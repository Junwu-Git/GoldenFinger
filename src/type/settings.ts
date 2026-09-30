<<<<<<< HEAD
// 显式导入 z：auto-imports.d.ts 的全局 z 在类型位置无法当命名空间用（同 type/game.ts）
import { z } from 'zod';
import { SystemDef } from '@/type/game';

/** 设置结构版本：字段结构破坏性变更时 +1 并在 settings store 里写迁移 */
export const SCHEMA_VERSION = 5;

export const setting_field = 'golden_finger';

/** 副 API 配置：任务生成可走独立的小模型，不占用正文连接 */
export const ApiSettings = z.object({
  /** main = 酒馆当前连接（generateRaw）；secondary = 自定义 OpenAI 兼容端点直连 */
  mode: z.enum(['main', 'secondary']).default('main'),
  url: z.string().default(''),
  key: z.string().default(''),
  model: z.string().default(''),
  temperature: z.number().min(0).max(2).default(0.9).catch(0.9),
  /** 任务 JSON（批量）+ 思维链自检都不短，太长会截断导致解析失败 */
  maxTokens: z.number().int().min(64).max(8192).default(2500).catch(2500),
});

export type ApiSettings = z.infer<typeof ApiSettings>;

/**
 * 注入/生成共用的提示词模块（choice 式「模块即消息」）：
 * - inject 域模块按序拼成注入给正文 AI 的单段面板状态；
 * - generate 域模块按序组装成发给任务生成 API 的 messages（每个模块产出一条消息，相邻同 role 自动合并）。
 * marker = 系统内容槽：内容由运行时按 id 填充（当前状态/世界观/剧情），编辑器只能调位置与角色，不可编辑删除。
 */
export const PromptModule = z.object({
  id: z.string(),
  name: z.string().min(1).max(24),
  scope: z.enum(['inject', 'generate']).default('inject'),
  /** generate 域：本模块在请求 messages 中的角色；inject 域忽略 */
  role: z.enum(['system', 'user', 'assistant']).default('system'),
  marker: z.boolean().default(false),
  enabled: z.boolean().default(true),
  content: z.string().default(''),
});

export type PromptModule = z.infer<typeof PromptModule>;

/** 书层世界书覆盖模式：default=不覆盖（跟随酒馆激活），off=从生成中排除，force=强制纳入 */
export const zWorldBookMode = z.enum(['off', 'force', 'default']);
export type WorldBookMode = z.infer<typeof zWorldBookMode>;

/** 楼层过滤规则（生成前清洗参考文本，三型同 choice 的 ChatFilterRule）：
 *  tag = 剥成对标签（含内容）；regex = 正则替换（自动 gs 标志）；extract = 只保留指定标签内容（仅 AI 楼层） */
export const StoryFilterRule = z.discriminatedUnion('type', [
  z.object({ type: z.literal('tag'), start: z.string(), end: z.string() }),
  z.object({ type: z.literal('regex'), pattern: z.string(), replace: z.string() }),
  z.object({ type: z.literal('extract'), tagName: z.string() }),
]);

export type StoryFilterRule = z.infer<typeof StoryFilterRule>;

/**
 * 默认模块（照 choice 的提示词模块体系重写，模块顺序即消息顺序）：
 * - 注入域：正文 AI 的系统状态播报；
 * - 生成域（choice 六段式）：系统定位 → 应答声明(assistant 预填) → 资料槽(system，同 choice 资料区为 system)
 *   → 信息边界/契约/思考框架(system) → 风格重申+生成请求(user) → 思维链预填(assistant)。相邻同 role 合并后 =
 *   [sys 定位][asst 应答][sys 状态+世界观+剧情+边界+契约+自检][user 风格+请求][asst 预填]。
 * 可用变量：{{user}}/{{persona}} 交由酒馆 substituteParams 与运行时分别填充，其余为系统状态。
 */
