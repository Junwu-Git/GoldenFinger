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
- **判定标记**：`[任务完成:T001]` / `[任务失败:T001]`（中英冒号与空白宽容）。正则单一来源 `core/injector.ts` 的 `MARKER_REGEX`，注入文本中的示例与它保持一致。结算对非 active 任务幂等。
- **货币判定**：奖励 `name === state.currencyName` 入 points，否则入背包（同名合并 count）。`normalizeTask` 已把「含货币名的奖励」归一，AI 稍微跑偏也能正确入账。
- **升级曲线**：`expToNext(level) = 60 + level * 60`（120 起步）。升级在结算末尾 while 循环处理，允许一次跨多级。
- **自动发布**：`noteAutoIssue()` 每 AI 回复（type 非 quiet）计数一次，达到 `autoIssueInterval` 且任务未满才返回 true；`issueTask` 成功后清零计数。
- **提示词模块化**：注入文本 = `settings.promptModules` 中 enabled 模块依序拼装，`{{变量}}` 由 `injector.buildVars` 填充（{{user}} 交给酒馆 substituteParams）。默认模板单一来源 `type/settings.ts` 的 `DEFAULT_PROMPT_MODULES`（schema default 用 `structuredClone` 工厂防共享引用污染）；模块数组为空时运行时回落默认。改注入文案只需要动默认模板或让用户在设置页编辑，预览/注入共用同一构建函数。
- **商店**：货架由 `core/shop-generator.ts` 生成（JSON 数组 4~6 件，提示词内写死价格带：普通 10~50 / 稀有 50~200 / 传说 200~1000，按宿主等级微调），逐件 zod 校验，失败保留旧货架。`GameState.shop` 为 null 表示从未开店；**首次进店 `ensureShop` 免费开张，`refreshShop` 换一批扣 `system.refreshCost`（失败退款）**；`buyItem` 即时结算（扣款→背包合并→库存-1）。稀有度 rarity 1~3（普通灰/稀有蓝/传说金），色板单一来源 `--gf-rarity-N`(+soft)。
- **API 配置的单一入口在面板「设置」页**：klona draftForm 编辑、保存才写 store；服务商预设（`core/api-presets.ts`，选预设自动填地址+示例模型）；「拉取模型」走 `window.TavernHelper.getModelList` 兼作连通测试（酒馆助手缺失时降级为仅手动填模型）。扩展设置抽屉刻意不放 API 设置。

## UI 要点（现状，可改）

- **双层结构（同 choice 的主面板 + 设置弹窗模式）**：
  - 主面板 `GamePanel.vue` = 单页直铺的状态总览（stat 格/经验条）+ 进行中任务卡（可手动结算）+ 发布按钮 + 已完结折叠区 + 最近动态，**没有标签页**；头部工具区（商店/背包/日志/系统/设置五个图标按钮）只负责打开二级窗口；未绑定时显示引导 CTA。
  - 二级窗口 `shared/GfWindow.vue` = Teleport 遮罩弹窗（拖拽、会话级开关），五个通用页面：系统（选系统/解绑）/ 商店 / 背包 / 日志 / 设置。页面开关单一信号在 `core/window-state.ts`（`isWindowOpen`/`activePage`/`openPage`，同 choice 的 floating-state 单例 ref 模式）。未绑定系统时窗口强制停在「系统」页。
  - `views/SystemSelectView.vue` 是独立的选系统界面（当前系统卡 + 全量系统网格，激活/解绑的 Popup 确认都收在这）。
- 主视觉「每系统主题色 `--gf-accent` + 暗色玻璃」；全部颜色/圆角/间距收成 `--gf-*` token（背景三层/文字三层/稀有度双色板），换肤只动 token。生成中走 header 下缘 shimmer 光带；视图切换 fade-slide；货架 stagger 入场。
- 空状态统一「大图标 + 风味文案 +（可选）行动按钮」；余额不足一律按钮置灰（不弹 toast），操作失败才 toast。
- **提示词在设置页两段呈现**：`提示词模板`（模块卡：名称+启停+textarea，单模块恢复/全部恢复默认，变量清单在脚本里拼——模板里直写 `{{ }}` 会被 Vue 吃掉）+ `提示词预览`（compose 结果只读镜像 + `getTokenCountAsync` token 数 + 复制）。
- 悬浮主面板 v-show 保挂载 + useDraggable 拖拽、位置持久化；有历史数据时激活新系统先弹酒馆 Popup 确认（防误清空）。
- i18n：界面文本全部 `t\`\``，插值 key 形如 `发布任务 ${0}《${1}》`，en.json 按此映射（新增文案后跑 key 对齐检查：0 missing / 0 unused / 0 重复）；注入给 AI 的提示词文本刻意不翻译（剧情语言）。

## 目录

- `src/core/`：api-client（主/副 API 统一入口）、api-presets（服务商预设）、task-generator（任务生成+解析）、shop-generator（货架生成+解析）、json.ts（LLM 文本抠 JSON 共用工具）、injector（模块化注入+判定标记）、window-state（二级窗口单例信号）、wand-menu（魔棒入口，轮询注入）。
- `src/store/`：settings（全局设置）、game（游玩状态+任务结算+商店 actions）。
- `src/type/`：game.ts（SystemDef/Task/ShopItem/GameState schema）、settings.ts（Settings schema + DEFAULT_PROMPT_MODULES，SCHEMA_VERSION=1）。
- `src/systems/builtin.ts`：5 个内置系统（含 shopName/refreshCost）；`findSystem(id, customSystems)` 是 id → 定义的唯一解析点。
- `src/components/`：GamePanel（主面板：状态+任务直铺）、SettingsDrawer（扩展抽屉：总开关/自定义系统/清数据）、`views/`（Shop/Inventory/Log/Settings/SystemSelect）、`shared/`（GfWindow 二级窗口、GfSectionCard、GfTaskCard）。
- `@types/`：酒馆助手类型包（全局 ambient 声明，无运行时产物）。

## 构建与验证

```bash
pnpm build       # production 构建 → dist/
pnpm typecheck   # vue-tsc --noEmit
pnpm lint
```

无单测，靠 typecheck/build/lint + 浏览器验证。核心交互改动至少确认：绑定系统 → 发任务 → AI 回复带标记 → 自动结算/升级 → 进店自动开张 → 购买 → 设置页改模板看预览变化 → API 保存，这条主链路可通。

## 未实现 / 规划

- 任务时限/失败惩罚的主动追踪（目前失败惩罚依赖任务 rewards 里的负数与 AI 演出）。
- 签到系统的「每日一次」真实日历限制（当前签到任务由 AI 生成的剧情任务承载）。
- 系统升级主动解锁新能力（当前等级只是称号与状态注入）；传说级商品的高级效果演出。
- 提示词模块拖拽排序与多套模板配置切换（当前模块固定顺序、单一模板）。
- 世界书/角色卡联动（把系统状态同步写进世界书条目等）。
