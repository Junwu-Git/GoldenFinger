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

    <!-- 未绑定：提示先去首页绑定 -->
    <div v-if="!system" class="gf-empty">
      <i class="fa-solid fa-store gf-empty-icon"></i>
      {{ t`绑定系统后商店才会开张。` }}
      <button class="gf-secondary-btn" @click="emit('navigate', 'home')">
        <i class="fa-solid fa-microchip"></i> {{ t`去选系统` }}
      </button>
    </div>

    <!-- 生成中 -->
    <div v-else-if="game.shopGenerating" class="gf-shop-loading">
      <i class="fa-solid fa-spinner fa-spin gf-empty-icon"></i>
      <div>{{ t`老板正在进货…` }}</div>
    </div>

    <!-- 货架 -->
    <template v-else-if="shopItems.length > 0">
      <div class="gf-shop-toolbar">
        <label class="gf-char-toggle">
          <input v-model="settings.characterShopEnabled" type="checkbox" />
          <span>{{ t`角色专属商品` }}</span>
        </label>
        <span class="gf-flex"></span>
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

      <!-- 系统通用商品栏 -->
      <template v-if="systemItems.length > 0">
        <div class="gf-shop-section">
          <span class="gf-shop-section-title">{{ t`系统通用商品` }}</span>
          <div class="gf-shelf-grid">
            <div v-for="item in systemItems" :key="item.id" class="gf-shop-item" :class="`rarity-${item.rarity}`">
              <ShopItemCard :item="item" :points="game.state.points" @buy="game.buyItem(item.id)" />
            </div>
          </div>
        </div>
      </template>

      <!-- 角色专属商品栏 -->
      <template v-if="characterItems.length > 0">
        <div class="gf-shop-section">
          <span class="gf-shop-section-title">{{ t`角色专属商品` }}</span>
          <div class="gf-shelf-grid">
            <div v-for="item in characterItems" :key="item.id" class="gf-shop-item" :class="`rarity-${item.rarity}`">
              <ShopItemCard :item="item" :points="game.state.points" @buy="game.buyItem(item.id)" />
            </div>
          </div>
        </div>
      </template>
    </template>

    <!-- 空货架 -->
    <div v-else class="gf-empty">
      <i class="fa-solid fa-store gf-empty-icon"></i>
      {{ t`货架空空如也。` }}
      <button class="gf-secondary-btn" @click="openShop">{{ t`催老板上货` }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import toastr from 'toastr';
import { storeToRefs } from 'pinia';
import { computed, onMounted } from 'vue';
import ShopItemCard from '@/components/shared/ShopItemCard.vue';
import { useGameStore } from '@/store/game';
import { useSettingsStore } from '@/store/settings';

const emit = defineEmits<{
  navigate: [tab: 'home'];
}>();

const game = useGameStore();
const { settings } = storeToRefs(useSettingsStore());
const system = computed(() => game.activeSystem);
const shopItems = computed(() => game.state.shop?.items ?? []);
const systemItems = computed(() => shopItems.value.filter(item => item.category === 'system'));
const characterItems = computed(() => shopItems.value.filter(item => item.category === 'character'));
const refreshCost = computed(() => system.value?.refreshCost ?? 0);

// 绑定状态下进店：无货架时免费开张
onMounted(() => {
  if (!game.activeSystem) {
    return;
  }
  void game.ensureShop().catch(error => {
    console.error('[GoldenFinger] 货架生成失败', error);
    toastr.error(error instanceof Error ? error.message : String(error), t`金手指系统`);
  });
});

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
