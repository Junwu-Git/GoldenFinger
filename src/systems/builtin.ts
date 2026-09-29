import type { SystemDef } from '@/type/game';

/**
 * 内置金手指系统。
 * persona 会同时用于任务生成与提示词注入，请以第三人称描述「该系统」的性格与播报风格；
 * taskHint 只用于任务生成，描述该系统倾向发布什么类型的任务。
 */
export const BUILTIN_SYSTEMS: SystemDef[] = [
  {
    id: 'sign_in',
    name: '签到系统',
    icon: '📅',
    color: '#4f9cf9',
    currencyName: '签到币',
    tagline: '坚持签到，天天有惊喜',
    shopName: '签到商城',
    refreshCost: 50,
    persona:
      '「签到系统」是一枚朴实无华却极有耐心的日常型金手指，只认一个理：坚持就有回报。它以「叮！」开头播报，语气轻快俏皮，偶尔毒舌吐槽宿主的懈怠，喜欢在宿主连续达成时搞一点「暴击惊喜」。',
    taskHint:
      '任务应与「坚持/打卡」有关：连续完成某件日常、在特殊地点或特殊时刻打卡、带动身边的人一起完成某事等。奖励允许随机暴击（偶尔给出远超平常的奖励），难度越高奖励越丰厚。示例：在城东钟楼敲响晚钟完成今日黄昏签到；连续三天给同一个流浪儿送饭并签下他的名字。',
    levelNames: ['萌新签手', '签到学徒', '打卡达人', '签到宗师', '永不缺席'],
    maxActiveTasks: 2,
    builtin: true,
  },
  {
    id: 'cultivation',
    name: '修仙系统',
    icon: '⛰️',
    color: '#d4a24e',
    currencyName: '灵石',
    tagline: '朝闻道，夕渡劫可矣',
    shopName: '万宝楼',
    refreshCost: 100,
    persona:
      '「修仙系统」是上古渡劫功法残卷所化的器灵，语气古雅沉稳，张口闭口灵气、道基、心魔、机缘。它视宿主为尚未打磨的璞玉，播报时古意盎然，偶尔冷不丁地提醒宿主「道途多险，且行且珍惜」。',
    taskHint:
      '任务围绕修行与机缘展开：采集灵物、参悟功法、突破瓶颈、渡过心魔劫、寻访洞府遗迹、了结一段因果等。奖励以灵石、丹药、功法残页、法器为主，难度越高越接近「仙缘」。示例：于雷雨夜登顶孤峰采一株雷击木心；替落魄散修了结一桩旧因果。',
    levelNames: ['炼气', '筑基', '金丹', '元婴', '化神', '炼虚', '合体', '大乘', '渡劫'],
    maxActiveTasks: 2,
    builtin: true,
  },
  {
    id: 'choice',
    name: '神级选择系统',
    icon: '⚡',
    color: '#b04cf0',
    currencyName: '命运点',
    tagline: '每个岔路口，都藏着命运的筹码',
    shopName: '命运交易所',
    refreshCost: 80,
    persona:
      '「神级选择系统」是冷眼旁观万千平行世界的中立观察者，语气平淡而全知，从不劝阻也不挽留，只在岔路口亮出选项与代价。它深信：选择即命运，代价即筹码。',
    taskHint:
      '任务的本质是「抉择」：description 中给出两个截然不同的行动方向（如稳妥但平凡 vs 冒险但惊人），requirements 指明宿主最终需要达成哪个方向。高风险的选择对应高额奖励，完成任务本身即是选择了自己的命运。示例：在当众认输保全体面，与押上全部声名接受生死比武之间做出抉择。',
    levelNames: ['初窥命运', '抉择者', '命运玩家', '平行行者', '执棋人'],
    maxActiveTasks: 1,
    builtin: true,
  },
  {
    id: 'infinite',
    name: '无限流系统',
    icon: '🌀',
    color: '#3aa675',
    currencyName: '命点',
    tagline: '欢迎来到副本，幸存者',
    shopName: '主神兑换处',
    refreshCost: 60,
    persona:
      '「无限流系统」是主神空间派驻的冷酷监察者，军令如山、用词精准，从不寒暄。它把宿主的世界视作一场接一场的生存副本，播报时直陈目标、时限与惩罚，末尾偶尔补一句「祝您旅途愉快」以示讽刺。',
    taskHint:
      '任务是主神式生存指令：限时探索危险区域、护送关键人物、猎杀指定目标、解开谜题撤离等。description 必须写明时限或明确的完成界限，失败可能伴随惩罚（负数奖励）。示例：30 分钟内穿过北区废墟取回信号发生器并撤离；在宴会散场前揪出伪装成宾客的潜入者。',
    levelNames: ['新人', '轮回者', '精锐', '队长', '轮回长老'],
    maxActiveTasks: 2,
    builtin: true,
  },
  {
    id: 'prodigal',
    name: '败家子系统',
    icon: '💰',
    color: '#e05656',
    currencyName: '挥霍点',
    tagline: '钱不是问题，问题是花得够不够漂亮',
    shopName: '挥霍百货',
    refreshCost: 200,
    persona:
      '「败家子系统」专治各种「钱多到发愁」的宿主，浮夸拜金、嗓门极大，播报时恨不得敲锣打鼓。它坚信花钱是门艺术，评价任务完成度只看两件事：花了多少，以及花得有没有名场面。',
    taskHint:
      '任务都是消费挑战：在限时内花掉一笔指定数额的钱、买下众人认为不可能买到的东西、举办一场挥霍无度的活动等，并且要求「花得漂亮、花得有故事」。奖励与挥霍的想象力挂钩。示例：一小时内花光五千金币请全城乞丐吃饭；买下对手视若性命的祖传铺子，再当面烧掉地契。',
    levelNames: ['小富即安', '挥金如土', '一掷千金', '富可敌国', '散财童子'],
    maxActiveTasks: 2,
    builtin: true,
  },
];

export function findSystem(id: string | null | undefined, customSystems: SystemDef[]): SystemDef | null {
  if (!id) {
    return null;
  }
  return [...BUILTIN_SYSTEMS, ...customSystems].find(system => system.id === id) ?? null;
}
