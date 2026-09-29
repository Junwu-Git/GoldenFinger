# 金手指系统（GoldenFinger）— 项目说明

SillyTavern 第三方扩展，基于 `tavern_extension_template`（与 choice 插件同源）。核心：绑定金手指系统 → 异步调用 API 生成任务 → 判定结算奖励 → `setExtensionPrompt` 注入系统状态给正文 AI。技术栈 TypeScript + Vue 3 SFC + Pinia + Zod + Vite；产物 `dist/index.js` + `dist/index.css`。

## 协作约定

- 回复用中文；代码注释简体中文、简洁，解释「为什么」而非「做什么」。
- 本文件分**约束/不变量**与**现状快照**两类；用户当前的 UI 示例与口头指示优先级最高。
- 任何 `@sillytavern/...` 导入的签名/导出名不凭记忆，实现前先去真实酒馆源码核实（本机酒馆 1.18.0）。
- 自查用一次性的 `pnpm build` / `pnpm typecheck` / `pnpm lint`；`pnpm watch` 由用户在独立终端跑。
- 核心交互/UI 改动需浏览器验证；纯逻辑小改动可跳过。

## 关键架构约束

- **技术栈边界**：TS、Vue 3 SFC、Pinia、Zod、原生 CSS（gf- 前缀 + `--gf-accent` 主题变量）。jQuery 仅限挂载点与魔棒菜单注入（沿 choice 先例），不用于业务 DOM。
- **类型基座**：`@types/` 是酒馆助手（JS-Slash-Runner）类型包，经 tsconfig include 全局生效——`window.TavernHelper.*`、`SillyTavern.ChatMessage`、`TypeFest.*`（type-fest 的全局命名空间）可直接用；酒馆助手 API 签名以 `@types/function/*.d.ts` 为准，不凭记忆。`src/types/ambient.d.ts` 里的 `StChatMessage` 是 ST 原生楼层结构（mes/is_user），与酒馆助手 `ChatMessage`（message 字段名）是两套类型，勿混用。
- **酒馆助手桥接可选**：判定标记清理优先走 `window.TavernHelper.setChatMessages`（改写+重渲染+落盘一步完成，运行时探测），不可用时回退直改 ST 楼层数据（updateMessageBlock + saveChat）。主体功能不依赖酒馆助手安装。
- **数据读写走 Pinia store**：组件不直接读写 `extension_settings`/`chat_metadata`。全局设置在 `store/settings.ts`（落 `extension_settings.golden_finger`）；游玩状态在 `store/game.ts`（落 `chat_metadata.golden_finger`，随聊天文件走、每个聊天独立存档）。
- **ST API 收敛**：版本敏感 API 只出现在 `src/core/` 与 `src/store/`；组件层不碰。
- **游玩状态替换而非原地改**：`activateSystem`/`reload`/`resetState` 都用 `state.value = 新对象`，由 deep watch 统一落盘；`suppressPersist` 仅用于 reload 换聊天时抑制回写。
- **事件监听不 await 长任务**：ST 的 eventSource.emit 串行 await 监听器，MESSAGE_RECEIVED 里把任务生成的 Promise 脱钩 fire-and-forget，否则会推迟 CHARACTER_MESSAGE_RENDERED（酒馆助手楼层渲染挂在它上面）。判定标记解析保持同步，saveChat 脱钩。
- **任务生成提示词走角色结构**：system 放系统人格 + JSON 契约，user 放当前状态 + 剧情摘要 + 请求；生成是纯函数（`core/task-generator.ts`），不碰状态，由 store 落账。
- **主/副 API 双路**：`core/api-client.ts` 是统一入口。main 走 `generateRaw`（酒馆当前连接）；secondary 直连 `/api/backends/chat-completions/generate`（OpenAI 兼容端点），附带 `tool_choice:'none'` 绕过酒馆助手类脚本的 fetch patch（机制与 choice 相同）。

## 领域契约（不变量）