export const DEFAULT_PROMPT_MODULES: PromptModule[] = [
  {
    id: 'header',
    name: '系统设定',
    scope: 'inject',
    role: 'system',
    marker: false,
    enabled: true,
    content: [
      '【系统设定 | 「{{systemName}}」已激活】',
      '设定：{{user}}被神秘的「{{systemName}}」绑定，只有{{user}}能感知系统的存在。系统消息以「叮！」开头，以仅{{user}}可见的系统面板形式呈现，其他角色对此一无所知。',
    ].join('\n'),
  },
  {
    id: 'persona',
    name: '系统人格',
    scope: 'inject',
    role: 'system',
    marker: false,
    enabled: true,
    content: '{{persona}}',
  },
  {
    id: 'status',
    name: '当前状态',
    scope: 'inject',
    role: 'system',
    marker: false,
    enabled: true,
    content: ['【当前系统状态】', '宿主：{{user}}｜{{level}}｜{{currency}}：{{points}}{{inventoryText}}'].join('\n'),
  },
  {
    id: 'tasks',
    name: '进行中任务',
    scope: 'inject',
    role: 'system',
    marker: false,
    enabled: true,
    content: ['【进行中的任务】', '{{tasks}}'].join('\n'),
  },
  {
    id: 'rules',
    name: '判定规则',
    scope: 'inject',
    role: 'system',
    marker: false,
    enabled: true,
    content: [
      '【任务判定规则（务必遵守）】',
      '- 当剧情明确显示{{user}}已完成某任务的要求、且事件已写入正文时，在回复的最末尾另起一行输出判定标记，如：[任务完成:T001]',
      '- 当剧情明确判定某任务已无法完成时，在回复末尾输出：[任务失败:T001]',
      '- 判定标记必须使用上述任务ID；除此之外，请在正文中自然展开剧情，可在任务达成或奖励发放处插入「叮！」开头的系统播报描写面板变化。',
      '- 错误示范：把判定标记混进对白、括号或段落中间；给【进行中的任务】之外的任务输出标记。',
      '- 不要在正文中解释标记机制；不要自行发明系统任务、奖励或判定，一切以【进行中的任务】为准。',
    ].join('\n'),
  },
  // ===== 任务生成请求模块（choice 式六段结构）：组装结果 = 发给生成 API 的完整 messages =====
  {
    id: 'gen_persona',
    name: '系统定位',
    scope: 'generate',
    role: 'system',
    marker: false,
    enabled: true,
    content: [
      '你在一部互动小说中扮演绑定于主角{{user}}的「金手指」——「{{systemName}}」。你不扮演故事里的任何角色，也不续写正文、不替{{user}}做任何决定；你只做一件事：以「{{systemName}}」的名义，根据宿主{{user}}的处境与最近剧情，发布贴合系统风格的系统任务。',
      '系统人格与播报风格：',
      '{{persona}}',
      '你发布的每一个任务都必须体现「{{systemName}}」的核心设定与风格：{{taskHint}}',
      '货币名称（奖励里必须逐字使用原文）：{{currency}}',
      '输出纪律：只输出 <thinking> 与任务 JSON 两种内容，除此之外一个字都不写；发现自己开始续写正文或扮演故事角色时，立即停下回到这两样东西。',
    ].join('\n\n'),
  },
  {
    id: 'gen_ack',
    name: '应答声明',
    scope: 'generate',
    role: 'assistant',
    marker: false,
    enabled: true,
    content:
      '收到。本轮按系统规则执行：结合世界观与最近剧情，发布恰好 {{taskCount}} 个贴合「{{systemName}}」风格的任务；先输出 <thinking> 自检，再输出 JSON 数组，不输出任何多余内容。',
  },
  {
    id: 'gen_state',
    name: '当前状态',
    scope: 'generate',
    role: 'system',
    marker: true,
    enabled: true,
    content: '',
  },
  {
    id: 'gen_world',
    name: '世界观背景',
    scope: 'generate',
    role: 'system',
    marker: true,
    enabled: true,
    content: '',
  },
  {
    id: 'gen_story',
    name: '最近剧情',
    scope: 'generate',
    role: 'system',
    marker: true,
    enabled: true,
    content: '',
  },
  {
    id: 'gen_rules',
    name: '信息边界',
    scope: 'generate',
    role: 'system',
    marker: false,
    enabled: true,
    content: [
      '【信息边界（非全知约束）】',
      '以下规则高于本批任务的一切信息来源：',
      '1. 信息分层：任务目标必须基于宿主{{user}}此刻可感知或早已知道的信息——此刻能看到、听到、碰到的具体事物，或其设定与经历里明确已知的事。其余一律视为宿主此刻不知道。',
      '2. 禁止越界：世界书与背景资料里只有读者能看到的信息（他人未公开的计划、远方正在发生的事、尚未揭示的真相），不得直接写成任务目标。要推动一条隐藏线索，必须通过宿主此刻可见的钩子触发——看见异样、听见动静、被当面告知——并把任务写成「因注意到…而调查…」「因怀疑…而试探…」这类形式。',
      '3. 逐条核查：每个任务定稿前自问——这个目标依赖的信息，宿主此刻拿得到吗？拿不到就改成由可感知钩子触发，或删掉这个任务。',
      '【批内梯度】',
      '一批 {{taskCount}} 个任务彼此目标不重叠、切入点各异，像一份正式的任务清单：难度按标尺拉开梯度，至少一条轻松的日常保底、一条有张力的压轴；方向覆盖当前情境下的不同可能性（社交、探索、战斗、经营等，按场景取用，不设限）；全部贴合「{{systemName}}」的任务风格。',
    ].join('\n'),
  },
  {
    id: 'gen_contract',
    name: '任务 JSON 契约',
    scope: 'generate',
    role: 'system',
    marker: false,
    enabled: true,
    content: [
      '【任务 JSON 契约（硬约束）】',
      '把一批新任务输出为一个 JSON 数组：数组用 [ ] 包裹、每个任务是一个对象、元素间用逗号分隔，形如：',
      '[{"title":"…","description":"…","requirements":"…","rewards":[{"name":"…","amount":10}],"expReward":30,"difficulty":2}]',
      '字段规格：',
      '- title：任务标题，12 字以内，有画面感；不要自己编任务编号，编号由系统分配。',
      '- description：任务描述，80 字以内——以系统的口吻交代背景、目标与紧迫感，让宿主一眼知道要做什么。',
      '- requirements：完成条件，20 字以内一句话，必须是能依据剧情明确判定成败的具体行为——剧情里能清楚看到「做成了 / 没做成」。',
      '- rewards：1~3 条；货币奖励的 name 必须逐字使用「{{currency}}」，物品奖励写具体物品名；amount 为整数，可为负（表示罚没）。',
      '- expReward：经验值，20~150 的整数，与难度正相关。',
      '- difficulty：1~5 的整数，按下方难度标尺给出。',
      '【难度标尺】',
      '1 顺手：日常小事，几乎无阻力（跑腿、寒暄、收拾屋子）。',
      '2 轻松：稍有不确定，多数情况能成（向熟人打听消息、完成一份寻常活计）。',
      '3 有挑战：明显障碍，要花力气或技巧（在宴会上周旋探听、潜入仓库取回失物）。',
      '4 吃力：强敌或高风险，失败有实际代价（与高手正面斗法、当众揭穿阴谋）。',
      '5 生死攸关：赌上性命或一切的大事——整批任务里至多一条。',
      '定难度时依次掂量：行为性质（观察、社交低于潜入、战斗）、场景障碍、宿主的等级与本领、失败后果。任务必须贴合宿主当前的能力与处境、能通过剧情行动完成，而不是纯运气事件。',
      '【目标写法】',
      '每个目标都落在剧情里一个具体可执行的行动上。"变得更强""击败强敌"是错误示范；应写成"在今晚的宴会上从管家口中问出密室钥匙的下落"这类可展开、可判定的目标。',
    ].join('\n'),
  },
  {
    id: 'gen_thinking',
    name: '思考框架',
    scope: 'generate',
    role: 'system',
    marker: false,
    enabled: true,
    content: [
      '正式输出前，把思考写出来，全部裹在 <thinking> 标签里。逐条作答，每条一两句即可：',
      '1. 最近剧情停在哪？宿主的等级、处境与手头任务是什么？从剧情里挑 2-3 个能直接落成任务的细节。',
      '2. 这批任务各指向什么方向？分别踩中「{{systemName}}」风格的哪一点？',
      '3. 合规自检：目标是否都可判定、互不重叠？是否都基于宿主可感知的信息？难度是否按标尺拉开、与宿主能力匹配？货币名称是否逐字用了「{{currency}}」？数量是否恰好 {{taskCount}} 个？',
      '核对无误即输出 JSON 数组；<thinking> 里不要出现 JSON 示例或方括号。',
    ].join('\n'),
  },
  {
    id: 'gen_style',
    name: '任务风格重申',
    scope: 'generate',
    role: 'user',
    marker: false,
    enabled: true,
    content: ['【任务风格（必须严格遵守）】', '{{taskHint}}'].join('\n'),
  },
  {
    id: 'gen_request',
    name: '生成请求',
    scope: 'generate',
    role: 'user',
    marker: false,
    enabled: true,
    content: [
      '【本轮任务：发布新任务】以「{{systemName}}」的身份与设定，结合上方当前状态、世界观与最近剧情（以 <current_scene> 标记的最新进展为准），发布恰好 {{taskCount}} 个新任务，组成一批任务清单。',
      '数量硬约束：恰好 {{taskCount}} 个，一个不多、一个不少；目标彼此不重叠、难度有梯度。任务要与当前情境有机衔接、宿主接了就能立刻展开；宁可贴合「{{systemName}}」的风格，也不要发布与该风格无关的泛泛任务。',
      '契约、信息边界与难度标尺见系统消息；先在 <thinking> 内完成自检，再输出 JSON 数组，数组之后一字不写。',
    ].join('\n\n'),
  },
  {
    id: 'gen_prefill',
    name: '思维链预填',
    scope: 'generate',
    role: 'assistant',
    marker: false,
    enabled: true,
    content: '收到，开始梳理剧情与任务方向。\n\n<thinking>\n',
  },
];

