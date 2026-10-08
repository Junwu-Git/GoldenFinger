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
- **判定标记**：`[任务完成:T001]` / `[任务失败:T001]`（中英冒号与空白宽容）。正则单一来源 `core/injector.ts` 的 `MARKER_REGEX`，注入文本中的示例与它保持一致。结算对非 active 任务幂等。**「完成」有三个来源**：① 正文 AI 标记（`handleMessageMarkers` 解析）；② **独立判定 API**（`store/game.ts` 的 `judgeTasks`，`core/task-generator.ts` 的 `composeJudgeMessages/adjudicateTasks`，首页手动按钮或 `autoJudge` 自动触发，不依赖主 AI 写标记）；③ 商店「自动完成」消耗品（`useItem` 的 `complete_task` 效果）。三个完成来源汇入 `setTaskStatus(id,'completed')` 幂等结算；**失败来源**：正文 AI 失败标记、独立判定 API 的 failed、任务超时（`source='timeout'`，`checkTaskDeadlines` 扫描）——失败都由任务生成时写死的条件（deadline / AI 判定）决定，不由玩家手动触发。玩家面板「放弃」是中性「作废」（`setTaskStatus(id,'voided','manual')`，`TaskStatus` 含 `voided`，不计失败、无惩罚、仅从进行中移除）。玩家面板操作：进行中任务卡「放弃」（带确认弹窗，作废不计失败）、首页「独立判定」按钮、背包「使用」有效果物品——完成不再唯一来自 AI 标记。任务超时（`Task.deadline`，`settings.taskTimeoutEnabled/Minutes`）与失败惩罚（`failPunishmentEnabled` + `applyPunishment` 扣负数奖励）见「任务时限」。
- **货币判定**：奖励 `name === state.currencyName` 入 points，否则入背包（同名合并 count）。`normalizeTask` 已把「含货币名的奖励」归一，AI 稍微跑偏也能正确入账。
- **升级曲线**：`expToNext(level) = 60 + level * 60`（120 起步）。升级在结算末尾 while 循环处理，允许一次跨多级。
- **任务时限与失败惩罚**：`Task.deadline`（ms；null=不限时，旧档不误杀）；`issueTasks` 在 `settings.taskTimeoutEnabled` 时写 `deadline = createdAt + taskTimeoutMinutes*60000`。`checkTaskDeadlines()` 同步扫 active 任务，过期即 `setTaskStatus(id,'failed','timeout')`；挂在 MESSAGE_RECEIVED（顶部）/CHAT_CHANGED（reload 后）/init。`source='timeout'` 时若 `failPunishmentEnabled` 走 `applyPunishment`（只扣 rewards 里 amount<0 项），否则奖励作废。任务卡展示剩余时限（GfTaskCard 30s 一跳）。
- **技能（剧情演示 + 可选数值加成）**：`SystemSkill = {name, description, unlockLevel, effect?}`，挂在 `SystemDef.skills`。宿主 Lv ≥ unlockLevel 自动觉醒，觉醒集合是派生态（store 的 `unlockedSkills` computed，由 level 推导，不落盘）。注入给正文 AI 与生成请求：`buildVars` 提供 `{{skills}}`（注入 status 模块用，v12→v13 迁移给老档 status 补行）、`gen_state` marker 里带全量「名称：描述」。可选 `effect`（`SystemSkillEffect`，`type ∈ points/exp/none`）：每次任务结算时按已觉醒技能被动叠加货币/经验，走 `applyExp`（可能顺带升级）；默认无加成（内置纯剧情技能缺省即无）。编辑器（SettingsDrawer）可给自定义系统配技能与 effect。
- **自动发布**：`noteAutoIssue()` 每 AI 回复（type 非 quiet）计数一次，达到 `autoIssueInterval` 且任务未满才返回 true；`issueTasks` 成功后清零计数。默认开启、节奏 3 楼（v2 迁移统一提升）；自动发布成功有「叮！」toast。
- **任务批量派发**：`issueTasks` 一次生成「剩余任务位」个任务把任务栏派满（maxActiveTasks=1 的系统仍一次 1 个）；提示词要求批内目标不重叠、难度有梯度；解析兼容单对象兜底，超出空位截断。
- **每日签到日历**：`SystemDef.dailyReward`（`{name,amount}` 可选）+ `GameState.signIn={lastSignInDate,streak}`。`settleRewards` 对 reward.name === dailyReward.name 的项做**自然日守门**：当日首笔才入账并推进 streak（昨天签过则+1 否则重开），同日重复跳过仍给经验（提示「今日已签到，不再发放」）。内置签到系统 `dailyReward={name:'每日签到奖励'}` 且 taskHint 引导 AI 那样发；`gen_state`（生成端）与 `buildVars` 的 `{{signinState}}` 带「今日已签到/未签到」，日期工具 `src/util/date.ts`（todayDateStr/dateStrOffset）。Home 未绑定到 dailyReward 系统时无影响。
- **提示词模块化（choice 式双域模块，v8 起生成域逐字复刻 choice 资料区槽位）**：`PromptModule = {id, name, scope, role, marker, enabled, content}`。`scope='inject'` 域按序拼装注入文本；`scope='generate'` 域按序组装成任务生成请求的 messages——默认结构 = 系统定位(system) → 应答声明(assistant) → **`<reference>` 资料区（reference_open + persona_description + world_info_before + char_description/char_personality/char_scenario + world_info_after，system marker 槽，整段不截断）+ reference_close</reference>** → 当前状态(gen_state，system marker) → wi_depth_before → chat_history(按楼层展开为逐条真实 user/assistant 聊天消息，末条 assistant 包 `<current_scene>`，不逐条截断，按 contextMode/contextRounds 取可见楼层) → wi_depth_after → 信息边界+契约+思考框架(system) → 生成请求(user，唯一，含任务风格) → 思维链预填(assistant)。相邻同 role 合并、但 **user 永不合并**（同 choice：user 代表独立输入边界，防止聊天 user 层混进任务指令；资料区为 system 是 choice 的语义：system 扛上下文数据、user 只承载任务指令）。**预填开关 `prefillEnabled`**：关闭时把 assistant 模块降级为 system（choice 的 prefill_enabled 兜底，兼容不支持预填的端点；chat_history 的聊天楼层不跟随降级，保留真实角色）。「编辑器显示 = 实际发送」；marker 槽按 id 渲染：persona_description=用户主角 persona、char_*=角色卡三字段、world_info_before/after+wi_depth_*=世界书、gen_state=当前状态、world_overview=系统世界观+宿主长期目标（不随当前角色/场景走，拓宽取景）；chat_history 在生成路径忽略其 role、按楼层来源定角色。默认模板单一来源 `type/settings.ts` 的 `DEFAULT_PROMPT_MODULES`（分域常量 DEFAULT_INJECT/GENERATE_MODULES；一律 `structuredClone` 防共享引用）；generate 域被**删空**才回落默认，全禁用是明确意图（组装出空请求由 api-client 报「缺少 user 消息」）。运行时变量由 `core/prompt-vars.ts` 的 `buildVars`/`fillVars` 填充（{{user}} 交给酒馆 substituteParams），生成域额外有 {{taskHint}}/{{taskCount}}。迁移 v3→v4 把能按 id 匹配的内置模块整体重排到新默认并刷新内容/角色（启停保留），custom_* 与未知 id 保留在末尾；v4→v5 只把三个资料槽 role 强制为 system；v6→v7 任务风格并入 gen_request；v7→v8 资料区逐字复刻 choice 槽位（persona/world×2/char×3/wi_depth×2/chat_history/reference×2）；v8→v9 商店货架生成接入模块系统（`shopPromptModules`/`DEFAULT_SHOP_MODULES`/`composeShopMessages`，与任务共用槽位）；v11→v12 在生成域与商店域插入 `world_overview` 槽（reference_close 之后、gen_state 之前）；v12→v13 给注入域 status 补 `{{skills}}` 行、v13→v14 补 `{{attributes}}` 行（都缺才补，不覆盖已自定义内容）；v14→v15 新增 `hiddenInjectionMode` 空字段（zod 兜底，无数据搬运）。PromptView 支持**拖拽排序**（手写 pointer：把手 grip 起拖、卡片 pointerover 定位、window pointerup 落盘，上移/下移按钮保留）与**多套模板预设** `settings.promptTemplatePresets`（命名快照 promptModules+shopPromptModules；编辑仍作用于当前激活集，另存为才写回预设、加载才覆盖当前）。
- **任务风格锚定**：taskHint 同时进 system 侧（gen_persona 模块）与 user 侧（gen_request 顶部【任务风格（必须严格遵守）】）；内置系统的 taskHint 各带一句具体示例（如签到系统的「在城东钟楼敲响晚钟完成今日黄昏签到」）。改风格产出先动 taskHint，不要加泛泛的系统指令。
- **输出链路（v4 起）**：生成提示词要求先 `<thinking>` 自检再输出 JSON；解析前由 `core/json.ts` 剥离思维标签（`STRIP_REASONING_TAGS_RE`，同 choice）防方括号污染区间候选。主 API 走 generateRaw 的**消息数组 + prefill 参数**（ST `createRawPrompt`：chat 补全挂末尾 assistant、文本补全拼 prompt 尾部），副 API 直传 messages——两条路都吃 choice 式消息结构。
- **商店（双来源货架）**：每批货两条 AI 并行生成后合并——① **系统通用批次** `generateShopShelf`（走 `composeShopMessages`，商店生成域模块 `shopPromptModules`，choice 式，与任务共用同一套参考/聊天槽位；一批正好 10 件，稀有度普通 5/稀有 3~4/传说 1~2，价格带普通 10~50 / 稀有 50~200 / 传说 200~1000 按等级微调）；② **角色专属批次** `generateCharacterShelf`（固定提示词 `composeCharacterShopMessages`，吃角色卡三字段+persona+系统世界观，3~4 件对女主量身定制：技能/身体改造/专属道具；开关 `settings.characterShopEnabled` 默认开，关掉只出通用货）。合并按名称去重（系统批次优先）后总量钳 12；**通用批次失败整体翻车（保留旧货架），角色批次失败只告警跳过**。`GameState.shop` 为 null 表示从未开店；**首次进店 `ensureShop` 免费开张，`refreshShop` 换一批扣 `system.refreshCost`（失败退款）**；`buyItem` 即时结算（扣款→背包合并/技能习得→库存-1，入包时把商品 `effect` 一并带入背包物品）。`ShopItem.category`（system/character）决定 ShopView 双栏归属；`ShopItem.kind`：`item`（购买入背包）/**`skill`（购买直接习得**进 `GameState.learnedSkills`（持久化、随聊天存档、随 `{{skills}}` 注入），不入背包；已习得重复购买不扣费不耗库存）。稀有度 rarity 1~3（普通灰/稀有蓝/传说金），色板单一来源 `--gf-rarity-N`(+soft)；商品卡统一走 `shared/ShopItemCard.vue`。
- **物品效果（可主动使用）**：`ShopItem`/`InventoryItem` 各带 `effect {type,amount,attribute?}`，契约枚举 `points`（使用得货币）/`exp`（使用得经验）/`complete_task`（自动完成一个进行中任务）/**`attribute`（身体改造，负载 `AttributeFx={target,attribute,amount,unit,tiers}`，优先读 attribute 负载、顶层 amount 归零）**/`none`（纯收藏，无使用入口）。`store/game.ts` 的 `useItem(name)` 即时结算后消耗数量（归零移出；落地不了——如无进行中任务——不消耗），升级与 `settleRewards` 共用 `applyExp`。`attribute` 走 `applyAttribute(fx)` upsert 进 `GameState.attributes`（`BodyAttribute`：新建以 amount 起步、已有在其上增减、有 `tiers` 档位标签则钳值并按 `tiers[value]` 展示），首页「身体状态」块展示、`buildVars` 的 `{{attributes}}` 注入（目标角色名留空=主角）。`buyItem` 入包带 effect，`InventoryView` 对非 none 物品显示「使用」按钮。
- **隐藏注入模式**：`settings.hiddenInjectionMode` 开启后注入文本不走 promptModules，固定用 `DEFAULT_COVERT_INJECT_MODULES`（`type/settings.ts`）——只输出 `buildVars` 预拼的 `{{covertStatus}}`（所携之物/本事=觉醒+已学技能/身体状态的中性描述），**不暴露系统存在/等级/货币/任务/判定规则**；正文 AI 因此不再输出判定标记，结算靠独立判定 API/超时/消耗品（UI 开关在 PromptView「正文不感知系统（隐藏模式）」）。
- **系统导入导出（分享）**：`src/util/system-exchange.ts`——`serializeSystem` 导出剥离 `id`/`builtin`；`deserializeSystem` 按 `SystemDef`（omit id/builtin）校验后**强制分配新 `custom_` id、`builtin:false`**，与已有系统天然不冲突（同一份 JSON 可重复导入为多个独立系统）。入口在 SettingsDrawer（复制到剪贴板 / 下载 .json / 粘贴或选文件导入）。
- **生成上下文（角色卡/世界书/过滤）**：`core/context-builder.ts` 组装「世界观背景」（角色卡/世界书，整段发送不截断）。角色卡读 context.characters 的描述/性格/场景（群聊跳过）。任务与商店生成参考区都按 choice 槽位分别取 buildPersonaContext（用户主角 persona）/buildCharSlots（描述/性格/场景三字段）/buildWorldInfoSlots（before/after/depthBefore/depthAfter）。世界书两条路：**默认走酒馆原生 `getWorldInfoPrompt`**（倒序楼层 + 128000 预算 + trigger:'normal'，关键字/概率/深度全由酒馆管线处理，同 choice 的 buildWI；不自己造激活判定），按槽位分桶——world_info_before=before+anBefore、world_info_after=after+anAfter、wi_depth_before=depth>2、wi_depth_after=depth≤2；**书层覆盖**（`worldBookModes`：书名→四态 off/follow/force/custom，choice 的 book_entry_modes；配套 `worldBookEnabled` 显式启用、`worldBookGlobalExcluded` 全局排除、`worldBookEntryOverrides` 自定义逐条，v10→v11 迁移由旧 `worldBookOverrides` default→follow 改名）配置了任一非 follow、或有启用/全局排除/逐条时退出手动组装参与书集（激活源未 off/未全局排除的书 + enabled 书 + 所有 force 书；follow 书跟随 entry.disable、force 无视、custom 书按逐条覆盖且快照未覆盖的条目保持酒馆原状）——手动组装不读写酒馆世界书缓存，故不影响正文主生成（choice 用缓存变异控制，本扩展刻意避免该副作用）。楼层过滤在任务与商店生成都走 `buildChatFloors`（共用逐层过滤 `filterStoryFloor`）：**先走酒馆原生正则**（`stRegexEnabled` 默认开，调 ST `getRegexedString`，直接用全局/预设/角色卡已配置的脚本、不必手动重录，同 choice 的 st_regex——placement 按楼层来源、depth 从生成点往回算，限定 minDepth/maxDepth 的脚本才生效；脚本清空该层即整条丢弃）再走本页 `storyFilterRules`（tag/regex/extract 三型），顺序 extract→tag→regex、清空丢层、非法正则跳过。剧情上下文取景由 `contextMode`（`visible_only`＝全部可见楼层 / `rounds`＝最近 N 轮，每轮=用户+助手 2 层）+ `contextRounds` 控制，不逐条截断。**类型切换必须整体替换规则对象**（缺字段会让存档 zod 解析崩）。

