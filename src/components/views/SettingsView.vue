<template>
  <div class="gf-view">
    <!-- 界面显示（悬浮球 / 聊天内状态条两个入口的开关） -->
    <GfSectionCard :title="t`界面显示`" icon="fa-solid fa-display">
      <div class="gf-setting-row">
        <label class="checkbox_label gf-flex">
          <input v-model="settings.bubbleEnabled" type="checkbox" />
          <span>{{ t`悬浮球入口` }}</span>
        </label>
      </div>
      <div class="gf-setting-desc">{{ t`在酒馆界面显示可拖拽的悬浮球，点按开合面板。` }}</div>
      <div class="gf-setting-row">
        <label class="checkbox_label gf-flex">
          <input v-model="settings.chatStateHud" type="checkbox" />
          <span>{{ t`聊天内显示身心状态` }}</span>
        </label>
      </div>
      <div class="gf-setting-desc">{{ t`有被动状态时，聊天区顶部悬浮一条状态条，点击直达状态页。` }}</div>
    </GfSectionCard>

    <!-- 自定义系统（创建/编辑/导入导出，原扩展抽屉的唯一管理入口已并入面板） -->
    <GfSectionCard :title="t`自定义系统（${settings.customSystems.length}）`" icon="fa-solid fa-wand-magic-sparkles">
      <CustomSystemManager />
    </GfSectionCard>

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
          @change="clampSetting('autoIssueInterval', 1, 50, 3)"
        />
      </div>
      <div class="gf-setting-desc">{{ t`每达到条数上限且任务未满时，系统会异步调用 API 自动发布新任务。` }}</div>
    </GfSectionCard>

    <!-- 任务结算：自动判定 + 任务时限 + 失败惩罚（时限是判定失效时的本地兜底，惩罚对所有失败来源通用） -->
    <GfSectionCard v-model:open="settleOpen" :title="t`任务结算`" icon="fa-solid fa-scale-balanced">
      <div class="gf-setting-row">
        <label class="checkbox_label gf-flex">
          <input v-model="settings.autoJudge" type="checkbox" />
          <span>{{ t`自动判定任务` }}</span>
        </label>
      </div>
      <div class="gf-setting-desc">
        {{
          t`每条 AI 回复后，系统会异步调用判定 API 结算进行中任务，不依赖主 AI 在正文写判定标记；任务带时限时，判定会结合剩余时间提前裁定。与状态提取同轮时合并为一次请求。`
        }}
      </div>
      <div class="gf-setting-row">
        <label class="checkbox_label gf-flex">
          <input v-model="settings.taskTimeoutEnabled" type="checkbox" />
          <span>{{ t`任务超时自动判失败` }}</span>
        </label>
        <input
          v-model.number="settings.taskTimeoutMinutes"
          class="text_input gf-number"
          type="number"
          min="1"
          max="1440"
          :disabled="!settings.taskTimeoutEnabled"
          @change="clampSetting('taskTimeoutMinutes', 1, 1440, 60)"
        />
      </div>
      <div class="gf-setting-row">
        <label class="checkbox_label gf-flex">
          <input v-model="settings.failPunishmentEnabled" type="checkbox" />
          <span>{{ t`失败惩罚（扣奖励里的负数项，所有失败来源通用）` }}</span>
        </label>
      </div>
      <div class="gf-setting-desc">
        {{
          t`任务逾期会自动结算为失败，也是自动判定关闭或失败时的本地兜底；开启惩罚后，任何来源的失败都会把奖励里的负数项（货币/物品）作为惩罚扣减。`
        }}
      </div>
    </GfSectionCard>

    <!-- 被动状态追踪 -->
    <GfSectionCard v-model:open="stateOpen" :title="t`被动状态追踪`" icon="fa-solid fa-heart-pulse">
      <div class="gf-setting-row">
        <label class="checkbox_label gf-flex">
          <input v-model="settings.passiveStateTracking" type="checkbox" />
          <span>{{ t`开启` }}</span>
        </label>
      </div>
      <div class="gf-setting-desc">
        {{
          t`每条 AI 回复后即时从最近剧情提取宿主的被动身心状态（受伤、寒冷、生病、生理反应等），及时更新并持续注入给正文 AI 与任务生成；与自动判定同轮触发时合并为一次请求。建议配置副 API 小模型；状态页可手动增删与立即提取。`
        }}
      </div>
    </GfSectionCard>

    <!-- 危险操作（只影响本聊天的游玩存档，全局设置不受影响） -->
    <GfSectionCard v-model:open="dangerOpen" :title="t`危险操作`" icon="fa-solid fa-triangle-exclamation">
      <div class="gf-setting-row">
        <button class="menu_button gf-danger" @click="resetChatState">
          <i class="fa-solid fa-trash-can"></i>&nbsp;{{ t`清空本聊天的金手指数据` }}
        </button>
      </div>
      <div class="gf-setting-desc">{{ t`清空等级、货币、任务、背包与日志；全局设置与其他聊天不受影响。` }}</div>
    </GfSectionCard>
  </div>
</template>

<script setup lang="ts">
import toastr from 'toastr';
import { storeToRefs } from 'pinia';
import { computed, reactive, ref } from 'vue';
import GfSectionCard from '@/components/shared/GfSectionCard.vue';
import CustomSystemManager from '@/components/shared/CustomSystemManager.vue';
import { normalizeApiUrl } from '@/core/api-client';
import { API_PRESETS, presetForApiUrl } from '@/core/api-presets';
import { useGameStore } from '@/store/game';
import { useSettingsStore } from '@/store/settings';

const settingsStore = useSettingsStore();
const { settings } = storeToRefs(settingsStore);
const game = useGameStore();

const autoOpen = ref(false);
const settleOpen = ref(false);
const stateOpen = ref(false);
const dangerOpen = ref(false);

async function resetChatState(): Promise<void> {
  const context = window.SillyTavern?.getContext?.();
  const result = await context?.callGenericPopup?.(
    t`确定清空本聊天的全部金手指数据（等级、货币、任务、背包、日志）？`,
    context.POPUP_TYPE.CONFIRM,
  );
  // 安全方向：弹窗不可用或未明确确认都不执行（防 context 缺失时 undefined === undefined 误判为确认）
  if (!context?.callGenericPopup || result !== context.POPUP_RESULT.AFFIRMATIVE) {
    return;
  }
  game.resetState();
  toastr.success(t`已清空`, t`金手指系统`);
}

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
  // 数字框直输不可信：保存前钳制到 schema 允许区间，避免越界值存进会话、下次加载被 zod 静默重置
  draft.maxTokens = clampNumberInput(draft.maxTokens, 64, 8192, 2500);
  Object.assign(settings.value.api, klona(draft));
  toastr.success(t`API 设置已保存`, t`金手指系统`);
}

/** 数字框输入清洗：空/非法回退 fallback，越界钳到 [min,max]（v-model.number 清空时给 ''） */
function clampNumberInput(value: unknown, min: number, max: number, fallback: number): number {
  const num = Math.round(Number(value));
  if (value === '' || value === null || value === undefined || !Number.isFinite(num)) {
    return fallback;
  }
  return _.clamp(num, min, max);
}

/** 直接绑定 store 的数字框在 change 时清洗（schema 的 catch 只在下次加载兜底，当次会话仍是脏值） */
function clampSetting(
  key: 'autoIssueInterval' | 'taskTimeoutMinutes',
  min: number,
  max: number,
  fallback: number,
): void {
  settings.value[key] = clampNumberInput(settings.value[key] as unknown, min, max, fallback);
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
