// 显式导入 z：auto-imports.d.ts 生成的全局 const z 在类型位置无法当命名空间用
// （z.infer 报 TS2503，且该文件是生成物随时可能重生成），不能用
import { z } from 'zod';

// #region 系统定义

/** 技能数值效果：纯剧情技能可附加的被动加成——每次任务结算时触发。
 *  points=结算加货币、exp=结算加经验；none 纯剧情无加成。complete_task 不适合被动，故不提供。 */
export const SystemSkillEffect = z.object({
  type: z.enum(['points', 'exp', 'none']).default('none'),
  amount: z.number().int().default(0).catch(0),
});

export type SystemSkillEffect = z.infer<typeof SystemSkillEffect>;

/** 系统专属技能：宿主 Lv ≥ unlockLevel 时自动觉醒，纯剧情能力；可附加被动数值效果 effect（见 SystemSkillEffect） */
export const SystemSkill = z.object({
  name: z.string().min(1).max(24),
  description: z.string().min(1).max(300),
  /** 觉醒所需等级（Lv 到达即觉醒，可从 1 级起自带） */
  unlockLevel: z.number().int().min(1).max(99).default(1),
  /** 被动数值加成（可选；内置纯剧情技能缺省即无加成），每次任务结算时触发 */
  effect: SystemSkillEffect.optional(),
});

export type SystemSkill = z.infer<typeof SystemSkill>;

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
  /** 系统世界观：该系统所处世界的整体设定/规则，生成任务与货架时作为更宏观的取景来源 */
  worldview: z.string().default(''),
  /** 宿主长期目标：跨越单条剧情的追求，让生成内容不必只围绕当前场景展开 */
  goal: z.string().default(''),
  /** 该系统可觉醒的专属技能：宿主 Lv ≥ unlockLevel 时自动觉醒（纯剧情能力，注入给 AI 在剧情里施展） */
  skills: z.array(SystemSkill).default([]),
  /** 等级称号，下标为 level-1，超出后显示 Lv.N */
  levelNames: z.array(z.string()).default([]),
  maxActiveTasks: z.number().int().min(1).max(5).default(2).catch(2),
  /** 商店风味名：万宝楼/主神兑换处/积分商城… */
  shopName: z.string().default('系统商店'),
  /** 换一批货架的价格（货币）；首次开店免费，换一批收费 */
  refreshCost: z.number().int().min(0).max(99999).default(50).catch(50),
  /** 每日签到奖励：设置后，奖励名等于 dailyReward.name 的结算按自然日设限——当日首笔入账，同日重复只保留经验不再给奖。
   *  未设置（内置其余系统）则无每日限制 */
  dailyReward: z
    .object({
      name: z.string().min(1).max(24),
      amount: z.number().int().min(0).max(99999),
    })
    .optional(),
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

export const TaskStatus = z.enum(['active', 'completed', 'failed', 'voided']);
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
  /** 任务截止时间戳（ms）；null = 不限时（旧档无期限任务不误杀） */
  deadline: z.number().nullable().default(null),
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

/** 身体改造负载：使用后把目标角色的某项属性向某方向改动。tiers=档位标签（如 ["平坦","A","B","C","D","E"]），value 作为下标展示 */
export const AttributeFx = z.object({
  /** 目标角色名，留空 = 主角（女主） */
  target: z.string().max(24).default(''),
  /** 属性名：罩杯/身材/敏感度… */
  attribute: z.string().min(1).max(24),
  /** 增减量：新建的属性以它起步，已有的在其原值上加减 */
  amount: z.number().int().default(1).catch(1),
  /** 单位后缀（档/cm…）；tiers 存在时展示用 tiers[value] 而非 value+unit */
  unit: z.string().max(8).default(''),
  /** 可选档位标签，value 作为下标 */
  tiers: z.array(z.string()).max(12).default([]),
});

export type AttributeFx = z.infer<typeof AttributeFx>;

