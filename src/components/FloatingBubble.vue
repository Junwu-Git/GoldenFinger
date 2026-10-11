<template>
  <!-- 按压/拖动期的全屏命中屏蔽层：气泡用 transform 跟手，Vue 异步刷新使位移滞后
       pointermove 一帧，Chromium 的 hover 重算会用更新前的几何命中下层酒馆元素
       （主界面 .menu_button 的 :hover 白底带过渡，表现为拖动时酒馆按键闪白）。
       屏蔽层与气泡同 z 且 DOM 在前（同层后者在上），气泡仍可命中 -->
  <div v-if="isPressed || isDragging" class="gf-bubble-shield" aria-hidden="true"></div>
  <div
    ref="bubbleEl"
    class="gf-bubble"
    :class="{
      idle: state === 'idle',
      generating: state === 'generating',
      disabled: state === 'disabled',
      dragging: isDragging,
      pressed: isPressed,
      'snap-left': isSnappedLeft,
      'snap-right': isSnappedRight,
    }"
    :style="{
      '--gf-accent': accent,
      '--gf-x': `${x}px`,
      '--gf-y': `${y}px`,
      width: `${SIZE}px`,
      height: `${SIZE}px`,
      '--gf-bubble-icon-size': `${SIZE / 3}px`,
      transition: isDragging
        ? 'none'
        : isPressed
          ? 'transform 0.12s ease-out'
          : 'transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
    }"
    :title="title"
    @pointerdown="onPointerDown"
  >
    <div class="gf-bubble-ring"></div>
    <i
      :class="
        state === 'generating' ? 'fa-solid fa-spinner fa-spin gf-bubble-icon' : 'fa-solid fa-dice-d20 gf-bubble-icon'
      "
    ></i>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { togglePanel } from '@/core/ui-state';
import { pinia } from '@/pinia';
import { useGameStore } from '@/store/game';
import { useSettingsStore } from '@/store/settings';

const SIZE = 48;
// 松手时指针净位移小于它视为点击（开合面板），大于它视为拖拽（贴边吸附）
const TAP_SLOP = 8;
// 球心距屏幕左右缘小于该值即贴边：球体缩进屏外 1/3 直径（露 2/3）
const SNAP_THRESHOLD = 100;
const SNAP_OFFSET = Math.round(SIZE / 3);

const game = useGameStore(pinia);
const { settings } = storeToRefs(useSettingsStore(pinia));

// 悬浮球是系统入口而非某系统专属：未绑定时回落默认紫
const accent = computed(() => game.activeSystem?.color ?? '#8b5cf6');
const isGenerating = computed(() => game.generating || game.shopGenerating);

const title = computed(() => (settings.value.enabled ? t`打开/关闭系统面板` : t`已停用，在面板「设置」页可重新开启`));

const state = computed(() => {
  if (isGenerating.value) return 'generating';
  if (!settings.value.enabled) return 'disabled';
  return 'idle';
});

// -- 位置：settings.bubblePos 单一来源；{-1,-1} 是未初始化哨兵（贴边 x 可为负，不能拿 x<0 判断） --
const saved = settings.value.bubblePos;
const x = ref(saved.x === -1 && saved.y === -1 ? window.innerWidth - SIZE - 16 : saved.x);
const y = ref(saved.x === -1 && saved.y === -1 ? window.innerHeight - SIZE - 80 : saved.y);

const isSnappedLeft = ref(false);
const isSnappedRight = ref(false);
const isPressed = ref(false);
const isDragging = ref(false);

