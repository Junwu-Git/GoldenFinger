import { ref } from 'vue';
import type { PageId } from '@/components/shared/tab-definitions';

/**
 * 面板开合是会话内状态，刻意不落盘：刷新/重开酒馆后面板默认收起，需要时再从
 * 悬浮球/魔棒打开。若持久化，「已收起」虽能跨刷新保留，但「开着的面板」
 * 也会在每次刷新时复活——浮层类 UI 的常规预期是开合随会话走，位置才随存档走。
 */
export const panelVisible = ref(false);

/** 面板当前页（type-only 依赖，无运行时耦合）：聊天内状态条等外部入口先设页再开面板，直达目标页 */
export const panelPage = ref<PageId>('home');

export function togglePanel(): void {
  panelVisible.value = !panelVisible.value;
}

export function closePanel(): void {
  panelVisible.value = false;
}
