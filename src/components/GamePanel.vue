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
          <span class="gf-banner-dot">·</span>
          <i class="fa-solid fa-coins gf-banner-coin"></i> {{ game.state.points }} {{ game.state.currencyName }}
        </span>
        <span v-else class="gf-banner-sub">{{ t`本聊天尚未绑定系统` }}</span>
      </div>
      <span class="gf-flex"></span>
      <button class="gf-icon-btn" :title="t`收起面板`" @click="closePanel">
        <i class="fa-solid fa-xmark"></i>
      </button>
      <div v-if="game.generating || game.shopGenerating" class="gf-progress"></div>
    </div>

    <!-- 一级标签栏：页面常显，未绑定也可浏览 -->
    <nav class="gf-tabs">
      <button
        v-for="page in PAGES"
        :key="page.id"
        class="gf-tab"
        :class="{ active: activePage === page.id }"
        @click="activePage = page.id"
      >
        <i :class="page.icon"></i>
        <span class="gf-tab-label">{{ page.label }}</span>
      </button>
    </nav>

    <!-- 配置页二级子区条（choice 式）：提示词/世界书/正则是全局通用配置，不随系统切换 -->
    <nav v-if="activePage === 'config'" class="gf-subtabs">
      <button
        v-for="sub in CONFIG_SUB_TABS"
        :key="sub.id"
        class="gf-subtab"
        :class="{ active: configSubTab === sub.id }"
        @click="configSubTab = sub.id"
      >
        <i :class="sub.icon"></i>
        {{ sub.label }}
      </button>
    </nav>

    <!-- 内容区 -->
    <div class="gf-panel-body">
      <Transition name="gf-view" mode="out-in">
        <HomeView v-if="activePage === 'home'" @navigate="activePage = $event" />
        <StatesView v-else-if="activePage === 'states'" />
        <ShopView v-else-if="activePage === 'shop'" @navigate="activePage = $event" />
        <InventoryView v-else-if="activePage === 'inventory'" />
        <LogView v-else-if="activePage === 'log'" />
        <PromptView v-else-if="activePage === 'config' && configSubTab === 'prompt'" />
        <WorldInfoView v-else-if="activePage === 'config' && configSubTab === 'worldinfo'" />
        <RegexView v-else-if="activePage === 'config'" />
        <SettingsView v-else />
      </Transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import HomeView from '@/components/views/HomeView.vue';
import InventoryView from '@/components/views/InventoryView.vue';
import LogView from '@/components/views/LogView.vue';
import PromptView from '@/components/views/PromptView.vue';
import RegexView from '@/components/views/RegexView.vue';
import SettingsView from '@/components/views/SettingsView.vue';
import ShopView from '@/components/views/ShopView.vue';
import StatesView from '@/components/views/StatesView.vue';
import WorldInfoView from '@/components/views/WorldInfoView.vue';
import { CONFIG_SUB_TABS, PAGES, type ConfigTabId } from '@/components/shared/tab-definitions';
import { closePanel, panelPage, panelVisible } from '@/core/ui-state';
import { pinia } from '@/pinia';
import { useGameStore } from '@/store/game';
import { useSettingsStore } from '@/store/settings';

const game = useGameStore(pinia);
const { settings } = storeToRefs(useSettingsStore(pinia));

const visible = panelVisible;
const system = computed(() => game.activeSystem);
const accent = computed(() => system.value?.color ?? '#8b5cf6');

// 页码在 ui-state（运行时状态单一来源）：聊天内状态条等入口要能直达指定页
const activePage = panelPage;
const configSubTab = ref<ConfigTabId>('prompt');

// -- 拖拽：手写 pointer 实现（不依赖 useDraggable，行为完全可控） --
const panel = ref<HTMLElement | null>(null);
const saved = settings.value.panelPos;
// {-1,-1} 是未初始化哨兵：拖拽钳位允许负 x（面板可探出屏幕左缘），不能拿 x<0 判未初始化（同 bubblePos）
const isUnset = saved.x === -1 && saved.y === -1;
const x = ref(isUnset ? window.innerWidth - 430 : saved.x);
const y = ref(isUnset ? 80 : saved.y);

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

// -- 点外关闭：面板开启时 pointerdown 落在面板之外即收起。悬浮球与各「开关面板」入口
//    自带开合语义（排除后交给它们的 click 处理，否则 pointerdown 先关、click 又开，
//    等于关不掉）；聊天内状态条是导航入口（点击换页/开面板），开着面板点它不该收起；
//    魔棒按钮与它的下拉（#extensionsMenuButton/#extensionsMenu）是本扩展
//    自己的入口，翻开菜单的过程不该顺带收面板；ST 弹窗（换系统确认等）的交互也不应收
//    面板。300ms 宽限防打开面板的同一次手势残留事件立刻又把它关掉 --
const openedAt = ref(0);
watch(visible, value => {
  if (value) {
    openedAt.value = Date.now();
  }
});

// 首次展开后按真实宽度钳一次位置：存档可能来自更宽的窗口、或带着拖出来的负 x；
// v-show 收起时 offsetWidth 为 0，必须等展开渲染完（post flush）再量
watch(
  visible,
  () => {
    const el = panel.value;
    if (el && el.offsetWidth > 0) {
      x.value = clamp(x.value, 90 - el.offsetWidth, window.innerWidth - 90);
      y.value = clamp(y.value, 0, window.innerHeight - 56);
    }
  },
  { flush: 'post', once: true },
);

let cleanupDoc: (() => void) | null = null;

onMounted(() => {
  const onDocPointerDown = (event: PointerEvent) => {
    if (!visible.value || Date.now() - openedAt.value < 300) {
      return;
    }
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    if (panel.value?.contains(target)) {
      return;
    }
    if (
      target.closest(
        '.gf-bubble, .gf-state-hud, [data-gf-panel-toggle], #extensionsMenuButton, #extensionsMenu, dialog.popup',
      )
    ) {
      return;
    }
    closePanel();
  };
  document.addEventListener('pointerdown', onDocPointerDown);
  cleanupDoc = () => document.removeEventListener('pointerdown', onDocPointerDown);
});

onUnmounted(() => {
  cleanupDoc?.();
});
</script>
