<<<<<<< HEAD
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
 * - v14 → v15：新增 hiddenInjectionMode（隐藏模式）空字段，zod 兜底，无数据搬运。
 * - v15 → v16：被动状态追踪——给注入域 status 模块补 {{passiveStates}} 行（缺才补）；设置字段 zod 兜底，无数据搬运。
 * - v16 → v17：移除预填充开关 prefillEnabled——模块一律按自身 role 发送，无降级开关。
 * - v17 → v18：判定与状态提取合并为一次后台维护请求——autoJudgeInterval/passiveStateInterval 收敛为
 *   maintenanceInterval（取原判定间隔）；货架契约改为 {system,character} 双区对象，商店模块按新默认刷新（启停保留）。
 * - v18 → v19：预填充收尾——删除「应答声明」（gen_ack/shop_ack，预填充时代的重复应答语，职责已由系统定位的
 *   输出纪律与生成请求覆盖，还会诱发弱模型「收到/本轮执行……」式复读）；「思维链预填」改「思维链起手」：
 *   内容仍是旧默认字面量的模块换指令式文案并把 assistant 改 system（不依赖模型预填充能力；想用预填充把模块角色改回 assistant）。
 * 生成域重建只重排生成域，注入域模块原样保留；custom_* 与未知 id 的生成模块保留在末尾。
 * - v19 → v20：后台维护节奏改为每轮即时——自动判定与状态提取都每条 AI 回复执行（双开合并为一次请求），
 *   maintenanceInterval 间隔字段删除（失败重试由内存态退避冷却兜底）。
 * - v20 → v21：新增悬浮球位置 bubblePos（zod 兜底，无数据搬运）。
 * - v21 → v22：面板开合改为运行时状态（core/ui-state.ts），panelVisible 字段删除——
 *   开合随会话走不落盘，刷新后面板默认收起；就地 delete 的原因同 v17。
 * - v22 → v23：新增界面显示开关 bubbleEnabled / chatStateHud（悬浮球、聊天内状态条），zod 兜底，无数据搬运。
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
/** 按当前 DEFAULT_SHOP_MODULES 重建商店模板默认模块（幂等）：保留 enabled 与 custom/未知 id。
 *  契约形态变更（单数组 → {system,character} 双区对象）时刷新内置模块内容，用户自定义内容随之对齐新契约 */