- **任务 JSON 契约**：`{title, description, requirements, rewards:[{name,amount}], expReward, difficulty}`。解析主路径 = 裸对象/围栏多候选 JSON.parse + zod，失败抛错提示重试；`normalizeTask` 钳制长度数值、剥离名称里的 `×N`、把含货币名的奖励归一为货币。
- **任务 id**：`T` + 三位序号（T001…），`taskCounter` 是序号唯一来源；判定标记与面板结算都按 id 匹配。
- **判定标记**：`[任务完成:T001]` / `[任务失败:T001]`（中英冒号与空白宽容）。正则单一来源 `core/injector.ts` 的 `MARKER_REGEX`，注入文本中的示例与它保持一致。结算对非 active 任务幂等。**「完成」没有手动入口**（玩家自结算已按用户要求移除）——完成唯一来自 AI 标记；面板上唯一的玩家操作是「放弃」（`setTaskStatus(id,'failed','manual')`，带确认弹窗），AI 漏判时用它腾出任务位。
- **货币判定**：奖励 `name === state.currencyName` 入 points，否则入背包（同名合并 count）。`normalizeTask` 已把「含货币名的奖励」归一，AI 稍微跑偏也能正确入账。
- **升级曲线**：`expToNext(level) = 60 + level * 60`（120 起步）。升级在结算末尾 while 循环处理，允许一次跨多级。
- **自动发布**：`noteAutoIssue()` 每 AI 回复（type 非 quiet）计数一次，达到 `autoIssueInterval` 且任务未满才返回 true；`issueTask` 成功后清零计数。
- **提示词模块化**：注入文本 = `settings.promptModules` 中 enabled 模块依序拼装，`{{变量}}` 由 `injector.buildVars` 填充（{{user}} 交给酒馆 substituteParams）。默认模板单一来源 `type/settings.ts` 的 `DEFAULT_PROMPT_MODULES`（schema default 用 `structuredClone` 工厂防共享引用污染）；模块数组为空时运行时回落默认。改注入文案只需要动默认模板或让用户在设置页编辑，预览/注入共用同一构建函数。
- **任务风格锚定**：taskHint 同时进 system 消息与 user 消息（user 层有【任务风格（必须严格遵守）】段 + 结尾硬性要求「宁可贴合风格，不要发布泛泛任务」）；内置系统的 taskHint 各带一句具体示例（如签到系统的「在城东钟楼敲响晚钟完成今日黄昏签到」）。改风格产出先动 taskHint，不要加泛泛的系统指令。
- **商店**：货架由 `core/shop-generator.ts` 生成（JSON 数组 4~6 件，提示词内写死价格带：普通 10~50 / 稀有 50~200 / 传说 200~1000，按宿主等级微调），逐件 zod 校验，失败保留旧货架。`GameState.shop` 为 null 表示从未开店；**首次进店 `ensureShop` 免费开张，`refreshShop` 换一批扣 `system.refreshCost`（失败退款）**；`buyItem` 即时结算（扣款→背包合并→库存-1）。稀有度 rarity 1~3（普通灰/稀有蓝/传说金），色板单一来源 `--gf-rarity-N`(+soft)。
- **生成上下文（角色卡/世界书/过滤）**：`core/context-builder.ts` 组装「世界观背景」块进任务/商品生成提示词。世界书**直接调酒馆原生 `getWorldInfoPrompt`**（倒序楼层 + 128000 预算 + trigger:'normal'，关键字/概率/深度全由酒馆管线处理，同 choice 的 buildWI；不自己造激活判定），before/after + depth≤2 条目聚合，总量截断防爆炸；角色卡读 context.characters 的描述/性格/场景（群聊跳过）。楼层过滤 `storyFilterRules`（tag/regex/extract 三型 discriminatedUnion）在 `buildStoryContext` 逐层执行，顺序 extract→tag→regex、清空丢层、非法正则跳过；**类型切换必须整体替换规则对象**（缺字段会让存档 zod 解析崩）。

## UI 要点（现状，可改）

