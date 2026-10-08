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
      <label class="checkbox_label">
        <input v-model="settings.hiddenInjectionMode" type="checkbox" />
        <span>{{ t`正文不感知系统（隐藏模式）` }}</span>
      </label>
      <div class="gf-setting-desc">{{ t`开启后正文只注入宿主所持之物（物品/技能/身体状态），系统设定、人格、任务与判定规则都不再进入正文；任务改由独立判定或超时结算。` }}</div>
    </GfSectionCard>

    <!-- 提示词模板（choice 式模块编辑：注入域拼面板状态，生成域组装生成请求的 messages） -->
    <GfSectionCard v-model:open="templateOpen" :title="t`提示词模板`" icon="fa-solid fa-pen-to-square">
      <template #extra>
        <button class="gf-link-btn" :title="t`全部恢复默认模板`" @click="resetModules">
          <i class="fa-solid fa-rotate-left"></i> {{ t`恢复默认` }}
        </button>
      </template>

      <!-- 多套模板预设：编辑仍作用于当前激活集，另存为才写回预设 -->
      <div class="gf-pm-preset-row">
        <span class="gf-setting-label">{{ t`模板预设` }}</span>
        <select v-model="presetSelected" class="gf-setting-control">
          <option value="" disabled>{{ t`选择预设` }}</option>
          <option v-for="name in presetNames" :key="name" :value="name">{{ name }}</option>
        </select>
        <button class="menu_button" :disabled="!presetSelected" @click="loadPreset">
          <i class="fa-solid fa-folder-open"></i>&nbsp;{{ t`加载` }}
        </button>
        <input v-model="presetInput" class="text_input gf-flex-input" :placeholder="t`预设名`" />
        <button class="menu_button" :disabled="!presetInput.trim()" @click="savePreset">
          <i class="fa-solid fa-floppy-disk"></i>&nbsp;{{ t`另存为` }}
        </button>
        <button class="menu_button gf-danger" :disabled="!presetSelected" @click="deletePreset">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </div>

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
        <div
          v-for="(module, idx) in injectModules"
          :key="module.id"
          class="gf-pm-card"
          :class="{ off: !module.enabled, 'gf-pm-drag-target': isDragTarget(injectModules, idx) }"
          @pointerover="setDragTo(injectModules, idx)"
        >
          <div class="gf-pm-head">
            <label class="checkbox_label gf-pm-toggle">
              <input v-model="module.enabled" type="checkbox" />
              <span>{{ module.name }}</span>
            </label>
            <span class="gf-flex"></span>
            <button class="gf-link-btn gf-pm-grip" :title="t`拖拽排序`" @pointerdown="beginDrag(injectModules, idx, $event)">
              <i class="fa-solid fa-grip-vertical"></i>
            </button>
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
        <div
          v-for="(module, idx) in generateModules"
          :key="module.id"
          class="gf-pm-card"
          :class="{ off: !module.enabled, 'gf-pm-drag-target': isDragTarget(generateModules, idx) }"
          @pointerover="setDragTo(generateModules, idx)"
        >
          <div class="gf-pm-head">
            <label class="checkbox_label gf-pm-toggle">
              <input v-model="module.enabled" type="checkbox" />
              <span>
                <i v-if="module.marker" class="fa-solid fa-lock gf-pm-lock"></i>
                {{ module.name }}
              </span>
            </label>
            <span class="gf-flex"></span>
            <button class="gf-link-btn gf-pm-grip" :title="t`拖拽排序`" @pointerdown="beginDrag(generateModules, idx, $event)">
              <i class="fa-solid fa-grip-vertical"></i>
            </button>
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
        <div
          v-for="(module, idx) in shopModules"
          :key="module.id"
          class="gf-pm-card"
          :class="{ off: !module.enabled, 'gf-pm-drag-target': isDragTarget(shopModules, idx) }"
          @pointerover="setDragTo(shopModules, idx)"
        >
          <div class="gf-pm-head">
            <label class="checkbox_label gf-pm-toggle">
              <input v-model="module.enabled" type="checkbox" />
              <span>
                <i v-if="module.marker" class="fa-solid fa-lock gf-pm-lock"></i>
                {{ module.name }}
              </span>
            </label>
            <span class="gf-flex"></span>
            <button class="gf-link-btn gf-pm-grip" :title="t`拖拽排序`" @pointerdown="beginDrag(shopModules, idx, $event)">
              <i class="fa-solid fa-grip-vertical"></i>
            </button>
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
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
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

// 模板预设：编辑作用于当前激活集，另存为/加载才读写预设快照
const presetInput = ref('');
const presetSelected = ref('');
const presetNames = computed(() => Object.keys(settings.value.promptTemplatePresets));

function savePreset(): void {
  const name = presetInput.value.trim();
  if (!name) {
    return;
  }
  settings.value.promptTemplatePresets[name] = {
    promptModules: klona(settings.value.promptModules),
    shopPromptModules: klona(settings.value.shopPromptModules),
  };
  presetSelected.value = name;
  presetInput.value = '';
  toastr.success(t`已保存模板预设「${name}」`, t`金手指系统`);
}

