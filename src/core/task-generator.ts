import { substituteParams } from '@sillytavern/script';
import { getRegexedString, regex_placement } from '@sillytavern/scripts/extensions/regex/engine';
import { z } from 'zod';
import { requestTaskCompletion, type ChatMsg } from '@/core/api-client';
import { buildCharSlots, buildPersonaContext, buildWorldInfoSlots } from '@/core/context-builder';
import { parseJsonFromText } from '@/core/json';
import { buildVars, fillVars } from '@/core/prompt-vars';
import { type GameState, ParsedTask, type SystemDef } from '@/type/game';
import { DEFAULT_GENERATE_MODULES, DEFAULT_SHOP_MODULES, type PromptModule, type Settings, type StoryFilterRule } from '@/type/settings';

/** 通过 API 异步生成一批新任务（纯函数：不碰状态，由 store 落账） */
export async function generateTasksViaApi(
  system: SystemDef,
  gameState: GameState,
  settings: Settings,
  count: number,
): Promise<ParsedTask[]> {
  const messages = await composeTaskMessages(system, gameState, settings, count);
  const raw = await requestTaskCompletion({
    messages,
    mainResponseLength: settings.api.maxTokens,
  });
  return parseTasksJson(raw, system).slice(0, count);
}

/**
 * 按传入的生成域模块组装生成请求（choice 式「模块即消息」，任务/商店共用）：
 * 普通模块经变量替换后按自身 role 产出消息；marker 槽位产出系统数据（persona/世界书×2/角色卡×3/wi_depth×2/当前状态，空则跳过）；
 * chat_history 按楼层展开为逐条真实 user/assistant 聊天消息（不逐条截断，末条 assistant 包 <current_scene>）；
 * 相邻同 role 合并、但 user 永不合并（同 choice）。供任务/商店生成与设置页「所见即所发」预览。
 */
async function composeMessages(
  system: SystemDef,
  gameState: GameState,
  settings: Settings,
  modules: PromptModule[],
  extraVars: Record<string, string>,
  kind: 'task' | 'shop',
): Promise<ChatMsg[]> {
  const vars = {
    ...buildVars(system, gameState),
    ...extraVars,
  };
  // 资料区各槽整段发送（不截断），按 choice 槽位分别取 persona/角色卡×3/世界书×2/wi_depth×2
  const personaBlock = buildPersonaContext();
  const charSlots = buildCharSlots(settings);
  const worldSlots = await buildWorldInfoSlots(settings);

  // 预填开关关闭时 assistant 模块降级为 system（同 choice 的 prefill_enabled 兜底），顺序不变；
  // chat_history 的聊天楼层不在此列（保留真实 user/assistant 角色，见下方特殊展开）
  const prefillOn = settings.prefillEnabled;
  const msgs: ChatMsg[] = [];
  for (const module of modules) {
    // chat_history 特殊：按楼层展开为逐条真实 user/assistant 聊天消息（不逐条截断、不随 prefill 降级）
    if (module.marker && module.id === 'chat_history') {
      const floors = buildChatFloors(
        settings.contextMode,
        settings.contextRounds,
        settings.storyFilterRules,
        settings.stRegexEnabled,
      );
      if (floors.length > 0) {
        msgs.push(...floors);
      } else {
        msgs.push({
          role: 'system',
          content:
            kind === 'shop'
              ? '【最近剧情】\n（暂无剧情：请上一批稳妥实用的开张货。）'
              : '【最近剧情】\n（暂无剧情：请发布一批引导宿主迈出第一步的初始任务。）',
        });
      }
      continue;
    }
    const content = module.marker
      ? markerContent(module.id, gameState, charSlots, worldSlots, personaBlock)
      : fillVars(module.content, vars);
    if (!content?.trim()) {
      continue;
    }
    const role = !prefillOn && module.role === 'assistant' ? 'system' : module.role;
    msgs.push({ role, content: substituteParams(content) });
  }

  // 合并相邻同 role；user 永不合并（同 choice：user 代表独立输入边界，防止聊天 user 层混进任务指令）
  const merged: ChatMsg[] = [];
  for (const msg of msgs) {
    const last = merged[merged.length - 1];
    if (last && last.role === msg.role && msg.role !== 'user') {
      last.content = `${last.content}\n\n${msg.content}`;
    } else {
      merged.push({ ...msg });
    }
  }
  return merged;
}

/** 任务生成请求（task 生成域模块）；count = 本批任务数，供生成任务与任务生成请求预览 */
export async function composeTaskMessages(
  system: SystemDef,
  gameState: GameState,
  settings: Settings,
  count: number,
): Promise<ChatMsg[]> {
  return composeMessages(
    system,
    gameState,
    settings,
    pickModules(settings, 'task'),
    { taskHint: system.taskHint, taskCount: String(count) },
    'task',
  );
}

