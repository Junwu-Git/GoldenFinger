<template>
  <div class="gf-view">
    <button
      class="gf-primary-btn"
      :disabled="game.generating || game.activeTasks.length >= (system?.maxActiveTasks ?? 0)"
      @click="issue"
    >
      <i :class="game.generating ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-bolt'"></i>
      {{ game.generating ? t`正在连接系统…` : t`发布新任务` }}
    </button>

    <div class="gf-view-title">{{ t`进行中（${game.activeTasks.length}）` }}</div>
    <template v-if="game.activeTasks.length > 0">
      <GfTaskCard v-for="task in game.activeTasks" :key="task.id" :task="task" @settle="settle" />
    </template>
    <div v-else class="gf-empty">
      <i class="fa-solid fa-inbox gf-empty-icon"></i>
      {{ t`系统还没有发布任务。` }}
    </div>

    <div class="gf-view-title">{{ t`已完结（${game.closedTasks.length}）` }}</div>
    <template v-if="game.closedTasks.length > 0">
      <GfTaskCard v-for="task in game.closedTasks" :key="task.id" :task="task" closed />
    </template>
    <div v-else class="gf-empty-small">{{ t`还没有完结的任务。` }}</div>
  </div>
</template>

<script setup lang="ts">
import toastr from 'toastr';
import { computed } from 'vue';
import GfTaskCard from '@/components/shared/GfTaskCard.vue';
import { useGameStore } from '@/store/game';
import type { TaskStatus } from '@/type/game';

const game = useGameStore();
const system = computed(() => game.activeSystem);

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
