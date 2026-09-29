<template>
  <div v-show="visible" ref="panel" class="gf-panel" :style="{ '--gf-accent': accent }">
    <!-- 头部横幅（拖拽把手）+ 工具区 -->
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
      <button v-if="system" class="gf-icon-btn" :title="t`商店`" @click="openPage('shop')">
        <i class="fa-solid fa-store"></i>
      </button>
      <button v-if="system" class="gf-icon-btn" :title="t`背包`" @click="openPage('inventory')">
        <i class="fa-solid fa-box-open"></i>
      </button>
      <button v-if="system" class="gf-icon-btn" :title="t`日志`" @click="openPage('log')">
        <i class="fa-solid fa-scroll"></i>
      </button>
      <button class="gf-icon-btn" :title="system ? t`更换/解绑系统` : t`选择系统`" @click="openPage('system')">
        <i class="fa-solid fa-microchip"></i>
      </button>
      <button class="gf-icon-btn" :title="t`设置`" @click="openPage('settings')">
        <i class="fa-solid fa-gear"></i>
      </button>
      <button class="gf-icon-btn" :title="t`收起面板`" @click="close">
        <i class="fa-solid fa-xmark"></i>
      </button>
      <div v-if="game.generating || game.shopGenerating" class="gf-progress"></div>
    </div>

    <!-- 内容区 -->
    <div class="gf-panel-body">
      <!-- 未绑定：引导到选系统界面 -->
      <div v-if="!system" class="gf-empty">
        <i class="fa-solid fa-microchip gf-empty-icon"></i>
        {{ t`本聊天尚未绑定金手指，绑定后系统会发布任务、开设商店。` }}
        <button class="gf-primary-btn gf-cta" @click="openPage('system')">
          <i class="fa-solid fa-microchip"></i> {{ t`选择系统` }}
        </button>
      </div>

      <!-- 主界面：状态 + 任务直铺 -->
      <div v-else class="gf-view">
        <div class="gf-stat-grid">
          <div class="gf-stat">
            <span class="gf-stat-value">Lv.{{ game.state.level }}</span>
            <span class="gf-stat-label">{{ game.levelTitle || t`等级` }}</span>
          </div>
          <div class="gf-stat">
            <span class="gf-stat-value">{{ game.state.points }}</span>
            <span class="gf-stat-label">{{ game.state.currencyName }}</span>
          </div>
          <div class="gf-stat">
            <span class="gf-stat-value">{{ game.state.inventory.length }}</span>
            <span class="gf-stat-label">{{ t`物品` }}</span>
          </div>
          <div class="gf-stat">
            <span class="gf-stat-value">{{ completedCount }}</span>
            <span class="gf-stat-label">{{ t`已完成` }}</span>
          </div>
        </div>

        <div class="gf-expblock">
          <div class="gf-expbar"><div class="gf-expbar-fill" :style="{ width: expPercent + '%' }"></div></div>
          <div class="gf-exp-text">EXP {{ game.state.exp }} / {{ game.expNext }}</div>
        </div>

        <div class="gf-view-title">{{ t`进行中的任务（${game.activeTasks.length}/${system.maxActiveTasks}）` }}</div>
        <template v-if="game.activeTasks.length > 0">
          <GfTaskCard v-for="task in game.activeTasks" :key="task.id" :task="task" @settle="settle" />
        </template>
        <div v-else class="gf-empty-small">{{ t`暂无任务，点下方按钮让系统发布一个。` }}</div>

        <button
          class="gf-primary-btn"
          :disabled="game.generating || game.activeTasks.length >= system.maxActiveTasks"
          @click="issue"
        >
          <i :class="game.generating ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-bolt'"></i>
          {{ game.generating ? t`正在连接系统…` : t`发布新任务` }}
        </button>

        <details v-if="game.closedTasks.length > 0" class="gf-details">
          <summary>{{ t`已完结（${game.closedTasks.length}）` }}</summary>
          <GfTaskCard v-for="task in game.closedTasks" :key="task.id" :task="task" closed />
        </details>

        <div class="gf-view-title">
          <span>{{ t`系统动态` }}</span>
          <button class="gf-link-btn" @click="openPage('log')">{{ t`全部` }} <i class="fa-solid fa-angle-right"></i></button>
        </div>
        <div v-if="game.state.log.length > 0" class="gf-recent-log">
          <div v-for="(entry, index) in game.state.log.slice(0, 5)" :key="entry.time + '-' + index" class="gf-log" :class="entry.kind">
            <span class="gf-log-time">{{ formatTime(entry.time) }}</span>
            <span>{{ entry.text }}</span>
          </div>
        </div>
        <div v-else class="gf-empty-small">{{ t`还没有动静。` }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useDraggable } from '@vueuse/core';
import { storeToRefs } from 'pinia';
import toastr from 'toastr';
import { computed, ref, watch } from 'vue';
import GfTaskCard from '@/components/shared/GfTaskCard.vue';
import { openPage } from '@/core/window-state';
import { pinia } from '@/pinia';
import { useGameStore } from '@/store/game';
import { useSettingsStore } from '@/store/settings';
import type { TaskStatus } from '@/type/game';

const game = useGameStore(pinia);
const { settings } = storeToRefs(useSettingsStore(pinia));

const visible = computed(() => settings.value.panelVisible);
const system = computed(() => game.activeSystem);
const accent = computed(() => system.value?.color ?? '#8b5cf6');
const completedCount = computed(() => game.closedTasks.filter(task => task.status === 'completed').length);
const expPercent = computed(() => Math.min(100, Math.round((game.state.exp / Math.max(1, game.expNext)) * 100)));

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

function formatTime(time: number): string {
  const date = new Date(time);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

async function issue(): Promise<void> {
  try {
    const task = await game.issueTask();
    toastr.success(t`新任务已发布：${task.title}`, t`金手指系统`);
  } catch (error) {
    console.error('[GoldenFinger] 发布任务失败', error);
    toastr.error(error instanceof Error ? error.message : String(error), t`金手指系统`);
  }
}

function settle(taskId: string, status: TaskStatus): void {
  if (game.setTaskStatus(taskId, status) && status === 'failed') {
    toastr.info(t`任务已标记为失败。`, t`金手指系统`);
  }
}
</script>

<style scoped>
.gf-cta {
  width: auto;
  padding: 9px 26px;
}
</style>