## UI 要点（现状，可改）

- **UI 布局是主面板常显 + choice 式两级导航**：一级 6 页（首页/商店/背包/日志/配置/设置）无论是否绑定系统都在（未绑定不隐藏 UI，这是用户明确要的）；「配置」页带二级子区条，切换 **提示词/世界书/正则** 三个子界面——三者编辑的是全局通用配置（extension_settings.golden_finger），**不随绑定系统切换而变化**，导航定义单一来源 `shared/tab-definitions.ts`（PAGES + CONFIG_SUB_TABS，照 choice 模式）。首页顶部是系统块（绑定=当前系统卡+「更换系统」展开网格，未绑定=直接铺选择网格）；商店未绑定时显示引导而非空白。拖拽是**手写 pointer 实现**（header 为把手、按钮除外、touch-action:none、位置在 pointerup 时才落盘）——曾用 @vueuse useDraggable 出过「完全拖不动」，回退手写前先想清楚。
  - 页面组件在 `views/`：Home（系统块+签到条+觉醒/已学技能+身体状态+任务直铺）/ Shop（系统通用|角色专属双栏货架+ShopItemCard 商品卡）/ Inventory / Log / Settings（任务生成API+自动发布+自动判定+任务时限）/ Prompt（注入设置[含隐藏模式开关]+模板三切换+预设+三预览）/ WorldInfo（生成上下文+剧情上下文+世界书控制）/ Regex（楼层过滤规则）/ SystemSelect（选系统，被 Home 复用）；`core/window-state.ts` 与 GfWindow 已随双层结构方案废弃删除。
