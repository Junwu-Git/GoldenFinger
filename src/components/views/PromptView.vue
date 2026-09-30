<template>
  <div class="gf-view">
    <!-- 提示词注入（总开关 + 深度；上下文开关在世界书页） -->
    <GfSectionCard v-model:open="injectionOpen" :title="t`提示词注入`" icon="fa-solid fa-syringe">
      <label class="checkbox_label">
        <input v-model="settings.enabled" type="checkbox" />
        <span>{{ t`启用金手指（注入提示词给正文 AI）` }}</span>
      </label>
      <div class="gf-setting-row">
        <span class="gf-setting-label">{{ t`注入深度（对话内生效）` }}</span>
        <input v-model.number="settings.injectionDepth" class="text_input gf-number" type="number" min="0" max="20" />
      </div>
    </GfSectionCard>

    <!-- 提示词模板（choice 式模块编辑：注入域拼面板状态，生成域组装生成请求的 messages） -->
    <GfSectionCard v-model:open="templateOpen" :title="t`提示词模板`" icon="fa-solid fa-pen-to-square">
      <template #extra>
        <button class="gf-link-btn" :title="t`全部恢复默认模板`" @click="resetModules">
          <i class="fa-solid fa-rotate-left"></i> {{ t`恢复默认` }}
        </button>
      </template>

      <nav class="gf-subtabs gf-pm-tabs">
        <button
          v-for="tab in promptTabs"
          :key="tab.id"
          class="gf-subtab"
          :class="{ active: promptTab === tab.id }"
          @click="promptTab = tab.id"
        >
          {{ tab.label }}
        </button>
      </nav>

      <div v-if="promptTab === 'inject'" class="gf-pm-domain">
        <div class="gf-pm-domain-title">{{ t`注入模板` }}</div>
        <div class="gf-setting-desc">
          {{ t`启用中的模块按顺序拼装后注入给正文 AI，双花括号变量会在注入时填充实际状态。` }}
        </div>
        <div v-for="module in injectModules" :key="module.id" class="gf-pm-card" :class="{ off: !module.enabled }">
          <div class="gf-pm-head">
            <label class="checkbox_label gf-pm-toggle">
              <input v-model="module.enabled" type="checkbox" />
              <span>{{ module.name }}</span>
            </label>
            <span class="gf-flex"></span>
            <button class="gf-link-btn" :title="t`上移`" @click="moveModule(module, -1)">
              <i class="fa-solid fa-arrow-up"></i>
            </button>
            <button class="gf-link-btn" :title="t`下移`" @click="moveModule(module, 1)">
              <i class="fa-solid fa-arrow-down"></i>
            </button>
            <button class="gf-link-btn" :title="t`恢复此模块的默认内容`" @click="resetModule(module)">
              <i class="fa-solid fa-rotate-left"></i>
            </button>
            <button class="gf-link-btn" :title="t`删除`" @click="removeModule(module)">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
          <textarea v-model="module.content" class="text_input gf-pm-textarea" rows="4"></textarea>
        </div>
        <button class="menu_button" @click="addModule('inject')">
          <i class="fa-solid fa-plus"></i>&nbsp;{{ t`添加模块` }}
        </button>
        <div class="gf-var-hint">{{ t`可用变量` }}: {{ injectVarHint }}</div>
      </div>

      <div v-if="promptTab === 'task'" class="gf-pm-domain">
        <div class="gf-pm-domain-title">{{ t`任务生成模板` }}</div>
        <label
          class="checkbox_label gf-prefill-row"
          :title="t`关闭后仅将应答声明与思维链预填的 assistant 角色改为 system，其他模块与提示词顺序不变。`"
        >
          <input v-model="settings.prefillEnabled" type="checkbox" />
          <span>{{ t`预填充` }}</span>
        </label>
        <div class="gf-setting-desc">
          {{
            t`模块按顺序组装成发给生成 API 的请求消息，相邻同角色的消息会自动合并；带锁标记的系统槽位内容由扩展自动填充，只能调整位置与角色。`
          }}
        </div>
        <div v-for="module in generateModules" :key="module.id" class="gf-pm-card" :class="{ off: !module.enabled }">
          <div class="gf-pm-head">
            <label class="checkbox_label gf-pm-toggle">
              <input v-model="module.enabled" type="checkbox" />
              <span>
                <i v-if="module.marker" class="fa-solid fa-lock gf-pm-lock"></i>
                {{ module.name }}
              </span>
            </label>
            <span class="gf-flex"></span>
            <select v-model="module.role" class="gf-pm-role-select">
              <option value="system">system</option>
              <option value="user">user</option>
              <option value="assistant">assistant</option>
            </select>
            <button class="gf-link-btn" :title="t`上移`" @click="moveModule(module, -1)">
              <i class="fa-solid fa-arrow-up"></i>
            </button>
            <button class="gf-link-btn" :title="t`下移`" @click="moveModule(module, 1)">
              <i class="fa-solid fa-arrow-down"></i>
            </button>
            <template v-if="!module.marker">
              <button class="gf-link-btn" :title="t`恢复此模块的默认内容`" @click="resetModule(module)">
                <i class="fa-solid fa-rotate-left"></i>
              </button>
              <button class="gf-link-btn" :title="t`删除`" @click="removeModule(module)">
                <i class="fa-solid fa-trash-can"></i>
              </button>
            </template>
          </div>
          <textarea
            v-if="!module.marker"
            v-model="module.content"
            class="text_input gf-pm-textarea"
            rows="4"
          ></textarea>
        </div>
        <button class="menu_button" @click="addModule('generate')">
          <i class="fa-solid fa-plus"></i>&nbsp;{{ t`添加模块` }}
        </button>
        <div class="gf-var-hint">{{ t`可用变量` }}: {{ genVarHint }}</div>
      </div>

      <div v-if="promptTab === 'shop'" class="gf-pm-domain">
        <div class="gf-pm-domain-title">{{ t`商店生成模板` }}</div>
        <div class="gf-setting-desc">
          {{
            t`商店货架生成走与任务一致的 choice 式模块（同一套参考区/聊天槽位 + 商店专用 定位/契约/思考/请求），预填充开关与任务共享。`
          }}
        </div>
        <div v-for="module in shopModules" :key="module.id" class="gf-pm-card" :class="{ off: !module.enabled }">
          <div class="gf-pm-head">
            <label class="checkbox_label gf-pm-toggle">
              <input v-model="module.enabled" type="checkbox" />
              <span>
                <i v-if="module.marker" class="fa-solid fa-lock gf-pm-lock"></i>
                {{ module.name }}
              </span>
            </label>
            <span class="gf-flex"></span>
            <select v-model="module.role" class="gf-pm-role-select">
              <option value="system">system</option>
              <option value="user">user</option>
              <option value="assistant">assistant</option>
            </select>
            <button class="gf-link-btn" :title="t`上移`" @click="moveModuleInList(shopModules, module, -1)">
              <i class="fa-solid fa-arrow-up"></i>
            </button>
            <button class="gf-link-btn" :title="t`下移`" @click="moveModuleInList(shopModules, module, 1)">
              <i class="fa-solid fa-arrow-down"></i>
            </button>
            <template v-if="!module.marker">
              <button class="gf-link-btn" :title="t`恢复此模块的默认内容`" @click="resetShopModule(module)">
                <i class="fa-solid fa-rotate-left"></i>
              </button>
              <button class="gf-link-btn" :title="t`删除`" @click="removeModuleFromList(shopModules, module)">
                <i class="fa-solid fa-trash-can"></i>
              </button>
            </template>
          </div>
          <textarea
            v-if="!module.marker"
            v-model="module.content"
            class="text_input gf-pm-textarea"
            rows="4"
          ></textarea>
        </div>
        <button class="menu_button" @click="addShopModule">
          <i class="fa-solid fa-plus"></i>&nbsp;{{ t`添加模块` }}
        </button>
        <div class="gf-var-hint">{{ t`可用变量` }}: {{ shopVarHint }}</div>
      </div>
    </GfSectionCard>

    <!-- 提示词预览：注入 + 生成请求 + 商店生成请求，切换条切换、整段展示 -->
    <GfSectionCard v-model:open="previewOpen" :title="t`提示词预览`" icon="fa-solid fa-eye">
      <template #extra>
        <span v-if="previewTokenCount !== null" class="gf-token-chip">{{ previewTokenCount }} tok</span>
      </template>
      <nav class="gf-subtabs gf-pm-tabs">
        <button
          v-for="tab in previewTabs"
          :key="tab.id"
          class="gf-subtab"
          :class="{ active: previewTab === tab.id }"
          @click="previewTab = tab.id"
        >
          {{ tab.label }}
        </button>
      </nav>
      <div v-if="!previewContent" class="gf-empty-small">
        {{ t`当前没有预览内容：未绑定系统，或总开关已关闭。` }}
      </div>
      <template v-else>
        <div class="gf-setting-desc">{{ t`以下是当前预览的完整提示词内容，随系统状态与模板实时变化。` }}</div>
        <pre class="gf-prompt-pre">{{ previewContent }}</pre>
        <div class="gf-editor-actions">
          <button class="menu_button" @click="copyPreview"><i class="fa-solid fa-copy"></i>&nbsp;{{ t`复制` }}</button>
        </div>
      </template>
    </GfSectionCard>
  </div>
