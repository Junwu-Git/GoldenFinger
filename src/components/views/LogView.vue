<template>
  <div class="gf-view">
    <div class="gf-view-title">
      <span>{{ t`系统日志（${game.state.log.length}）` }}</span>
      <button v-if="game.state.log.length > 0" class="gf-link-btn" @click="game.clearLog()">
        <i class="fa-solid fa-broom"></i> {{ t`清空` }}
      </button>
    </div>
    <div v-if="game.state.log.length > 0" class="gf-log-list">
      <div v-for="(entry, index) in game.state.log" :key="entry.time + '-' + index" class="gf-log" :class="entry.kind">
        <span class="gf-log-time">{{ formatTime(entry.time) }}</span>
        <span>{{ entry.text }}</span>
      </div>
    </div>
    <div v-else class="gf-empty">
      <i class="fa-solid fa-scroll gf-empty-icon"></i>
      {{ t`系统还没有留下记录。` }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { useGameStore } from '@/store/game';

const game = useGameStore();

function formatTime(time: number): string {
  const date = new Date(time);
  const month = date.getMonth() + 1;
  return `${month}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
</script>
