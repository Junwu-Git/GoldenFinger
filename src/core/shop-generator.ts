import { z } from 'zod';
import { requestTaskCompletion } from '@/core/api-client';
import { parseJsonFromText } from '@/core/json';
import { composeShopMessages } from '@/core/task-generator';
import { type GameState, type ItemEffect, ShopItem, type SystemDef } from '@/type/game';
import type { Settings } from '@/type/settings';

/** AI 返回的商品数组契约（id 由本地生成，不在提示词里要求） */
const SHELF_SCHEMA = z
  .array(ShopItem.omit({ id: true }))
  .min(1)
  .max(12);

/** 通过 API 异步生成一批货架商品（纯函数：不碰状态，由 store 落账）；请求消息由商店生成域模块组装（choice 式） */
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
  return parsed.map((item, index) => normalizeItem(item, index));
}

function normalizeItem(item: Omit<ShopItem, 'id'>, index: number): ShopItem {
  return {
    id: `S${Date.now().toString(36)}_${index}`,
    name: item.name.trim().slice(0, 24) || t`无名商品`,
    description: item.description.trim().slice(0, 120),
    price: _.clamp(Math.round(item.price), 1, 99999),
    stock: item.stock === null ? null : _.clamp(Math.round(item.stock), 0, 999),
    rarity: _.clamp(Math.round(item.rarity), 1, 3),
    // 归一到合法效果枚举；AI 漏填/填错一律按 none（纯收藏，无使用入口）
    effect: {
      type: (['points', 'exp', 'complete_task', 'none'] as const).includes(item.effect?.type)
        ? (item.effect.type as ItemEffect['type'])
        : 'none',
      amount: _.clamp(Math.round(item.effect?.amount ?? 0), -9999, 99999),
    },
  };
}
