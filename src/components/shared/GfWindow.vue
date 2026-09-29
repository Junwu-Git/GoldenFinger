<template>
  <Teleport to="body">
    <div v-if="isWindowOpen" class="gf-window-overlay" @click.self="closeWindow">
      <div ref="dialog" class="gf-window" :style="{ '--gf-accent': accent }">
        <!-- 标题栏（拖拽把手） -->
        <div ref="handle" class="gf-window-titlebar">
          <i :class="currentPage.icon" class="gf-window-title-icon"></i>
          <span class="gf-window-title">{{ currentPage.label }}</span>
          <span class="gf-flex"></span>
          <button class="gf-icon-btn" :title="t`关闭`" @click="closeWindow">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <!-- 页面导航 -->
        <nav class="gf-window-nav">
          <button
            v-for="page in pages"
            :key="page.id"
            class="gf-window-tab"
            :class="{ active: activePage === page.id }"
            @click="activePage = page.id"
          >
            <i :class="page.icon"></i>
            <span>{{ page.label }}</span>
          </button>
        </nav>

        <!-- 页面内容 -->
        <div class="gf-window-body">
          <Transition name="gf-view" mode="out-in">
            <SystemSelectView v-if="forcedSystemPage || activePage === 'system'" />
            <ShopView v-else-if="activePage === 'shop'" />
            <InventoryView v-else-if="activePage === 'inventory'" />
            <LogView v-else-if="activePage === 'log'" />
            <SettingsView v-else-if="activePage === 'settings'" />
          </Transition>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { useDraggable } from '@vueuse/core';
import { computed, ref } from 'vue';
import { activePage, closeWindow, isWindowOpen } from '@/core/window-state';
import { pinia } from '@/pinia';
import { useGameStore } from '@/store/game';
import InventoryView from '@/components/views/InventoryView.vue';
import LogView from '@/components/views/LogView.vue';
import SettingsView from '@/components/views/SettingsView.vue';
import ShopView from '@/components/views/ShopView.vue';
import SystemSelectView from '@/components/views/SystemSelectView.vue';

const game = useGameStore(pinia);

const pages = computed(() => [
  { id: 'system' as const, icon: 'fa-solid fa-microchip', label: t`系统` },
  { id: 'shop' as const, icon: 'fa-solid fa-store', label: t`商店` },
  { id: 'inventory' as const, icon: 'fa-solid fa-box-open', label: t`背包` },
  { id: 'log' as const, icon: 'fa-solid fa-scroll', label: t`日志` },
  { id: 'settings' as const, icon: 'fa-solid fa-gear', label: t`设置` },
]);

const currentPage = computed(() => pages.value.find(page => page.id === activePage.value) ?? pages.value[0]);
const accent = computed(() => game.activeSystem?.color ?? '#8b5cf6');

// 未绑定系统时强制停在「系统」页：其他页面的内容都依赖已绑定
const forcedSystemPage = computed(() => !game.activeSystem);

// 弹窗拖拽（标题栏把手），初始居中；位置不持久化（会话级）
const dialog = ref<HTMLElement | null>(null);
const handle = ref<HTMLElement | null>(null);
useDraggable(dialog, {
  handle,
  preventDefault: true,
  initialValue: {
    x: Math.max(12, (window.innerWidth - 660) / 2),
    y: Math.max(24, (window.innerHeight - 680) / 2.4),
  },
});
</script>