- 主视觉「每系统主题色 `--gf-accent` + 暗色玻璃」；全部颜色/圆角/间距收成 `--gf-*` token（背景三层/文字三层/稀有度双色板），换肤只动 token。生成中走 header 下缘 shimmer 光带；视图切换 fade-slide；货架 stagger 入场。
- 空状态统一「大图标 + 风味文案 +（可选）行动按钮」；余额不足一律按钮置灰（不弹 toast），操作失败才 toast。
- **提示词/世界书/正则在「配置」页分三个子界面呈现**（通用配置，见上）：`提示词`（提示词注入：总开关/注入深度，注入位置恒为对话内 IN_CHAT、不再可选；`提示词模板`：卡片内切换条 注入模板|任务生成模板|商店生成模板，三卡默认折叠，普通模块卡=名称+启停+role 下拉[生成域]+上移/下移+单模块恢复+删除+textarea，marker 槽带锁只可调位置与角色/启停，可添加自定义模块，变量清单在脚本里拼——模板里直写 `{{ }}` 会被 Vue 吃掉；`提示词预览`：单卡内切换条 注入预览|生成请求预览|商店生成请求预览，默认折叠，每型渲染为单块整段文本（生成/商店请求把 composeTaskMessages/composeShopMessages 的各消息 content 顺序拼接）+`getTokenCountAsync` token 数+复制，展开时才组装）。`世界书`（生成上下文开关 useCharCard/useWorldInfo + 剧情上下文 contextMode/contextRounds + **世界书控制**：choice 式四区——总开关、已启用世界书(`listAllWorldBooks` 列出 active+enabled 书、行可展开逐条勾选、每书四态钩 off/follow/force/custom 循环写入 `worldBookModes`、来源徽章/显式启用/全局排除徽章、移除；勾选条目即切入 custom 并写入 `worldBookEntryOverrides`)、全局排除(`worldBookGlobalExcluded` 搜索添加/移除)、未启用世界书(`worldBookEnabled` 搜索+启用)，参与书置顶、未激活淡显）。`正则`（**走酒馆正则开关 stRegexEnabled** + 楼层过滤 storyFilterRules 编辑器）。
- 悬浮主面板 v-show 保挂载，拖拽为手写 pointer 实现（位置持久化，见上）；有历史数据时激活新系统先弹酒馆 Popup 确认（防误清空）。
- i18n：界面文本全部 `t\`\``，插值 key 形如 `发布任务 ${0}《${1}》`，en.json 按此映射（新增文案后跑 key 对齐检查：0 missing / 0 unused / 0 重复）；注入给 AI 的提示词文本刻意不翻译（剧情语言）。

