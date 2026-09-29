import { getWorldInfoPrompt } from '@sillytavern/scripts/world-info';
import type { Settings } from '@/type/settings';

/** 世界书取数预算：沿 choice 的放大值——独立生成请求不吃正文上下文预算，放大才能装下大条目 */
const WI_MAX_CONTEXT = 128_000;
/** 世界书文本总预算（超出截断，防生成提示词爆炸） */
const WI_TOTAL_CLIP = 3_000;
const CHAR_DESC_CLIP = 400;
const CHAR_FIELD_CLIP = 200;

function clip(text: unknown, max: number): string {
  const trimmed = String(text ?? '').trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

/**
 * 组装「世界观背景」块：角色卡核心字段 + 酒馆原生激活的世界书条目。
 * 供任务/商品生成提示词使用，让产出贴合当前卡与世界书，而不是只看最近几条聊天。
 * 世界书直接调 getWorldInfoPrompt（关键字/概率/深度/预算全由酒馆管线处理，同 choice 的 buildWI）；
 * 两个来源相互独立，读不到就跳过，不影响生成主链路。
 */
export async function buildWorldContext(settings: Settings): Promise<string> {
  const context = window.SillyTavern?.getContext?.();
  const parts: string[] = [];

  if (settings.useCharCard) {
    const card = getCharCard(context);
    if (card) {
      parts.push(`【角色卡设定】\n${card}`);
    }
  }

  if (settings.useWorldInfo) {
    try {
      const worldInfo = await getWorldInfoBlock(context);
      if (worldInfo) {
        parts.push(`【世界书设定】\n${worldInfo}`);
      }
    } catch (error) {
      console.warn('[GoldenFinger] 读取世界书失败，已跳过', error);
    }
  }

  return clip(parts.join('\n\n'), WI_TOTAL_CLIP + CHAR_DESC_CLIP + CHAR_FIELD_CLIP * 2);
}

/** 角色卡核心字段；群聊没有单一角色卡，返回 null */
function getCharCard(context: any): string | null {
  if (!context || context.groupId != null) {
    return null;
  }
  const character = context.characters?.[context.characterId];
  if (!character) {
    return null;
  }
  const parts: string[] = [];
  const description = character.data?.description ?? character.description;
  const personality = character.data?.personality ?? character.personality;
  const scenario = character.data?.scenario ?? character.scenario;
  if (description) {
    parts.push(`描述：${clip(description, CHAR_DESC_CLIP)}`);
  }
  if (personality) {
    parts.push(`性格：${clip(personality, CHAR_FIELD_CLIP)}`);
  }
  if (scenario) {
    parts.push(`场景：${clip(scenario, CHAR_FIELD_CLIP)}`);
  }
  return parts.length > 0 ? parts.join('\n') : null;
}

/** 调酒馆原生世界书扫描管线，聚合插入型条目（before/after/贴近生成点的浅深度/作者注释前后） */
async function getWorldInfoBlock(context: any): Promise<string | null> {
  const chat = (context?.chat ?? []) as StChatMessage[];
  // 与主生成一致：倒序（最新在前）、剔除隐藏楼层
  const chatStrings = chat
    .filter(message => !message.is_system)
    .map(message => String(message.mes ?? ''))
    .reverse();
  if (chatStrings.length === 0) {
    return null;
  }

  const character = context?.groupId == null ? context?.characters?.[context.characterId] : undefined;
  const result = await getWorldInfoPrompt(chatStrings, WI_MAX_CONTEXT, false, {
    trigger: 'normal',
    personaDescription: '',
    characterDescription: String(character?.data?.description ?? character?.description ?? ''),
    characterPersonality: String(character?.data?.personality ?? character?.personality ?? ''),
    characterDepthPrompt: '',
    scenario: String(character?.data?.scenario ?? character?.scenario ?? ''),
    creatorNotes: '',
  });

  // 深度条目：≤2 层的贴近生成点，是「当前情境」的一部分；更深的属于远背景，不重复带入
  const depthContents = (result.worldInfoDepth ?? [])
    .filter((group: any) => (group.depth ?? 99) <= 2)
    .flatMap((group: any) => (group.entries ?? []).map((entry: any) => String(entry.content ?? '')));

  const blocks = [
    result.worldInfoBefore,
    result.worldInfoAfter,
    ...depthContents,
    result.anBefore,
    result.anAfter,
  ]
    .map(block => String(block ?? '').trim())
    .filter(Boolean);
  return blocks.length > 0 ? blocks.join('\n\n') : null;
}
