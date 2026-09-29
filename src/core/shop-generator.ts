import { substituteParams } from '@sillytavern/script';
import { z } from 'zod';
import { requestTaskCompletion, type ChatMsg } from '@/core/api-client';
import { parseJsonFromText } from '@/core/json';
import { buildStoryContext } from '@/core/task-generator';
import { type GameState, ShopItem, type SystemDef } from '@/type/game';
import type { Settings } from '@/type/settings';

/** AI 返回的商品数组契约（id 由本地生成，不在提示词里要求） */
const SHELF_SCHEMA = z
  .array(ShopItem.omit({ id: true }))
  .min(1)
  .max(8);

const SHELF_INSTRUCTIONS = `把一批商店商品输出为严格的 JSON 数组：不要输出任何解释性文字、前后缀或代码块标记。每个元素字段如下：
{
  "name": "商品名，8字以内，有画面感",
  "description": "商品描述：它是什么、有何妙用，40字以内",
  "price": 正整数价格,
  "stock": 数量或 null(不限量),
  "rarity": 1到3的整数
}
生成要求：
- 一批 4~6 件；rarity 分布大致为 普通(1) 2~3 件、稀有(2) 1~2 件、传说(3) 0~1 件。
- 价格带：普通 10~50、稀有 50~200、传说 200~1000；再结合宿主当前的等级与持有货币微调，让「攒一攒够得着传说」有盼头。
- 商品必须契合店铺气质与世界观，且能在剧情中实际派上用场（消耗品、情报、装备、机缘、服务皆可）。`;

/** 通过 API 异步生成一批货架商品（纯函数：不碰状态，由 store 落账） */
export async function generateShopShelf(
  system: SystemDef,
  gameState: GameState,
  settings: Settings,
): Promise<ShopItem[]> {
  const inventoryText = gameState.inventory.length
    ? gameState.inventory.map(item => `${item.name}×${item.count}`).join('、')
    : '空';

  const systemMsg: ChatMsg = {
    role: 'system',
    content: [
      `你在一部互动小说中扮演绑定于主角的「金手指」——「${system.name}」，并负责运营它的内置商店「${system.shopName}」。`,
      system.persona,
      `这家商店出售的货品必须贴合「${system.shopName}」的气质与世界观，标价使用货币「${system.currencyName}」。`,
      SHELF_INSTRUCTIONS,
    ]
      .filter(Boolean)
      .join('\n\n'),
  };

  const userMsg: ChatMsg = {
    role: 'user',
    content: substituteParams(
      [
        '【当前系统状态】',
        `宿主等级：Lv.${gameState.level}`,
        `持有货币：${gameState.currencyName} ×${gameState.points}`,
        `持有物品：${inventoryText}`,
        '',
        '【最近剧情】',
        buildStoryContext(5, 120) || '（暂无剧情：请上一批稳妥实用的开张货。）',
        '',
        `请根据当前状态与剧情氛围上一批新货。只输出 JSON 数组本身。`,
      ].join('\n'),
    ),
  };

  const raw = await requestTaskCompletion({
    messages: [systemMsg, userMsg],
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
  };
}
