import { chat_metadata, substituteParams } from '@sillytavern/script';
import { power_user } from '@sillytavern/scripts/power-user';
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
  entries?: Record<string, WorldBookEntry>;
} | null;

/** 世界书条目（按 UI 展开/消费使用面声明；constant/vectorized 仅展示用） */
export type WorldBookEntry = {
  uid?: number | string;
  comment?: string;
  key?: string[] | string;
  content?: string;
  constant?: boolean;
  disable?: boolean;
  vectorized?: boolean;
};

/** 世界书取数预算：沿 choice 的放大值——独立生成请求不吃正文上下文预算，放大才能装下大条目 */
const WI_MAX_CONTEXT = 128_000;

/** 深度条目分界：depth ≤ 此值注入 wi_depth_after（浅、贴近生成点），> 此值注入 wi_depth_before（深、背景），同 choice */
const WI_DEPTH_AFTER_MAXDEPTH = 2;

/** 用户主角 persona（choice 的 persona_description 槽，包 <user_persona>，整段发送不截断）；无 persona 返回 null */
export function buildPersonaContext(): string | null {
  const persona = power_user?.persona_description;
  if (!persona) {
    return null;
  }
  return `<user_persona>\n以下是用户本人（用户=主角=user）的人物设定：\n${substituteParams(String(persona))}\n</user_persona>`;
}

export type CharSlots = { description: string | null; personality: string | null; scenario: string | null };

/** 角色卡三个槽（choice 的 char_description/char_personality/char_scenario），整段发送不截断；respect useCharCard */
export function buildCharSlots(settings: Settings): CharSlots {
  const empty: CharSlots = { description: null, personality: null, scenario: null };
  if (!settings.useCharCard) {
    return empty;
  }
  const context = window.SillyTavern?.getContext?.();
  if (!context || context.groupId != null) {
    return empty;
  }
  const character = context.characters?.[context.characterId];
  if (!character) {
    return empty;
  }
  const trim = (value: unknown): string | null => {
    const s = String(value ?? '').trim();
    return s || null;
  };
  return {
    description: trim(character.data?.description ?? character.description),
    personality: trim(character.data?.personality ?? character.personality),
    scenario: trim(character.data?.scenario ?? character.scenario),
  };
}

export type WorldInfoSlots = {
  before: string;
  after: string;
  depthBefore: string;
  depthAfter: string;
};

const EMPTY_WORLD_SLOTS: WorldInfoSlots = { before: '', after: '', depthBefore: '', depthAfter: '' };

/** 世界书四个槽（choice 的 world_info_before/world_info_after/wi_depth_before/wi_depth_after），整段发送不截断；respect useWorldInfo */
export async function buildWorldInfoSlots(settings: Settings): Promise<WorldInfoSlots> {
  if (!settings.useWorldInfo) {
    return { ...EMPTY_WORLD_SLOTS };
  }
  try {
    const context = window.SillyTavern?.getContext?.();
    return await getWorldInfoBlock(context, settings);
  } catch (error) {
    console.warn('[GoldenFinger] 读取世界书失败，已跳过', error);
    return { ...EMPTY_WORLD_SLOTS };
  }
}

/**
 * 世界书设定按 choice 槽位分桶：
 * - 无任何覆盖（全 follow、无显式启用、无全局排除、无逐条）→ 走酒馆原生 getWorldInfoPrompt 扫描（零行为变化）；
 * - 任一覆盖 → 手动组装参与书集（激活源中未 off/未全局排除的书 + 所有 force 的书 + 显式启用书；follow 书跟随
 *   entry.disable、force 书无视 disable、custom 书按逐条覆盖）。手动组装不读写酒馆世界书缓存，也就不影响正文主生成
 *   （choice 用缓存变异做书层控制，本扩展避免那个副作用）。
 */
async function getWorldInfoBlock(context: any, settings: Settings): Promise<WorldInfoSlots> {
  const modes = settings.worldBookModes ?? {};
  const enabled = settings.worldBookEnabled ?? [];
  const globalExcluded = settings.worldBookGlobalExcluded ?? [];
  const entryOverrides = settings.worldBookEntryOverrides ?? {};
  const hasModeCover = Object.values(modes).some(mode => mode !== 'follow');
  if (hasModeCover || enabled.length > 0 || globalExcluded.length > 0 || Object.keys(entryOverrides).length > 0) {
    const manual = await getWorldInfoOverridden(settings);
    return { before: manual ?? '', after: '', depthBefore: '', depthAfter: '' };
  }
  return await getWorldInfoNative(context);
}

