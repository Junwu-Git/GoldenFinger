import { substituteParams } from '@sillytavern/script';
import { z } from 'zod';
import { requestTaskCompletion, type ChatMsg } from '@/core/api-client';
import { parseJsonFromText } from '@/core/json';
import { buildVars, fillVars } from '@/core/prompt-vars';
import { stateCatalogLines, stateListText, STATE_OPS_LIST_SCHEMA, STATE_OPS_SCHEMA, type StateOp } from '@/core/state-tracker';
import { buildChatFloors } from '@/core/task-generator';
import { type GameState, type SystemDef, type Task } from '@/type/game';
import type { Settings } from '@/type/settings';

/** 后台维护的区块开关：judge=任务裁定、states=被动状态提取；至少一个为 true。
 *  双开时合并为一次请求（共用楼层上下文），单开时保持各自独立的提示词与契约 */
export interface MaintenanceSections {
  judge: boolean;
  states: boolean;
}

/** 维护结果（纯数据）：被请求但未返回有效数据的区块为 null，由 store 决定报错/告警；
 *  未请求的区块恒为 null */
export interface MaintenanceOutcome {
  verdicts: Array<{ id: string; status: 'completed' | 'failed' }> | null;
  stateOps: StateOp[] | null;
}

/** 判定结果契约：只列出本次已可结算的进行中任务 */
const VERDICT_SCHEMA = z.array(z.object({ id: z.string(), status: z.enum(['completed', 'failed']) })).max(20);

/** 合并维护响应契约：两区独立容错——单区缺失/非法只降级该区，不拖垮另一区 */
const MAINTENANCE_SCHEMA = z.object({
  verdicts: VERDICT_SCHEMA.nullish().catch(undefined),
  ops: STATE_OPS_LIST_SCHEMA.nullish().catch(undefined),
});

/** 任务条目的时限标注：剩余约N分钟 / 已逾期；无时限任务不标注（本地超时扫描会在逾期时先行强制结算，
 *  已逾期仅出现在扫描未及的间隙，一并下发让 AI 可立即裁定） */
function taskDeadlineTag(task: Task, now: number): string {
  if (task.deadline === null) {
    return '';
  }
  const remainMs = task.deadline - now;
  if (remainMs <= 0) {
    return '[已逾期]';
  }
  return `[剩余约${Math.max(1, Math.ceil(remainMs / 60000))}分钟]`;
}

/** 判定任务清单的共用行：编号《标题》（要求）+ 时限标注 */
function taskListLines(gameState: GameState): string {
  const now = Date.now();
  return (
    gameState.tasks
      .filter(task => task.status === 'active')
      .map(task => `${task.id}《${task.title}》（${task.requirements}）${taskDeadlineTag(task, now)}`)
      .join('\n') || '（当前没有进行中的任务）'
  );
}

/** 任务裁定单区请求：契约 system → 真实剧情楼层 → user 请求（判定是玩家侧一条独立的结算路径） */
function composeJudgeMessages(system: SystemDef, gameState: GameState, settings: Settings): ChatMsg[] {
  const vars = buildVars(system, gameState);
  const contract = substituteParams(
    fillVars(
      [
        '你是绑定于主角{{user}}的「{{systemName}}」任务裁定者。你唯一要做的事：对照最近剧情，逐条裁决进行中的任务完成/失败。',
        '判定纪律：',
        '- 只有剧情里明确可见「做成」才给 completed；剧情明确「已无法完成」才给 failed；证据不足、仍在推进的任务不要输出（保持进行中）。',
        '- 任务可能带 [剩余约N分钟] 时限标注：可结合时限与剧情提前裁定——时限内剧情已无完成可能即判 failed；无标注的任务不受时限影响。',
        '- 楼层正文开头可能出现 <!-- --> 形式的注释（骰子裁定等系统记录）：其中记录的结局与程度可作为剧情证据结合裁决；注释不是任务标记。',
        '- 一个任务最多判定一次；不要对进行中任务列表之外的编号下结论。',
        '- 只输出 JSON 数组，形如 [{"id":"T001","status":"completed"}]，除此之外一字不写。',
        '先输出 <thinking> 自检，再输出 JSON 数组。',
      ].join('\n'),
      vars,
    ),
  );
  const request = substituteParams(
    fillVars(`【进行中任务】\n${taskListLines(gameState)}\n\n请对照最近剧情，逐条裁决这些任务的完成/失败，只输出 JSON 数组。`, vars),
  );
  return appendFloors([{ role: 'system', content: contract }], { role: 'user', content: request }, settings);
}