function loadPreset(): void {
  const preset = settings.value.promptTemplatePresets[presetSelected.value];
  if (!preset) {
    return;
  }
  settings.value.promptModules = klona(preset.promptModules);
  settings.value.shopPromptModules = klona(preset.shopPromptModules);
  toastr.success(t`已加载模板预设「${presetSelected.value}」`, t`金手指系统`);
}

function deletePreset(): void {
  if (!presetSelected.value) {
    return;
  }
  delete settings.value.promptTemplatePresets[presetSelected.value];
  presetSelected.value = '';
  toastr.success(t`已删除模板预设`, t`金手指系统`);
}

// 拖拽排序：把手 pointerdown 起拖，卡片 pointerover 更新落点，window pointerup 落盘（同面板手写 pointer 方案）
const drag = ref<{ list: PromptModule[]; from: number; to: number } | null>(null);

function beginDrag(list: PromptModule[], from: number, event: PointerEvent): void {
  // 把手本身就是起拖按钮，不需要再排除按钮；直接起拖
  drag.value = { list, from, to: from };
  event.preventDefault();
}

function setDragTo(list: PromptModule[], index: number): void {
  if (drag.value && drag.value.list === list) {
    drag.value.to = index;
  }
}

function isDragTarget(list: PromptModule[], index: number): boolean {
  return drag.value?.list === list && drag.value.to === index;
}

/** 在过滤视图里把第 from 个模块移到第 to 个位置：先按 scope 从源数组移除，再插到该 scope 第 to 个元素之前 */
function reorderModuleInScope(list: PromptModule[], from: number, to: number): void {
  if (from === to || from < 0 || to < 0 || to >= list.length) {
    return;
  }
  const item = list[from];
  const source =
    item.scope === 'inject' || item.scope === 'generate'
      ? settings.value.promptModules
      : settings.value.shopPromptModules;
  source.splice(source.indexOf(item), 1);
  // 移除后 source 里同 scope 的顺序即目标过滤视图（少一个）；第 to 个元素作为插入锚点
  const scopeItems = source.filter(module => module.scope === item.scope);
  const anchor = scopeItems[to];
  if (anchor === undefined) {
    source.push(item);
  } else {
    source.splice(source.indexOf(anchor), 0, item);
  }
}

function endDrag(): void {
  const d = drag.value;
  if (!d) {
    return;
  }
  if (d.to !== d.from) {
    reorderModuleInScope(d.list, d.from, d.to);
  }
  drag.value = null;
}

function cancelDrag(): void {
  drag.value = null;
}

onMounted(() => {
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', cancelDrag);
});
onUnmounted(() => {
  window.removeEventListener('pointerup', endDrag);
  window.removeEventListener('pointercancel', cancelDrag);
  schedulePreview.cancel();
});

// 变量清单放 script 里拼：模板里直接写 {{ }} 会被 Vue 当插值
const injectVarHint =
  '{{user}} {{systemName}} {{persona}} {{level}} {{currency}} {{points}} {{inventoryText}} {{tasks}} {{maxTasks}} {{skills}} {{attributes}} {{signinState}} {{covertStatus}}';
const genVarHint =
  '{{user}} {{systemName}} {{persona}} {{taskHint}} {{taskCount}} {{currency}} {{level}} {{points}} {{inventoryText}} {{tasks}} {{maxTasks}} {{skills}} {{attributes}} {{signinState}}';
const shopVarHint =
  '{{user}} {{systemName}} {{shopName}} {{persona}} {{currency}} {{level}} {{points}} {{inventoryText}} {{tasks}} {{maxTasks}} {{skills}} {{attributes}} {{signinState}}';

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

// 预览重建防抖：deep watch 在改模板/状态变化时高频触发，而全量重组（含世界书扫描）+ token 计数开销大
let previewSeq = 0;
const schedulePreview = _.debounce(async () => {
  const seq = ++previewSeq;
  const system = game.activeSystem;
  if (!previewOpen.value || !system || !settings.value.enabled) {
    previewContent.value = '';
    previewTokenCount.value = null;
    return;
  }
  try {
    const content = await buildPreviewContent(previewTab.value, system);
    if (seq !== previewSeq) {
      return; // 等待期间又有新触发，过期响应丢弃
    }
    previewContent.value = content;
  } catch (error) {
    console.error('[GoldenFinger] 提示词预览失败', error);
    previewContent.value = '';
  }
}, 300);

watch(
  [previewOpen, previewTab, () => settings.value, () => game.state],
  () => schedulePreview(),
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

.gf-pm-preset-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 10px;
  flex-wrap: wrap;
}
.gf-pm-preset-row .gf-setting-control {
  flex: none;
  max-width: 140px;
}
.gf-pm-preset-row input {
  flex: 1 1 120px;
}

.gf-pm-grip {
  cursor: grab;
  touch-action: none;
}
.gf-pm-drag-target {
  outline: 2px dashed color-mix(in srgb, var(--gf-accent) 60%, transparent);
  outline-offset: 1px;
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
