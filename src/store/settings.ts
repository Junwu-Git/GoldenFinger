<<<<<<< HEAD
import { saveSettingsDebounced } from '@sillytavern/script';
import { extension_settings } from '@sillytavern/scripts/extensions';
import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { DEFAULT_PROMPT_MODULES, SCHEMA_VERSION, Settings, setting_field } from '@/type/settings';
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
 */
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
>>>>>>> 4121a8d9abe908f3b0a6a37322b05eef37e5cadc

  watch(
    settings,
    new_settings => {
<<<<<<< HEAD
      new_settings.schema_version = SCHEMA_VERSION;
      _.set(extension_settings, setting_field, klona(new_settings));
=======
      _.set(extension_settings, setting_field, klona(new_settings)); // 用 klona 克隆对象从而去除 proxy 层
>>>>>>> 4121a8d9abe908f3b0a6a37322b05eef37e5cadc
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
>>>>>>> 4121a8d9abe908f3b0a6a37322b05eef37e5cadc
});
