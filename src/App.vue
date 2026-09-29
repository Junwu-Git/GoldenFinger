<template>
  <Teleport to="#extensions_settings2">
    <SettingsDrawer />
  </Teleport>
  <GamePanel />
  <GfWindow />
</template>

<script setup lang="ts">
import GfWindow from '@/components/shared/GfWindow.vue';
import GamePanel from '@/components/GamePanel.vue';
import SettingsDrawer from '@/components/SettingsDrawer.vue';
</script>
