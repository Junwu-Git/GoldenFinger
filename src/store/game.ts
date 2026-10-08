import toastr from 'toastr';
import { saveMetadataDebounced } from '@sillytavern/scripts/extensions';
import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import { generateTasksViaApi, adjudicateTasks } from '@/core/task-generator';
import { generateShopShelf, generateCharacterShelf } from '@/core/shop-generator';
import { useSettingsStore } from '@/store/settings';
import { findSystem } from '@/systems/builtin';
import {
  defaultEffect,
  GameState,
  expToNext,
  type AttributeFx,
  type BodyAttribute,
  type LogKind,
  type ShopItem,
  type SystemDef,
  type Task,
  type TaskStatus,
} from '@/type/game';
import { dateStrOffset, todayDateStr } from '@/util/date';
import { validateInplace } from '@/util/zod';

/** 金手指游玩状态在聊天元数据中的字段名 */
export const STATE_FIELD = 'golden_finger';

/** 运行时上限（对齐 GameState schema 硬约束）：超限的存档在下次加载时 zod 校验会直接崩档，这里先裁剪/拒绝 */
const MAX_CLOSED_TASKS = 40;
const MAX_INVENTORY = 50;
const MAX_LEARNED_SKILLS = 50;
const MAX_ATTRIBUTES = 50;

