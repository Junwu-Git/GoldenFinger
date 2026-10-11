import { z } from 'zod';
import { type GameState, KIND_NAMES, type PassiveStateKind } from '@/type/game';

/** 追踪范围清单（单一来源）：提取提示词的「追踪范围」段与状态页展示共用，判定要点写进每条 hint */
export interface StateCatalogEntry {
  name: string;
  hint: string;
}

export const STATE_CATALOG: Array<{ kind: PassiveStateKind; items: StateCatalogEntry[] }> = [
  {
    kind: 'body',
    items: [
      { name: '外伤/疼痛', hint: '战斗、事故造成的伤口、淤青、骨折，持续到剧情痊愈才移除' },
      { name: '生病/中毒', hint: '感冒发烧、食物中毒、疫病，持续到痊愈' },
      { name: '疲惫/透支', hint: '长途跋涉、熬夜、剧烈运动或施法后的体力衰竭' },
      { name: '饥饿/口渴/困倦', hint: '基本生理需求长期未满足' },
      { name: '环境侵袭', hint: '严寒、酷热、潮湿等造成的体感（衣物庇护不足时）' },
      { name: '身体受限/感官异常', hint: '被束缚、负伤部位行动不便、耳鸣眩晕、暂时视物模糊' },
    ],
  },
  {
    kind: 'mind',
    items: [
      { name: '恐惧/惊吓余悸', hint: '刚经历危险后的紧张、后怕' },
      { name: '强烈情绪延续', hint: '愤怒、悲伤、羞耻等情绪的余波未平' },
      { name: '精神疲惫', hint: '心力交瘁、决策疲劳、情绪麻木' },
      { name: '迷失/混乱', hint: '方向感丧失、认知混乱、记忆恍惚' },
      { name: '精神影响残留', hint: '催眠、魅惑、精神控制消退前的残留效应' },
    ],
  },
  {
    kind: 'physio',
    items: [
      { name: '生理唤起', hint: '被画面、言语或触碰刺激起的身体反应' },
      { name: '贤者模式/不应期', hint: '释放后的疲软期、冷淡期' },
      { name: '欲望积压', hint: '长期未释放的渴望、燥热难耐' },
      { name: '敏感度异常', hint: '被开发/调教部位的敏感上升或异常' },
    ],
  },
];

/** 状态提取 ops 契约：add 新增（不带 id，编号系统分配）/ update 按 id 改字段 / remove 按 id 移除并附理由。
 *  按 id 增改删而非按名匹配：避免「受伤→左臂擦伤」的措辞漂移在清单里堆出重复条目 */
const STATE_OP_UNION = z.union([
  z.object({
    op: z.literal('add'),
    name: z.string().min(1).max(24),
    kind: z.enum(['body', 'mind', 'physio']).default('body').catch('body'),
    intensity: z.number().int().min(1).max(3).default(1).catch(1),
    note: z.string().max(60).default('').catch(''),
    /** 估计还能持续的 AI 回复数；null = 到剧情明确解除才移除 */
    durationFloors: z.number().int().min(0).max(99).nullable().default(null),
  }),
  z.object({
    op: z.literal('update'),
    id: z.string(),
    name: z.string().min(1).max(24).optional(),
    intensity: z.number().int().min(1).max(3).optional(),
    note: z.string().max(60).optional(),
    durationFloors: z.number().int().min(0).max(99).nullable().optional(),
  }),
  z.object({
    op: z.literal('remove'),
    id: z.string(),
    reason: z.string().max(60).default('').catch(''),
  }),
]);

/** ops 数组契约（独立导出，供合并维护请求按区复用） */
export const STATE_OPS_LIST_SCHEMA = STATE_OP_UNION.array().max(10);

/** 单区状态提取响应契约：{"ops":[...]} */
export const STATE_OPS_SCHEMA = z.object({ ops: STATE_OPS_LIST_SCHEMA.default([]) });

export type StateOp = z.infer<typeof STATE_OPS_LIST_SCHEMA>[number];

/** 追踪范围文本（提取提示词「追踪范围」段；物质影响单独说明归属规则） */
export function stateCatalogLines(): string[] {
  return [
    ...STATE_CATALOG.flatMap(group =>
      group.items.map(item => `- ${KIND_NAMES[group.kind]}｜${item.name}：${item.hint}`),
    ),
    '- 物质影响｜醉酒、药物、春药等：按主导感受归入身体或生理，kind 相应取 body 或 physio。',
  ];
}

/** 当前状态清单文本（提取请求用，字段与状态页表格同源） */
export function stateListText(gameState: GameState): string {
  return (
    gameState.passiveStates
      .map(
        state =>
          `${state.id} ${state.name}｜${KIND_NAMES[state.kind]}｜强度${state.intensity}${state.note ? `｜${state.note}` : ''}｜${state.remainingFloors === null ? '无自动消退' : `剩 ${state.remainingFloors} 楼`}`,
      )
      .join('\n') || '（当前无记录状态）'
  );
}
