<template>
  <div class="gf-view">
    <!-- 提示词模板（choice PromptEditor 式模块编辑） -->
    <GfSectionCard :title="t`提示词模板`" icon="fa-solid fa-pen-to-square">
      <template #extra>
        <button class="gf-link-btn" :title="t`全部恢复默认模板`" @click="resetModules">
          <i class="fa-solid fa-rotate-left"></i> {{ t`恢复默认` }}
        </button>
      </template>
      <div class="gf-setting-desc">
        {{ t`启用中的模块按顺序拼装后注入给正文 AI，双花括号变量会在注入时填充实际状态。` }}
      </div>
      <div v-for="(module, index) in settings.promptModules" :key="module.id" class="gf-pm-card" :class="{ off: !module.enabled }">
        <div class="gf-pm-head">
          <label class="checkbox_label gf-pm-toggle">
            <input v-model="module.enabled" type="checkbox" />
            <span>{{ module.name }}</span>
          </label>
          <button class="gf-link-btn" :title="t`恢复此模块的默认内容`" @click="resetModule(index)">
            <i class="fa-solid fa-rotate-left"></i>
          </button>
        </div>
        <textarea v-model="module.content" class="text_input gf-pm-textarea" rows="4"></textarea>
      </div>
      <div class="gf-var-hint">{{ varHint }}</div>
    </GfSectionCard>

    <!-- 提示词预览 -->
    <GfSectionCard :title="t`提示词预览`" icon="fa-solid fa-eye">
      <template #extra>
        <span v-if="tokenCount !== null" class="gf-token-chip">{{ tokenCount }} tok</span>
      </template>
      <div v-if="!previewText" class="gf-empty-small">
        {{ t`当前没有注入内容：未绑定系统，或总开关已关闭。` }}
      </div>
      <template v-else>
        <div class="gf-setting-desc">{{ t`以下文本会按当前位置/深度实时注入给正文 AI，随剧情状态自动更新。` }}</div>
        <pre class="gf-prompt-pre">{{ previewText }}</pre>
        <div class="gf-editor-actions">
          <button class="menu_button" @click="copyPreview"><i class="fa-solid fa-copy"></i>&nbsp;{{ t`复制` }}</button>
        </div>
      </template>
    </GfSectionCard>

    <!-- 任务生成 API -->
    <GfSectionCard :title="t`任务生成 API`" icon="fa-solid fa-plug">
      <label class="gf-radio-row">
        <input v-model="draft.mode" type="radio" value="main" />
        <span>{{ t`跟随酒馆当前连接` }}</span>
      </label>
      <label class="gf-radio-row">
        <input v-model="draft.mode" type="radio" value="secondary" />
        <span>{{ t`副 API（OpenAI 兼容端点，可用独立小模型）` }}</span>
      </label>

      <template v-if="draft.mode === 'secondary'">
        <div class="gf-setting-row">
          <span class="gf-setting-label">{{ t`服务商预设` }}</span>
          <select v-model="selectedPreset" class="gf-setting-control">
            <option v-for="preset in API_PRESETS" :key="preset.name" :value="preset.name">{{ preset.name }}</option>
            <option value="custom">{{ t`自定义` }}</option>
          </select>
        </div>
        <div class="gf-setting-col">
          <span class="gf-setting-label">{{ t`API 地址` }}</span>
          <input
            v-model="draft.url"
            class="text_input gf-flex-input"
            type="text"
            placeholder="https://api.example.com/v1"
          />
        </div>
        <div class="gf-setting-col">
          <span class="gf-setting-label">{{ t`密钥（可选）` }}</span>
          <input v-model="draft.key" class="text_input gf-flex-input" type="password" />
        </div>
        <div class="gf-setting-col">
          <span class="gf-setting-label">{{ t`模型` }}</span>
          <div class="gf-setting-row">
            <input v-model="draft.model" class="text_input gf-flex-input" type="text" placeholder="gpt-4o-mini" />
            <button class="menu_button" :disabled="fetchingModels" @click="fetchModels">
              <i :class="fetchingModels ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-cloud-arrow-down'"></i>
              {{ t`拉取模型` }}
            </button>
          </div>
          <select
            v-if="modelOptions.length > 0"
            class="gf-setting-control gf-model-list"
            :value="draft.model"
            @change="draft.model = ($event.target as HTMLSelectElement).value"
          >
            <option value="" disabled>{{ t`选择模型` }}</option>
            <option v-for="model in modelOptions" :key="model" :value="model">{{ model }}</option>
          </select>
        </div>
        <div class="gf-setting-row">
          <span class="gf-setting-label">{{ t`回复长度上限（tokens）` }}</span>
          <input v-model.number="draft.maxTokens" class="text_input gf-number" type="number" min="64" max="8192" />
        </div>
        <div class="gf-editor-actions">
          <button class="menu_button" @click="saveApi">
            <i class="fa-solid fa-floppy-disk"></i>&nbsp;{{ t`保存` }}
          </button>
          <button class="menu_button" @click="resetApi">{{ t`还原` }}</button>
        </div>
      </template>
    </GfSectionCard>

    <!-- 提示词注入 -->
    <GfSectionCard v-model:open="injectOpen" :title="t`提示词注入`" icon="fa-solid fa-syringe">
      <label class="checkbox_label">
        <input v-model="settings.enabled" type="checkbox" />
        <span>{{ t`启用金手指（注入提示词给正文 AI）` }}</span>
      </label>
      <div class="gf-setting-row">
        <span class="gf-setting-label">{{ t`注入位置` }}</span>
        <select v-model="settings.injectionPosition" class="gf-setting-control">
          <option value="in_chat">{{ t`对话内（推荐）` }}</option>
          <option value="in_prompt">{{ t`主提示词区` }}</option>
        </select>
      </div>
      <div class="gf-setting-row">
        <span class="gf-setting-label">{{ t`注入深度（对话内生效）` }}</span>
        <input v-model.number="settings.injectionDepth" class="text_input gf-number" type="number" min="0" max="20" />
      </div>
    </GfSectionCard>

    <!-- 自动发布 -->
    <GfSectionCard v-model:open="autoOpen" :title="t`自动发布任务`" icon="fa-solid fa-robot">
      <div class="gf-setting-row">
        <label class="checkbox_label gf-flex">
          <input v-model="settings.autoIssue" type="checkbox" />
          <span>{{ t`开启` }}</span>
        </label>
        <input
          v-model.number="settings.autoIssueInterval"
          class="text_input gf-number"
          type="number"
          min="1"
          max="50"
          :disabled="!settings.autoIssue"
        />
      </div>
      <div class="gf-setting-desc">{{ t`每达到条数上限且任务未满时，系统会异步调用 API 自动发布新任务。` }}</div>
    </GfSectionCard>
  </div>
