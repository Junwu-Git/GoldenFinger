import { saveSettingsDebounced } from '@sillytavern/script';
import { extension_settings } from '@sillytavern/scripts/extensions';
import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import {
  DEFAULT_GENERATE_MODULES,
  DEFAULT_PROMPT_MODULES,
  DEFAULT_SHOP_MODULES,
  SCHEMA_VERSION,
  Settings,
  setting_field,
} from '@/type/settings';
import { validateInplace } from '@/util/zod';

/**
 * 逐版本迁移：
 * - v1 → v2：任务改为批量派发、货架扩到 10 件后，800 的回复上限会截断 JSON；
 *   同时按「系统主动派发」的方向把自动发布默认打开并加快节奏。
 * - v2 → v3：任务生成提示词纳入模块系统，老档只有 inject 域模块，补上 generate 域默认模块。
 * - v3 → v4：生成域提示词按 choice 六段结构重写（预填/信息边界/思考框架等新模块 + 内置模块内容刷新）；
 *   思维链会加长输出，回复上限提到 2500 防截断。
 * - v4 → v5：资料槽（gen_state/gen_world/gen_story）role 改为 system——对齐 choice「资料区为 system、user 只承载指令」。
 *   v4 老档这三个槽还是 user（沿老主路「只取最后 user 当 prompt」的旧设计），按 id 强制刷新 role、其余保留。
 * - v5 → v6：剧情上下文改为 choice 式两模式（visible_only/rounds）。删除单条截断 storyMessageLength；
 *   旧 storyMessages（楼层数 N）迁移为 contextMode='rounds' + contextRounds=round(N/2)（每轮=用户+助手 2 层）。
 * - v6 → v7：剧情上下文之后的生成域默认模块按 choice 布局重建（任务风格并入 gen_request，删除单 user 冗余）。
 * - v7 → v8：生成域资料区逐字复刻 choice 槽位——用 persona_description/world_info_before|after/char_description|personality|scenario/
 *   wi_depth_before|after/chat_history/reference_open|close 取代过渡的 gen_char、gen_world、gen_ref_open/close、gen_story。
 * - v8 → v9：商店货架生成接入模块系统——新增独立 shopPromptModules（默认 DEFAULT_SHOP_MODULES）。
 * - v9 → v10：移除注入位置选项（injectionPosition），注入恒为对话内（IN_CHAT）。
 * - v10 → v11：世界书对齐 choice 四态——旧 worldBookOverrides（off/force/default）改名 worldBookModes（default→follow），
 *   并初始化新的逐条覆盖/显式启用/全局排除空字段。
 * 生成域重建只重排生成域，注入域模块原样保留；custom_* 与未知 id 的生成模块保留在末尾。
 */
/** 生成域已移除的内置模块 id：迁移时从用户存档中丢弃（并入新槽位/模块） */
const REMOVED_GENERATE_IDS = new Set([
  'gen_char',
  'gen_world',
  'gen_ref_open',
  'gen_ref_close',
  'gen_story',
  'gen_style',
]);

/** 按当前 DEFAULT_PROMPT_MODULES 重建生成域默认模块（幂等）：保留 enabled，丢弃 REMOVED_GENERATE_IDS 与旧内置，
 *  保留 custom 前缀/未知 id，注入域原样保留。 */