function rebuildShopDefaults(migrated: Record<string, unknown>): void {
  const modules = Array.isArray(migrated.shopPromptModules) ? (migrated.shopPromptModules as unknown[]) : [];
  const defIds = new Set(DEFAULT_SHOP_MODULES.map(def => def.id));
  const rebuilt: unknown[] = [];
  for (const def of DEFAULT_SHOP_MODULES) {
    const old = modules.find(mod => (mod as { id?: string })?.id === def.id);
    rebuilt.push(
      old
        ? { ...structuredClone(def), enabled: (old as { enabled?: boolean }).enabled !== false }
        : structuredClone(def),
    );
  }
  for (const mod of modules) {
    const id = (mod as { id?: string })?.id;
    if (!id || !defIds.has(id)) {
      rebuilt.push(mod); // custom/未知 id 保留
    }
  }
  migrated.shopPromptModules = rebuilt;
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
  if (version < 14) {
    // 身体改造属性：给注入域 status 模块补「身体状态」行（缺 {{attributes}} 才补，避免覆盖已自定义内容）
    migrated.promptModules = (Array.isArray(migrated.promptModules) ? migrated.promptModules : []).map(module => {
      const id = (module as { id?: string })?.id;
      const content = (module as { content?: string })?.content;
      if (id === 'status' && typeof content === 'string' && !content.includes('{{attributes}}')) {
        return { ...module, content: `${content}\n{{attributes}}` };
      }
      return module;
    });
  }
  if (version < 16) {
    // 被动状态追踪：给注入域 status 模块补「身心状态」行（缺 {{passiveStates}} 才补，避免覆盖已自定义内容）
    migrated.promptModules = (Array.isArray(migrated.promptModules) ? migrated.promptModules : []).map(module => {
      const id = (module as { id?: string })?.id;
      const content = (module as { content?: string })?.content;
      if (id === 'status' && typeof content === 'string' && !content.includes('{{passiveStates}}')) {
        return { ...module, content: `${content}\n{{passiveStates}}` };
      }
      return module;
    });
  }
  if (version < 17) {
    // 移除预填充开关：模块一律按自身 role 发送。字段已从 schema 删除，但 validateInplace 用 _.assign
    // 就地合并回原对象，旧键仍会残留在运行时对象里并被 deep watch 继续落盘，必须就地 delete 才清干净。
    delete migrated.prefillEnabled;
  }
  if (version < 18) {
    // 后台维护合并：判定与状态提取共用一次请求与节奏——间隔取原判定间隔（缺省 3），删除两个旧间隔字段。
    const oldInterval = migrated.autoJudgeInterval;
    migrated.maintenanceInterval =
      typeof oldInterval === 'number' && Number.isFinite(oldInterval) ? _.clamp(Math.round(oldInterval), 1, 50) : 3;
    delete migrated.autoJudgeInterval;
    delete migrated.passiveStateInterval;
    // 货架契约改为 {system,character} 双区对象：商店模块按新默认刷新（启停保留，custom 保留在末尾）
    rebuildShopDefaults(migrated);
  }
  if (version < 19) {
    // 预填充收尾：删「应答声明」——shop_ack 在上面的 rebuildShopDefaults 里是「未知 id 保留」的漏网鱼，
    // 必须在此统一剔除（rebuild 后执行，顺序不能换）；「思维链预填」→「思维链起手」：exact-match
    //（内容 === 旧默认字面量才换文案并随改角色，用户自定义过的内容/角色不动），名称只按旧默认名改；
    // 新文案取自当前 DEFAULT（单一事实源，迁移终态零漂移）。
    const OLD_PREFILL_CONTENT: Record<string, string> = {
      gen_prefill: '收到，开始梳理剧情与任务方向。\n\n<thinking>\n',
      shop_prefill: '收到，开始梳理货架方向。\n\n<thinking>\n',
    };
    const newContentById = new Map(
      [...DEFAULT_PROMPT_MODULES, ...DEFAULT_SHOP_MODULES].map(mod => [mod.id, mod.content]),
    );
    const fixPrefillModules = (modules: unknown[]): unknown[] =>
      modules
        .filter(mod => {
          const id = (mod as { id?: string })?.id;
          return id !== 'gen_ack' && id !== 'shop_ack';
        })
        .map(mod => {
          const m = mod as { id?: string; name?: string; role?: string; content?: string };
          if (m.id !== 'gen_prefill' && m.id !== 'shop_prefill') return mod;
          const fixed = { ...m };
          if (fixed.name === '思维链预填') fixed.name = '思维链起手';
          if (fixed.content === OLD_PREFILL_CONTENT[fixed.id ?? '']) {
            fixed.content = newContentById.get(fixed.id!) ?? fixed.content;
            if (fixed.role === 'assistant') fixed.role = 'system';
          }
          return fixed;
        });
    if (Array.isArray(migrated.promptModules)) {
      migrated.promptModules = fixPrefillModules(migrated.promptModules);
    }
    if (Array.isArray(migrated.shopPromptModules)) {
      migrated.shopPromptModules = fixPrefillModules(migrated.shopPromptModules);
    }
    // 模板预设快照同步清理（同 choice v72 处理 prompt_configs 的动机）：漏掉的话「加载预设」
    // 会把 gen_ack/旧版 gen_prefill 原样复活回当前激活集
    const presets = migrated.promptTemplatePresets;
    if (typeof presets === 'object' && presets !== null) {
      for (const snapshot of Object.values(presets as Record<string, unknown>)) {
        if (typeof snapshot !== 'object' || snapshot === null) continue;
        const snap = snapshot as Record<string, unknown>;
        if (Array.isArray(snap.promptModules)) snap.promptModules = fixPrefillModules(snap.promptModules);
        if (Array.isArray(snap.shopPromptModules)) snap.shopPromptModules = fixPrefillModules(snap.shopPromptModules);
      }
    }
  }
  if (version < 20) {
    // 后台维护节奏改为每轮即时（判定与状态提取都每条 AI 回复执行，双开合并为一次请求）：
    // 间隔设置失去意义，字段删除；失败重试改由内存态退避冷却兜底。就地 delete 的原因同 v17。
    delete migrated.maintenanceInterval;
  }
  if (version < 22) {
    // 面板开合改为运行时状态（core/ui-state.ts），不再落盘；就地 delete 的原因同 v17。
    delete migrated.panelVisible;
  }
  return migrated;
}

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref(validateInplace(Settings, migrateSettings(_.get(extension_settings, setting_field))));
=======
import { setting_field, Settings } from '@/type/settings';
import { validateInplace } from '@/util/zod';
import { saveSettingsDebounced } from '@sillytavern/script';
import { extension_settings } from '@sillytavern/scripts/extensions';

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref(validateInplace(Settings, _.get(extension_settings, setting_field)));
>>>>>>> 83e6cc212575a48c19774faad97f3bcf4a3ca234

  watch(
    settings,
    new_settings => {
<<<<<<< HEAD
      new_settings.schema_version = SCHEMA_VERSION;
      _.set(extension_settings, setting_field, klona(new_settings));
=======
      _.set(extension_settings, setting_field, klona(new_settings)); // 用 klona 克隆对象从而去除 proxy 层
>>>>>>> 83e6cc212575a48c19774faad97f3bcf4a3ca234
      saveSettingsDebounced();
    },
    { deep: true },
  );
<<<<<<< HEAD

  return { settings };
=======
  return {
    settings,
  };
>>>>>>> 83e6cc212575a48c19774faad97f3bcf4a3ca234
});
