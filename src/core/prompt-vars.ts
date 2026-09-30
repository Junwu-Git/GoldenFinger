import type { GameState, SystemDef, Task } from '@/type/game';

/** 模块可用的运行时变量（{{user}} 不在此列，交给酒馆 substituteParams）；注入与任务生成共用 */
export function buildVars(system: SystemDef, state: GameState): Record<string, string> {
  const activeTasks = state.tasks.filter(task => task.status === 'active');
  const tasksText =
    activeTasks.length > 0
      ? activeTasks
          .map(
            task =>
              `• ${task.id}《${task.title}》难度${'★'.repeat(task.difficulty)}｜要求：${task.requirements}｜奖励：${rewardText(task)}`,
          )
          .join('\n')
      : '（暂无任务，等待系统发布）';
  return {
    systemName: system.name,
    persona: system.persona,
    level: levelText(system, state),
    currency: system.currencyName,
    points: String(state.points),
    inventoryText: state.inventory.length
      ? `｜物品：${state.inventory.map(item => `${item.name}×${item.count}`).join('、')}`
      : '',
    tasks: tasksText,
    maxTasks: String(system.maxActiveTasks),
  };
}

export function fillVars(content: string, vars: Record<string, string>): string {
  return content.replace(/\{\{(\w+)\}\}/g, (match, key: string) => vars[key] ?? match);
}

function levelText(system: SystemDef, state: GameState): string {
  const title = system.levelNames[state.level - 1];
  return title ? `Lv.${state.level} ${title}` : `Lv.${state.level}`;
}

export function rewardText(task: Task): string {
  const rewards = task.rewards.map(reward => `${reward.name}×${reward.amount}`).join('、');
  return task.expReward > 0 ? `${rewards}，经验+${task.expReward}` : rewards;
}
