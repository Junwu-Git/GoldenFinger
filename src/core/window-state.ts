import { ref } from 'vue';

/** 二级窗口（商店/背包/日志/系统/设置）的全局开关：主面板与各入口共用同一信号（同 choice 的 floating-state 模式） */
export type WindowPage = 'shop' | 'inventory' | 'log' | 'system' | 'settings';

export const isWindowOpen = ref(false);
export const activePage = ref<WindowPage>('shop');

export function openPage(page: WindowPage): void {
  activePage.value = page;
  isWindowOpen.value = true;
}

export function closeWindow(): void {
  isWindowOpen.value = false;
}
