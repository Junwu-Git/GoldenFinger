<template>
  <div class="gf-task" :class="{ closed }">
    <div class="gf-task-head">
      <span class="gf-task-id">#{{ task.id }}</span>
      <span class="gf-task-title">{{ task.title }}</span>
      <span class="gf-task-stars" :title="t`难度`">{{ '★'.repeat(task.difficulty) }}</span>
      <span v-if="closed" class="gf-task-badge" :class="task.status">
        {{ task.status === 'completed' ? t`完成` : task.status === 'voided' ? t`作废` : t`失败` }}
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
    <div v-if="!closed && task.deadline" class="gf-task-line">
      <span class="gf-task-tag">{{ t`时限` }}</span
      ><span :class="{ 'gf-deadline-urgent': remaining <= 0 }">{{ remainingText }}</span>
    </div>
    <div v-if="!closed" class="gf-task-actions">
      <!-- 只允许放弃：完成/失败判定唯一来自剧情 AI 的标记或独立判定，玩家不能自我结算，放弃只是中性作废 -->
      <button class="gf-mini-btn bad" :title="t`放弃后任务作废，不计失败`" @click="$emit('abandon', task.id)">
        <i class="fa-solid fa-flag"></i> {{ t`放弃` }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue';
import { rewardText } from '@/core/prompt-vars';
import type { Task } from '@/type/game';

const props = defineProps<{
  task: Task;
  /** 已完结态：隐藏描述与操作，只留标题行 */
  closed?: boolean;
}>();

defineEmits<{
  abandon: [taskId: string];
}>();

// 时限倒计时：30s 一跳刷新「剩余时间」文案
const now = ref(Date.now());
const timer = setInterval(() => {
  now.value = Date.now();
}, 30_000);
onUnmounted(() => clearInterval(timer));

const remaining = computed(() => (props.task.deadline ?? Infinity) - now.value);
const remainingText = computed(() => {
  if (remaining.value <= 0) {
    return t`已逾期`;
  }
  const min = Math.ceil(remaining.value / 60_000);
  if (min < 60) {
    return t`剩余 ${min} 分钟`;
  }
  const hours = Math.floor(min / 60);
  const mins = min % 60;
  return mins > 0 ? t`剩余 ${hours} 小时 ${mins} 分` : t`剩余 ${hours} 小时`;
});
</script>
