<template>
  <div class="gf-view">
    <!-- 任务生成 API（提示词/世界书/正则等通用配置已拆到「配置」页） -->
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

    <!-- 自动判定 -->
    <GfSectionCard v-model:open="judgeOpen" :title="t`自动判定任务`" icon="fa-solid fa-scale-balanced">
      <div class="gf-setting-row">
        <label class="checkbox_label gf-flex">
          <input v-model="settings.autoJudge" type="checkbox" />
          <span>{{ t`开启` }}</span>
        </label>
        <input
          v-model.number="settings.autoJudgeInterval"
          class="text_input gf-number"
          type="number"
          min="1"
          max="50"
          :disabled="!settings.autoJudge"
        />
      </div>
      <div class="gf-setting-desc">{{ t`每达到条数上限且有进行中任务时，系统会异步调用独立判定 API 结算任务，不依赖主 AI 在正文写判定标记。` }}</div>
    </GfSectionCard>
  </div>
</template>

<script setup lang="ts">
import toastr from 'toastr';
import { storeToRefs } from 'pinia';
import { computed, reactive, ref } from 'vue';
import GfSectionCard from '@/components/shared/GfSectionCard.vue';
import { normalizeApiUrl } from '@/core/api-client';
import { API_PRESETS, presetForApiUrl } from '@/core/api-presets';
import { useSettingsStore } from '@/store/settings';

const settingsStore = useSettingsStore();
const { settings } = storeToRefs(settingsStore);

const autoOpen = ref(false);
const judgeOpen = ref(false);

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
</style>
