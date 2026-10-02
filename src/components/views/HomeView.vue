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

      <div v-if="game.unlockedSkills.length > 0" class="gf-skills">
        <div class="gf-view-title">{{ t`已觉醒技能（${game.unlockedSkills.length}）` }}</div>
        <div v-for="skill in game.unlockedSkills" :key="skill.name" class="gf-skill">
          <span class="gf-skill-name">{{ skill.name }}</span>
          <span class="gf-skill-desc">{{ skill.description }}</span>
        </div>
      </div>

      <div class="gf-view-title gf-title-row">
        <span>{{ t`进行中的任务（${game.activeTasks.length}/${system.maxActiveTasks}）` }}</span>
        <button
          class="gf-mini-btn gf-judge-btn"
          :disabled="game.judging || game.activeTasks.length === 0"
          @click="judge"
        >
          <i :class="game.judging ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-scale-balanced'"></i>
          {{ game.judging ? t`判定中…` : t`独立判定` }}
        </button>
      </div>
      <template v-if="game.activeTasks.length > 0">
        <GfTaskCard v-for="task in game.activeTasks" :key="task.id" :task="task" @abandon="abandon" />
      </template>
      <div v-else class="gf-empty-small">{{ t`暂无任务，点下方按钮让系统派发一批。` }}</div>

      <button
        class="gf-primary-btn"
        :disabled="game.generating || game.activeTasks.length >= system.maxActiveTasks"
        @click="issue"
      >
        <i :class="game.generating ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-bolt'"></i>
        {{ game.generating ? t`正在连接系统…` : t`让系统派发任务` }}
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
    const tasks = await game.issueTasks();
    const titles = tasks.map(item => `《${item.title}》`).join('、');
    toastr.success(t`系统派发了 ${tasks.length} 个新任务：${titles}`, t`金手指系统`);
  } catch (error) {
    console.error('[GoldenFinger] 发布任务失败', error);
    toastr.error(error instanceof Error ? error.message : String(error), t`金手指系统`);
  }
}

async function judge(): Promise<void> {
  try {
    const settled = await game.judgeTasks();
    if (settled > 0) {
      toastr.success(t`独立判定结算了 ${settled} 个任务`, t`金手指系统`);
    } else {
      toastr.info(t`独立判定完成：暂无任务有明确的完成/失败铁证`, t`金手指系统`);
    }
  } catch (error) {
    console.error('[GoldenFinger] 独立判定失败', error);
    toastr.error(error instanceof Error ? error.message : String(error), t`金手指系统`);
  }
}

async function abandon(taskId: string): Promise<void> {
  const task = game.state.tasks.find(item => item.id === taskId);
  const context = window.SillyTavern?.getContext?.();
  const result = await context?.callGenericPopup?.(
    t`确定放弃「${task?.title ?? taskId}」？奖励作废。`,
    context.POPUP_TYPE.CONFIRM,
  );
  if (result === context?.POPUP_RESULT?.AFFIRMATIVE) {
    game.setTaskStatus(taskId, 'failed', 'manual');
  }
}
</script>

<style scoped>
.gf-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.gf-skills {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}
.gf-skill {
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--gf-bg-card, rgba(255, 255, 255, 0.04));
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.gf-skill-name {
  font-weight: 600;
  color: var(--gf-accent, inherit);
}
.gf-skill-desc {
  font-size: 12px;
  opacity: 0.85;
}
</style>
