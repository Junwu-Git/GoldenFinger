import {
  extension_prompt_roles,
  extension_prompt_types,
  setExtensionPrompt,
  substituteParams,
} from '@sillytavern/script';
import { useGameStore } from '@/store/game';
import { useSettingsStore } from '@/store/settings';
import type { GameState, SystemDef } from '@/type/game';
import { DEFAULT_INJECT_MODULES, type Settings } from '@/type/settings';
import { buildVars, fillVars } from '@/core/prompt-vars';

export const INJECTION_KEY = 'golden_finger';

/** 判定标记：[任务完成:T001] / [任务失败：T001]（中英冒号与空白宽容） */
export const MARKER_REGEX = /\[任务(完成|失败)[:：]\s*([A-Za-z]{0,6}\d{1,4})\s*\]/g;

/** 状态或设置变化后调用：把当前系统状态写进酒馆提示词注入层 */
export function refreshInjection(): void {
  const { settings } = useSettingsStore();
  const game = useGameStore();
  const system = game.activeSystem;

  let text = '';
  if (settings.enabled && system) {
    text = buildInjectionText(system, game.state, settings);
  }

  // 注入位置恒为对话内（IN_CHAT），按 injectionDepth 深度靠近最近楼层；不再提供主提示词区选项
  setExtensionPrompt(
    INJECTION_KEY,
    text,
    extension_prompt_types.IN_CHAT,
    settings.injectionDepth,
    false,
    extension_prompt_roles.SYSTEM,
  );
}

/** 按 settings.promptModules 的 inject 域拼装注入文本：enabled 模块依序填充变量后拼接（generate 域归任务生成请求） */
export function buildInjectionText(system: SystemDef, state: GameState, settings: Settings): string {
  const vars = buildVars(system, state);
  const injectModules = settings.promptModules.filter(module => module.scope === 'inject');
  const modules =
    injectModules.length > 0 ? injectModules : structuredClone(DEFAULT_INJECT_MODULES).filter(module => module.enabled);
  const text = modules
    .filter(module => module.enabled && module.content.trim())
    .map(module => fillVars(module.content, vars))
    .join('\n\n');
  return substituteParams(text);
}

/**
 * 扫描一条 AI 消息里的判定标记并结算（对非 active 任务幂等）。
 * 同步改状态与楼层 DOM，落盘脱钩 fire-and-forget——ST 的 eventSource.emit 会串行
 * await 每个监听器，把 saveChat 的网络耗时留在监听器里会推迟 MESSAGE_RECEIVED
 * 之后的 CHARACTER_MESSAGE_RENDERED 等事件（酒馆助手楼层渲染挂在那些事件上）。
 *
 * @returns 是否结算出了任何变化
 */
export function handleMessageMarkers(messageIndex: number): boolean {
  const context = window.SillyTavern?.getContext?.();
  // chat 元素是 ST 原生楼层结构，显式断言（见 types/ambient.d.ts）
  const message = (context?.chat?.[messageIndex] ?? undefined) as StChatMessage | undefined;
  if (!message || typeof message.mes !== 'string') {
    return false;
  }
  const game = useGameStore();
  const { settings } = useSettingsStore();
  if (!game.activeSystem) {
    return false;
  }

  let text = message.mes;
  let settled = false;
  let stripped = false;

  for (const match of [...text.matchAll(MARKER_REGEX)]) {
    const completed = match[1] === '完成';
    const changed = game.setTaskStatus(match[2], completed ? 'completed' : 'failed');
    if (changed) {
      settled = true;
      if (settings.removeMarkers) {
        text = text.replace(match[0], '');
        stripped = true;
      }
    }
  }

  if (settled && stripped) {
    const cleaned = text
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    // 酒馆助手可用时走 setChatMessages：一步完成改写 + 楼层重渲染（补发渲染事件）+ 落盘
    // （其内部 saveChatConditional 已核实，见 JS-Slash-Runner src/function/chat_message.ts）；
    // 不可用时直接改 ST 楼层数据兜底（updateMessageBlock 只重渲染 DOM，saveChat 落盘）
    const helper = window.TavernHelper;
    if (typeof helper?.setChatMessages === 'function') {
      void helper
        .setChatMessages([{ message_id: messageIndex, message: cleaned }], { refresh: 'affected' })
        .catch(error => console.error('[GoldenFinger] 结算后清理判定标记失败', error));
    } else {
      message.mes = cleaned;
      context?.updateMessageBlock?.(messageIndex, message);
      void context?.saveChat?.()?.catch?.((error: unknown) => {
        console.error('[GoldenFinger] 结算后保存聊天失败', error);
      });
    }
  }

  return settled;
}
