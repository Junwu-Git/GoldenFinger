<template>
  <div class="gf-view">
    <!-- 店招 + 余额 -->
    <div class="gf-shop-head">
      <div class="gf-shop-title">
        <i class="fa-solid fa-store gf-shop-icon"></i>
        <span>{{ system?.shopName ?? t`系统商店` }}</span>
      </div>
      <span class="gf-shop-balance">💰 {{ game.state.points }} {{ game.state.currencyName }}</span>
    </div>

    <!-- 生成中 -->
    <div v-if="game.shopGenerating" class="gf-shop-loading">
      <i class="fa-solid fa-spinner fa-spin gf-empty-icon"></i>
      <div>{{ t`老板正在进货…` }}</div>
    </div>

    <!-- 货架 -->
    <template v-else-if="shopItems.length > 0">
      <div class="gf-shelf-grid">
        <div v-for="item in shopItems" :key="item.id" class="gf-shop-item" :class="`rarity-${item.rarity}`">
          <div class="gf-shop-item-head">
            <span class="gf-shop-item-name">{{ item.name }}</span>
            <span class="gf-rarity-badge" :class="`rarity-${item.rarity}`">{{ rarityName(item.rarity) }}</span>
          </div>
          <div v-if="item.description" class="gf-shop-item-desc">{{ item.description }}</div>
          <div class="gf-shop-item-foot">
            <span class="gf-price-pill" :class="{ poor: game.state.points < item.price }">💰 {{ item.price }}</span>
            <span v-if="item.stock !== null" class="gf-stock" :class="{ out: item.stock <= 0 }">
              {{ item.stock <= 0 ? t`售罄` : t`剩 ${item.stock} 件` }}
            </span>
            <span class="gf-flex"></span>
            <button
              class="gf-mini-btn ok"
              :disabled="game.state.points < item.price || (item.stock !== null && item.stock <= 0)"
              @click="game.buyItem(item.id)"
            >
              <i class="fa-solid fa-cart-shopping"></i> {{ t`购买` }}
            </button>
          </div>
        </div>
      </div>
    </template>

    <!-- 空货架 -->
    <div v-else class="gf-empty">
      <i class="fa-solid fa-store gf-empty-icon"></i>
      {{ t`货架空空如也。` }}
      <button class="gf-secondary-btn" @click="openShop">{{ t`催老板上货` }}</button>
    </div>

    <!-- 换一批 -->
    <button
      class="gf-secondary-btn gf-refresh-btn"
      :disabled="game.shopGenerating || game.state.points < refreshCost"
      :title="t`换一批需要 ${refreshCost} ${game.state.currencyName}`"
      @click="refresh"
    >
      <i :class="game.shopGenerating ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-rotate'"></i>
      {{ refreshCost > 0 ? t`换一批（${refreshCost} ${game.state.currencyName}）` : t`换一批` }}
    </button>
  </div>
</template>

<script setup lang="ts">
import toastr from 'toastr';
import { computed, onMounted } from 'vue';
import { useGameStore } from '@/store/game';
import { RARITY_NAMES } from '@/type/game';

const game = useGameStore();
const system = computed(() => game.activeSystem);
const shopItems = computed(() => game.state.shop?.items ?? []);
const refreshCost = computed(() => system.value?.refreshCost ?? 0);

// 进店即免费开张：无货架时自动生成一次
onMounted(() => {
  void game.ensureShop().catch(error => {
    console.error('[GoldenFinger] 货架生成失败', error);
    toastr.error(error instanceof Error ? error.message : String(error), t`金手指系统`);
  });
});

function rarityName(rarity: number): string {
  return RARITY_NAMES[rarity] ?? RARITY_NAMES[1];
}

async function openShop(): Promise<void> {
  try {
    await game.ensureShop();
  } catch (error) {
    toastr.error(error instanceof Error ? error.message : String(error), t`金手指系统`);
  }
}

async function refresh(): Promise<void> {
  try {
    await game.refreshShop();
  } catch (error) {
    console.error('[GoldenFinger] 换一批失败', error);
    toastr.error(error instanceof Error ? error.message : String(error), t`金手指系统`);
  }
}
</script>
