import { substituteParams } from '@sillytavern/script';
import { z } from 'zod';
import { requestTaskCompletion, type ChatMsg } from '@/core/api-client';
import { buildCharSlots, buildPersonaContext } from '@/core/context-builder';
import { parseJsonFromText } from '@/core/json';
import { buildVars, fillVars } from '@/core/prompt-vars';
import { composeShopMessages } from '@/core/task-generator';
import { type AttributeFx, type GameState, type ItemEffect, ShopItem, type SystemDef } from '@/type/game';
import type { Settings } from '@/type/settings';

/** AI 返回的商品数组契约（id 由本地生成，不在提示词里要求） */
const SHELF_SCHEMA = z
  .array(ShopItem.omit({ id: true }))
  .min(1)
  .max(12);

const EFFECT_TYPES = ['points', 'exp', 'complete_task', 'attribute', 'none'] as const;
const ITEM_KINDS = ['item', 'skill'] as const;

/**
 * 通过 API 异步生成一批「系统通用」货架商品（纯函数：不碰状态，由 store 落账）。
 * 请求消息由商店生成域模块组装（choice 式）；不针对当前角色细节，只按系统风格。
 */
export async function generateShopShelf(
  system: SystemDef,
  gameState: GameState,
  settings: Settings,
): Promise<ShopItem[]> {
  const messages = await composeShopMessages(system, gameState, settings);
  const raw = await requestTaskCompletion({
    messages,
    mainResponseLength: settings.api.maxTokens,
  });

  const parsed = parseJsonFromText(raw, SHELF_SCHEMA, '[');
  if (!parsed) {
    console.error('[GoldenFinger] 货架生成原始输出：', raw);
    throw new Error(t`AI 没有返回有效的商品 JSON，请重试`);
  }
  return parsed.map((item, index) => normalizeItem(item, index, 'system'));
}

/**
 * 通过 API 异步生成一批「角色专属」货架商品（纯函数）：固定一条聚焦当前角色卡/女主设定的提示词，
 * 产出对她量身定制的技能、身体改造与专属道具。失败抛错，由 store 决定保留旧货架。
 */
export async function generateCharacterShelf(
  system: SystemDef,
  gameState: GameState,
  settings: Settings,
): Promise<ShopItem[]> {
  const messages = composeCharacterShopMessages(system, gameState, settings);
  const raw = await requestTaskCompletion({
    messages,
    mainResponseLength: settings.api.maxTokens,
  });

  const parsed = parseJsonFromText(raw, SHELF_SCHEMA, '[');
  if (!parsed) {
    console.error('[GoldenFinger] 角色货架生成原始输出：', raw);
    throw new Error(t`AI 没有返回有效的商品 JSON，请重试`);
  }
  return parsed.map((item, index) => normalizeItem(item, index, 'character'));
}

/** 角色专属货架请求：system 定位 + 角色卡/女主设定，user 只写请求与契约（不参与正文角色扮演） */
function composeCharacterShopMessages(system: SystemDef, gameState: GameState, settings: Settings): ChatMsg[] {
  const vars = buildVars(system, gameState);
  const fill = (template: string): string => substituteParams(fillVars(template, vars));

  const charSlots = buildCharSlots(settings);
  const personaBlock = buildPersonaContext();
  const card = [charSlots.description, charSlots.personality, charSlots.scenario].filter(Boolean).join('\n\n');

  const systemMsg = fill(
    [
      '你在一部互动小说中为绑定于主角{{user}}的「{{systemName}}」运营它的定制商店「{{shopName}}」。',
      '这一次不卖店铺的通用货，只上一批专为当前女主角量身定制的货品：只对她有效、能增益她的技能、身体改造与特殊道具。',
      '',
      ...(personaBlock ? [personaBlock] : []),
      '【女主角设定】',
      card || '（未提供角色卡设定，请按系统的世界观自由发挥）',
      '',
      '【系统世界观】',
      system.worldview || '（无）',
      '【宿主长期目标】',
      system.goal || '（无）',
      '',
      '货币名称（标价必须逐字使用）：{{currency}}。',
    ].join('\n'),
  );

  const requestMsg = fill(
    [
      '请以「{{shopName}}」的口吻，结合上方女主角设定，上一批 3~4 件角色专属货品。',
      '每件可以是：一个「技能」（kind 写 "skill"，宿主购买即习得）；一次「身体改造」（effect.type 写 "attribute"，使用后改变女主角的身体属性）；或一件只对她生效的特殊道具。',
      '只输出 JSON 数组，每件字段：{"name","description","price","stock","rarity","kind","effect"}。',
      '- 身体改造的 effect 示例：{"type":"attribute","attribute":{"target":"女主","attribute":"罩杯","amount":1,"unit":"档","tiers":["平坦","A","B","C","D","E","F"]}}',
      '- 普通道具 effect 按 {"type":"points"|"exp"|"complete_task"|"none","amount":N}。',
      '价格带与稀有度分布同店铺通用货；货品必须契合世界观、只对女主角有意义，不要重复通用商品。',
    ].join('\n'),
  );

  return [
    { role: 'system', content: systemMsg },
    { role: 'user', content: requestMsg },
  ];
}

function normalizeItem(item: Omit<ShopItem, 'id'>, index: number, category: 'system' | 'character'): ShopItem {
  const kind = (ITEM_KINDS as readonly string[]).includes(String(item.kind)) ? (item.kind as ShopItem['kind']) : 'item';
  const type = (EFFECT_TYPES as readonly string[]).includes(item.effect?.type)
    ? (item.effect.type as ItemEffect['type'])
    : 'none';
  const attribute =
    type === 'attribute' && item.effect?.attribute ? normalizeAttribute(item.effect.attribute) : undefined;
  return {
    // id 拼入批次来源：系统/角色两批是并行生成的，仅靠时间戳+下标会在同毫秒完成时撞 id
    id: `S${Date.now().toString(36)}_${category}_${index}`,
    name: item.name.trim().slice(0, 24) || t`无名商品`,
    description: item.description.trim().slice(0, 120),
    price: _.clamp(Math.round(item.price), 1, 99999),
    stock: item.stock === null ? null : _.clamp(Math.round(item.stock), 0, 999),
    rarity: _.clamp(Math.round(item.rarity), 1, 3),
    // 归一到合法效果枚举；AI 漏填/填错一律按 none（纯收藏，无使用入口）
    effect: {
      type,
      // attribute 的数值在 attribute.amount 里，顶层 amount 归零
      amount: type === 'attribute' ? 0 : _.clamp(Math.round(item.effect?.amount ?? 0), -9999, 99999),
      ...(attribute ? { attribute } : {}),
    },
    category,
    kind,
  };
}

/** 归一身体改造负载：钳制长度/数值，档位标签净化 */
function normalizeAttribute(fx: AttributeFx): AttributeFx {
  const tiers = (fx.tiers ?? [])
    .map(tier => String(tier).slice(0, 12).trim())
    .filter(Boolean)
    .slice(0, 12);
  return {
    target: (fx.target ?? '').trim().slice(0, 24),
    attribute: (fx.attribute ?? '').trim().slice(0, 24) || '身材',
    // 显式 0 增量（AI 表示不变）应被尊重；缺省仍按 +1
    amount: _.clamp(Math.round(fx.amount ?? 1), -99, 99),
    unit: (fx.unit ?? '').trim().slice(0, 8),
    tiers,
  };
}