/** 物品效果：AI 在商品生成契约里指定的结构化效果，购买入包后在背包里可主动「使用」。
 *  type=none 表示纯收藏/剧情道具，无使用入口；type=attribute 表示身体改造（优先读 attribute 负载）。
 *  amount 语义随 type 而定（货币/经验数值；attribute 时作为属性增减量后备）。 */
export const ItemEffect = z.object({
  type: z.enum(['points', 'exp', 'complete_task', 'attribute', 'none']).default('none'),
  amount: z.number().int().default(0).catch(0),
  /** 身体改造负载（type='attribute' 时有值） */
  attribute: AttributeFx.optional(),
});

export type ItemEffect = z.infer<typeof ItemEffect>;

/** 背包内可使用的物品效果默认值（避免到处手写对象字面量） */
export function defaultEffect(): ItemEffect {
  return { type: 'none', amount: 0 };
}

export const ShopItem = z.object({
  /** 货架内唯一；每次换一批整批重新生成 */
  id: z.string(),
  name: z.string().min(1).max(24),
  description: z.string().max(120).default(''),
  price: z.number().int().min(1).catch(10),
  /** null = 不限量 */
  stock: z.number().int().min(0).nullable().default(null).catch(null),
  rarity: z.number().int().min(1).max(3).default(1).catch(1),
  effect: ItemEffect.default(() => defaultEffect()),
  /** 货品来源：system=系统通用批次 / character=角色卡专属批次（商店两栏分别生成） */
  category: z.enum(['system', 'character']).default('system'),
  /** 货品形态：item=实体物品（购买入背包）/ skill=技能（购买直接习得、不入背包） */
  kind: z.enum(['item', 'skill']).default('item'),
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
  /** 购买时从商品带入；任务奖励入包的物品为默认 none（纯收藏） */
  effect: ItemEffect.default(() => defaultEffect()),
});

export type InventoryItem = z.infer<typeof InventoryItem>;

/** 玩家从商店习得的技能（技能商品购买直接进此集合，注入给正文 AI 在剧情里施展） */
export const LearnedSkill = z.object({
  name: z.string().min(1).max(24),
  description: z.string().max(300).default(''),
  /** 习得来源（系统名） */
  source: z.string().max(24).default(''),
});

export type LearnedSkill = z.infer<typeof LearnedSkill>;

/** 身体改造数值属性：使用 attribute 类物品后 upsert；tiers 存在时以 value 作下标展示 */
export const BodyAttribute = z.object({
  /** 目标角色名（如「女主」），留空同主角 */
  target: z.string().max(24).default(''),
  name: z.string().min(1).max(24),
  value: z.number().int().default(0).catch(0),
  unit: z.string().max(8).default(''),
  tiers: z.array(z.string()).max(12).default([]),
});

export type BodyAttribute = z.infer<typeof BodyAttribute>;

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
    /** 从商店习得的技能（购买技能商品直接进此集合，注入给正文 AI） */
    learnedSkills: z.array(LearnedSkill).max(50).default([]),
    /** 身体改造数值属性（使用 attribute 类物品后 upsert，面板展示 + 注入 AI） */
    attributes: z.array(BodyAttribute).max(50).default([]),
    log: z.array(LogEntry).max(80).default([]),
    /** 距上次发布任务收到的 AI 回复数（自动发布用） */
    msgCounter: z.number().int().default(0).catch(0),
    /** 距上次判定收到的 AI 回复数（自动判定用） */
    judgeMsgCounter: z.number().int().default(0).catch(0),
    /** 商店货架；null = 从未开店（首次进店免费生成） */
    shop: ShopState.nullable().default(null),
    /** 每日签到日历记录：lastSignInDate = 最近一次签到的本地日期（YYYY-MM-DD），streak = 连续签到天数 */
    signIn: z
      .object({
        lastSignInDate: z.string().nullable().default(null),
        streak: z.number().int().min(0).default(0).catch(0),
      })
      .default(() => ({ lastSignInDate: null, streak: 0 })),
  })
  .prefault({});

export type GameState = z.infer<typeof GameState>;

/** 升到下一级所需经验：120 起步，每级 +60 */
export function expToNext(level: number): number {
  return 60 + level * 60;
}