export const useGameStore = defineStore('golden_finger_game', () => {
  const settingsStore = useSettingsStore();

  const state = ref<GameState>(readMetadata());
  const generating = ref(false);
  const shopGenerating = ref(false);
  const judging = ref(false);

  /** reload 换入新聊天状态时抑制 watch 落盘（数据本来就是从元数据读的） */
  let suppressPersist = false;

  function readMetadata(): GameState {
    const metadata = window.SillyTavern?.getContext?.()?.chatMetadata as Record<string, unknown> | undefined;
    try {
      return validateInplace(GameState, metadata?.[STATE_FIELD] ?? {});
    } catch (error) {
      // 脏档（如被旧 bug 写超限的数据）不能让扩展整个挂掉：报错留档后空状态重建，原数据仍在聊天文件里可找回
      console.error('[GoldenFinger] 游玩状态校验失败，已重置为本聊天空档', error);
      toastr.error(t`本聊天的金手指数据校验失败，已重置为空档（原始数据仍保留在聊天文件中）`, t`金手指系统`);
      return validateInplace(GameState, {});
    }
  }

  function persist(): void {
    const metadata = window.SillyTavern?.getContext?.()?.chatMetadata as Record<string, unknown> | undefined;
    if (!metadata) {
      return;
    }
    metadata[STATE_FIELD] = klona(state.value);
    saveMetadataDebounced();
  }

  watch(
    state,
    () => {
      if (!suppressPersist) {
        persist();
      }
    },
    { deep: true },
  );

  /** 聊天切换时重新载入本聊天的游玩状态 */
  function reload(): void {
    suppressPersist = true;
    try {
      state.value = readMetadata();
    } finally {
      suppressPersist = false;
    }
  }

  const activeSystem = computed<SystemDef | null>(() =>
    findSystem(state.value.activeSystemId, settingsStore.settings.customSystems),
  );
  const activeTasks = computed<Task[]>(() => state.value.tasks.filter(task => task.status === 'active'));
  const closedTasks = computed<Task[]>(() =>
    state.value.tasks
      .filter(task => task.status !== 'active')
      .slice()
      .reverse(),
  );
  const expNext = computed(() => expToNext(state.value.level));
  const levelTitle = computed(() => activeSystem.value?.levelNames[state.value.level - 1] ?? '');
  /** 已觉醒的系统专属技能（Lv ≥ unlockLevel；纯剧情能力，无数值效果） */
  const unlockedSkills = computed(() =>
    (activeSystem.value?.skills ?? []).filter(skill => state.value.level >= skill.unlockLevel),
  );

  /** 当前聊天文件标识（单聊=角色当前聊天名、群聊=群 chat_id，st-context.js 已核实）：在途请求落账前校验，防写进切走后的新聊天 */
  function currentChatId(): string {
    return String(window.SillyTavern?.getContext?.()?.chatId ?? '');
  }

  function log(kind: LogKind, text: string): void {
    // LogEntry.text 上限 400：超长文本会让下次加载 zod 校验崩档，这里统一截断
    state.value.log.unshift({ time: Date.now(), kind, text: text.slice(0, 400) });
    if (state.value.log.length > 80) {
      state.value.log.length = 80;
    }
  }

  /** 为本聊天激活一个系统（重置全部游玩数据） */
  function activateSystem(system: SystemDef): void {
    const fresh = validateInplace(GameState, {});
    fresh.activeSystemId = system.id;
    fresh.activatedAt = Date.now();
    fresh.currencyName = system.currencyName;
    state.value = fresh;
    log('system', t`已绑定系统「${system.name}」，开始你的金手指之旅吧！`);
  }

  /** 关闭系统：停掉注入，但保留数据（重新激活任意系统会重置） */
  function deactivateSystem(): void {
    state.value.activeSystemId = null;
    log('system', t`系统已解绑。`);
  }

  /** 通过 API 异步发布一批新任务：数量 = 剩余任务位，一次把任务栏派满 */
  async function issueTasks(): Promise<Task[]> {
    const system = activeSystem.value;
    if (!system) {
      throw new Error(t`尚未绑定系统`);
    }
    if (generating.value) {
      throw new Error(t`上一个任务还在生成中`);
    }
    const slots = system.maxActiveTasks - activeTasks.value.length;
    if (slots <= 0) {
      throw new Error(t`进行中的任务已达上限（${system.maxActiveTasks}个）`);
    }

    generating.value = true;
    const chatId = currentChatId();
    try {
      const parsedList = await generateTasksViaApi(system, state.value, settingsStore.settings, slots);
      if (chatId !== currentChatId()) {
        // 等待期间已切换聊天：state 已被 reload 换成新聊天，这批任务落进去就是污染，报错丢弃
        throw new Error(t`生成期间已切换聊天，本批任务未保存`);
      }
      const timeoutMs = settingsStore.settings.taskTimeoutEnabled
        ? settingsStore.settings.taskTimeoutMinutes * 60_000
        : null;
      const created: Task[] = [];
      for (const parsed of parsedList) {
        state.value.taskCounter += 1;
        const task: Task = {
          ...parsed,
          id: `T${String(state.value.taskCounter).padStart(3, '0')}`,
          status: 'active',
          createdAt: Date.now(),
          deadline: timeoutMs ? Date.now() + timeoutMs : null,
          closedAt: null,
        };
        state.value.tasks.push(task);
        created.push(task);
      }
      state.value.msgCounter = 0;
      for (const task of created) {
        log('task', t`发布任务 ${task.id}《${task.title}》`);
      }
      return created;
    } finally {
      generating.value = false;
    }
  }

  /** AI 回复计数；达到自动发布条件时返回 true（由调用方触发 issueTasks） */
  function noteAutoIssue(): boolean {
    const { settings } = settingsStore;
    if (!settings.enabled || !settings.autoIssue || !state.value.activeSystemId) {
      return false;
    }
    if (generating.value) {
      return false;
    }
    if (activeTasks.value.length >= (activeSystem.value?.maxActiveTasks ?? 99)) {
      return false;
    }
    state.value.msgCounter += 1;
    return state.value.msgCounter >= settings.autoIssueInterval;
  }

  /** AI 回复计数；达到自动判定条件时返回 true（由调用方触发 judgeTasks） */
  function noteAutoJudge(): boolean {
    const { settings } = settingsStore;
    if (!settings.enabled || !settings.autoJudge || !state.value.activeSystemId) {
      return false;
    }
    if (judging.value) {
      return false;
    }
    if (activeTasks.value.length === 0) {
      return false;
    }
    state.value.judgeMsgCounter += 1;
    return state.value.judgeMsgCounter >= settings.autoJudgeInterval;
  }

  /** 自动发布失败退避：清零计数，重新计满间隔楼数再试（避免 API 持续故障时每楼重试轰炸） */
  function onAutoIssueFailed(): void {
    state.value.msgCounter = 0;
  }

  /** 自动判定失败退避：同 onAutoIssueFailed */
  function onAutoJudgeFailed(): void {
    state.value.judgeMsgCounter = 0;
  }

  /**
   * 设置任务状态并结算。
   * 完成来源：剧情 AI 判定标记 / 独立判定 API / 商店「自动完成」物品。
   * 失败来源：判定标记、独立判定 API、任务超时（source='timeout'）——失败都来自任务生成时写死的条件
   * （deadline 或 AI 判定），不由玩家手动触发；玩家面板「放弃」是中性「作废」（status='voided'），不计失败、无惩罚。
   * @returns 任务是否存在且为 active（判定标记解析依赖它做幂等）
   */
  function setTaskStatus(taskId: string, status: TaskStatus, source: 'marker' | 'manual' | 'timeout' = 'marker'): boolean {
    const task = state.value.tasks.find(item => item.id === taskId && item.status === 'active');
    if (!task) {
      return false;
    }
    task.status = status;
    task.closedAt = Date.now();
    if (status === 'completed') {
      settleRewards(task);
    } else if (status === 'voided') {
      // 作废：玩家放弃，中性处理——不计失败、不触发失败惩罚，仅从进行中移除
      log('system', t`任务 ${task.id}《${task.title}》作废，不计失败。`);
      toastr.info(t`任务「${task.title}」已作废，不计失败`, t`金手指系统`);
    } else if (source === 'timeout') {
      // 超时失败：按设置决定是否把负数奖励当作惩罚扣减
      if (settingsStore.settings.failPunishmentEnabled) {
        applyPunishment(task);
      } else {
        log('system', t`任务 ${task.id}《${task.title}》超时失败，奖励作废。`);
        toastr.warning(t`任务「${task.title}」超时失败，奖励作废`, t`金手指系统`);
      }
    } else {
      log('system', t`任务 ${task.id}《${task.title}》判定失败，奖励作废。`);
      toastr.warning(t`任务「${task.title}」判定失败`, t`金手指系统`);
    }
    pruneTasks();
    return true;
  }

  /** 结算后裁剪旧完结任务：active 全保留，完结按 closedAt 只留最近 MAX_CLOSED_TASKS 条，防 tasks 数组无限增长撑爆存档 */
  function pruneTasks(): void {
    const closed = state.value.tasks
      .filter(task => task.status !== 'active')
      .sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0));
    if (closed.length <= MAX_CLOSED_TASKS) {
      return;
    }
    const keep = new Set(closed.slice(0, MAX_CLOSED_TASKS));
    state.value.tasks = state.value.tasks.filter(task => task.status === 'active' || keep.has(task));
  }

  /** 执行失败惩罚：只扣减 rewards 里的负数项（货币入 points、物品从背包扣减）。背包没有该物品时无可扣，跳过。
   *  无论是否有惩罚可扣，都会给出超时失败反馈（避免开启惩罚后无负数奖励时静默）。 */
  function applyPunishment(task: Task): void {
    const s = state.value;
    const texts: string[] = [];
    for (const reward of task.rewards) {
      if (reward.amount >= 0) {
        continue;
      }
      if (reward.name === s.currencyName) {
        s.points += reward.amount;
      } else {
        const item = s.inventory.find(candidate => candidate.name === reward.name);
        if (item) {
          // 惩罚扣减钳到 0：背包存货不足时不产生负数
          item.count = Math.max(0, item.count + reward.amount);
        }
      }
      texts.push(`${reward.name}×${reward.amount}`);
    }
    if (texts.length > 0) {
      log('system', t`任务 ${task.id}《${task.title}》超时失败，惩罚扣减：${texts.join('、')}`);
      toastr.warning(t`任务「${task.title}」超时失败，惩罚扣减：${texts.join('、')}`, t`金手指系统`);
    } else {
      log('system', t`任务 ${task.id}《${task.title}》超时失败，奖励作废。`);
      toastr.warning(t`任务「${task.title}」超时失败，奖励作废`, t`金手指系统`);
    }
  }

  /** 扫描进行中任务，把逾期的判为失败（同步、轻量；挂在 MESSAGE_RECEIVED/CHAT_CHANGED 上） */
  function checkTaskDeadlines(): void {
    if (!settingsStore.settings.taskTimeoutEnabled) {
      return;
    }
    const now = Date.now();
    for (const task of state.value.tasks) {
      if (task.status === 'active' && task.deadline !== null && task.deadline < now) {
        setTaskStatus(task.id, 'failed', 'timeout');
      }
    }
  }

  /** 增加经验并处理升级（一次可跨多级）；升级日志/toast 统一在此，结算与物品使用共用 */
  function applyExp(amount: number): void {
    if (amount <= 0) {
      return;
    }
    const s = state.value;
    s.exp += amount;
    while (s.exp >= expToNext(s.level)) {
      s.exp -= expToNext(s.level);
      s.level += 1;
      log('levelup', t`系统升级！当前等级 Lv.${s.level} ${levelTitle.value}`);
      toastr.success(t`系统升级！当前等级 Lv.${s.level} ${levelTitle.value}`, t`金手指系统`);
    }
  }

  /** 按改造负载 upsert 一个身体数值属性：新建以 amount 起步，已有则在其上增减；有档位标签则钳制在档位范围内。
   *  @returns 生效后的属性记录（新建超上限时拒绝，返回 null，调用方不应消耗物品） */
  function applyAttribute(fx: AttributeFx): BodyAttribute | null {
    const s = state.value;
    const attr = s.attributes.find(candidate => candidate.target === fx.target && candidate.name === fx.attribute);
    if (attr) {
      const max = attr.tiers?.length ? attr.tiers.length - 1 : 999;
      attr.value = _.clamp(attr.value + fx.amount, 0, max);
      if (!attr.unit && fx.unit) {
        attr.unit = fx.unit;
      }
      if (fx.tiers?.length) {
        attr.tiers = fx.tiers;
      }
      return attr;
    }
    if (s.attributes.length >= MAX_ATTRIBUTES) {
      toastr.warning(t`身体属性记录已达上限，无法新增`, t`金手指系统`);
      return null;
    }
    const max = fx.tiers?.length ? fx.tiers.length - 1 : 999;
    const created: BodyAttribute = {
      target: fx.target,
      name: fx.attribute,
      value: _.clamp(Math.max(0, fx.amount), 0, max),
      unit: fx.unit,
      tiers: fx.tiers ?? [],
    };
    s.attributes.push(created);
    return created;
  }

  function attrText(attr: BodyAttribute): string {
    if (attr.tiers?.length) {
      return attr.tiers[_.clamp(attr.value, 0, attr.tiers.length - 1)] ?? `${attr.value}${attr.unit}`;
    }
    return `${attr.value}${attr.unit}`;
  }

  function settleRewards(task: Task): void {
    const s = state.value;
    const gainTexts: string[] = [];
    // 每日签到守门：奖励名等于 dailyReward.name 的项，当日首笔才入账并推进连续签到，同日重复跳过
    const daily = activeSystem.value?.dailyReward ?? null;
    const today = todayDateStr();
    // 循环内用可变标记：同任务里出现第二个同名签到奖励时，也被当作「已签到」跳过
    let dailyGranted = daily !== null && s.signIn.lastSignInDate === today;

    for (const reward of task.rewards) {
      if (daily && reward.name === daily.name) {
        if (dailyGranted) {
          gainTexts.push(`${reward.name}×${reward.amount}（${t`今日已签到，不再发放`}）`);
          continue;
        }
        // 首笔：入账 + 置签到日 + 推进连续天数（昨天签过则 +1，否则重开）
        dailyGranted = true;
        s.signIn.streak = s.signIn.lastSignInDate === dateStrOffset(-1) ? s.signIn.streak + 1 : 1;
        s.signIn.lastSignInDate = today;
        gainTexts.push(t`每日签到达成（连续 ${s.signIn.streak} 天）：${reward.name}×${reward.amount}`);
      }
      if (reward.name === s.currencyName) {
        s.points += reward.amount;
      } else {
        const item = s.inventory.find(candidate => candidate.name === reward.name);
        if (item) {
          // 负数奖励项（罚没条款/惩罚）不把库存扣成负数
          item.count = Math.max(0, item.count + reward.amount);
        } else if (s.inventory.length >= MAX_INVENTORY) {
          gainTexts.push(`${reward.name}（${t`背包已满，未入包`}）`);
        } else {
          s.inventory.push({ name: reward.name, description: '', count: reward.amount, effect: defaultEffect() });
        }
      }
      // 首笔签到奖励的入账文本已由上面「每日签到达成」给出，这里不再重复追加
      if (!(daily && reward.name === daily.name)) {
        gainTexts.push(`${reward.name}×${reward.amount}`);
      }
    }

    if (task.expReward > 0) {
      gainTexts.push(t`经验+${task.expReward}`);
    }
    applyExp(task.expReward);
    // 已觉醒技能的被动加成：points 入货币、exp 走 applyExp（可能顺带升级）
    for (const skill of unlockedSkills.value) {
      const fx = skill.effect;
      if (!fx) {
        continue;
      }
      if (fx.type === 'points' && fx.amount !== 0) {
        s.points += fx.amount;
        gainTexts.push(t`${skill.name}技能加成 ${s.currencyName}+${fx.amount}`);
      } else if (fx.type === 'exp' && fx.amount !== 0) {
        applyExp(fx.amount);
        gainTexts.push(t`${skill.name}技能加成 经验+${fx.amount}`);
      }
    }
    log('reward', t`任务 ${task.id}《${task.title}》完成！获得：${gainTexts.join('、')}`);
    toastr.success(t`任务完成！获得 ${gainTexts.join('、')}`, t`金手指系统`);
  }

  /** 清空本聊天的全部金手指数据 */
  function resetState(): void {
    state.value = validateInplace(GameState, {});
  }

  /** 只清日志，不动其他数据 */
  function clearLog(): void {
    state.value.log = [];
  }

  // #region 商店

  /** 调 API 生成一批新货架（不扣费；扣费由调用方负责） */
  async function generateShelf(): Promise<void> {
    const system = activeSystem.value;
    if (!system) {
      throw new Error(t`尚未绑定系统`);
    }
    if (shopGenerating.value) {
      // 必须抛错而非静默：refreshShop 先扣费后调用这里，静默返回会变成「扣了费不换货还不退款」
      throw new Error(t`货架正在生成中`);
    }
    shopGenerating.value = true;
    const chatId = currentChatId();
    try {
      // 系统通用批次必须成功；角色专属批次可选，失败时保留系统货并告警（不整体翻车）
      const characterPromise = settingsStore.settings.characterShopEnabled
        ? generateCharacterShelf(system, state.value, settingsStore.settings).catch(error => {
            console.warn('[GoldenFinger] 角色专属货架生成失败，已跳过', error);
            return [] as ShopItem[];
          })
        : (Promise.resolve([]) as Promise<ShopItem[]>);
      const [systemItems, characterItems] = await Promise.all([
        generateShopShelf(system, state.value, settingsStore.settings),
        characterPromise,
      ]);
      if (chatId !== currentChatId()) {
        // 等待期间已切换聊天：旧货架/扣费留在旧聊天数据里，这里不写新聊天
        console.warn('[GoldenFinger] 货架生成期间切换了聊天，本批货架已丢弃');
        return;
      }
      // 合并去重（同名保留系统批次优先），总量不超过 12
      const seen = new Set<string>();
      const items = [...systemItems, ...characterItems].filter(item => {
        const key = item.name.trim().toLowerCase();
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      }).slice(0, 12);
      const previous = state.value.shop;
      state.value.shop = { items, generatedAt: Date.now(), rollCount: (previous?.rollCount ?? 0) + 1 };
      log('system', t`「${system.shopName}」上了一批新货（第${state.value.shop.rollCount}批）`);
    } finally {
      shopGenerating.value = false;
    }
  }

  /** 进店：无货架时免费开张生成 */
  async function ensureShop(): Promise<void> {
    if (state.value.shop && state.value.shop.items.length > 0) {
      return;
    }
    await generateShelf();
  }

  /** 换一批：扣货币后重新生成；生成失败退款（旧货架保留） */
  async function refreshShop(): Promise<void> {
    const cost = activeSystem.value?.refreshCost ?? 0;
    if (cost > 0 && state.value.points < cost) {
      throw new Error(t`货币不足，换一批需要 ${cost} ${state.value.currencyName}`);
    }
    if (cost > 0) {
      state.value.points -= cost;
      log('info', t`支付 ${cost} ${state.value.currencyName} 换了一批新货`);
    }
    try {
      await generateShelf();
    } catch (error) {
      if (cost > 0) {
        state.value.points += cost;
      }
      throw error;
    }
  }

  /** 购买：即时结算（扣款→入包/习得→库存-1）；技能商品直接习得、不入背包 */
  function buyItem(itemId: string): void {
    const shop = state.value.shop;
    const item = shop?.items.find(candidate => candidate.id === itemId);
    if (!item) {
      return;
    }
    if (item.stock !== null && item.stock <= 0) {
      toastr.warning(t`「${item.name}」已售罄`, t`金手指系统`);
      return;
    }
    if (state.value.points < item.price) {
      toastr.warning(t`货币不足，还差 ${item.price - state.value.points} ${state.value.currencyName}`, t`金手指系统`);
      return;
    }
    // 技能商品：已习得则不可重复购买（不扣费、不消耗库存）
    if (item.kind === 'skill' && state.value.learnedSkills.some(skill => skill.name === item.name)) {
      toastr.info(t`已习得技能「${item.name}」，无需重复购买`, t`金手指系统`);
      return;
    }
    // 上限保护先于扣款：新技能/新物品占不了位就拒绝卖（同名合并不占新位，不受限）
    if (item.kind === 'skill') {
      if (state.value.learnedSkills.length >= MAX_LEARNED_SKILLS) {
        toastr.warning(t`已学技能已达上限，无法再习得「${item.name}」`, t`金手指系统`);
        return;
      }
    } else if (
      !state.value.inventory.some(candidate => candidate.name === item.name) &&
      state.value.inventory.length >= MAX_INVENTORY
    ) {
      toastr.warning(t`背包已满，无法购入「${item.name}」`, t`金手指系统`);
      return;
    }
    state.value.points -= item.price;
    if (item.stock !== null) {
      item.stock -= 1;
    }
    if (item.kind === 'skill') {
      // 技能商品：购买直接习得进持久化集合，注入正文 AI 供剧情施展
      state.value.learnedSkills.push({
        name: item.name,
        description: item.description,
        source: activeSystem.value?.name ?? '',
      });
      log('reward', t`习得了技能「${item.name}」`);
      toastr.success(t`已习得技能「${item.name}」`, t`金手指系统`);
      return;
    }
    const owned = state.value.inventory.find(candidate => candidate.name === item.name);
    if (owned) {
      owned.count += 1;
    } else {
      // 商品效果随购买一并入包，供背包「使用」（effect=none 的纯收藏品则不可用）
      state.value.inventory.push({
        name: item.name,
        description: item.description,
        count: 1,
        effect: { ...item.effect },
      });
    }
    log('reward', t`购入「${item.name}」，花费 ${item.price} ${state.value.currencyName}`);
    toastr.success(t`已购入「${item.name}」`, t`金手指系统`);
  }

  // #endregion

  // #region 背包物品使用

  /** 使用背包物品：按 effect 即时结算后消耗数量（归零移出）；effect=none 或不存在视为纯收藏，不可用。 */
  function useItem(name: string): void {
    const s = state.value;
    const item = s.inventory.find(candidate => candidate.name === name);
    if (!item || item.count <= 0) {
      return;
    }
    const effect = item.effect ?? defaultEffect();
    const amount = effect.amount ?? 0;
    const gained: string[] = [];
    switch (effect.type) {
      case 'points':
        if (amount > 0) {
          s.points += amount;
          gained.push(`${s.currencyName}+${amount}`);
        }
        break;
      case 'exp':
        if (amount > 0) {
          applyExp(amount);
          gained.push(`经验+${amount}`);
        }
        break;
      case 'complete_task': {
        // 自动完成第一个进行中任务（结算奖励与升级）；玩家侧的一条非正文完成路径
        const target = s.tasks.find(task => task.status === 'active');
        if (target) {
          setTaskStatus(target.id, 'completed');
          gained.push(t`任务「${target.title}」已完成`);
        }
        break;
      }
      case 'attribute': {
        // 身体改造：按负载 upsert 目标角色的数值属性（新建以 amount 起步，已有则在其上增减）
        const fx = effect.attribute;
        if (!fx || !fx.attribute) {
          break;
        }
        const applied = applyAttribute(fx);
        if (!applied) {
          // 上限拒绝已在 applyAttribute 内提示，物品不消耗
          return;
        }
        // 展示生效后的实际值（含目标角色前缀），而非改动量
        gained.push(`${applied.target ? `${applied.target}·` : ''}${applied.name} → ${attrText(applied)}`);
        break;
      }
      default:
        break;
    }
    if (gained.length === 0) {
      if (effect.type === 'none') {
        toastr.info(t`「${name}」是纯收藏物品，没有可使用的效果`, t`金手指系统`);
      } else {
        // 有效果但当前无法落地（如 complete_task 已无进行中任务）：提示而非误报为收藏品
        toastr.info(t`「${name}」现在用不了（例如没有进行中的任务可结算）`, t`金手指系统`);
      }
      return;
    }
    item.count -= 1;
    if (item.count <= 0) {
      s.inventory = s.inventory.filter(entry => entry.name !== name);
    }
    log('reward', t`使用了「${name}」——${gained.join('、')}`);
    toastr.success(t`已使用「${name}」，${gained.join('、')}`, t`金手指系统`);
  }

  // #endregion

  // #region 任务独立判定

  /** 调独立判定 API 结算进行中任务（不依赖主 AI 写标记）；返回实际结算的任务条数。 */
  async function judgeTasks(): Promise<number> {
    const system = activeSystem.value;
    if (!system) {
      throw new Error(t`尚未绑定系统`);
    }
    if (judging.value) {
      throw new Error(t`上一个判定还在进行中`);
    }
    if (activeTasks.value.length === 0) {
      return 0;
    }
    judging.value = true;
    const chatId = currentChatId();
    try {
      const verdicts = await adjudicateTasks(system, state.value, settingsStore.settings);
      if (chatId !== currentChatId()) {
        // 等待期间已切换聊天：裁决对象是旧聊天的任务，不能结算进新聊天
        throw new Error(t`判定期间已切换聊天，结果未保存`);
      }
      let settled = 0;
      for (const verdict of verdicts) {
        if (setTaskStatus(verdict.id, verdict.status)) {
          settled += 1;
        }
      }
      state.value.judgeMsgCounter = 0;
      return settled;
    } finally {
      judging.value = false;
    }
  }

  // #endregion

  return {
    state,
    generating,
    shopGenerating,
    judging,
    activeSystem,
    activeTasks,
    closedTasks,
    expNext,
    levelTitle,
    unlockedSkills,
    reload,
    activateSystem,
    deactivateSystem,
    issueTasks,
    noteAutoIssue,
    noteAutoJudge,
    onAutoIssueFailed,
    onAutoJudgeFailed,
    setTaskStatus,
    checkTaskDeadlines,
    useItem,
    judgeTasks,
    resetState,
    clearLog,
    ensureShop,
    refreshShop,
    buyItem,
  };
});
