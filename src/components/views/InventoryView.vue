<template>
  <div class="gf-view">
    <div class="gf-view-title">{{ t`背包（${game.state.inventory.length}）` }}</div>
    <div v-if="game.state.inventory.length > 0" class="gf-bag-grid">
      <div v-for="item in game.state.inventory" :key="item.name" class="gf-bag-item">
        <div class="gf-bag-item-head">
          <span class="gf-bag-item-name">{{ item.name }}</span>
          <span class="gf-bag-count">×{{ item.count }}</span>
        </div>
        <div v-if="item.description" class="gf-bag-item-desc">{{ item.description }}</div>
      </div>
    </div>
    <div v-else class="gf-empty">
      <i class="fa-solid fa-box-open gf-empty-icon"></i>
      {{ t`空空如也。去商店淘点好东西吧。` }}
      <button class="gf-secondary-btn" @click="openPage('shop')">
        <i class="fa-solid fa-store"></i> {{ system?.shopName ?? t`商店` }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { openPage } from '@/core/window-state';
import { pinia } from '@/pinia';
import { useGameStore } from '@/store/game';

const game = useGameStore(pinia);
const system = computed(() => game.activeSystem);
</script>