</template>

<script setup lang="ts">
import toastr from 'toastr';
import { storeToRefs } from 'pinia';
import { computed, ref, watch } from 'vue';
import GfSectionCard from '@/components/shared/GfSectionCard.vue';
import { buildInjectionText } from '@/core/injector';
import { composeShopMessages, composeTaskMessages } from '@/core/task-generator';
import { useGameStore } from '@/store/game';
import { useSettingsStore } from '@/store/settings';
import { type SystemDef } from '@/type/game';
import { DEFAULT_PROMPT_MODULES, DEFAULT_SHOP_MODULES, type PromptModule } from '@/type/settings';

const game = useGameStore();
const settingsStore = useSettingsStore();
const { settings } = storeToRefs(settingsStore);

/** 顶层三卡默认折叠（本地视图状态，不持久化） */
const injectionOpen = ref(false);
const templateOpen = ref(false);
const previewOpen = ref(false);

/** 提示词模板三区切换（本地视图状态，不持久化） */
const promptTab = ref<'inject' | 'task' | 'shop'>('task');
const promptTabs = [
  { id: 'inject', label: t`注入模板` },
  { id: 'task', label: t`任务生成模板` },
  { id: 'shop', label: t`商店生成模板` },
] as const;

/** 提示词预览三型切换 */
const previewTab = ref<'inject' | 'gen' | 'shop'>('inject');
const previewTabs = [
  { id: 'inject', label: t`注入预览` },
  { id: 'gen', label: t`生成请求预览` },
  { id: 'shop', label: t`商店生成请求预览` },
] as const;