</template>

<script setup lang="ts">
import toastr from 'toastr';
import { storeToRefs } from 'pinia';
import { computed, reactive, ref, watch } from 'vue';
import GfSectionCard from '@/components/shared/GfSectionCard.vue';
import { buildInjectionText } from '@/core/injector';
import { normalizeApiUrl } from '@/core/api-client';
import { API_PRESETS, presetForApiUrl } from '@/core/api-presets';
import { useGameStore } from '@/store/game';
import { useSettingsStore } from '@/store/settings';
import { DEFAULT_PROMPT_MODULES } from '@/type/settings';

const game = useGameStore();
const settingsStore = useSettingsStore();
const { settings } = storeToRefs(settingsStore);

const injectOpen = ref(false);
const autoOpen = ref(false);

// #region 提示词模板

// 变量清单放 script 里拼：模板里直接写 {{ }} 会被 Vue 当插值
const varHint = computed(
  () =>
    `${t`可用变量`}: {{user}} {{systemName}} {{persona}} {{level}} {{currency}} {{points}} {{inventoryText}} {{tasks}} {{maxTasks}}`,
);

function resetModule(index: number): void {
  const current = settings.value.promptModules[index];
  const fallback = DEFAULT_PROMPT_MODULES.find(candidate => candidate.id === current?.id);
  if (!current || !fallback) {
    return;
  }
  current.content = fallback.content;
  current.enabled = fallback.enabled;
  current.name = fallback.name;
}