/** 状态提取单区请求（同判定的三段结构）：契约 system → 最近剧情楼层 → user 携当前清单的维护请求 */
function composeStateMessages(system: SystemDef, gameState: GameState, settings: Settings): ChatMsg[] {
  const vars = buildVars(system, gameState);
  // 追踪范围从 STATE_CATALOG 生成（与状态页同源）
  const contract = substituteParams(
    fillVars(
      [
        '你是绑定于主角{{user}}的「状态追踪者」。你不扮演故事里的任何角色，也不续写正文；你唯一要做的事：对照最近剧情，维护一份{{user}}的被动身心状态清单——不受{{user}}主观控制的身体/精神/生理状态。',
        '判定标准：状态必须是{{user}}主观选择之外的后果（受伤、环境、生理周期、他人影响等），且剧情里有明确证据；{{user}}主动决定去做的事（攻击、对话、移动）不算状态。',
        '【追踪范围（只记录以下类别，超出范围的不要记录）】',
        ...stateCatalogLines(),
        '维护纪律：',
        '- 只记录剧情中明确发生或持续存在的状态；没有证据不要编造。',
        '- 强度：1=轻微 2=明显 3=严重。剧情里状态好转或恶化时，用 update 调整强度。',
        '- 时效：会随剧情自然消退的状态（醉酒、亢奋、贤者模式等）给出 durationFloors（估计还能持续的 AI 回复数）；要到剧情明确痊愈/解除才消失的状态（伤病、诅咒等）durationFloors 给 null。',
        '- 剧情明确显示某状态已解除时，用 remove 移除；没有任何变化时输出空 ops——不要为了输出而输出。',
        '输出契约：只输出 JSON 对象，形如：',
        '{"ops":[{"op":"add","name":"…","kind":"body|mind|physio","intensity":1,"note":"来历一句话","durationFloors":null},{"op":"update","id":"S002","intensity":3},{"op":"remove","id":"S001","reason":"已痊愈"}]}',
        'op=update/remove 时 id 必须取自当前状态清单中的编号；add 不带 id（编号由系统分配）。',
        '先输出 <thinking> 自检，再输出 JSON，除此之外一字不写。',
      ].join('\n'),
      vars,
    ),
  );
  const request = substituteParams(
    fillVars(
      `【当前状态清单】\n${stateListText(gameState)}\n\n请对照最近剧情维护上述清单：新增新产生的状态、更新有变化的状态、移除已解除的状态；没有变化就输出空 ops。只输出 JSON 对象。`,
      vars,
    ),
  );
  return appendFloors([{ role: 'system', content: contract }], { role: 'user', content: request }, settings);
}

/** 合并维护请求：任务裁定 + 状态提取共用一份契约 system 与楼层，输出 {"verdicts":[...],"ops":[...]}；
 *  只下发启用区块的规则与键（单开时走各自的单区请求，提示词更聚焦） */
function composeMaintenanceMessages(
  system: SystemDef,
  gameState: GameState,
  settings: Settings,
  sections: MaintenanceSections,
): ChatMsg[] {
  const vars = buildVars(system, gameState);
  const contractLines = [
    '你是绑定于主角{{user}}的「{{systemName}}」后台维护者。你不扮演故事里的任何角色，也不续写正文；你唯一要做的事：对照最近剧情，完成下方交办的维护区块。',
  ];
  if (sections.judge) {
    contractLines.push(
      '【区块一｜任务裁定】',
      '- 只有剧情里明确可见「做成」才给 completed；剧情明确「已无法完成」才给 failed；证据不足、仍在推进的任务不要输出（保持进行中）。',
      '- 任务可能带 [剩余约N分钟] 时限标注：可结合时限与剧情提前裁定——时限内剧情已无完成可能即判 failed；无标注的任务不受时限影响。',
      '- 一个任务最多判定一次；不要对进行中任务列表之外的编号下结论。',
    );
  }
  if (sections.states) {
    contractLines.push(
      '【区块二｜状态追踪】维护一份{{user}}的被动身心状态清单——不受{{user}}主观控制的身体/精神/生理状态。',
      '判定标准：状态必须是{{user}}主观选择之外的后果（受伤、环境、生理周期、他人影响等），且剧情里有明确证据；{{user}}主动决定去做的事（攻击、对话、移动）不算状态。',
      '【追踪范围（只记录以下类别，超出范围的不要记录）】',
      ...stateCatalogLines(),
      '维护纪律：',
      '- 只记录剧情中明确发生或持续存在的状态；没有证据不要编造。',
      '- 强度：1=轻微 2=明显 3=严重。剧情里状态好转或恶化时，用 update 调整强度。',
      '- 时效：会随剧情自然消退的状态（醉酒、亢奋、贤者模式等）给出 durationFloors（估计还能持续的 AI 回复数）；要到剧情明确痊愈/解除才消失的状态（伤病、诅咒等）durationFloors 给 null。',
      '- 剧情明确显示某状态已解除时，用 remove 移除；没有任何变化的区块输出空数组——不要为了输出而输出。',
    );
  }
  // 输出契约只含启用区块的键：模型漏输出某键即该区失败，不得臆造
  const exampleParts: string[] = [];
  if (sections.judge) {
    exampleParts.push('"verdicts":[{"id":"T001","status":"completed"}]');
  }
  if (sections.states) {
    exampleParts.push(
      '"ops":[{"op":"add","name":"…","kind":"body|mind|physio","intensity":1,"note":"来历一句话","durationFloors":null},{"op":"update","id":"S002","intensity":3},{"op":"remove","id":"S001","reason":"已痊愈"}]',
    );
  }
  contractLines.push(
    '输出契约：只输出一个 JSON 对象，形如：',
    `{${exampleParts.join(',')}}`,
    'op=update/remove 时 id 必须取自对应清单中的编号；add 不带 id（编号由系统分配）；未交办的区块不得输出对应键。',
    '先输出 <thinking> 自检，再输出 JSON，除此之外一字不写。',
  );
  const contract = substituteParams(fillVars(contractLines.join('\n'), vars));

  const requestParts: string[] = [];
  if (sections.judge) {
    requestParts.push(`【进行中任务】\n${taskListLines(gameState)}`);
  }
  if (sections.states) {
    requestParts.push(`【当前状态清单】\n${stateListText(gameState)}`);
  }
  const request = substituteParams(
    fillVars(
      `${requestParts.join('\n\n')}\n\n请对照最近剧情完成上述维护区块：只对有明确剧情证据的条目动手，没有变化就输出空数组。只输出 JSON 对象。`,
      vars,
    ),
  );
  return appendFloors([{ role: 'system', content: contract }], { role: 'user', content: request }, settings);
}

