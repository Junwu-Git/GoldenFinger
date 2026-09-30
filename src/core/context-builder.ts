import { chat_metadata } from '@sillytavern/script';
import {
  getWorldInfoPrompt,
  loadWorldInfo,
  METADATA_KEY,
  selected_world_info,
  world_names,
} from '@sillytavern/scripts/world-info';
import type { Settings, WorldBookMode } from '@/type/settings';

/** loadWorldInfo 返回值按使用面声明（world-info.js 实际返回 { entries: Record<uid, 条目> }） */
type LoadedWorldBook = {
  entries?: Record<string, { content?: string; disable?: boolean }>;
} | null;

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
      const worldInfo = await getWorldInfoBlock(context, settings);
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

/**
 * 组装「世界书设定」块：
 * - 无书层覆盖（worldBookOverrides 全 default/空）→ 走酒馆原生 getWorldInfoPrompt 扫描（零行为变化）；
 * - 任一 off/force 覆盖 → 手动组装参与书集：激活源中未 off 的书 + 所有 force 的书，
 *   default 书跟随酒馆的 entry.disable，force 书无视 disable。手动组装不读写酒馆世界书缓存，
 *   也就不会影响正文主生成（choice 用缓存变异做书层控制，本扩展避免那个副作用）。
 */
async function getWorldInfoBlock(context: any, settings: Settings): Promise<string | null> {
  const overrides = settings.worldBookOverrides ?? {};
  const hasOverride = Object.values(overrides).some(mode => mode === 'off' || mode === 'force');
  if (hasOverride) {
    return await getWorldInfoOverridden(overrides);
  }
  return await getWorldInfoNative(context);
}

/** 书层覆盖下的手动组装：不依赖酒馆关键字/概率选择，按书集收拢全部可选条目 */
async function getWorldInfoOverridden(overrides: Record<string, WorldBookMode>): Promise<string | null> {
  const activeNames = new Set(listActiveWorldBooks().map(book => book.name));
  const participating = new Set<string>();
  for (const name of activeNames) {
    if (overrides[name] !== 'off') {
      participating.add(name);
    }
  }
  for (const [name, mode] of Object.entries(overrides)) {
    if (name && mode === 'force') {
      participating.add(name);
    }
  }

  const blocks: string[] = [];
  for (const name of participating) {
    if (!name.trim()) {
      continue;
    }
    const force = overrides[name] === 'force';
    try {
      const data = (await loadWorldInfo(name)) as LoadedWorldBook | null;
      const entries = data?.entries ? Object.values(data.entries) : [];
      for (const entry of entries) {
        if (entry.disable && !force) {
          continue;
        }
        const content = String(entry.content ?? '').trim();
        if (content) {
          blocks.push(content);
        }
      }
    } catch {
      console.warn('[GoldenFinger] 加载世界书失败，已跳过：', name);
    }
  }
  return blocks.length > 0 ? blocks.join('\n\n') : null;
}

/** 调酒馆原生世界书扫描管线，聚合插入型条目（before/after/贴近生成点的浅深度/作者注释前后） */
async function getWorldInfoNative(context: any): Promise<string | null> {
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

  const blocks = [result.worldInfoBefore, result.worldInfoAfter, ...depthContents, result.anBefore, result.anAfter]
    .map(block => String(block ?? '').trim())
    .filter(Boolean);
  return blocks.length > 0 ? blocks.join('\n\n') : null;
}

export type WorldBookSource = 'global' | 'character' | 'chat';

export interface ActiveWorldBook {
  name: string;
  /** 一本书可能同时被多个来源激活（如既全局勾选又绑角色卡），按来源展示徽章 */
  sources: WorldBookSource[];
}

/**
 * 只读枚举当前酒馆已激活的世界书，供世界书界面展示（不做逐书管理）。
 * 三个来源与 getWorldInfoPrompt 管线消费的激活源一致：全局勾选（selected_world_info）、
 * 角色卡绑定（data.extensions.world，群聊无单一角色卡故跳过）、聊天绑定（chat_metadata[METADATA_KEY]）。
 * 纯展示用途，读不到返回空数组，不影响生成主链路。
 */
export function listActiveWorldBooks(): ActiveWorldBook[] {
  try {
    const context = window.SillyTavern?.getContext?.();
    const globalBooks = (selected_world_info ?? []).filter((name): name is string => typeof name === 'string');
    const charBook =
      context?.groupId == null ? String(context?.characters?.[context.characterId]?.data?.extensions?.world ?? '') : '';
    const chatBook = typeof chat_metadata?.[METADATA_KEY] === 'string' ? chat_metadata[METADATA_KEY] : '';

    const merged = new Map<string, WorldBookSource[]>();
    const push = (name: string, source: WorldBookSource) => {
      if (!name) {
        return;
      }
      const sources = merged.get(name) ?? [];
      if (!sources.includes(source)) {
        sources.push(source);
      }
      merged.set(name, sources);
    };
    for (const name of globalBooks) {
      push(name, 'global');
    }
    push(charBook, 'character');
    push(chatBook, 'chat');
    return [...merged].map(([name, sources]) => ({ name, sources }));
  } catch (error) {
    console.warn('[GoldenFinger] 枚举已激活世界书失败', error);
    return [];
  }
}

export interface WorldBookRow {
  name: string;
  /** 激活来源（全局/角色/聊天）；不在激活源里则为空数组 */
  sources: WorldBookSource[];
  active: boolean;
}

/**
 * 枚举酒馆全部世界书（world_names 全集 + 激活但不在全集里的临时书），带激活标记，
 * 供世界书界面做逐书 关闭/默认/强制 控制。纯展示+取书名，不触发世界书网络加载。
 */
export function listAllWorldBooks(): WorldBookRow[] {
  try {
    const activeMap = new Map(listActiveWorldBooks().map(book => [book.name, book.sources]));
    const names = (world_names ?? []).filter((name): name is string => typeof name === 'string');
    const seen = new Set<string>();
    const all: string[] = [];
    for (const name of names) {
      if (!seen.has(name)) {
        seen.add(name);
        all.push(name);
      }
    }
    // 激活但不在 world_names 里的临时书（如聊天/角色刚绑定的）也要能操作
    for (const name of activeMap.keys()) {
      if (!seen.has(name)) {
        seen.add(name);
        all.push(name);
      }
    }
    return all.map(name => ({ name, sources: activeMap.get(name) ?? [], active: activeMap.has(name) }));
  } catch (error) {
    console.warn('[GoldenFinger] 枚举世界书失败', error);
    return [];
  }
}