function resetModules(): void {
  settings.value.promptModules = structuredClone(DEFAULT_PROMPT_MODULES);
  toastr.success(t`已恢复默认模板`, t`金手指系统`);
}

// #endregion

// #region 提示词预览

const previewText = computed(() => {
  const system = game.activeSystem;
  if (!system || !settings.value.enabled) {
    return '';
  }
  return buildInjectionText(system, game.state, settings.value);
});

const tokenCount = ref<number | null>(null);
watch(
  previewText,
  async text => {
    if (!text) {
      tokenCount.value = 0;
      return;
    }
    try {
      const context = window.SillyTavern?.getContext?.();
      const count = await context?.getTokenCountAsync?.(text);
      tokenCount.value = typeof count === 'number' ? count : null;
    } catch {
      tokenCount.value = null;
    }
  },
  { immediate: true },
);

async function copyPreview(): Promise<void> {
  try {
    await navigator.clipboard.writeText(previewText.value);
    toastr.success(t`已复制到剪贴板`, t`金手指系统`);
  } catch {
    toastr.error(t`复制失败`, t`金手指系统`);
  }
}

// #endregion

// #region 任务生成 API（草稿编辑，保存才生效）

const draft = reactive(klona(settings.value.api));
const fetchingModels = ref(false);
const fetchedModels = ref<string[]>([]);
const presetModels = ref<string[]>([]);

const selectedPreset = computed({
  get: () => presetForApiUrl(draft.url)?.name ?? 'custom',
  set: (name: string) => {
    const preset = API_PRESETS.find(candidate => candidate.name === name);
    if (preset) {
      draft.url = preset.baseUrl;
      draft.model = '';
      presetModels.value = preset.models;
      fetchedModels.value = [];
    }
  },
});

const modelOptions = computed<string[]>(() =>
  fetchedModels.value.length > 0 ? fetchedModels.value : presetModels.value,
);

function saveApi(): void {
  Object.assign(settings.value.api, klona(draft));
  toastr.success(t`API 设置已保存`, t`金手指系统`);
}

function resetApi(): void {
  Object.assign(draft, klona(settings.value.api));
  fetchedModels.value = [];
}

async function fetchModels(): Promise<void> {
  if (!draft.url.trim()) {
    toastr.warning(t`请先填写 API 地址`, t`金手指系统`);
    return;
  }
  if (typeof window.TavernHelper?.getModelList !== 'function') {
    toastr.warning(t`拉取模型列表需要安装酒馆助手（JS-Slash-Runner）`, t`金手指系统`);
    return;
  }
  fetchingModels.value = true;
  try {
    const models = await window.TavernHelper.getModelList({
      apiurl: normalizeApiUrl(draft.url),
      key: draft.key || undefined,
    });
    fetchedModels.value = models;
    if (!draft.model && models.length > 0) {
      draft.model = models[0];
    }
    toastr.success(t`拉取到 ${models.length} 个模型`, t`金手指系统`);
  } catch (error) {
    console.error('[GoldenFinger] 拉取模型列表失败', error);
    toastr.error(error instanceof Error ? error.message : String(error), t`金手指系统`);
  } finally {
    fetchingModels.value = false;
  }
}

// #endregion
</script>

<style scoped>
.gf-radio-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 4px 0;
  cursor: pointer;
}

.gf-model-list {
  max-height: 140px;
}

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
