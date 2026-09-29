<template>
  <div
    v-show="visible"
    ref="panel"
    class="gf-panel"
    :style="{ '--gf-accent': accent, transform: `translate(${x}px, ${y}px)` }"
  >
    <!-- 头部横幅（拖拽把手） -->
    <div class="gf-panel-header" @pointerdown="onDragStart">
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
      <button class="gf-icon-btn" :title="t`收起面板`" @click="close">
        <i class="fa-solid fa-xmark"></i>
      </button>
      <div v-if="game.generating || game.shopGenerating" class="gf-progress"></div>
    </div>

    <!-- 标签栏：五个页面常显，未绑定也可浏览 -->
    <nav class="gf-tabs">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="gf-tab"
        :class="{ active: activeTab === tab.id }"
        @click="activeTab = tab.id"
      >
        <i :class="tab.icon"></i>
        <span class="gf-tab-label">{{ tab.label }}</span>
      </button>
    </nav>

    <!-- 内容区 -->
    <div class="gf-panel-body">
      <Transition name="gf-view" mode="out-in">
        <HomeView v-if="activeTab === 'home'" @navigate="activeTab = $event" />
        <ShopView v-else-if="activeTab === 'shop'" @navigate="activeTab = $event" />
        <InventoryView v-else-if="activeTab === 'inventory'" />
        <LogView v-else-if="activeTab === 'log'" />
        <SettingsView v-else-if="activeTab === 'settings'" />
      </Transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { computed, ref } from 'vue';
import HomeView from '@/components/views/HomeView.vue';
import InventoryView from '@/components/views/InventoryView.vue';
import LogView from '@/components/views/LogView.vue';
import SettingsView from '@/components/views/SettingsView.vue';
import ShopView from '@/components/views/ShopView.vue';
import { pinia } from '@/pinia';
import { useGameStore } from '@/store/game';
import { useSettingsStore } from '@/store/settings';

const game = useGameStore(pinia);
const { settings } = storeToRefs(useSettingsStore(pinia));

const visible = computed(() => settings.value.panelVisible);
const system = computed(() => game.activeSystem);
const accent = computed(() => system.value?.color ?? '#8b5cf6');

type TabId = 'home' | 'shop' | 'inventory' | 'log' | 'settings';
const activeTab = ref<TabId>('home');

const tabs = computed(() => [
  { id: 'home' as const, icon: 'fa-solid fa-house', label: t`首页` },
  { id: 'shop' as const, icon: 'fa-solid fa-store', label: t`商店` },
  { id: 'inventory' as const, icon: 'fa-solid fa-box-open', label: t`背包` },
  { id: 'log' as const, icon: 'fa-solid fa-scroll', label: t`日志` },
  { id: 'settings' as const, icon: 'fa-solid fa-gear', label: t`设置` },
]);

// -- 拖拽：手写 pointer 实现（不依赖 useDraggable，行为完全可控） --
const panel = ref<HTMLElement | null>(null);
const saved = settings.value.panelPos;
const x = ref(saved.x >= 0 ? saved.x : window.innerWidth - 430);
const y = ref(saved.y >= 0 ? saved.y : 80);

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

function onDragStart(event: PointerEvent): void {
  // 按钮上的按下留给点击；把手其余区域负责拖动
  if ((event.target as HTMLElement).closest('button, a, input, textarea, select')) {
    return;
  }
  const el = panel.value;
  if (!el) {
    return;
  }
  event.preventDefault();
  // 面板可能带圆角阴影，用可视矩形计算抓取偏移
  const rect = el.getBoundingClientRect();
  const offsetX = event.clientX - rect.left;
  const offsetY = event.clientY - rect.top;

  const onMove = (move: PointerEvent) => {
    x.value = clamp(move.clientX - offsetX, 90 - el.offsetWidth, window.innerWidth - 90);
    y.value = clamp(move.clientY - offsetY, 0, window.innerHeight - 56);
  };
  const onUp = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    settings.value.panelPos = { x: x.value, y: y.value };
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

function close(): void {
  settings.value.panelVisible = false;
}
</script>
