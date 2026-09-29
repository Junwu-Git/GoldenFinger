<template>
  <div class="gf-task" :class="{ closed }">
    <div class="gf-task-head">
      <span class="gf-task-id">#{{ task.id }}</span>
      <span class="gf-task-title">{{ task.title }}</span>
      <span class="gf-task-stars" :title="t`难度`">{{ '★'.repeat(task.difficulty) }}</span>
      <span v-if="closed" class="gf-task-badge" :class="task.status">
        {{ task.status === 'completed' ? t`完成` : t`失败` }}
      </span>
    </div>
    <div class="gf-task-desc">{{ task.description }}</div>
    <div class="gf-task-line"><span class="gf-task-tag">{{ t`要求` }}</span>{{ task.requirements }}</div>
    <div class="gf-task-line"><span class="gf-task-tag">{{ t`奖励` }}</span>{{ rewardText(task) }}</div>
    <div v-if="!closed" class="gf-task-actions">
      <button class="gf-mini-btn ok" @click="$emit('settle', task.id, 'completed')">
        <i class="fa-solid fa-check"></i> {{ t`完成` }}
      </button>
      <button class="gf-mini-btn bad" @click="$emit('settle', task.id, 'failed')">
        <i class="fa-solid fa-xmark"></i> {{ t`失败` }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { rewardText } from '@/core/injector';
import type { Task } from '@/type/game';

defineProps<{
  task: Task;
  /** 已完结态：隐藏描述与操作，只留标题行 */
  closed?: boolean;
}>();

defineEmits<{
  settle: [taskId: string, status: 'completed' | 'failed'];
}>();
</script>