/** 三段结构的公共尾段：契约 system 之后接真实剧情楼层（取景/过滤与任务生成一致），末尾是 user 请求 */
function appendFloors(msgs: ChatMsg[], request: ChatMsg, settings: Settings): ChatMsg[] {
  const floors = buildChatFloors(
    settings.contextMode,
    settings.contextRounds,
    settings.storyFilterRules,
    settings.stRegexEnabled,
  );
  if (floors.length > 0) {
    msgs.push(...floors);
  }
  msgs.push(request);
  return msgs;
}

/**
 * 后台维护请求（纯函数：不碰状态，由 store 落账）：双开区块时一次请求同时完成裁定与状态提取，
 * 共用楼层上下文；单开时退回各自独立契约。单区请求解析失败直接抛错（手动按钮的报错语义）；
 * 合并请求按区降级——某区无效返回 null，两区都无效才抛错。
 */
export async function requestMaintenance(
  system: SystemDef,
  gameState: GameState,
  settings: Settings,
  sections: MaintenanceSections,
): Promise<MaintenanceOutcome> {
  const merged = sections.judge && sections.states;
  const messages = merged
    ? composeMaintenanceMessages(system, gameState, settings, sections)
    : sections.judge
      ? composeJudgeMessages(system, gameState, settings)
      : composeStateMessages(system, gameState, settings);
  const raw = await requestTaskCompletion({ messages, mainResponseLength: settings.api.maxTokens });

  if (merged) {
    const parsed = parseJsonFromText(raw, MAINTENANCE_SCHEMA, '{');
    if (parsed) {
      return { verdicts: parsed.verdicts ?? null, stateOps: parsed.ops ?? null };
    }
    // 模型无视对象要求只回了单一区块结果时的兜底：能救回一个区块总比全失败强
    const verdicts = parseJsonFromText(raw, VERDICT_SCHEMA, '[');
    if (verdicts) {
      return { verdicts, stateOps: null };
    }
    const ops = parseJsonFromText(raw, STATE_OPS_SCHEMA, '{');
    if (ops) {
      return { verdicts: null, stateOps: ops.ops };
    }
    console.error('[GoldenFinger] 后台维护原始输出：', raw);
    throw new Error(t`AI 没有返回有效的维护结果，请重试`);
  }
  if (sections.judge) {
    const parsed = parseJsonFromText(raw, VERDICT_SCHEMA, '[');
    if (!parsed) {
      console.error('[GoldenFinger] 判定 API 原始输出：', raw);
      throw new Error(t`AI 没有返回有效的判定结果，请重试`);
    }
    return { verdicts: parsed, stateOps: null };
  }
  const parsed = parseJsonFromText(raw, STATE_OPS_SCHEMA, '{');
  if (!parsed) {
    console.error('[GoldenFinger] 状态提取原始输出：', raw);
    throw new Error(t`AI 没有返回有效的状态清单结果，请重试`);
  }
  return { verdicts: null, stateOps: parsed.ops };
}
