<template>
  <div class="gf-view">
    <!-- 当前系统 -->
    <div v-if="system" class="gf-current-system" :style="{ '--gf-accent': system.color }">
      <div class="gf-system-icon">{{ system.icon }}</div>
      <div class="gf-current-info">
        <div class="gf-current-name">{{ system.name }}</div>
        <div class="gf-current-meta">
          {{ system.currencyName }} · {{ system.shopName }} ·
          {{ t`任务上限 ${system.maxActiveTasks}` }}
        </div>
        <div v-if="system.tagline" class="gf-current-tagline">{{ system.tagline }}</div>
      </div>
      <button class="gf-mini-btn bad" @click="deactivate">{{ t`解绑` }}</button>
    </div>
    <div v-else class="gf-empty-small">{{ t`本聊天还没有绑定系统，选一个开始吧：` }}</div>

    <div class="gf-view-title">{{ t`可选系统（${allSystems.length}）` }}</div>
    <div class="gf-system-grid">
      <button
        v-for="candidate in allSystems"
        :key="candidate.id"
        class="gf-system-card"
        :class="{ current: candidate.id === system?.id }"
        :style="{ '--gf-accent': candidate.color }"
        @click="activate(candidate)"
      >
        <div class="gf-system-icon">{{ candidate.icon }}</div>
        <div class="gf-system-name">{{ candidate.name }}</div>
        <div class="gf-system-tagline">{{ candidate.tagline }}</div>
        <div class="gf-system-meta">{{ candidate.currencyName }} · {{ candidate.shopName }}</div>
      </button>
    </div>
    <div class="gf-hint">{{ t`自定义系统在扩展设置里创建与编辑；重新绑定会重置本聊天数据。` }}</div>
  </div>
</template>

<script setup lang="ts">
import toastr from 'toastr';
import { storeToRefs } from 'pinia';
import { computed } from 'vue';
import { pinia } from '@/pinia';
import { useGameStore } from '@/store/game';
import { useSettingsStore } from '@/store/settings';
import { BUILTIN_SYSTEMS } from '@/systems/builtin';
import type { SystemDef } from '@/type/game';

const game = useGameStore(pinia);
const { settings } = storeToRefs(useSettingsStore(pinia));

const system = computed(() => game.activeSystem);
const allSystems = computed<SystemDef[]>(() => [...BUILTIN_SYSTEMS, ...settings.value.customSystems]);

async function activate(candidate: SystemDef): Promise<void> {
  if (candidate.id === system.value?.id) {
    return;
  }
  const context = window.SillyTavern?.getContext?.();
  // 有历史数据时先确认，避免误清空
  if (game.state.tasks.length > 0 || game.state.points !== 0 || game.state.log.length > 0) {
    const result = await context?.callGenericPopup?.(
      t`激活新系统会清空本聊天现有的金手指数据（等级、任务、背包、日志），确定继续吗？`,
      context.POPUP_TYPE.CONFIRM,
    );
    if (result !== context?.POPUP_RESULT?.AFFIRMATIVE) {
      return;
    }
  }
  game.activateSystem(candidate);
  toastr.success(t`「${candidate.name}」已绑定到本聊天！`, t`金手指系统`);
}

async function deactivate(): Promise<void> {
  const context = window.SillyTavern?.getContext?.();
  const result = await context?.callGenericPopup?.(
    t`解绑系统？游玩数据会保留，重新绑定会重置。`,
    context.POPUP_TYPE.CONFIRM,
  );
  if (result !== context?.POPUP_RESULT?.AFFIRMATIVE) {
    return;
  }
  game.deactivateSystem();
  toastr.info(t`系统已解绑。`, t`金手指系统`);
}
</script>

<style scoped>
.gf-current-system {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: var(--gf-radius-md);
  background: linear-gradient(120deg, color-mix(in srgb, var(--gf-accent) 18%, transparent), var(--gf-bg-1));
  border: 1px solid color-mix(in srgb, var(--gf-accent) 40%, transparent);
}

.gf-current-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.gf-current-name {
  font-weight: 700;
  font-size: 15px;
}

.gf-current-meta {
  font-size: 12px;
  color: var(--gf-text-2);
}

.gf-current-tagline {
  font-size: 11px;
  color: var(--gf-text-2);
  opacity: 0.8;
}

.gf-system-meta {
  font-size: 10px;
  color: var(--gf-text-2);
}
</style>
