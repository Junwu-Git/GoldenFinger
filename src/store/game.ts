import toastr from 'toastr';
import { saveMetadataDebounced } from '@sillytavern/scripts/extensions';
import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import { generateTasksViaApi, adjudicateTasks } from '@/core/task-generator';
import { generateShopShelf } from '@/core/shop-generator';
import { useSettingsStore } from '@/store/settings';
import { findSystem } from '@/systems/builtin';
import { defaultEffect, GameState, expToNext, type LogKind, type SystemDef, type Task, type TaskStatus } from '@/type/game';
import { validateInplace } from '@/util/zod';

/** 金手指游玩状态在聊天元数据中的字段名 */
export const STATE_FIELD = 'golden_finger';

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
    return validateInplace(GameState, metadata?.[STATE_FIELD] ?? {});
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

  function log(kind: LogKind, text: string): void {
    state.value.log.unshift({ time: Date.now(), kind, text });
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
    try {
      const parsedList = await generateTasksViaApi(system, state.value, settingsStore.settings, slots);
      const created: Task[] = [];
      for (const parsed of parsedList) {
        state.value.taskCounter += 1;
        const task: Task = {
          ...parsed,
          id: `T${String(state.value.taskCounter).padStart(3, '0')}`,
          status: 'active',
          createdAt: Date.now(),
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

  /**
   * 设置任务状态并结算奖励。
   * 完成的唯一入口是剧情 AI 的判定标记；玩家面板只能放弃（source='manual'）。
   * @returns 任务是否存在且为 active（判定标记解析依赖它做幂等）
   */
  function setTaskStatus(taskId: string, status: TaskStatus, source: 'marker' | 'manual' = 'marker'): boolean {
    const task = state.value.tasks.find(item => item.id === taskId && item.status === 'active');
    if (!task) {
      return false;
    }
    task.status = status;
    task.closedAt = Date.now();
    if (status === 'completed') {
      settleRewards(task);
    } else if (source === 'manual') {
      log('system', t`放弃了任务 ${task.id}《${task.title}》，奖励作废。`);
      toastr.info(t`已放弃任务「${task.title}」`, t`金手指系统`);
    } else {
      log('system', t`任务 ${task.id}《${task.title}》判定失败，奖励作废。`);
      toastr.warning(t`任务「${task.title}」判定失败`, t`金手指系统`);
    }
    return true;
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

  function settleRewards(task: Task): void {
    const s = state.value;
    const gainTexts: string[] = [];

    for (const reward of task.rewards) {
      if (reward.name === s.currencyName) {
        s.points += reward.amount;
      } else {
        const item = s.inventory.find(candidate => candidate.name === reward.name);
        if (item) {
          item.count += reward.amount;
        } else {
          s.inventory.push({ name: reward.name, description: '', count: reward.amount, effect: defaultEffect() });
        }
      }
      gainTexts.push(`${reward.name}×${reward.amount}`);
    }

    if (task.expReward > 0) {
      gainTexts.push(t`经验+${task.expReward}`);
    }
    applyExp(task.expReward);
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
      return;
    }
    shopGenerating.value = true;
    try {
      const items = await generateShopShelf(system, state.value, settingsStore.settings);
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

  /** 购买：即时结算（扣款→入包→库存-1） */
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
    state.value.points -= item.price;
    if (item.stock !== null) {
      item.stock -= 1;
    }
    const owned = state.value.inventory.find(candidate => candidate.name === item.name);
    if (owned) {
      owned.count += 1;
    } else {
      // 商品效果随购买一并入包，供背包「使用」（effect=none 的纯收藏品则不可用）
      state.value.inventory.push({ name: item.name, description: item.description, count: 1, effect: { ...item.effect } });
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
    try {
      const verdicts = await adjudicateTasks(system, state.value, settingsStore.settings);
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
    setTaskStatus,
    useItem,
    judgeTasks,
    resetState,
    clearLog,
    ensureShop,
    refreshShop,
    buyItem,
  };
});
