<template>
  <div class="gf-section-card" v-bind="$attrs">
    <button type="button" class="gf-section-head" @click="open = !open">
      <i class="fa-solid fa-chevron-down gf-section-chevron" :class="{ closed: !open }"></i>
      <i v-if="icon" :class="icon" class="gf-section-icon"></i>
      <span class="gf-section-title">{{ title }}</span>
      <span class="gf-flex"></span>
      <span v-if="$slots.extra" class="gf-section-extra" @click.stop>
        <slot name="extra"></slot>
      </span>
    </button>
    <div v-show="open" class="gf-section-body">
      <slot></slot>
    </div>
  </div>
</template>

<script setup lang="ts">
// 折叠状态只放组件内：切视图卸载即重置，不持久化
const open = defineModel<boolean>('open', { default: true });

defineProps<{
  title: string;
  icon?: string;
}>();

defineSlots<{
  default?: () => unknown;
  /** 标题行右侧常显区（如小按钮/状态徽标） */
  extra?: () => unknown;
}>();
</script>

<style scoped>
.gf-section-card {
  border: 1px solid var(--gf-border);
  border-radius: var(--gf-radius-md);
  background: var(--gf-bg-1);
  overflow: hidden;
}

.gf-section-head {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 9px 12px;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--gf-text-1);
  font-size: 13px;
  font-weight: 600;
  text-align: left;
}

.gf-section-head:hover {
  background: rgba(255, 255, 255, 0.03);
}

.gf-section-chevron {
  color: var(--gf-accent);
  transition: transform 0.2s ease;
  font-size: 11px;
}

.gf-section-chevron.closed {
  transform: rotate(-90deg);
}

.gf-section-icon {
  color: var(--gf-accent);
  opacity: 0.85;
}

.gf-section-title {
  letter-spacing: 0.02em;
}

.gf-section-extra {
  display: flex;
  align-items: center;
  gap: 6px;
}

.gf-section-body {
  padding: 10px 12px 12px;
  border-top: 1px dashed var(--gf-border);
}
</style>
