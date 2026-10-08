import { z } from 'zod';
import { SystemDef } from '@/type/game';
import type { SystemDef as SystemDefType } from '@/type/game';

/**
 * 系统定义的导入导出（分享）。
 * 导出：去掉 id 与 builtin——id 是内部唯一标识（内置系统是固定值、自定义是时间戳），分享给他人时无意义，
 *       内置标记也应随被分享的系统而定，统一交由导入端重建，避免误解。
 * 导入：按 SystemDef 契约校验后，强制生成新的 custom_ id、builtin 置 false（导入的都算自定义系统），
 *       与内置/已有自定义系统的 id 解耦，天然避免冲突，可随意改名、多次导入。
 */

/** 把一个系统的可分享定义序列化为缩进 JSON（去掉 id 与 builtin） */
export function serializeSystem(system: SystemDefType): string {
  const { id: _id, builtin: _builtin, ...portable } = system;
  return JSON.stringify(portable, null, 2);
}

/** 解析分享 JSON 为一个可直接推入 customSystems 的新系统定义（每次导入都是全新 custom 系统） */
export function deserializeSystem(text: string, existingSystems: SystemDefType[]): SystemDefType {
  const raw = JSON.parse(text) as unknown; // 语法错误在此抛出，由调用方兜底
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('不是有效的系统定义 JSON');
  }
  // 分享 JSON 已剥掉 id/builtin，而 SystemDef.id 必填无默认——按剥掉这两个字段后的契约校验，
  // 否则任何导出的系统（缺 id）都会在此失败，导不回来。
  const parsed = SystemDef.omit({ id: true, builtin: true }).safeParse(raw);
  if (!parsed.success) {
    throw new Error(z.prettifyError(parsed.error));
  }
  let id = `custom_${Date.now().toString(36)}`;
  const used = new Set(existingSystems.map(system => system.id));
  while (used.has(id)) {
    id = `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  }
  return { ...parsed.data, id, builtin: false };
}
