import type { BodyAttribute, GameState, SystemDef, Task } from '@/type/game';
import { todayDateStr } from '@/util/date';

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
  const unlockedSkills = (system.skills ?? []).filter(skill => state.level >= skill.unlockLevel);
  const skillNames = [
    ...unlockedSkills.map(skill => `「${skill.name}」`),
    ...state.learnedSkills.map(skill => `「${skill.name}」`),
  ];
  const itemsPlain = state.inventory.map(item => `${item.name}×${item.count}`).join('、');
  const items = state.inventory
    .map(item => `${item.name}×${item.count}${item.description ? `（${item.description}）` : ''}`)
    .join('、');
  const attrs = state.attributes.map(attrText).join('、');
  // 隐藏模式中性状态：只列随身之物/本事/身体状态并写明用途，不暴露系统/等级/货币（空字段不占行）
  const covertSkills = [
    ...unlockedSkills.map(skill => `${skill.name}：${skill.description}`),
    ...state.learnedSkills.map(skill => (skill.description ? `${skill.name}：${skill.description}` : skill.name)),
  ];
  const covertLines: string[] = [];
  if (items) covertLines.push(`所携之物：${items}`);
  if (covertSkills.length) covertLines.push(`本事：${covertSkills.join('；')}`);
  if (attrs) covertLines.push(`身体状态：${attrs}`);
  const covertStatus = covertLines.join('\n');
  return {
    systemName: system.name,
    shopName: system.shopName,
    persona: system.persona,
    level: levelText(system, state),
    currency: system.currencyName,
    points: String(state.points),
    inventoryText: itemsPlain ? `｜物品：${itemsPlain}` : '',
    tasks: tasksText,
    maxTasks: String(system.maxActiveTasks),
    // 系统觉醒技能 + 商店习得技能，一并注入正文 AI 供剧情施展
    skills: skillNames.length ? skillNames.join('、') : '无',
    // 身体改造数值属性（attribute 类物品使用后记录），空则模块里不占行
    attributes: attrs ? `｜身体状态：${attrs}` : '',
    // 每日签到状态（仅设置了 dailyReward 的系统有值，其余为空；模块可挂 {{signinState}}）
    signinState: system.dailyReward
      ? state.signIn.lastSignInDate === todayDateStr()
        ? `今日已签到（连续 ${state.signIn.streak} 天）`
        : '今日未签到'
      : '',
    covertStatus,
  };
}

/** 身体属性展示文本：有档位标签取 tiers[value]，否则 value+unit；可带目标角色名前缀 */
function attrText(attr: BodyAttribute): string {
  const label =
    attr.tiers && attr.tiers.length > 0
      ? attr.tiers[_.clamp(attr.value, 0, attr.tiers.length - 1)]
      : `${attr.value}${attr.unit}`;
  return `${attr.target ? `${attr.target}·` : ''}${attr.name} ${label}`;
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
