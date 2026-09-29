<template>
  <div class="gf-view">
    <!-- 系统块：绑定显示当前卡（可展开更换），未绑定直接铺选择网格 -->
    <SystemSelectView />

    <template v-if="system">
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
        <button class="gf-link-btn" @click="emit('navigate', 'log')">
          {{ t`全部` }} <i class="fa-solid fa-angle-right"></i>
        </button>
      </div>
      <div v-if="game.state.log.length > 0" class="gf-recent-log">
        <div
          v-for="(entry, index) in game.state.log.slice(0, 5)"
          :key="entry.time + '-' + index"
          class="gf-log"
          :class="entry.kind"
        >
          <span class="gf-log-time">{{ formatTime(entry.time) }}</span>
          <span>{{ entry.text }}</span>
        </div>
      </div>
      <div v-else class="gf-empty-small">{{ t`还没有动静。` }}</div>
    </template>
  </div>
</template>

<script setup lang="ts">
import toastr from 'toastr';
import { computed } from 'vue';
import GfTaskCard from '@/components/shared/GfTaskCard.vue';
import SystemSelectView from '@/components/views/SystemSelectView.vue';
import { useGameStore } from '@/store/game';
import type { TaskStatus } from '@/type/game';

const emit = defineEmits<{
  navigate: [tab: 'log'];
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
  if (game.setTaskStatus(taskId, status) && status === 'failed') {
    toastr.info(t`任务已标记为失败。`, t`金手指系统`);
  }
}
</script>