function rebuildGenerateDefaults(migrated: Record<string, unknown>): void {
  const modules = Array.isArray(migrated.promptModules) ? (migrated.promptModules as unknown[]) : [];
  const genDefs = DEFAULT_PROMPT_MODULES.filter(def => def.scope === 'generate');
  const genIds = new Set(genDefs.map(def => def.id));
  const injectModules = modules.filter(mod => (mod as { scope?: string })?.scope !== 'generate');
  const oldGenModules = modules.filter(mod => (mod as { scope?: string })?.scope === 'generate');
  const rebuiltGen: unknown[] = [];
  for (const def of genDefs) {
    const old = oldGenModules.find(mod => (mod as { id?: string })?.id === def.id);
    rebuiltGen.push(
      old
        ? { ...structuredClone(def), enabled: (old as { enabled?: boolean }).enabled !== false }
        : structuredClone(def),
    );
  }
  for (const mod of oldGenModules) {
    const id = (mod as { id?: string })?.id;
    if (!id || genIds.has(id) || REMOVED_GENERATE_IDS.has(id)) {
      continue; // 已按默认重建；或属于被移除的内置（并入新槽位）
    }
    rebuiltGen.push(mod); // custom_*/未知 id 保留
  }
  migrated.promptModules = [...injectModules, ...rebuiltGen];
}
function migrateSettings(raw: unknown): unknown {
  const data = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const version = typeof data.schema_version === 'number' ? data.schema_version : 0;
  if (version >= SCHEMA_VERSION) {
    return data;
  }
  const migrated = { ...data };
  if (version < 2) {
    migrated.autoIssue = true;
    migrated.autoIssueInterval = 3;
    const api = { ...(typeof migrated.api === 'object' && migrated.api !== null ? migrated.api : {}) } as Record<
      string,
      unknown
    >;
    if (typeof api.maxTokens !== 'number' || api.maxTokens < 1500) {
      api.maxTokens = 2000;
    }
    migrated.api = api;
  }
  if (version < 3) {
    const modules = Array.isArray(migrated.promptModules) ? migrated.promptModules : [];
    const hasGenerate = modules.some(module => (module as { scope?: string })?.scope === 'generate');
    if (!hasGenerate) {
      migrated.promptModules = [
        ...modules,
        ...structuredClone(DEFAULT_PROMPT_MODULES.filter(m => m.scope === 'generate')),
      ];
    }
  }
  if (version < 4) {
    // 内置模块（能按 id 匹配到默认的）整体重排到新默认顺序并刷新内容/角色，启停保留；
    // custom_* 与未知 id 的模块原样保留、追加在末尾（scope 过滤后仍在各自域内）
    const modules = Array.isArray(migrated.promptModules) ? migrated.promptModules : [];
    const rebuilt: unknown[] = [];
    for (const def of DEFAULT_PROMPT_MODULES) {
      const old = modules.find(module => (module as { id?: string })?.id === def.id);
      rebuilt.push(
        old
          ? { ...structuredClone(def), enabled: (old as { enabled?: boolean }).enabled !== false }
          : structuredClone(def),
      );
    }
    for (const mod of modules) {
      const id = (mod as { id?: string })?.id;
      if (!id || !DEFAULT_PROMPT_MODULES.some(def => def.id === id)) {
        rebuilt.push(mod);
      }
    }
    migrated.promptModules = rebuilt;
    const api = { ...(typeof migrated.api === 'object' && migrated.api !== null ? migrated.api : {}) } as Record<
      string,
      unknown
    >;
    if (typeof api.maxTokens !== 'number' || api.maxTokens < 2500) {
      api.maxTokens = 2500;
    }
    migrated.api = api;
  }
  if (version < 5) {
    // 资料槽 role 统一为 system（对齐 choice 资料区为 system）：只改这三个 marker 的 role，其余不动
    migrated.promptModules = (Array.isArray(migrated.promptModules) ? migrated.promptModules : []).map(module => {
      const id = (module as { id?: string })?.id;
      return id === 'gen_state' || id === 'gen_world' || id === 'gen_story' ? { ...module, role: 'system' } : module;
    });
  }
  if (version < 6) {
    // 剧情上下文改为 choice 式两模式：删除单条截断 storyMessageLength；
    // 旧 storyMessages（楼层数 N）→ contextMode='rounds' + contextRounds=round(N/2)，保留用户改过的取景习惯
    delete migrated.storyMessageLength;
    const oldCount = (migrated as Record<string, unknown>).storyMessages;
    if (typeof oldCount === 'number') {
      migrated.contextMode = 'rounds';
      migrated.contextRounds = Math.max(1, Math.min(30, Math.round(oldCount / 2)));
    }
    delete migrated.storyMessages;
  }
  if (version < 7) {
    // 生成域默认模块按当前 choice 布局重建（去旧槽位、任务风格并入 gen_request）
    rebuildGenerateDefaults(migrated);
  }
  if (version < 8) {
    // 收敛 v7 曾引入的过渡槽位（gen_char/gen_world/gen_ref_*/gen_story/gen_style）到 choice 槽位
    rebuildGenerateDefaults(migrated);
  }
  if (version < 9) {
    // 商店货架生成接入模块系统：新增独立 shopPromptModules（默认 DEFAULT_SHOP_MODULES）
    if (!Array.isArray(migrated.shopPromptModules)) {
      migrated.shopPromptModules = structuredClone(DEFAULT_SHOP_MODULES);
    }
  }
  if (version < 10) {
    // 移除注入位置选项：注入恒为对话内（IN_CHAT），清理旧字段（zod strip 亦会吞掉）
    delete migrated.injectionPosition;
  }
  if (version < 11) {
    // 世界书对齐 choice 四态：旧 worldBookOverrides 改名 worldBookModes，default→follow；
    // 逐条覆盖/显式启用/全局排除是新空字段（zod default 兜底），无需搬运旧数据
    const oldOverrides = (migrated as Record<string, unknown>).worldBookOverrides;
    if (typeof oldOverrides === 'object' && oldOverrides !== null) {
      const modes: Record<string, string> = {};
      for (const [name, mode] of Object.entries(oldOverrides as Record<string, string>)) {
        modes[name] = mode === 'default' ? 'follow' : mode;
      }
      migrated.worldBookModes = modes;
    }
    delete migrated.worldBookOverrides;
  }
  if (version < 12) {
    // 新增「系统世界观/长期目标」marker 槽（world_overview）：给已存生成/商店模块列表插入默认槽，
    // 位置固定在 reference_close 之后、gen_state 之前（缺 gen_state 则追加到末尾）；自定义顺序与启停保留
    const injectSlot = (list: unknown, defs: typeof DEFAULT_GENERATE_MODULES): unknown => {
      const modules = Array.isArray(list) ? [...(list as unknown[])] : [];
      const def = defs.find(module => module.id === 'world_overview');
      if (!def || modules.some(module => (module as { id?: string })?.id === 'world_overview')) {
        return modules;
      }
      const genStateIdx = modules.findIndex(module => (module as { id?: string })?.id === 'gen_state');
      modules.splice(genStateIdx >= 0 ? genStateIdx : modules.length, 0, structuredClone(def));
      return modules;
    };
    migrated.promptModules = injectSlot(migrated.promptModules, DEFAULT_GENERATE_MODULES);
    migrated.shopPromptModules = injectSlot(migrated.shopPromptModules, DEFAULT_SHOP_MODULES);
  }
  if (version < 13) {
    // 技能系统：给注入域 status 模块补「已觉醒技能」行（缺 {{skills}} 才补，避免覆盖已自定义内容）
    migrated.promptModules = (Array.isArray(migrated.promptModules) ? migrated.promptModules : []).map(module => {
      const id = (module as { id?: string })?.id;
      const content = (module as { content?: string })?.content;
      if (id === 'status' && typeof content === 'string' && !content.includes('{{skills}}')) {
        return { ...module, content: `${content}\n已觉醒技能：{{skills}}` };
      }
      return module;
    });
  }
  return migrated;
}

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref(validateInplace(Settings, migrateSettings(_.get(extension_settings, setting_field))));

  watch(
    settings,
    new_settings => {
      new_settings.schema_version = SCHEMA_VERSION;
      _.set(extension_settings, setting_field, klona(new_settings));
      saveSettingsDebounced();
    },
    { deep: true },
  );

  return { settings };
});
