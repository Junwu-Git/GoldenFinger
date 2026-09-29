<template>
  <div v-show="visible" ref="panel" class="gf-panel" :style="{ '--gf-accent': accent }">
    <!-- 头部横幅（拖拽把手） -->
    <div ref="handle" class="gf-panel-header">
      <span class="gf-banner-icon">{{ system?.icon ?? '✦' }}</span>
      <div class="gf-banner-text">
        <span class="gf-panel-title">{{ system ? system.name : t`金手指系统` }}</span>
        <span v-if="system" class="gf-banner-sub">
          {{ t`Lv.${game.state.level}` }} <b v-if="game.levelTitle">{{ game.levelTitle }}</b>
          <span class="gf-banner-dot">·</span>💰 {{ game.state.points }} {{ game.state.currencyName }}
        </span>
        <span v-else class="gf-banner-sub">{{ t`本聊天尚未绑定系统` }}</span>
      </div>
      <span class="gf-flex"></span>
      <button v-if="system" class="gf-icon-btn" :title="t`关闭系统`" @click="deactivate">
        <i class="fa-solid fa-power-off"></i>
      </button>
      <button class="gf-icon-btn" :title="t`收起面板`" @click="close">
        <i class="fa-solid fa-xmark"></i>
      </button>
      <div v-if="game.generating || game.shopGenerating" class="gf-progress"></div>
    </div>

    <!-- 标签栏 -->
    <nav v-if="system" class="gf-tabs">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="gf-tab"
        :class="{ active: activeTab === tab.id }"
        :title="tab.label"
        @click="activeTab = tab.id"
      >
        <i :class="tab.icon"></i>
        <span class="gf-tab-label">{{ tab.label }}</span>
      </button>
    </nav>

    <!-- 内容区 -->
    <div class="gf-panel-body">
      <!-- 未绑定：系统选择 -->
      <div v-if="!system" class="gf-view">
        <div class="gf-empty">{{ t`选择一个系统绑定到本聊天：` }}</div>
        <div class="gf-system-grid">
          <button
            v-for="candidate in allSystems"
            :key="candidate.id"
            class="gf-system-card"
            :style="{ '--gf-accent': candidate.color }"
            @click="activate(candidate)"
          >
            <div class="gf-system-icon">{{ candidate.icon }}</div>
            <div class="gf-system-name">{{ candidate.name }}</div>
            <div class="gf-system-tagline">{{ candidate.tagline }}</div>
          </button>
        </div>
        <div v-if="settings.customSystems.length === 0" class="gf-hint">
          {{ t`没有心仪的？在扩展设置里可以创建自定义系统。` }}
        </div>
      </div>

      <!-- 六标签视图 -->
      <Transition v-else name="gf-view" mode="out-in">
        <HomeView v-if="activeTab === 'home'" @navigate="activeTab = $event" />
        <TasksView v-else-if="activeTab === 'tasks'" />
        <ShopView v-else-if="activeTab === 'shop'" />
        <InventoryView v-else-if="activeTab === 'inventory'" @navigate="activeTab = $event" />
        <LogView v-else-if="activeTab === 'log'" />
        <SettingsView v-else-if="activeTab === 'settings'" />
      </Transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useDraggable } from '@vueuse/core';
import { storeToRefs } from 'pinia';
import toastr from 'toastr';
import { computed, ref, watch } from 'vue';
import HomeView from '@/components/views/HomeView.vue';
import TasksView from '@/components/views/TasksView.vue';
import ShopView from '@/components/views/ShopView.vue';
import InventoryView from '@/components/views/InventoryView.vue';
import LogView from '@/components/views/LogView.vue';
import SettingsView from '@/components/views/SettingsView.vue';
import { pinia } from '@/pinia';
import { useGameStore } from '@/store/game';
import { useSettingsStore } from '@/store/settings';
import { BUILTIN_SYSTEMS } from '@/systems/builtin';
import type { SystemDef } from '@/type/game';

const game = useGameStore(pinia);
const { settings } = storeToRefs(useSettingsStore(pinia));

const visible = computed(() => settings.value.panelVisible);
const allSystems = computed<SystemDef[]>(() => [...BUILTIN_SYSTEMS, ...settings.value.customSystems]);
const system = computed(() => game.activeSystem);
const accent = computed(() => system.value?.color ?? '#8b5cf6');

type TabId = 'home' | 'tasks' | 'shop' | 'inventory' | 'log' | 'settings';
const activeTab = ref<TabId>('home');

const tabs = computed(() => [
  { id: 'home' as const, icon: 'fa-solid fa-house', label: t`首页` },
  { id: 'tasks' as const, icon: 'fa-solid fa-list-check', label: t`任务` },
  { id: 'shop' as const, icon: 'fa-solid fa-store', label: t`商店` },
  { id: 'inventory' as const, icon: 'fa-solid fa-box-open', label: t`背包` },
  { id: 'log' as const, icon: 'fa-solid fa-scroll', label: t`日志` },
  { id: 'settings' as const, icon: 'fa-solid fa-gear', label: t`设置` },
]);

// 换绑/解绑系统时回到首页，避免停在旧上下文的标签上
watch(
  () => game.state.activeSystemId,
  () => {
    activeTab.value = 'home';
  },
);

// 面板拖拽，位置持久化；面板用 v-show 保持挂载，拖拽监听不随显隐重建
const panel = ref<HTMLElement | null>(null);
const handle = ref<HTMLElement | null>(null);
const saved = settings.value.panelPos;
const { x, y } = useDraggable(panel, {
  handle,
  preventDefault: true,
  initialValue: {
    x: saved.x >= 0 ? Math.min(saved.x, window.innerWidth - 120) : window.innerWidth - 430,
    y: saved.y >= 0 ? Math.min(saved.y, window.innerHeight - 120) : 80,
  },
});
watch([x, y], ([newX, newY]) => {
  settings.value.panelPos = { x: newX, y: newY };
});

function close(): void {
  settings.value.panelVisible = false;
}

async function activate(candidate: SystemDef): Promise<void> {
  const context = window.SillyTavern?.getContext?.();
  // 解绑后重新激活（数据还在）或有历史数据时先确认，避免误清空
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
  const result = await context?.callGenericPopup?.(t`关闭系统？游玩数据会保留，重新绑定会重置。`, context.POPUP_TYPE.CONFIRM);
  if (result !== context?.POPUP_RESULT?.AFFIRMATIVE) {
    return;
  }
  game.deactivateSystem();
}
</script>
