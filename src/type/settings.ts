// 显式导入 z：auto-imports.d.ts 的全局 z 在类型位置无法当命名空间用（同 type/game.ts）
import { z } from 'zod';
import { SystemDef } from '@/type/game';

/** 设置结构版本：字段结构破坏性变更时 +1 并在 settings store 里写迁移 */
export const SCHEMA_VERSION = 1;

export const setting_field = 'golden_finger';

/** 副 API 配置：任务生成可走独立的小模型，不占用正文连接 */
export const ApiSettings = z.object({
  /** main = 酒馆当前连接（generateRaw）；secondary = 自定义 OpenAI 兼容端点直连 */
  mode: z.enum(['main', 'secondary']).default('main'),
  url: z.string().default(''),
  key: z.string().default(''),
  model: z.string().default(''),
  temperature: z.number().min(0).max(2).default(0.9).catch(0.9),
  /** 任务 JSON 很短，不需要长回复 */
  maxTokens: z.number().int().min(64).max(8192).default(800).catch(800),
});

export type ApiSettings = z.infer<typeof ApiSettings>;

/** 注入提示词的组成模块：enabled 的模块按序拼装，{{变量}} 在注入时填充（同 choice 的模块化提示词思路） */
export const PromptModule = z.object({
  id: z.string(),
  name: z.string().min(1).max(24),
  enabled: z.boolean().default(true),
  content: z.string(),
});

export type PromptModule = z.infer<typeof PromptModule>;

/** 可用变量：{{user}}/{{persona}} 交由酒馆 substituteParams 与运行时分别填充，其余为系统状态 */
export const DEFAULT_PROMPT_MODULES: PromptModule[] = [
  {
    id: 'header',
    name: '系统设定',
    enabled: true,
    content: [
      '【系统设定 | 「{{systemName}}」已激活】',
      '设定：{{user}}被神秘的「{{systemName}}」绑定，只有{{user}}能感知系统的存在。系统消息以「叮！」开头，以仅{{user}}可见的系统面板形式呈现，其他角色对此一无所知。',
    ].join('\n'),
  },
  {
    id: 'persona',
    name: '系统人格',
    enabled: true,
    content: '{{persona}}',
  },
  {
    id: 'status',
    name: '当前状态',
    enabled: true,
    content: ['【当前系统状态】', '宿主：{{user}}｜{{level}}｜{{currency}}：{{points}}{{inventoryText}}'].join('\n'),
  },
  {
    id: 'tasks',
    name: '进行中任务',
    enabled: true,
    content: ['【进行中的任务】', '{{tasks}}'].join('\n'),
  },
  {
    id: 'rules',
    name: '判定规则',
    enabled: true,
    content: [
      '【任务判定规则（务必遵守）】',
      '- 当剧情明确显示{{user}}已完成某任务的要求、且事件已写入正文时，在回复的最末尾另起一行输出判定标记，如：[任务完成:T001]',
      '- 当剧情明确判定某任务已无法完成时，在回复末尾输出：[任务失败:T001]',
      '- 判定标记必须使用上述任务ID；除此之外，请在正文中自然展开剧情，可在任务达成或奖励发放处插入「叮！」开头的系统播报描写面板变化。',
      '- 不要在正文中解释标记机制；不要自行发明系统任务、奖励或判定，一切以【进行中的任务】为准。',
    ].join('\n'),
  },
];

export type Settings = z.infer<typeof Settings>;
export const Settings = z
  .object({
    schema_version: z.number().default(SCHEMA_VERSION),
    /** 总开关：关闭后停止提示词注入（面板仍可查看与手动结算） */
    enabled: z.boolean().default(true),
    /** 注入位置：in_chat = 对话末尾按深度插入（推荐）；in_prompt = 主提示词区 */
    injectionPosition: z.enum(['in_chat', 'in_prompt']).default('in_chat'),
    /** in_chat 模式下距对话末尾的深度 */
    injectionDepth: z.number().int().min(0).max(20).default(4).catch(4),
    /** 每 N 条 AI 回复自动发布新任务 */
    autoIssue: z.boolean().default(false),
    autoIssueInterval: z.number().int().min(1).max(50).default(6).catch(6),
    /** 结算后自动移除 AI 回复中的 [任务完成:Txxx] 判定标记 */
    removeMarkers: z.boolean().default(true),
    /** 任务生成时参考最近多少条消息 */
    storyMessages: z.number().int().min(2).max(30).default(10).catch(10),
    /** 任务生成时单条消息的最大截取长度 */
    storyMessageLength: z.number().int().min(50).max(600).default(160).catch(160),
    api: ApiSettings.prefault({}),
    /** 注入提示词模板（可编辑；default 用工厂防共享引用被就地污染） */
    promptModules: z.array(PromptModule).default(() => structuredClone(DEFAULT_PROMPT_MODULES)),
    customSystems: z.array(SystemDef).default([]),
    /** 面板窗口位置（-1 表示未初始化，首开时停靠右上） */
    panelPos: z.object({ x: z.number(), y: z.number() }).default({ x: -1, y: -1 }).catch({ x: -1, y: -1 }),
    panelVisible: z.boolean().default(false),
  })
  .prefault({});
