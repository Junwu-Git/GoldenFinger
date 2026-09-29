<template>
  <div class="gf-view">
    <!-- 状态总览 -->
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

    <!-- 进行中任务 -->
    <div class="gf-view-title">
      <span>{{ t`进行中的任务（${game.activeTasks.length}/${system?.maxActiveTasks ?? 0}）` }}</span>
      <button class="gf-link-btn" @click="emit('navigate', 'tasks')">{{ t`全部` }} <i class="fa-solid fa-angle-right"></i></button>
    </div>
    <template v-if="game.activeTasks.length > 0">
      <GfTaskCard v-for="task in game.activeTasks.slice(0, 2)" :key="task.id" :task="task" @settle="settle" />
    </template>
    <div v-else class="gf-empty-small">{{ t`暂无任务，点下方按钮让系统发布一个。` }}</div>

    <!-- 快捷操作 -->
    <div class="gf-home-actions">
      <button class="gf-primary-btn" :disabled="game.generating || game.activeTasks.length >= (system?.maxActiveTasks ?? 0)" @click="issue">
        <i :class="game.generating ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-bolt'"></i>
        {{ game.generating ? t`正在连接系统…` : t`发布新任务` }}
      </button>
      <button class="gf-secondary-btn" @click="emit('navigate', 'shop')">
        <i class="fa-solid fa-store"></i> {{ system?.shopName }}
      </button>
    </div>

    <!-- 系统动态 -->
    <div class="gf-view-title">
      <span>{{ t`系统动态` }}</span>
      <button class="gf-link-btn" @click="emit('navigate', 'log')">{{ t`全部` }} <i class="fa-solid fa-angle-right"></i></button>
    </div>
    <div v-if="game.state.log.length > 0" class="gf-recent-log">
      <div v-for="(entry, index) in game.state.log.slice(0, 5)" :key="entry.time + '-' + index" class="gf-log" :class="entry.kind">
        <span class="gf-log-time">{{ formatTime(entry.time) }}</span>
        <span>{{ entry.text }}</span>
      </div>
    </div>
    <div v-else class="gf-empty-small">{{ t`还没有动静。` }}</div>
  </div>
</template>

<script setup lang="ts">
import toastr from 'toastr';
import { computed } from 'vue';
import GfTaskCard from '@/components/shared/GfTaskCard.vue';
import { useGameStore } from '@/store/game';
import type { TaskStatus } from '@/type/game';

const emit = defineEmits<{
  navigate: [tab: 'tasks' | 'shop' | 'log'];
}>();

const game = useGameStore();
const system = computed(() => game.activeSystem);
const completedCount = computed(() => game.closedTasks.filter(task => task.status === 'completed').length);
const expPercent = computed(() => Math.min(100, Math.round((game.state.exp / Math.max(1, game.expNext)) * 100)));

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
  game.setTaskStatus(taskId, status);
}
</script>
