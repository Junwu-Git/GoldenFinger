import { z } from 'zod';
import { requestTaskCompletion } from '@/core/api-client';
import { parseJsonFromText } from '@/core/json';
import { composeShopMessages } from '@/core/task-generator';
import { type AttributeFx, type GameState, type ItemEffect, ShopItem, type SystemDef } from '@/type/game';
import type { Settings } from '@/type/settings';

/** AI 返回的商品元素契约（id/category 由本地按所在区赋值，不在提示词里要求） */
const ITEM_SCHEMA = ShopItem.omit({ id: true, category: true });

/** 单请求双区货架契约：system=系统通用批；character=角色专属批（可缺省，非法时整键降级为缺失，不拖垮 system 区）。
 *  system 上限放宽到 14：模型把两批都塞进 system 键时仍可解析，由 store 合并钳量 */
const SHELF_OBJECT_SCHEMA = z.object({
  system: z.array(ITEM_SCHEMA).min(1).max(14),
  character: z.array(ITEM_SCHEMA).max(6).nullish().catch(undefined),
});

/** 兜底契约：模型沿用旧版裸数组输出（或无视对象要求）时整批按系统通用货处理 */
const SHELF_ARRAY_SCHEMA = z.array(ITEM_SCHEMA).min(1).max(14);

const EFFECT_TYPES = ['points', 'exp', 'complete_task', 'attribute', 'none'] as const;
const ITEM_KINDS = ['item', 'skill'] as const;

/** 一批货架：双区商品，category 已按所在区赋值 */
export interface ShopShelf {
  system: ShopItem[];
  character: ShopItem[];
}

/**
 * 通过 API 异步生成一批货架（纯函数：不碰状态，由 store 落账）。
 * 单请求双区：system 区 10 件系统通用货必出；character 区 3~4 件角色专属货按 characterShopEnabled
 * 经 {{characterShelf}} 变量下发，缺失/失败仅告警（返回空数组），不整体翻车。
 */
export async function generateShopShelf(
  system: SystemDef,
  gameState: GameState,
  settings: Settings,
): Promise<ShopShelf> {
  const messages = await composeShopMessages(system, gameState, settings);
  const raw = await requestTaskCompletion({
    messages,
    mainResponseLength: settings.api.maxTokens,
  });

  const merged = parseJsonFromText(raw, SHELF_OBJECT_SCHEMA, '{');
  if (merged) {
    const character = (merged.character ?? []).map((item, index) => normalizeItem(item, index, 'character'));
    if (settings.characterShopEnabled && character.length === 0) {
      console.warn('[GoldenFinger] 合并货架缺少有效的角色专属区（character），本批仅上系统通用货：', raw);
    }
    return {
      system: merged.system.map((item, index) => normalizeItem(item, index, 'system')),
      character,
    };
  }
  const legacy = parseJsonFromText(raw, SHELF_ARRAY_SCHEMA, '[');
  if (legacy) {
    console.warn('[GoldenFinger] 货架输出为裸数组（旧契约形态），已整体按系统通用货处理：', raw);
    return { system: legacy.map((item, index) => normalizeItem(item, index, 'system')), character: [] };
  }
  console.error('[GoldenFinger] 货架生成原始输出：', raw);
  throw new Error(t`AI 没有返回有效的商品 JSON，请重试`);
}

function normalizeItem(
  item: Omit<ShopItem, 'id' | 'category'>,
  index: number,
  category: 'system' | 'character',
): ShopItem {
  const kind = (ITEM_KINDS as readonly string[]).includes(String(item.kind)) ? (item.kind as ShopItem['kind']) : 'item';
  const type = (EFFECT_TYPES as readonly string[]).includes(item.effect?.type)
    ? (item.effect.type as ItemEffect['type'])
    : 'none';
  const attribute =
    type === 'attribute' && item.effect?.attribute ? normalizeAttribute(item.effect.attribute) : undefined;
  return {
    // id 拼入批次来源：换批都在同毫秒内完成过，仅靠时间戳+下标会撞 id
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
