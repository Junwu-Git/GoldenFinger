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
    <div class="gf-task-line">
      <span class="gf-task-tag">{{ t`要求` }}</span
      >{{ task.requirements }}
    </div>
    <div class="gf-task-line">
      <span class="gf-task-tag">{{ t`奖励` }}</span
      >{{ rewardText(task) }}
    </div>
    <div v-if="!closed" class="gf-task-actions">
      <!-- 只允许放弃：完成判定唯一来自剧情 AI 的 [任务完成:Txxx] 标记，玩家不能自我结算 -->
      <button class="gf-mini-btn bad" :title="t`放弃后奖励作废`" @click="$emit('abandon', task.id)">
        <i class="fa-solid fa-flag"></i> {{ t`放弃` }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { rewardText } from '@/core/prompt-vars';
import type { Task } from '@/type/game';

defineProps<{
  task: Task;
  /** 已完结态：隐藏描述与操作，只留标题行 */
  closed?: boolean;
}>();

defineEmits<{
  abandon: [taskId: string];
}>();
</script>
