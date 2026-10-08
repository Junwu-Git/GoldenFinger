<template>
  <div>
    <div class="gf-shop-item-head">
      <span class="gf-shop-item-name">{{ item.name }}</span>
      <span class="gf-rarity-badge" :class="`rarity-${item.rarity}`">{{ rarityName(item.rarity) }}</span>
    </div>
    <div v-if="item.kind === 'skill'" class="gf-item-kind"><i class="fa-solid fa-wand-sparkles"></i> {{ t`技能` }}</div>
    <div v-else-if="item.effect?.type === 'attribute'" class="gf-item-kind gf-item-kind-attr">
      <i class="fa-solid fa-heart-pulse"></i> {{ t`身体改造` }}
    </div>
    <div v-if="item.description" class="gf-shop-item-desc">{{ item.description }}</div>
    <div class="gf-shop-item-foot">
      <span class="gf-price-pill" :class="{ poor: points < item.price }">💰 {{ item.price }}</span>
      <span v-if="item.stock !== null" class="gf-stock" :class="{ out: item.stock <= 0 }">
        {{ item.stock <= 0 ? t`售罄` : t`剩 ${item.stock} 件` }}
      </span>
      <span class="gf-flex"></span>
      <button
        class="gf-mini-btn ok"
        :disabled="points < item.price || (item.stock !== null && item.stock <= 0)"
        @click="emit('buy')"
      >
        <i class="fa-solid fa-cart-shopping"></i> {{ item.kind === 'skill' ? t`习得` : t`购买` }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ShopItem } from '@/type/game';
import { RARITY_NAMES } from '@/type/game';

const props = defineProps<{
  item: ShopItem;
  points: number;
}>();

const emit = defineEmits<{
  buy: [];
}>();

function rarityName(rarity: number): string {
  return RARITY_NAMES[rarity] ?? RARITY_NAMES[1];
}
</script>