// #region 提示词模板

/** 分域视图：数组顺序即模块顺序，操作都在原数组上进行（filter 出的是同一批对象的引用） */
const injectModules = computed(() => settings.value.promptModules.filter(module => module.scope === 'inject'));
const generateModules = computed(() => settings.value.promptModules.filter(module => module.scope === 'generate'));
const shopModules = computed(() => settings.value.shopPromptModules);

// 变量清单放 script 里拼：模板里直接写 {{ }} 会被 Vue 当插值
const injectVarHint =
  '{{user}} {{systemName}} {{persona}} {{level}} {{currency}} {{points}} {{inventoryText}} {{tasks}} {{maxTasks}}';
const genVarHint =
  '{{user}} {{systemName}} {{persona}} {{taskHint}} {{taskCount}} {{currency}} {{level}} {{points}} {{inventoryText}} {{tasks}}';
const shopVarHint =
  '{{user}} {{systemName}} {{shopName}} {{persona}} {{currency}} {{level}} {{points}} {{inventoryText}} {{tasks}}';

function moveModule(module: PromptModule, dir: -1 | 1): void {
  const list = settings.value.promptModules;
  const scopeIndex = list.reduce<number[]>((acc, item, index) => {
    if (item.scope === module.scope) {
      acc.push(index);
    }
    return acc;
  }, []);
  const from = scopeIndex.indexOf(list.indexOf(module));
  const to = scopeIndex[from + dir];
  if (from < 0 || to === undefined) {
    return;
  }
  [list[scopeIndex[from]], list[to]] = [list[to], list[scopeIndex[from]]];
}

function removeModule(module: PromptModule): void {
  const pos = settings.value.promptModules.indexOf(module);
  if (pos >= 0) {
    settings.value.promptModules.splice(pos, 1);
  }
}

function addModule(scope: 'inject' | 'generate'): void {
  settings.value.promptModules.push({
    id: `custom_${Date.now().toString(36)}`,
    name: t`新模块`,
    scope,
    role: 'system',
    marker: false,
    enabled: true,
    content: '',
  });
}

function resetModule(module: PromptModule): void {
  const fallback = DEFAULT_PROMPT_MODULES.find(candidate => candidate.id === module.id);
  if (!fallback) {
    return;
  }
  Object.assign(module, structuredClone(fallback));
}

function resetModules(): void {
  // 恢复全部模板默认：注入+任务（promptModules）与 商店（shopPromptModules）一起重置
  settings.value.promptModules = structuredClone(DEFAULT_PROMPT_MODULES);
  settings.value.shopPromptModules = structuredClone(DEFAULT_SHOP_MODULES);
  toastr.success(t`已恢复默认模板`, t`金手指系统`);
}

/** 在指定数组里按相邻位移动（商店生成域数组同 scope，直接搬邻居） */
function moveModuleInList(list: PromptModule[], module: PromptModule, dir: -1 | 1): void {
  const from = list.indexOf(module);
  const to = from + dir;
  if (from < 0 || to < 0 || to >= list.length) {
    return;
  }
  [list[from], list[to]] = [list[to], list[from]];
}

