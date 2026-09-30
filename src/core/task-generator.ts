import { substituteParams } from '@sillytavern/script';
import { getRegexedString, regex_placement } from '@sillytavern/scripts/extensions/regex/engine';
import { z } from 'zod';
import { requestTaskCompletion, type ChatMsg } from '@/core/api-client';
import { buildWorldContext } from '@/core/context-builder';
import { parseJsonFromText } from '@/core/json';
import { buildVars, fillVars } from '@/core/prompt-vars';
import { type GameState, ParsedTask, type SystemDef } from '@/type/game';
import { DEFAULT_GENERATE_MODULES, type PromptModule, type Settings, type StoryFilterRule } from '@/type/settings';

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
 * 按设置里的 generate 域模块组装任务生成请求（choice 式「模块即消息」）：
 * 普通模块经变量替换后按自身 role 产出消息；marker 槽位产出系统数据（状态/世界观/剧情，空则跳过）；
 * 生成请求全是系统指令文本、不含聊天楼层展开，相邻同 role 全部合并（不同于 choice 的 user 不合并）。
 * 导出供设置页做「所见即所发」的请求预览。
 */
export async function composeTaskMessages(
  system: SystemDef,
  gameState: GameState,
  settings: Settings,
  count: number,
): Promise<ChatMsg[]> {
  const vars = {
    ...buildVars(system, gameState),
    taskHint: system.taskHint,
    taskCount: String(count),
  };
  const modules = pickGenerateModules(settings);
  const worldContext = await buildWorldContext(settings);
  const story = buildStoryContext(
    settings.storyMessages,
    settings.storyMessageLength,
    settings.storyFilterRules,
    settings.stRegexEnabled,
  );

  // 预填开关关闭时 assistant 模块降级为 system（同 choice 的 prefill_enabled 兜底），顺序不变
  const prefillOn = settings.prefillEnabled;
  const msgs: ChatMsg[] = [];
  for (const module of modules) {
    const content = module.marker
      ? markerContent(module.id, gameState, worldContext, story)
      : fillVars(module.content, vars);
    if (!content?.trim()) {
      continue;
    }
    const role = !prefillOn && module.role === 'assistant' ? 'system' : module.role;
    msgs.push({ role, content: substituteParams(content) });
  }

  const merged: ChatMsg[] = [];
  for (const msg of msgs) {
    const last = merged[merged.length - 1];
    if (last && last.role === msg.role) {
      last.content = `${last.content}\n\n${msg.content}`;
    } else {
      merged.push({ ...msg });
    }
  }
  return merged;
}

/** generate 域模块：域被删空时回落默认模板；全禁用是明确意图，组装出空请求由调用方报错 */
function pickGenerateModules(settings: Settings): PromptModule[] {
  const present = settings.promptModules.filter(module => module.scope === 'generate');
  if (present.length === 0) {
    return structuredClone(DEFAULT_GENERATE_MODULES);
  }
  return present.filter(module => module.enabled);
}

/** marker 槽位的运行时内容：id 是识别键（与默认模块的 id 一一对应），无内容返回空串跳过 */
function markerContent(id: string, gameState: GameState, worldContext: string, story: string): string {
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
    case 'gen_world':
      return worldContext.trim() ? `【世界观背景】\n${worldContext.trim()}` : '';
    case 'gen_story': {
      if (!story.trim()) {
        return '【最近剧情】\n（暂无剧情：请发布一批引导宿主迈出第一步的初始任务。）';
      }
      // 最新一楼用 <current_scene> 包裹（同 choice 的场景锚定）：给模型一个明确的「当前场景」边界，
      // 生成请求里「以 <current_scene> 标记的最新进展为准」与它呼应
      const lines = story.split('\n');
      const latest = lines.pop()?.trim() ?? '';
      return ['【最近剧情】', ...lines, `<current_scene>${latest}</current_scene>`].filter(Boolean).join('\n');
    }
    default:
      return '';
  }
}

/** 取最近 N 条消息拼成「名字：内容」的剧情摘要，单条截断防 token 爆炸；
 *  stRegexEnabled 时每条先过酒馆原生正则（直接用全局/预设/角色卡已配置的脚本，不必手动重录），
 *  再走本页过滤规则（同 choice 的 st_regex 顺序）；本函数同时服务任务与商店生成。 */
export function buildStoryContext(
  count: number,
  maxLength: number,
  filterRules: StoryFilterRule[] = [],
  stRegexEnabled = true,
): string {
  // chat 元素是 ST 原生楼层结构，显式断言（见 types/ambient.d.ts）
  const chat = (window.SillyTavern?.getContext?.()?.chat ?? []) as StChatMessage[];
  const recent = chat.slice(-count);
  const lines: string[] = [];
  for (let i = 0; i < recent.length; i++) {
    const message = recent[i];
    if (typeof message.mes !== 'string' || !message.mes.trim()) {
      continue;
    }
    const context = window.SillyTavern?.getContext?.();
    const name = message.is_user ? context?.name1 : message.name || context?.name2 || '???';
    // 先走酒馆正则：placement 按楼层来源、depth 从当前生成点(0)往回算——限定 minDepth/maxDepth
    // 的脚本（如「只保留最近 N 层」）依赖它；脚本把楼层清空则整条丢弃（下方空文本判断处理）
    let text = String(message.mes ?? '');
    if (stRegexEnabled) {
      const placement = message.is_user ? regex_placement.USER_INPUT : regex_placement.AI_OUTPUT;
      text = getRegexedString(text, placement, { isPrompt: true, depth: recent.length - 1 - i });
    }
    const filtered = applyStoryFilters(text, Boolean(message.is_user), filterRules);
    if (filtered) {
      lines.push(`${name}：${filtered.slice(0, maxLength).trim()}`);
    }
  }
  return lines.join('\n');
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