/** 商店货架生成请求（shop 生成域模块）；供生成货架与商店生成请求预览 */
export async function composeShopMessages(
  system: SystemDef,
  gameState: GameState,
  settings: Settings,
): Promise<ChatMsg[]> {
  return composeMessages(system, gameState, settings, pickModules(settings, 'shop'), {}, 'shop');
}

/** 生成域模块：域被删空时回落默认模板；全禁用是明确意图，组装出空请求由调用方报错 */
function pickModules(settings: Settings, kind: 'task' | 'shop'): PromptModule[] {
  const source = kind === 'shop' ? settings.shopPromptModules : settings.promptModules.filter(m => m.scope === 'generate');
  if (source.length === 0) {
    return structuredClone(kind === 'shop' ? DEFAULT_SHOP_MODULES : DEFAULT_GENERATE_MODULES);
  }
  return source.filter(module => module.enabled);
}

/** marker 槽位的运行时内容：id 是识别键（与默认模块的 id 一一对应），无内容返回空串跳过；
 *  chat_history 不在此列，由 composeMessages 按楼层展开 */
function markerContent(
  id: string,
  gameState: GameState,
  charSlots: { description: string | null; personality: string | null; scenario: string | null },
  worldSlots: { before: string; after: string; depthBefore: string; depthAfter: string },
  personaBlock: string | null,
): string {
  switch (id) {
    case 'gen_state': {
      const activeTasks = gameState.tasks.filter(task => task.status === 'active');
      return [
        '【当前系统状态】',
        `宿主等级：Lv.${gameState.level}`,
        `持有货币：${gameState.currencyName} ×${gameState.points}`,
        ...(gameState.inventory.length
          ? [`持有物品：${gameState.inventory.map(item => `${item.name}×${item.count}`).join('、')}`]
          : []),
        `进行中的任务：${activeTasks.map(task => `${task.id}《${task.title}》（${task.requirements}）`).join('；') || '无'}`,
      ].join('\n');
    }
    case 'persona_description':
      return personaBlock ?? '';
    case 'char_description':
      return charSlots.description ?? '';
    case 'char_personality':
      return charSlots.personality ?? '';
    case 'char_scenario':
      return charSlots.scenario ?? '';
    case 'world_info_before':
      return worldSlots.before;
    case 'world_info_after':
      return worldSlots.after;
    case 'wi_depth_before':
      return worldSlots.depthBefore;
    case 'wi_depth_after':
      return worldSlots.depthAfter;
    default:
      return '';
  }
}

/**
 * 对单条楼层先走酒馆原生正则（直接用全局/预设/角色卡已配置的脚本，不必手动重录），再走本页过滤规则
 * （同 choice 的 st_regex 顺序）；depth 从当前生成点(0)往回算——限定 minDepth/maxDepth 的脚本依赖它。
 * 脚本把楼层清空则返回 null，表示整条丢弃。
 */
function filterStoryFloor(
  message: StChatMessage,
  depth: number,
  filterRules: StoryFilterRule[],
  stRegexEnabled: boolean,
): string | null {
  let text = String(message.mes ?? '');
  if (stRegexEnabled) {
    const placement = message.is_user ? regex_placement.USER_INPUT : regex_placement.AI_OUTPUT;
    text = getRegexedString(text, placement, { isPrompt: true, depth });
  }
  const filtered = applyStoryFilters(text, Boolean(message.is_user), filterRules);
  const trimmed = filtered?.trim() ?? '';
  return trimmed || null;
}

/**
 * 取最近 N 条消息拼成「名字：内容」的剧情摘要（商店扁平路径，单条截断防 token 爆炸）；
 * stRegexEnabled 时每条先过酒馆原生正则，再走本页过滤规则。任务生成改走 buildChatFloors，本函数仅服务商店。
 */
/** 取聊天可见楼层（剔除 is_system 隐藏层，同 choice 的 coreChat 语义），按上下文模式切窗口 */
function visibleStoryFloors(mode: 'visible_only' | 'rounds', rounds: number): StChatMessage[] {
  const chat = (window.SillyTavern?.getContext?.()?.chat ?? []) as StChatMessage[];
  const visible = chat.filter(message => !message.is_system);
  if (mode === 'rounds' && rounds > 0) {
    return visible.slice(-rounds * 2);
  }
  return visible;
}

/**
 * 按楼层保留真实 user/assistant 角色、不逐条截断的最近剧情（choice 式，任务生成用）：
 * 逐条过酒馆正则 + 本页过滤规则，空层丢弃；末条 assistant 包 <current_scene> 作当前场景锚定
 * （同 choice 的场景锚定，生成请求里「以 <current_scene> 标记的最新进展为准」与它呼应；无 assistant 时回退末条）。
 */