/** 分域默认模块（编辑器分区渲染 / 运行时回落 / 迁移补齐共用；使用点 structuredClone 防共享引用） */
export const DEFAULT_INJECT_MODULES = DEFAULT_PROMPT_MODULES.filter(module => module.scope === 'inject');
export const DEFAULT_GENERATE_MODULES = DEFAULT_PROMPT_MODULES.filter(module => module.scope === 'generate');

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
    /** 每 N 条 AI 回复自动发布一批新任务 */
    autoIssue: z.boolean().default(true),
    autoIssueInterval: z.number().int().min(1).max(50).default(3).catch(3),
    /** 结算后自动移除 AI 回复中的 [任务完成:Txxx] 判定标记 */
    removeMarkers: z.boolean().default(true),
    /** 任务生成请求的 assistant 预填（应答声明 + 思维链预填）；关闭后这些模块降级为 system 消息 */
    prefillEnabled: z.boolean().default(true),
    /** 任务生成时参考最近多少条消息 */
    storyMessages: z.number().int().min(2).max(30).default(10).catch(10),
    /** 任务生成时单条消息的最大截取长度 */
    storyMessageLength: z.number().int().min(50).max(600).default(160).catch(160),
    /** 生成任务/商品时读取角色卡核心字段 */
    useCharCard: z.boolean().default(true),
    /** 生成任务/商品时读取已激活的世界书条目 */
    useWorldInfo: z.boolean().default(true),
    /** 生成前对参考楼层执行的过滤规则（剥思维链/HTML/套话等） */
    storyFilterRules: z.array(StoryFilterRule).default([]),
    /** 生成前是否先走酒馆原生正则（全局/预设/角色卡已配置的脚本）再走本页 storyFilterRules */
    stRegexEnabled: z.boolean().default(true),
    /** 书层世界书覆盖（书名 → 模式）：配置了任一 off/force 时，生成改用手动组装参与书集；
     *  全为 default 时仍走酒馆原生 getWorldInfoPrompt 激活，零行为变化 */
    worldBookOverrides: z.record(z.string(), zWorldBookMode.default('default')).default({}),
    api: ApiSettings.prefault({}),
    /** 注入提示词模板（可编辑；default 用工厂防共享引用被就地污染） */
    promptModules: z.array(PromptModule).default(() => structuredClone(DEFAULT_PROMPT_MODULES)),
    customSystems: z.array(SystemDef).default([]),
    /** 面板窗口位置（-1 表示未初始化，首开时停靠右上） */
    panelPos: z.object({ x: z.number(), y: z.number() }).default({ x: -1, y: -1 }).catch({ x: -1, y: -1 }),
    panelVisible: z.boolean().default(false),
  })
  .prefault({});
=======
export type Settings = z.infer<typeof Settings>;
export const Settings = z
  .object({
    button_selected: z.boolean().default(false),
  })
  .prefault({});

export const setting_field = 'tavern_extension_example';
>>>>>>> 4121a8d9abe908f3b0a6a37322b05eef37e5cadc