/** 从指定数组移除某模块（商店生成域用） */
function removeModuleFromList(list: PromptModule[], module: PromptModule): void {
  const pos = list.indexOf(module);
  if (pos >= 0) {
    list.splice(pos, 1);
  }
}

function addShopModule(): void {
  settings.value.shopPromptModules.push({
    id: `custom_${Date.now().toString(36)}`,
    name: t`新模块`,
    scope: 'generate',
    role: 'system',
    marker: false,
    enabled: true,
    content: '',
  });
}

function resetShopModule(module: PromptModule): void {
  const fallback = DEFAULT_SHOP_MODULES.find(candidate => candidate.id === module.id);
  if (!fallback) {
    return;
  }
  Object.assign(module, structuredClone(fallback));
}

// #endregion

// #region 提示词预览

/** 注入文本：buildInjectionText 只读镜像 */
const injectPreviewText = computed(() => {
  const system = game.activeSystem;
  if (!system || !settings.value.enabled) {
    return '';
  }
  return buildInjectionText(system, game.state, settings.value);
});

const previewContent = ref('');
const previewTokenCount = ref<number | null>(null);

/** 按当前预览 tab 组装整体内容：生成/商店请求把各消息 content 按顺序拼接成一段 */
async function buildPreviewContent(tab: 'inject' | 'gen' | 'shop', system: SystemDef): Promise<string> {
  if (tab === 'inject') {
    return injectPreviewText.value;
  }
  const msgs =
    tab === 'gen'
      ? await composeTaskMessages(
          system,
          game.state,
          settings.value,
          Math.max(1, system.maxActiveTasks - game.activeTasks.length),
        )
      : await composeShopMessages(system, game.state, settings.value);
  return msgs.map(msg => msg.content).join('\n\n');
}

watch(
  [previewOpen, previewTab, () => settings.value, () => game.state],
  async ([open, tab]) => {
    const system = game.activeSystem;
    if (!open || !system || !settings.value.enabled) {
      previewContent.value = '';
      previewTokenCount.value = null;
      return;
    }
    try {
      previewContent.value = await buildPreviewContent(tab, system);
    } catch (error) {
      console.error('[GoldenFinger] 提示词预览失败', error);
      previewContent.value = '';
    }
  },
  { deep: true, immediate: true },
);

watch(previewContent, async text => {
  if (!text) {
    previewTokenCount.value = null;
    return;
  }
  try {
    const context = window.SillyTavern?.getContext?.();
    const count = await context?.getTokenCountAsync?.(text);
    previewTokenCount.value = typeof count === 'number' ? count : null;
  } catch {
    previewTokenCount.value = null;
  }
});

async function copyPreview(): Promise<void> {
  try {
    await navigator.clipboard.writeText(previewContent.value);
    toastr.success(t`已复制到剪贴板`, t`金手指系统`);
  } catch {
    toastr.error(t`复制失败`, t`金手指系统`);
  }
}

// #endregion
</script>

<style scoped>
.gf-token-chip {
  font-size: 11px;
  font-family: monospace;
  color: var(--gf-accent);
  border: 1px solid var(--gf-border);
  border-radius: 999px;
  padding: 1px 8px;
}

.gf-pm-card {
  margin-bottom: 8px;
  border: 1px solid var(--gf-border);
  border-radius: var(--gf-radius-sm);
  background: var(--gf-bg-1);
  padding: 7px 9px;
}

.gf-pm-domain {
  margin-bottom: 6px;
}

.gf-prefill-row {
  margin: 2px 0 6px;
}

.gf-pm-tabs {
  margin-bottom: 8px;
}

.gf-pm-domain-title {
  font-weight: 700;
  font-size: 12.5px;
  color: var(--gf-accent);
  margin: 6px 0 4px;
}

.gf-pm-lock {
  font-size: 10px;
  color: var(--gf-text-2);
  margin-right: 2px;
}

.gf-pm-role-select {
  width: 88px;
  flex: none;
}

.gf-pm-card.off {
  opacity: 0.55;
}

.gf-pm-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  margin-bottom: 4px;
}

.gf-pm-toggle {
  margin: 0;
  font-weight: 600;
}

.gf-pm-textarea {
  width: 100%;
  resize: vertical;
  font-size: 12px;
  line-height: 1.5;
}

.gf-var-hint {
  font-family: var(--gf-font-mono);
  font-size: 10.5px;
  color: var(--gf-text-2);
  line-height: 1.6;
  word-break: break-all;
}
</style>
