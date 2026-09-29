import { extension_prompt_roles, extension_prompt_types, setExtensionPrompt, substituteParams } from '@sillytavern/script';
import { useGameStore } from '@/store/game';
import { useSettingsStore } from '@/store/settings';
import type { GameState, SystemDef, Task } from '@/type/game';

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
    text = buildInjectionText(system, game.state);
  }

  const position =
    settings.injectionPosition === 'in_chat' ? extension_prompt_types.IN_CHAT : extension_prompt_types.IN_PROMPT;
  setExtensionPrompt(INJECTION_KEY, text, position, settings.injectionDepth, false, extension_prompt_roles.SYSTEM);
}

export function buildInjectionText(system: SystemDef, state: GameState): string {
  const activeTasks = state.tasks.filter(task => task.status === 'active');
  const inventoryText = state.inventory.length
    ? `｜物品：${state.inventory.map(item => `${item.name}×${item.count}`).join('、')}`
    : '';

  const lines: string[] = [
    `【系统设定 | 「${system.name}」已激活】`,
    `设定：{{user}}被神秘的「${system.name}」绑定，只有{{user}}能感知系统的存在。系统消息以「叮！」开头，以仅{{user}}可见的系统面板形式呈现，其他角色对此一无所知。`,
  ];
  if (system.persona) {
    lines.push(system.persona);
  }
  lines.push(
    '【当前系统状态】',
    `宿主：{{user}}｜${levelText(system, state)}｜${system.currencyName}：${state.points}${inventoryText}`,
    '【进行中的任务】',
  );
  if (activeTasks.length > 0) {
    for (const task of activeTasks) {
      lines.push(
        `• ${task.id}《${task.title}》难度${'★'.repeat(task.difficulty)}｜要求：${task.requirements}｜奖励：${rewardText(task)}`,
      );
    }
  } else {
    lines.push('（暂无任务，等待系统发布）');
  }
  lines.push(
    '【任务判定规则（务必遵守）】',
    '- 当剧情明确显示{{user}}已完成某任务的要求、且事件已写入正文时，在回复的最末尾另起一行输出判定标记，如：[任务完成:T001]',
    '- 当剧情明确判定某任务已无法完成时，在回复末尾输出：[任务失败:T001]',
    '- 判定标记必须使用上述任务ID；除此之外，请在正文中自然展开剧情，可在任务达成或奖励发放处插入「叮！」开头的系统播报描写面板变化。',
    '- 不要在正文中解释标记机制；不要自行发明系统任务、奖励或判定，一切以【进行中的任务】为准。',
  );
  return substituteParams(lines.join('\n'));
}

function levelText(system: SystemDef, state: GameState): string {
  const title = system.levelNames[state.level - 1];
  return title ? `Lv.${state.level} ${title}` : `Lv.${state.level}`;
}

export function rewardText(task: Task): string {
  const rewards = task.rewards.map(reward => `${reward.name}×${reward.amount}`).join('、');
  return task.expReward > 0 ? `${rewards}，经验+${task.expReward}` : rewards;
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
    const cleaned = text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
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
