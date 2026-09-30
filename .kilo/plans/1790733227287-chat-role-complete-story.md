# 计划（v6）：提示词页 UI 收整——默认折叠 / 移除主提示词区 / 预览整段 + 分页切换

## 目标（对应本次四点反馈）
1. **页面默认折叠**：提示词页三张卡（提示词注入/提示词模板/提示词预览）默认都收起，不再默认全展开。
2. **移除「主提示词区」**：删除 `in_prompt`（IN_PROMPT）注入位置选项，注入固定为「对话内」(IN_CHAT)。
3. **请求预览整段**：生成请求预览不再按 `[role]` 分模块展示，拼成一段整体内容。
4. **预览分页切换**：三个预览（注入预览 / 生成请求预览 / 商店生成请求预览）合并进一张卡，用内部切换条切换，不再三张并列。

## 现状核对（证据）
- `GfSectionCard.vue`：`defineModel('open', {default:true})`；未绑 `v-model:open` 的卡（提示词注入、提示词模板、注入预览）**恒展开**。只有两个「生成请求预览」卡绑了 `genPreviewOpen`/`shopPreviewOpen`（默认 false）。
- PromptView 当前结构：提示词注入 / 提示词模板（内部已有 注入|任务|商店 切换条）/ 提示词注入预览 / 生成请求预览 / 商店生成请求预览，共 5 张卡。
- `injector.ts` `refreshInjection`：`injectionPosition==='in_chat' ? IN_CHAT : IN_PROMPT`。
- `settings.ts`：`injectionPosition: z.enum(['in_chat','in_prompt']).default('in_chat')`。
- `t`注入位置`/t`对话内（推荐）`/t`主提示词区`` 只出现在 PromptView 的注入位置下拉。

## 决策
- 移除 `injectionPosition` 设置字段与「注入位置」下拉；注入恒走 `IN_CHAT`（`injectionDepth` 保留，仍对 IN_CHAT 生效）。
- 三张顶层卡都**默认折叠**（绑 `v-model:open` 到默认 false 的 ref）。
- 预览合并为一张「提示词预览」卡 + 内部 `gf-subtabs`（注入预览｜生成请求预览｜商店生成请求预览），每段预览渲染为**单块整段文本**（`pre`），不再按消息 role 分段。
- `SCHEMA_VERSION` 9→10；迁移删除 `injectionPosition`（zod 默认 .strip 会吞未知键，迁移仅作清理）。

## 实施步骤（ordered）

### 1. `src/type/settings.ts`
- 删除字段 `injectionPosition`（zod enum 一行）。
- `SCHEMA_VERSION = 10`。

### 2. `src/store/settings.ts`
- 追加 `if (version < 10) { delete migrated.injectionPosition; }`（清理旧字段；zod strip 兜底）。
- 头部注释补 v9→v10 说明。

### 3. `src/core/injector.ts`
- `refreshInjection` 恒用 `extension_prompt_types.IN_CHAT`，删掉 `injectionPosition` 分支与相关选择：
  ```ts
  setExtensionPrompt(INJECTION_KEY, text, extension_prompt_types.IN_CHAT, settings.injectionDepth, false, extension_prompt_roles.SYSTEM);
  ```

### 4. `src/components/views/PromptView.vue`
- **顶部三卡默认折叠**：
  - 提示词注入 / 提示词模板 / 提示词预览 三张 `GfSectionCard` 分别绑 `v-model:open` 到 `injectionOpen` / `templateOpen` / `previewOpen`（均 `ref(false)`）。
  - 移除「提示词注入」卡里的「注入位置」下拉（`注入位置` 标签 + `对话内（推荐）`/`主提示词区` 两个 option）。
- **预览收整为一张卡 + 切换条**：
  - 删除现有的「提示词注入预览」/「生成请求预览」/「商店生成请求预览」三张卡；合并为一张「提示词预览」卡（默认折叠）。
  - 卡内顶部 `gf-subtabs`：`注入预览`｜`生成请求预览`｜`商店生成请求预览`，由 `previewTab` 控制（默认 `inject`）。
  - 卡体渲染当前 tab 的**单块整段文本**（单个 `pre`）+ token 数 + 复制按钮。
- **script**：
  - 新增 refs：`injectionOpen / templateOpen / previewOpen`（false）、`previewTab`（'inject'|'gen'|'shop'）。
  - 移除 `genPreviewOpen`/`shopPreviewOpen`（被 `previewOpen`+`previewTab` 取代）。
  - 预览内容合成：注入预览 = `buildInjectionText`（既有 `previewText` computed）；生成请求预览 / 商店生成请求预览 = `composeTaskMessages`/`composeShopMessages` 结果的 content 按顺序 `join('\n\n')` 成一段。用一个 `previewContent` ref + watch（监听 `[previewOpen, previewTab, settings, game.state]`）按 tab 填充；token 数用 `getTokenCountAsync` 对 `previewContent` 实时算。
- **scoped CSS**：`gf-pm-tabs` 已在；预览卡复用 `gf-subtabs` 切换条（如需加间距用新类或复用 `gf-pm-tabs`）。

### 5. i18n `en.json`
- 移除 deven 不再使用的 key：`注入位置`、`对话内（推荐）`、`主提示词区`。新增预览切换条 label：`注入预览`。跑 key 对齐（0 missing / 0 unused / 0 重复）。

### 6. `AGENTS.md`
- 注入段：注入位置恒为 IN_CHAT（对话内，按 `injectionDepth` 深度），移除 in_prompt 提及；
- UI 段：提示词页三卡默认折叠、预览三合一 + 切换条 + 整段展示。

## 影响 / 边界
- 行为：注入位置只剩「对话内」，主提示词区不再可用；注入深度仍有效。
- schema：删 `injectionPosition`，`SCHEMA_VERSION` 9→10，旧字段迁移清理（zod strip 兜底）。
- 预览：生成/商店预览由分段变为拼接整段；不再单独占卡，合并进单卡切换条。
- 交互：三卡默认折叠，点标题展开；预览卡内切换 tab。

## 验证
- `pnpm typecheck` / `pnpm lint`（PromptView/injector/settings/store/settings）/ `pnpm build`。
- i18n 对齐：0 missing / 0 unused / 0 重复。
- 浏览器：配置→提示词——三卡默认折叠；点开「提示词注入」无注入位置项；「提示词模板」内三模块切换正常；「提示词预览」内 注入/生成请求/商店生成请求 三 tab 各自显示单块整段文本、token 数与复制可用。
- 老档迁移：旧 save 带 `injectionPosition`，加载后字段被清理、注入仍走对话内、预览正常。

## 范围外 / 未决
- 不做多套模板配置切换（choice 的 PromptConfig 式，仍列未实现）。
- 预览整段使用「各消息 content 顺序拼接」的呈现（不保留 `[role]` 标记）；如需保留极简角色前缀可后续微调。