## 目录

- `src/core/`：api-client（主/副 API 统一入口）、api-presets（服务商预设）、context-builder（角色卡+世界书上下文，getWorldInfoPrompt 直调 + 书层四态覆盖离线组装；listActiveWorldBooks/listAllWorldBooks/loadWorldBookEntries 枚举与加载世界书）、task-generator（任务生成+模块组装 composeTaskMessages+解析+楼层过滤+独立判定 composeJudgeMessages/adjudicateTasks）、shop-generator（系统通用+角色专属双路货架生成+解析+归一）、json.ts（LLM 文本抠 JSON 共用工具）、prompt-vars（buildVars/fillVars/rewardText 纯函数，注入与生成共用）、injector（模块化/隐藏模式注入+判定标记）、wand-menu（魔棒入口，轮询注入）。
- `src/store/`：settings（全局设置+逐版本迁移 migrateSettings，SCHEMA_VERSION=15）、game（游玩状态+任务结算+商店 actions+物品使用 useItem+独立判定 judgeTasks）。
- `src/type/`：game.ts（SystemDef/Task/ShopItem/GameState schema + ItemEffect/AttributeFx + SystemSkill + LearnedSkill/BodyAttribute）、settings.ts（Settings schema + DEFAULT_PROMPT_MODULES 双域默认 + DEFAULT_COVERT_INJECT_MODULES + StoryFilterRule）。
- `src/util/`：date（本地日期串，签到自然日守门）、system-exchange（系统导入导出契约，见「系统导入导出」）、zod（validateInplace 就地校验兜默认值）。
- `src/systems/builtin.ts`：7 个内置系统（含 shopName/refreshCost/skills/dailyReward）；`findSystem(id, customSystems)` 是 id → 定义的唯一解析点。
- `src/components/`：GamePanel（一级 6 页+配置二级子区壳+手写拖拽）、SettingsDrawer（扩展抽屉：总开关/自定义系统[编辑器配技能+导入导出分享]/清数据）、`views/`（Home/Shop/Inventory/Log/Settings/Prompt/WorldInfo/Regex/SystemSelect）、`shared/`（GfSectionCard、GfTaskCard、ShopItemCard、tab-definitions 导航定义）。
- `@types/`：酒馆助手类型包（全局 ambient 声明，无运行时产物）。

## 构建与验证

```bash
pnpm build       # production 构建 → dist/
pnpm typecheck   # vue-tsc --noEmit
pnpm lint
```

无单测，靠 typecheck/build/lint + 浏览器验证。核心交互改动至少确认：绑定系统 → 发任务 → AI 回复带标记 → 自动结算/升级 → 进店自动开张 → 购买 → 面板可拖拽 → 设置页改模板/过滤规则看预览与生成变化 → API 保存，这条主链路可通。

## 未实现 / 规划

- 传说级商品的高级效果演出（当前效果仅有即时数值/完成/改造结算，无酷炫演出）。
- 世界书/角色卡联动（把系统状态同步写进世界书条目等）。
- 技能数值加成的细分：目前 effect 仅整型 points/exp，无装备/成长等复杂机制。
- 模板预设的全局共享（当前 `promptTemplatePresets` 仅存本地）与拖拽时的浮动占位视觉（当前是卡片高亮定位）。
