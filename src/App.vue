<template>
  <FloatingBubble v-if="settings.bubbleEnabled" />
  <ChatStateHud />
  <GamePanel />
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import ChatStateHud from '@/components/ChatStateHud.vue';
import FloatingBubble from '@/components/FloatingBubble.vue';
import GamePanel from '@/components/GamePanel.vue';
import { pinia } from '@/pinia';
import { useSettingsStore } from '@/store/settings';

const { settings } = storeToRefs(useSettingsStore(pinia));
</script>
