<template>
  <Teleport to="#extensions_settings2">
    <SettingsDrawer />
  </Teleport>
  <GamePanel />
</template>

<script setup lang="ts">
import GamePanel from '@/components/GamePanel.vue';
import SettingsDrawer from '@/components/SettingsDrawer.vue';
</script>