function buildChatFloors(
  mode: 'visible_only' | 'rounds',
  rounds: number,
  filterRules: StoryFilterRule[],
  stRegexEnabled: boolean,
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const floors = visibleStoryFloors(mode, rounds);
  const out: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  const total = floors.length;
  let lastAssistantIdx = -1;
  for (let i = 0; i < total; i++) {
    const message = floors[i];
    if (typeof message.mes !== 'string' || !message.mes.trim()) {
      continue;
    }
    const content = filterStoryFloor(message, total - 1 - i, filterRules, stRegexEnabled);
    if (!content) {
      continue;
    }
    const isUser = Boolean(message.is_user);
    out.push({ role: isUser ? 'user' : 'assistant', content });
    if (!isUser) {
      lastAssistantIdx = out.length - 1;
    }
  }
  if (out.length > 0) {
    const wrapIdx = lastAssistantIdx >= 0 ? lastAssistantIdx : out.length - 1;
    out[wrapIdx] = { ...out[wrapIdx], content: `<current_scene>\n${out[wrapIdx].content}\n</current_scene>` };
  }
  return out;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 对单条楼层跑过滤规则（执行顺序同 choice 的 buildChatHistory）：
 * extract（仅 AI 楼层，无命中丢弃整条）→ tag 剥对 → regex 替换；清空后整条丢弃。
 */
function applyStoryFilters(text: string, isUser: boolean, rules: StoryFilterRule[]): string | null {
  let out = text;

  const extracts = rules.filter(rule => rule.type === 'extract');
  if (!isUser && extracts.length > 0) {
    let extracted = '';
    for (const rule of extracts) {
      const tag = rule.tagName.trim();
      if (!tag) {
        continue;
      }
      const pattern = new RegExp(`<${escapeRegExp(tag)}>[\\s\\S]*?</${escapeRegExp(tag)}>`, 'gi');
      for (const match of out.matchAll(pattern)) {
        extracted += `${match[0]}\n`;
      }
    }
    out = extracted.trim();
    if (!out) {
      return null;
    }
  }

  for (const rule of rules) {
    if (rule.type === 'tag') {
      if (rule.start.trim() && rule.end.trim()) {
        out = out.replace(new RegExp(`${escapeRegExp(rule.start)}[\\s\\S]*?${escapeRegExp(rule.end)}`, 'g'), '');
      }
    } else if (rule.type === 'regex') {
      if (!rule.pattern.trim()) {
        continue;
      }
      try {
        // 与 choice 一致：用户正则统一挂 gs 标志（跨行 + 贪婪语义可预期）
        out = out.replace(new RegExp(rule.pattern, 'gs'), rule.replace ?? '');
      } catch {
        // 非法正则跳过该条，不中断整体生成
      }
    }
  }

  out = out.trim();
  return out || null;
}

/** 解析 AI 返回的任务批次：JSON 数组主路径（围栏/裸数组多候选）+ 单对象兜底 + 字段归一化 */
export function parseTasksJson(raw: string, system: SystemDef): ParsedTask[] {
  const batch = parseJsonFromText(raw, z.array(ParsedTask).min(1).max(8), '[');
  if (batch) {
    return batch.map(task => normalizeTask(task, system));
  }
  // 部分模型无视数组要求只回一个对象：能救回一个总比报错重试强
  const single = parseJsonFromText(raw, ParsedTask, '{');
  if (single) {
    return [normalizeTask(single, system)];
  }
  console.error('[GoldenFinger] 任务生成原始输出：', raw);
  throw new Error(t`AI 没有返回有效的任务 JSON，请重试`);
}

/** 归一化：钳制长度/数值，剥离写进名称里的 ×N，统一货币名称 */
function normalizeTask(task: ParsedTask, system: SystemDef): ParsedTask {
  return {
    title: task.title.trim().slice(0, 40) || t`神秘任务`,
    description: task.description.trim().slice(0, 400) || t`（系统没有留下描述）`,
    requirements: task.requirements.trim().slice(0, 120) || t`完成剧情中的目标`,
    rewards: task.rewards.slice(0, 3).map(reward => {
      let name = reward.name.trim().slice(0, 20);
      let amount = Math.round(reward.amount);
      const multiplier = name.match(/[×xX]\s*(\d+)\s*$/);
      if (multiplier) {
        // AI 把数量写进了名称（如「灵石×100」）：数量取其中的较大者，名称剥离
        amount = Math.max(amount, Number(multiplier[1]));
        name = name.replace(multiplier[0], '').trim();
      }
      if (name.includes(system.currencyName)) {
        name = system.currencyName;
      }
      return { name: name || system.currencyName, amount: _.clamp(amount, -9999, 99999) };
    }),
    expReward: _.clamp(Math.round(task.expReward), 0, 500),
    difficulty: _.clamp(Math.round(task.difficulty), 1, 5),
  };
}