/** 书层覆盖下的手动组装：不依赖酒馆关键字/概率选择，按书集收拢全部可选条目 */
async function getWorldInfoOverridden(settings: Settings): Promise<string | null> {
  const overrides = settings.worldBookEntryOverrides ?? {};
  const modes = settings.worldBookModes ?? {};
  const globalExcluded = new Set(settings.worldBookGlobalExcluded ?? []);
  const enabledBooks = settings.worldBookEnabled ?? [];
  const modeOf = (name: string): WorldBookMode => modes[name] ?? 'follow';

  // 参与书集 = 激活书（未全局排除、非 off）+ 显式启用书（未全局排除、非 off）+ 所有 force 书（无视关闭态）
  const activeNames = new Set(listActiveWorldBooks().map(book => book.name));
  const participating = new Set<string>();
  for (const name of activeNames) {
    if (!globalExcluded.has(name) && modeOf(name) !== 'off') {
      participating.add(name);
    }
  }
  for (const name of enabledBooks) {
    if (name && !globalExcluded.has(name) && modeOf(name) !== 'off') {
      participating.add(name);
    }
  }
  for (const [name, mode] of Object.entries(modes)) {
    if (name && mode === 'force') {
      participating.add(name);
    }
  }

  const blocks: string[] = [];
  for (const name of participating) {
    if (!name.trim()) {
      continue;
    }
    const mode = modeOf(name);
    try {
      const data = (await loadWorldInfo(name)) as LoadedWorldBook | null;
      const entries = data?.entries ? Object.values(data.entries) : [];
      const bookOverrides = overrides[name] ?? {};
      for (const entry of entries) {
        if (mode === 'off') {
          continue; // off 书已不参与，防御
        }
        if (mode === 'force') {
          // force 无视一切关闭态
        } else if (mode === 'custom') {
          // custom：按逐条覆盖；快照未覆盖的条目保持酒馆原状
          const uid = String(entry.uid ?? '');
          if (uid && typeof bookOverrides[uid] === 'boolean') {
            if (!bookOverrides[uid]) {
              continue;
            }
          } else if (entry.disable) {
            continue;
          }
        } else if (entry.disable) {
          // follow：尊重酒馆条目 disable
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

/** 调酒馆原生世界书扫描管线，按 choice 槽位分桶：before=before+anBefore、after=after+anAfter、depthBefore=depth>2、depthAfter=depth≤2 */
async function getWorldInfoNative(context: any): Promise<WorldInfoSlots> {
  const chat = (context?.chat ?? []) as StChatMessage[];
  // 与主生成一致：倒序（最新在前）、剔除隐藏楼层
  const chatStrings = chat
    .filter(message => !message.is_system)
    .map(message => String(message.mes ?? ''))
    .reverse();
  if (chatStrings.length === 0) {
    return { ...EMPTY_WORLD_SLOTS };
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

  const join = (values: unknown[]): string =>
    values
      .map(value => String(value ?? '').trim())
      .filter(Boolean)
      .join('\n\n');
  const depth = (maxDepth: number): string => {
    const groups = (result.worldInfoDepth ?? []).filter((group: any) => (group.depth ?? 99) > maxDepth);
    return join(groups.flatMap((group: any) => (group.entries ?? []).map((entry: any) => String(entry.content ?? ''))));
  };
  return {
    before: join([result.worldInfoBefore, result.anBefore]),
    after: join([result.worldInfoAfter, result.anAfter]),
    depthBefore: depth(WI_DEPTH_AFTER_MAXDEPTH),
    depthAfter: join(
      (result.worldInfoDepth ?? [])
        .filter((group: any) => (group.depth ?? 99) <= WI_DEPTH_AFTER_MAXDEPTH)
        .flatMap((group: any) => (group.entries ?? []).map((entry: any) => String(entry.content ?? ''))),
    ),
  };
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

/**
 * 加载一本书的条目列表，供世界书界面展开逐条勾选。触发 loadWorldInfo（未命中缓存时网络拉取）。
 * 失败返回 null；条目按使用面声明字段，调用点显式断言。
 */
export async function loadWorldBookEntries(name: string): Promise<WorldBookEntry[] | null> {
  try {
    const data = (await loadWorldInfo(name)) as LoadedWorldBook | null;
    const entries = data?.entries ? Object.values(data.entries) : [];
    return entries.map(entry => ({
      uid: entry.uid,
      comment: entry.comment,
      key: entry.key,
      content: entry.content,
      constant: entry.constant,
      disable: entry.disable,
      vectorized: entry.vectorized,
    }));
  } catch (error) {
    console.warn('[GoldenFinger] 加载世界书条目失败，已跳过：', name, error);
    return null;
  }
}
