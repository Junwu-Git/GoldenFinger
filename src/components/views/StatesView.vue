<template>
  <div class="gf-view">
    <!-- 未绑定：给引导（同商店惯例，不隐藏 UI） -->
    <div v-if="!system" class="gf-guide">
      <div class="gf-view-title">{{ t`当前状态` }}</div>
      <div class="gf-empty-small">
        {{
          t`绑定系统后，系统会自动从剧情提取宿主的被动身心状态（受伤、寒冷、生病、生理反应等），注入正文并在这里展示与手动管理。`
        }}
      </div>
    </div>

    <template v-else>
      <div class="gf-view-title gf-title-row">
        <span>{{ t`当前状态（${game.state.passiveStates.length}）` }}</span>
        <span class="gf-state-actions">
          <button class="gf-mini-btn" :disabled="game.trackingStates" :title="t`立即从剧情提取`" @click="extractNow">
            <i :class="game.trackingStates ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-arrows-rotate'"></i>
          </button>
          <button class="gf-mini-btn" :title="t`手动记录状态`" @click="adding = !adding">
            <i class="fa-solid fa-plus"></i>
          </button>
        </span>
      </div>

      <!-- 手动记录：名称 + 来历 + 类别 + 强度 -->
      <div v-if="adding" class="gf-state-add">
        <input
          v-model="newName"
          class="text_input"
          type="text"
          :placeholder="t`状态名，如：受伤（左臂）`"
          @keyup.enter="submitAdd"
        />
        <input v-model="newNote" class="text_input" type="text" :placeholder="t`来历（可选）`" />
        <select v-model="newKind" class="gf-state-select">
          <option value="body">{{ KIND_NAMES.body }}</option>
          <option value="mind">{{ KIND_NAMES.mind }}</option>
          <option value="physio">{{ KIND_NAMES.physio }}</option>
        </select>
        <select v-model.number="newIntensity" class="gf-state-select">
          <option :value="1">{{ t`轻微` }}</option>
          <option :value="2">{{ t`明显` }}</option>
          <option :value="3">{{ t`严重` }}</option>
        </select>
        <button class="gf-mini-btn" @click="submitAdd"><i class="fa-solid fa-check"></i></button>
      </div>

      <table v-if="game.state.passiveStates.length > 0" class="gf-state-table">
        <thead>
          <tr>
            <th>{{ t`状态` }}</th>
            <th>{{ t`强度` }}</th>
            <th>{{ t`来历` }}</th>
            <th class="gf-state-op"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="st in game.state.passiveStates" :key="st.id">
            <td>
              {{ st.name }}
              <span class="gf-state-kind">{{ KIND_NAMES[st.kind] }}</span>
              <span v-if="st.remainingFloors !== null" class="gf-state-floors">
                {{ t`剩 ${st.remainingFloors} 楼` }}
              </span>
            </td>
            <td>
              <span class="gf-state-intensity" :class="`gf-state-i${st.intensity}`">
                {{ intensityLabel(st.intensity) }}
              </span>
            </td>
            <td class="gf-state-note">{{ st.note || '—' }}</td>
            <td class="gf-state-op">
              <button class="gf-link-btn" :title="t`移除`" @click="game.removePassiveState(st.id)">
                <i class="fa-solid fa-xmark"></i>
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-else class="gf-empty-small">{{ t`暂无记录的被动状态。` }}</div>

      <div v-if="!settings.passiveStateTracking" class="gf-state-hint">
        {{ t`在「设置 → 被动状态追踪」开启后，会随剧情自动维护这份清单。` }}
      </div>

      <!-- 追踪范围：与提取提示词同源（STATE_CATALOG） -->
      <GfSectionCard :title="t`追踪范围`" icon="fa-solid fa-list-check">
        <div class="gf-catalog-desc">
          {{
            t`提取只识别以下类别的被动状态。判定标准：不受宿主主观控制、剧情里有明确证据；强度 1~3 随剧情调整，会自然消退的状态带持续楼数，伤病类到剧情痊愈才解除。`
          }}
        </div>
        <div v-for="group in STATE_CATALOG" :key="group.kind" class="gf-catalog-group">
          <div class="gf-catalog-kind">{{ KIND_NAMES[group.kind] }}</div>
          <div v-for="item in group.items" :key="item.name" class="gf-catalog-item">
            <span class="gf-catalog-name">{{ item.name }}</span>
            <span class="gf-catalog-hint">{{ item.hint }}</span>
          </div>
        </div>
      </GfSectionCard>
    </template>
  </div>