// 贴边态推断：x 缩进屏内一侧即为贴边（-SNAP_OFFSET 或更靠外为左贴，触/越右缘为右贴）
function inferSnap(): void {
  const centerX = x.value + SIZE / 2;
  isSnappedLeft.value = centerX < window.innerWidth / 2 && x.value <= 0;
  isSnappedRight.value = centerX >= window.innerWidth / 2 && x.value >= window.innerWidth - SIZE;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/** 贴边吸附纯计算：球心近左/右缘则贴边露出 2/3，否则钳在视口内；y 恒钳制 */
function snapPosition(px: number, py: number): { x: number; y: number; left: boolean; right: boolean } {
  const centerX = px + SIZE / 2;
  const clampedY = clamp(py, 0, window.innerHeight - SIZE);
  if (centerX < SNAP_THRESHOLD) {
    return { x: -SNAP_OFFSET, y: clampedY, left: true, right: false };
  }
  if (window.innerWidth - centerX < SNAP_THRESHOLD) {
    return { x: window.innerWidth - SIZE + SNAP_OFFSET, y: clampedY, left: false, right: true };
  }
  return { x: clamp(px, 0, window.innerWidth - SIZE), y: clampedY, left: false, right: false };
}

// -- 按住期间 body 行内样式禁选（触屏长按会选中附近聊天文本）：必须与清理成对出现，
//    漏清理会导致全站文本无法选中，属于不可见的高危回归（up/cancel/unmount 三处兜底） --
const applySuppressSelect = () => {
  document.body.style.setProperty('user-select', 'none', 'important');
  document.body.style.setProperty('-webkit-user-select', 'none', 'important');
};
const clearSuppressSelect = () => {
  document.body.style.removeProperty('user-select');
  document.body.style.removeProperty('-webkit-user-select');
};

const bubbleEl = ref<HTMLElement | null>(null);
let downPos = { x: 0, y: 0 };
let grabOffset = { x: 0, y: 0 };
let active = false;

function onWindowMove(event: PointerEvent): void {
  if (!active) return;
  // 净位移超过 TAP_SLOP 才转入拖拽：撤掉按压缩放，让球以完整尺寸跟手
  if (Math.hypot(event.clientX - downPos.x, event.clientY - downPos.y) > TAP_SLOP) {
    isDragging.value = true;
  }
  if (isDragging.value) {
    x.value = event.clientX - grabOffset.x;
    y.value = event.clientY - grabOffset.y;
  }
}

function settle(event: PointerEvent): void {
  window.removeEventListener('pointermove', onWindowMove);
  window.removeEventListener('pointerup', onWindowUp);
  window.removeEventListener('pointercancel', onWindowCancel);
  const moved = Math.hypot(event.clientX - downPos.x, event.clientY - downPos.y);
  isPressed.value = false;
  clearSuppressSelect();
  if (isDragging.value) {
    // 拖完弹回吸附位：贴边露 2/3，自由位钳制；位置落盘进设置
    const snapped = snapPosition(x.value, y.value);
    x.value = snapped.x;
    y.value = snapped.y;
    isSnappedLeft.value = snapped.left;
    isSnappedRight.value = snapped.right;
  }
  isDragging.value = false;
  active = false;
  if (moved < TAP_SLOP) {
    togglePanel();
  } else {
    settings.value.bubblePos = { x: x.value, y: y.value };
  }
}

function onWindowUp(event: PointerEvent): void {
  if (!active) return;
  settle(event);
}

// pointercancel 是手势被系统打断（罕见，touch-action:none 已挡住滚动接管）：只清理，
// 不当点击、不吸附不落盘——球停在当前位置，下次手势从那里继续
function onWindowCancel(): void {
  if (!active) return;
  window.removeEventListener('pointermove', onWindowMove);
  window.removeEventListener('pointerup', onWindowUp);
  window.removeEventListener('pointercancel', onWindowCancel);
  isPressed.value = false;
  isDragging.value = false;
  active = false;
  clearSuppressSelect();
}

function onPointerDown(event: PointerEvent): void {
  if (event.button !== 0 || active) return;
  const el = bubbleEl.value;
  if (!el) return;
  // 抓取偏移取可视矩形（含当前 translate）；必须在置 pressed 之前算——按压缩放会缩矩形，
  // 锚点带进 scale 偏差会让点击抖动放大成位置突跳
  const rect = el.getBoundingClientRect();
  grabOffset = { x: event.clientX - rect.left, y: event.clientY - rect.top };
  downPos = { x: event.clientX, y: event.clientY };
  active = true;
  isPressed.value = true;
  // 非鼠标指针抑制长按文本选择/系统菜单；touch-action:none 已阻断滚动接管
  if (event.pointerType !== 'mouse') {
    event.preventDefault();
  }
  applySuppressSelect();
  window.addEventListener('pointermove', onWindowMove);
  window.addEventListener('pointerup', onWindowUp);
  window.addEventListener('pointercancel', onWindowCancel);
}

// 窗口尺寸变化：贴边态重新吸附到新视口边缘，自由位只钳制（不趁机抢吸附）；
// 挂载时也钳一次——存档可能来自更宽的窗口，球会整个悬在屏外
function reclamp(): void {
  if (isSnappedLeft.value) {
    x.value = -SNAP_OFFSET;
  } else if (isSnappedRight.value) {
    x.value = window.innerWidth - SIZE + SNAP_OFFSET;
  } else {
    x.value = clamp(x.value, 0, window.innerWidth - SIZE);
  }
  y.value = clamp(y.value, 0, window.innerHeight - SIZE);
}

onMounted(() => {
  inferSnap();
  reclamp();
  window.addEventListener('resize', reclamp);
});

onUnmounted(() => {
  window.removeEventListener('resize', reclamp);
  clearSuppressSelect();
});
</script>

<style scoped>
.gf-bubble {
  position: fixed;
  left: 0;
  top: 0;
  /* 面板（--gf-z-panel）之下：面板开启时主界面让位，气泡仍可在其余区域点按开合 */
  z-index: calc(var(--gf-z-panel) - 1);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  background: linear-gradient(165deg, color-mix(in srgb, var(--gf-accent) 16%, #17131f), #131019 72%);
  border: 1px solid color-mix(in srgb, var(--gf-accent) 40%, transparent);
  color: var(--gf-accent);
  /* 图标随直径等比（1/3） */
  font-size: var(--gf-bubble-icon-size, 16px);
  cursor: pointer;
  box-shadow:
    0 4px 14px rgba(0, 0, 0, 0.5),
    0 0 16px color-mix(in srgb, var(--gf-accent) 20%, transparent);
  touch-action: none;
  /* -webkit- 前缀版老内核要认；touch-callout 抑制 iOS 长按系统菜单 */
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
  transform: translate3d(var(--gf-x), var(--gf-y), 0);
  overflow: hidden;
}

.gf-bubble.idle {
  opacity: 0.8;
  animation: gf-bubble-breathe 8s ease-in-out infinite;
}

.gf-bubble.generating {
  animation: gf-bubble-pulse 3s ease-in-out infinite;
}

.gf-bubble.disabled {
  opacity: 0.45;
  filter: grayscale(40%);
}

.gf-bubble.dragging {
  will-change: transform;
  cursor: grabbing;
}

.gf-bubble.pressed {
  transform: translate3d(var(--gf-x), var(--gf-y), 0) scale(0.94);
}

/* 锥形渐变内环（radial mask 镂空成弧环）：待机慢转、生成快转、停用静止 */
.gf-bubble-ring {
  position: absolute;
  inset: 3px;
  border-radius: 50%;
  background: conic-gradient(from 0deg, var(--gf-accent), transparent 60%, var(--gf-accent));
  opacity: 0.3;
  pointer-events: none;
  -webkit-mask: radial-gradient(farthest-side, #0000 calc(100% - 4px), #000 calc(100% - 3px));
  mask: radial-gradient(farthest-side, #0000 calc(100% - 4px), #000 calc(100% - 3px));
}

.gf-bubble.idle .gf-bubble-ring {
  animation: gf-bubble-ring-spin 20s linear infinite;
}

.gf-bubble.generating .gf-bubble-ring {
  animation: gf-bubble-ring-spin 1.5s linear infinite;
  opacity: 0.5;
}

.gf-bubble.disabled .gf-bubble-ring {
  animation: none;
  opacity: 0.15;
}

.gf-bubble-icon {
  position: relative;
  z-index: 1;
  transition: transform 0.3s ease;
}

/* 贴边态图标向屏幕内侧让位（0.5 倍图标高），球体藏在屏外的部分不挡住图标 */
.gf-bubble.snap-left .gf-bubble-icon {
  transform: translateX(calc(var(--gf-bubble-icon-size, 16px) * 0.5));
}

.gf-bubble.snap-right .gf-bubble-icon {
  transform: translateX(calc(var(--gf-bubble-icon-size, 16px) * -0.5));
}

/* 悬停增强仅对真 hover 指针启用：触屏 :hover 点按后粘滞不回弹 */
@media (hover: hover) and (pointer: fine) {
  .gf-bubble:hover {
    opacity: 1;
    box-shadow:
      0 4px 14px rgba(0, 0, 0, 0.5),
      0 0 24px color-mix(in srgb, var(--gf-accent) 38%, transparent);
  }

  .gf-bubble.snap-left:hover .gf-bubble-icon {
    transform: translateX(calc(var(--gf-bubble-icon-size, 16px) * 0.7));
  }

  .gf-bubble.snap-right:hover .gf-bubble-icon {
    transform: translateX(calc(var(--gf-bubble-icon-size, 16px) * -0.7));
  }

  /* 悬停放大排除按压态：特异性压过 pressed 会让按住收缩永不生效 */
  .gf-bubble:not(.snap-left):not(.snap-right):not(.pressed):hover {
    transform: translate3d(var(--gf-x), var(--gf-y), 0) scale(1.08);
  }
}

/* 触屏的悬停等价物是「按住」：按住贴边球时图标探出，松手随 pressed 清理回落 */
.gf-bubble.pressed.snap-left .gf-bubble-icon {
  transform: translateX(calc(var(--gf-bubble-icon-size, 16px) * 0.7));
}

.gf-bubble.pressed.snap-right .gf-bubble-icon {
  transform: translateX(calc(var(--gf-bubble-icon-size, 16px) * -0.7));
}

.gf-bubble-shield {
  position: fixed;
  inset: 0;
  z-index: calc(var(--gf-z-panel) - 1);
  background: transparent;
}

@keyframes gf-bubble-breathe {
  0%,
  100% {
    box-shadow:
      0 4px 14px rgba(0, 0, 0, 0.5),
      0 0 12px color-mix(in srgb, var(--gf-accent) 18%, transparent);
  }
  50% {
    box-shadow:
      0 4px 14px rgba(0, 0, 0, 0.5),
      0 0 22px color-mix(in srgb, var(--gf-accent) 30%, transparent);
  }
}

@keyframes gf-bubble-pulse {
  0%,
  100% {
    box-shadow:
      0 4px 14px rgba(0, 0, 0, 0.5),
      0 0 16px color-mix(in srgb, var(--gf-accent) 22%, transparent);
  }
  50% {
    box-shadow:
      0 4px 14px rgba(0, 0, 0, 0.5),
      0 0 30px color-mix(in srgb, var(--gf-accent) 45%, transparent);
  }
}

@keyframes gf-bubble-ring-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
