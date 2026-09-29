import { substituteParams } from '@sillytavern/script';
import { requestTaskCompletion, type ChatMsg } from '@/core/api-client';
import { parseJsonFromText } from '@/core/json';
import { type GameState, ParsedTask, type SystemDef } from '@/type/game';
import type { Settings } from '@/type/settings';

/** 要求 AI 严格输出任务 JSON 的说明（主路径），解析失败时另有括号启发式兜底在 parse 层 */
const TASK_JSON_INSTRUCTIONS = `把新任务输出为一个严格的 JSON 对象：不要输出任何解释性文字、前后缀或代码块标记。字段如下：
{
  "title": "任务标题，12字以内，有画面感",
  "description": "任务描述：交代背景、目标与紧迫感，80字以内",
  "requirements": "完成条件：一句话，20字以内，必须是能依据剧情明确判定成败的行为",
  "rewards": [{"name": "奖励名称", "amount": 数值}],
  "expReward": 经验值数值,
  "difficulty": 1到5的整数
}
生成要求：
- rewards 给 1~3 条；货币奖励的 name 必须使用给定的货币名称原文，物品奖励使用具体物品名称。
- expReward 建议 20~150，与难度正相关；amount 一般为正数。
- difficulty 与剧情张力匹配：日常小事 1~2，生死攸关 5。
- 任务要贴合宿主当前的能力与处境，能通过剧情行动完成，而不是纯运气事件。`;

/** 通过 API 异步生成一个新任务（纯函数：不碰状态，由 store 落账） */
export async function generateTaskViaApi(
  system: SystemDef,
  gameState: GameState,
  settings: Settings,
): Promise<ParsedTask> {
  const story = buildStoryContext(settings.storyMessages, settings.storyMessageLength);
  const activeTasks = gameState.tasks.filter(task => task.status === 'active');

  const stateLines = [
    `宿主等级：Lv.${gameState.level}`,
    `持有货币：${gameState.currencyName} ×${gameState.points}`,
    ...(gameState.inventory.length
      ? [`持有物品：${gameState.inventory.map(item => `${item.name}×${item.count}`).join('、')}`]
      : []),
    `进行中的任务：${activeTasks.map(task => `${task.id}《${task.title}》（${task.requirements}）`).join('；') || '无'}`,
  ];

  // 角色结构：system 放规则与人格，user 放状态、剧情上下文与本次请求
  const systemMsg: ChatMsg = {
    role: 'system',
    content: [
      `你在一部互动小说中扮演绑定于主角的「金手指」——「${system.name}」。`,
      system.persona,
      system.taskHint,
      `货币名称（奖励里必须严格使用）：${system.currencyName}`,
      TASK_JSON_INSTRUCTIONS,
    ]
      .filter(Boolean)
      .join('\n\n'),
  };

  const userMsg: ChatMsg = {
    role: 'user',
    content: substituteParams(
      [
        '【当前系统状态】',
        ...stateLines,
        '',
        '【最近剧情】',
        story || '（暂无剧情：请发布一个引导宿主迈出第一步的初始任务。）',
        '',
        '请根据最近剧情的走向，发布一个与当前情境有机衔接、能推动剧情的新任务。只输出 JSON 对象本身。',
      ].join('\n'),
    ),
  };

  const raw = await requestTaskCompletion({
    messages: [systemMsg, userMsg],
    mainResponseLength: settings.api.maxTokens,
  });

  return parseTaskJson(raw, system);
}

/** 取最近 N 条消息拼成「名字：内容」的剧情摘要，单条截断防 token 爆炸 */
export function buildStoryContext(count: number, maxLength: number): string {
  // chat 元素是 ST 原生楼层结构，显式断言（见 types/ambient.d.ts）
  const chat = (window.SillyTavern?.getContext?.()?.chat ?? []) as StChatMessage[];
  return chat
    .slice(-count)
    .filter(message => typeof message.mes === 'string' && message.mes.trim())
    .map(message => {
      const context = window.SillyTavern?.getContext?.();
      const name = message.is_user ? context?.name1 : message.name || context?.name2 || '???';
      return `${name}：${message.mes!.slice(0, maxLength).trim()}`;
    })
    .join('\n');
}

/** 解析 AI 返回的任务：JSON 主路径（围栏/裸对象多候选）+ 字段归一化 */
export function parseTaskJson(raw: string, system: SystemDef): ParsedTask {
  const parsed = parseJsonFromText(raw, ParsedTask);
  if (parsed) {
    return normalizeTask(parsed, system);
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
