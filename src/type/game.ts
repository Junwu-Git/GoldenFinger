// 显式导入 z：auto-imports.d.ts 生成的全局 const z 在类型位置无法当命名空间用
// （z.infer 报 TS2503，且该文件是生成物随时可能重生成），不能用
import { z } from 'zod';

// #region 系统定义

/** 内置与自定义金手指系统共用的定义。persona 会同时用于任务生成与提示词注入。 */
export const SystemDef = z.object({
  /** 唯一 id：内置系统为固定值，自定义系统以 custom_ 开头 */
  id: z.string().min(1).max(60),
  name: z.string().min(1).max(24),
  icon: z.string().default('✨'),
  /** 主题色（CSS 颜色值），面板与任务卡沿用它 */
  color: z.string().default('#8b5cf6'),
  currencyName: z.string().default('积分'),
  /** 一句话卖点，展示在系统选择卡片上 */
  tagline: z.string().default(''),
  /** 系统人格：以第三人称描述「该系统」的性格与播报风格，注入与生成共用 */
  persona: z.string().default(''),
  /** 任务风格指引：该系统倾向发布什么类型的任务，仅用于任务生成 */
  taskHint: z.string().default(''),
  /** 等级称号，下标为 level-1，超出后显示 Lv.N */
  levelNames: z.array(z.string()).default([]),
  maxActiveTasks: z.number().int().min(1).max(5).default(2).catch(2),
  /** 商店风味名：万宝楼/主神兑换处/积分商城… */
  shopName: z.string().default('系统商店'),
  /** 换一批货架的价格（货币）；首次开店免费，换一批收费 */
  refreshCost: z.number().int().min(0).max(99999).default(50).catch(50),
  builtin: z.boolean().default(false),
});

export type SystemDef = z.infer<typeof SystemDef>;

// #endregion

// #region 任务

export const Reward = z.object({
  /** 货币奖励的 name 必须与系统货币名完全一致，结算时据此入账 */
  name: z.string().min(1).max(24),
  /** 可为负数表示消耗/惩罚 */
  amount: z.number().min(-9999).max(99999),
});

export type Reward = z.infer<typeof Reward>;

export const TaskStatus = z.enum(['active', 'completed', 'failed']);
export type TaskStatus = z.infer<typeof TaskStatus>;

export const Task = z.object({
  id: z.string(),
  title: z.string().min(1).max(60),
  description: z.string().min(1).max(600),
  requirements: z.string().min(1).max(300),
  rewards: z.array(Reward).min(1).max(4),
  expReward: z.number().min(0).max(2000),
  difficulty: z.number().min(1).max(5),
  status: TaskStatus.default('active'),
  createdAt: z.number(),
  closedAt: z.number().nullable().default(null),
});

export type Task = z.infer<typeof Task>;

/** 任务生成接口返回的原始数据（尚未分配 id 与状态） */
export const ParsedTask = z.object({
  title: z.string().default('神秘任务'),
  description: z.string().default(''),
  requirements: z.string().default(''),
  rewards: z
    .array(Reward)
    .min(1)
    .prefault([{ name: '', amount: 10 }]),
  expReward: z.number().default(50).catch(50),
  difficulty: z.number().default(2).catch(2),
});

export type ParsedTask = z.infer<typeof ParsedTask>;

// #endregion

// #region 商店

/** 稀有度：1 普通 / 2 稀有 / 3 传说 */
export const RARITY_NAMES: Record<number, string> = { 1: '普通', 2: '稀有', 3: '传说' };

export const ShopItem = z.object({
  /** 货架内唯一；每次换一批整批重新生成 */
  id: z.string(),
  name: z.string().min(1).max(24),
  description: z.string().max(120).default(''),
  price: z.number().int().min(1).catch(10),
  /** null = 不限量 */
  stock: z.number().int().min(0).nullable().default(null).catch(null),
  rarity: z.number().int().min(1).max(3).default(1).catch(1),
});

export type ShopItem = z.infer<typeof ShopItem>;

/** 货架状态；GameState.shop 为 null 表示从未开店 */
export const ShopState = z.object({
  items: z.array(ShopItem).max(12).default([]),
  generatedAt: z.number().default(0),
  rollCount: z.number().int().default(0),
});

export type ShopState = z.infer<typeof ShopState>;

// #endregion

// #region 背包与日志

export const InventoryItem = z.object({
  name: z.string().min(1).max(24),
  description: z.string().max(120).default(''),
  count: z.number().min(-9999).max(9999),
});

export type InventoryItem = z.infer<typeof InventoryItem>;

export const LogEntry = z.object({
  time: z.number(),
  kind: z.enum(['info', 'task', 'reward', 'levelup', 'system']),
  text: z.string().max(400),
});

export type LogEntry = z.infer<typeof LogEntry>;
export type LogKind = LogEntry['kind'];

// #endregion

/** 每个聊天独立保存的游玩状态，存于聊天元数据（chat_metadata）中，随聊天文件走 */
export const GameState = z
  .object({
    activeSystemId: z.string().nullable().default(null),
    activatedAt: z.number().nullable().default(null),
    level: z.number().int().min(1).default(1).catch(1),
    exp: z.number().min(0).default(0).catch(0),
    points: z.number().default(0).catch(0),
    currencyName: z.string().default('积分'),
    /** 已发放的任务序号，用于生成 T001 之类的 id */
    taskCounter: z.number().int().default(0).catch(0),
    tasks: z.array(Task).max(100).default([]),
    inventory: z.array(InventoryItem).max(50).default([]),
    log: z.array(LogEntry).max(80).default([]),
    /** 距上次发布任务收到的 AI 回复数（自动发布用） */
    msgCounter: z.number().int().default(0).catch(0),
    /** 商店货架；null = 从未开店（首次进店免费生成） */
    shop: ShopState.nullable().default(null),
  })
  .prefault({});

export type GameState = z.infer<typeof GameState>;

/** 升到下一级所需经验：120 起步，每级 +40 */
export function expToNext(level: number): number {
  return 60 + level * 60;
}