</template>

<script setup lang="ts">
import toastr from 'toastr';
import { computed, ref } from 'vue';
import GfSectionCard from '@/components/shared/GfSectionCard.vue';
import { useGameStore } from '@/store/game';
import { useSettingsStore } from '@/store/settings';
import { INTENSITY_NAMES, KIND_NAMES, type PassiveStateKind } from '@/type/game';
import { STATE_CATALOG } from '@/core/state-tracker';

const game = useGameStore();
const settings = useSettingsStore().settings;
const system = computed(() => game.activeSystem);

const adding = ref(false);
const newName = ref('');
const newNote = ref('');
const newKind = ref<PassiveStateKind>('body');
const newIntensity = ref(2);

function intensityLabel(intensity: number): string {
  return INTENSITY_NAMES[intensity] ?? '轻微';
}

function submitAdd(): void {
  const name = newName.value.trim();
  if (!name) {
    return;
  }
  game.addPassiveState(name, newKind.value, newIntensity.value, newNote.value);
  newName.value = '';
  newNote.value = '';
  adding.value = false;
}

/** 手动触发一次提取（不依赖自动节奏，验证与强刷用） */
async function extractNow(): Promise<void> {
  try {
    const changed = await game.extractStates();
    if (changed > 0) {
      toastr.success(t`状态追踪更新了 ${changed} 条身心状态`, t`金手指系统`);
    } else {
      toastr.info(t`状态追踪完成：清单无需变化`, t`金手指系统`);
    }
  } catch (error) {
    console.error('[GoldenFinger] 状态提取失败', error);
    toastr.error(error instanceof Error ? error.message : String(error), t`金手指系统`);
  }
}
</script>

<style scoped>
.gf-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.gf-guide {
  margin-bottom: 12px;
}
.gf-state-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}
.gf-state-add {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: var(--gf-radius-md);
  background: var(--gf-bg-1);
  margin-bottom: 8px;
}
.gf-state-add .text_input {
  flex: 1;
  min-width: 0;
}
.gf-state-select {
  max-width: 72px;
}
.gf-state-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  margin-bottom: 8px;
}
.gf-state-table th {
  text-align: left;
  font-weight: 600;
  color: var(--gf-text-2);
  padding: 4px 6px;
  border-bottom: 1px solid var(--gf-border);
}
.gf-state-table td {
  padding: 5px 6px;
  border-bottom: 1px dashed var(--gf-border);
  vertical-align: middle;
}

.gf-state-table tbody tr:hover {
  background: rgba(255, 255, 255, 0.03);
}
.gf-state-note {
  opacity: 0.8;
}
.gf-state-op {
  text-align: right;
  width: 28px;
}
.gf-state-intensity {
  font-size: 11px;
  font-weight: 600;
  border-radius: 999px;
  padding: 0 7px;
}
.gf-state-i1 {
  color: var(--gf-text-2);
  background: var(--gf-bg-2);
}
.gf-state-i2 {
  color: var(--gf-rarity-2);
  background: var(--gf-rarity-2-soft);
}
.gf-state-i3 {
  color: var(--gf-danger);
  background: var(--gf-danger-soft);
}
.gf-state-floors {
  font-size: 11px;
  opacity: 0.7;
}
.gf-state-kind {
  font-size: 10px;
  opacity: 0.55;
  margin: 0 2px;
}
.gf-state-hint {
  font-size: 11px;
  opacity: 0.6;
  margin-bottom: 12px;
}
.gf-catalog-desc {
  font-size: 11px;
  opacity: 0.75;
  margin-bottom: 8px;
}
.gf-catalog-group {
  margin-bottom: 8px;
}
.gf-catalog-kind {
  font-size: 11px;
  font-weight: 700;
  color: var(--gf-accent);
  margin-bottom: 3px;
}
.gf-catalog-item {
  display: flex;
  gap: 6px;
  font-size: 12px;
  padding: 3px 0;
  border-bottom: 1px dashed var(--gf-border);
}
.gf-catalog-item:last-child {
  border-bottom: none;
}
.gf-catalog-name {
  font-weight: 600;
  flex-shrink: 0;
}
.gf-catalog-hint {
  opacity: 0.75;
}
</style>