- **UI 布局是五标签主面板且常显**：首页/商店/背包/日志/设置五个 tab 无论是否绑定系统都在（未绑定不隐藏 UI，这是用户明确要的）；首页顶部是系统块（绑定=当前系统卡+「更换系统」展开网格，未绑定=直接铺选择网格）；商店未绑定时显示引导而非空白。拖拽是**手写 pointer 实现**（header 为把手、按钮除外、touch-action:none、位置在 pointerup 时才落盘）——曾用 @vueuse useDraggable 出过「完全拖不动」，回退手写前先想清楚。
  - 页面组件在 `views/`：Home（系统块+状态+任务直铺）/ Shop / Inventory / Log / Settings / SystemSelect（选系统，被 Home 复用）；`core/window-state.ts` 与 GfWindow 已随双层结构方案废弃删除。
- 主视觉「每系统主题色 `--gf-accent` + 暗色玻璃」；全部颜色/圆角/间距收成 `--gf-*` token（背景三层/文字三层/稀有度双色板），换肤只动 token。生成中走 header 下缘 shimmer 光带；视图切换 fade-slide；货架 stagger 入场。
- 空状态统一「大图标 + 风味文案 +（可选）行动按钮」；余额不足一律按钮置灰（不弹 toast），操作失败才 toast。
- **提示词在设置页两段呈现**：`提示词模板`（模块卡：名称+启停+textarea，单模块恢复/全部恢复默认，变量清单在脚本里拼——模板里直写 `{{ }}` 会被 Vue 吃掉）+ `提示词预览`（compose 结果只读镜像 + `getTokenCountAsync` token 数 + 复制）。
- 悬浮主面板 v-show 保挂载，拖拽为手写 pointer 实现（位置持久化，见上）；有历史数据时激活新系统先弹酒馆 Popup 确认（防误清空）。
- i18n：界面文本全部 `t\`\``，插值 key 形如 `发布任务 ${0}《${1}》`，en.json 按此映射（新增文案后跑 key 对齐检查：0 missing / 0 unused / 0 重复）；注入给 AI 的提示词文本刻意不翻译（剧情语言）。

## 目录

- `src/core/`：api-client（主/副 API 统一入口）、api-presets（服务商预设）、context-builder（角色卡+世界书上下文，getWorldInfoPrompt 直调）、task-generator（任务生成+解析+楼层过滤）、shop-generator（货架生成+解析）、json.ts（LLM 文本抠 JSON 共用工具）、injector（模块化注入+判定标记）、wand-menu（魔棒入口，轮询注入）。
- `src/store/`：settings（全局设置）、game（游玩状态+任务结算+商店 actions）。
- `src/type/`：game.ts（SystemDef/Task/ShopItem/GameState schema）、settings.ts（Settings schema + DEFAULT_PROMPT_MODULES + StoryFilterRule，SCHEMA_VERSION=1）。
- `src/systems/builtin.ts`：5 个内置系统（含 shopName/refreshCost）；`findSystem(id, customSystems)` 是 id → 定义的唯一解析点。
- `src/components/`：GamePanel（五标签壳+手写拖拽）、SettingsDrawer（扩展抽屉：总开关/自定义系统/清数据）、`views/`（Home/Shop/Inventory/Log/Settings/SystemSelect）、`shared/`（GfSectionCard、GfTaskCard）。
- `@types/`：酒馆助手类型包（全局 ambient 声明，无运行时产物）。

## 构建与验证

```bash
pnpm build       # production 构建 → dist/
pnpm typecheck   # vue-tsc --noEmit
pnpm lint
```

无单测，靠 typecheck/build/lint + 浏览器验证。核心交互改动至少确认：绑定系统 → 发任务 → AI 回复带标记 → 自动结算/升级 → 进店自动开张 → 购买 → 面板可拖拽 → 设置页改模板/过滤规则看预览与生成变化 → API 保存，这条主链路可通。

## 未实现 / 规划

- 任务时限/失败惩罚的主动追踪（目前失败惩罚依赖任务 rewards 里的负数与 AI 演出）。
- 签到系统的「每日一次」真实日历限制（当前签到任务由 AI 生成的剧情任务承载）。
- 系统升级主动解锁新能力（当前等级只是称号与状态注入）；传说级商品的高级效果演出。
- 提示词模块拖拽排序与多套模板配置切换（当前模块固定顺序、单一模板）。
- 世界书/角色卡联动（把系统状态同步写进世界书条目等）。
