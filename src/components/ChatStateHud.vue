<template>
  <!-- 聊天内身心状态条：纯 DOM 悬浮层，不写进聊天数据；点击直达面板状态页 -->
  <Transition name="gf-hud">
    <div
      v-if="visible"
      class="gf-state-hud"
      :style="{ '--gf-accent': accent }"
      :title="t`宿主身心状态（点击打开状态页）`"
      @click="openStates"
    >
      <i class="fa-solid fa-heart-pulse gf-hud-icon"></i>
      <span
        v-for="st in game.state.passiveStates"
        :key="st.id"
        class="gf-hud-chip"
        :class="`gf-hud-i${st.intensity}`"
        :title="chipTitle(st)"
      >
        {{ st.name }}<span class="gf-hud-pips">{{ pips(st.intensity) }}</span>
      </span>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { computed } from 'vue';
import { panelPage, panelVisible, togglePanel } from '@/core/ui-state';
import { pinia } from '@/pinia';
import { useGameStore } from '@/store/game';
import { useSettingsStore } from '@/store/settings';
import { INTENSITY_NAMES, type PassiveState } from '@/type/game';

const game = useGameStore(pinia);
const { settings } = storeToRefs(useSettingsStore(pinia));

// 状态条是数据的影子：有记录才显示，不在设置之外自己常驻（玩家侧只读，管理仍在状态页）；
// 总开关关闭/未绑定系统时隐藏，与状态页「未绑定显示引导」的口径一致
const visible = computed(
  () =>
    settings.value.chatStateHud && settings.value.enabled && !!game.activeSystem && game.state.passiveStates.length > 0,
);

// 状态条是系统入口而非某系统专属：未绑定时回落默认紫（同悬浮球）
const accent = computed(() => game.activeSystem?.color ?? '#8b5cf6');

const PIPS: Record<number, string> = { 1: '●', 2: '●●', 3: '●●●' };

function pips(intensity: number): string {
  return PIPS[intensity] ?? PIPS[1];
}

function chipTitle(st: PassiveState): string {
  const parts = [INTENSITY_NAMES[st.intensity] ?? t`轻微`];
  if (st.note) {
    parts.push(st.note);
  }
  if (st.remainingFloors !== null) {
    parts.push(t`剩 ${st.remainingFloors} 楼`);
  }
  return parts.join('｜');
}

function openStates(): void {
  panelPage.value = 'states';
  if (!panelVisible.value) {
    togglePanel();
  }
}
</script>

<style scoped>
.gf-state-hud {
  position: fixed;
  top: 46px;
  left: 50%;
  transform: translateX(-50%);
  /* 面板 > 悬浮球 > 状态条：三个浮层互不遮挡各自的点击 */
  z-index: calc(var(--gf-z-panel) - 2);
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
  max-width: min(72vw, 620px);
  padding: 5px 10px;
  border-radius: var(--gf-radius-lg);
  background: linear-gradient(168deg, var(--gf-bg-0), color-mix(in srgb, var(--gf-accent) 9%, var(--gf-bg-0)));
  border: 1px solid color-mix(in srgb, var(--gf-accent) 42%, transparent);
  box-shadow: var(--gf-shadow-md);
  color: var(--gf-text-0);
  font-size: 12px;
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
}

.gf-hud-icon {
  color: var(--gf-accent);
  opacity: 0.85;
}

.gf-hud-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 11px;
  line-height: 18px;
  white-space: nowrap;
}

.gf-hud-pips {
  font-size: 8px;
  letter-spacing: 1px;
  opacity: 0.85;
}

/* 强度三档配色与状态页表格一致（灰/蓝/红 + 柔和底） */
.gf-hud-i1 {
  color: var(--gf-text-1);
  background: var(--gf-bg-2);
}

.gf-hud-i2 {
  color: var(--gf-rarity-2);
  background: var(--gf-rarity-2-soft);
}

.gf-hud-i3 {
  color: var(--gf-danger);
  background: var(--gf-danger-soft);
}

.gf-hud-enter-active,
.gf-hud-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.gf-hud-enter-from,
.gf-hud-leave-to {
  opacity: 0;
  /* 基础 transform 带水平居中，入场位移要叠在它上面 */
  transform: translateX(-50%) translateY(-8px);
}
</style>
