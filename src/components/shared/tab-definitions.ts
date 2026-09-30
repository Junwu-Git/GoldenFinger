// 导航两级结构（照 choice 的 tab-definitions 模式）：一级页（导航栏胶囊）× 子区（页内分段控件）。
// 目前只有「配置」页有子区。提示词/世界书/正则三个子区编辑的是全局通用配置
// （extension_settings.golden_finger），不随绑定系统切换而变化，故独立成页而非并入系统。

/** 一级页 id（导航栏胶囊） */
export type PageId = 'home' | 'shop' | 'inventory' | 'log' | 'config' | 'settings';

/** 配置页子区 id */
export type ConfigTabId = 'prompt' | 'worldinfo' | 'regex';

interface PageDefinition {
  id: PageId;
  label: string;
  icon: string;
}

interface SubAreaDefinition {
  id: ConfigTabId;
  label: string;
  icon: string;
}

/** 一级页。顺序即展示顺序 */
export const PAGES: PageDefinition[] = [
  { id: 'home', label: t`首页`, icon: 'fa-solid fa-house' },
  { id: 'shop', label: t`商店`, icon: 'fa-solid fa-store' },
  { id: 'inventory', label: t`背包`, icon: 'fa-solid fa-box-open' },
  { id: 'log', label: t`日志`, icon: 'fa-solid fa-scroll' },
  { id: 'config', label: t`配置`, icon: 'fa-solid fa-sliders' },
  { id: 'settings', label: t`设置`, icon: 'fa-solid fa-gear' },
];

/** 配置页子区。顺序即展示顺序 */
export const CONFIG_SUB_TABS: SubAreaDefinition[] = [
  { id: 'prompt', label: t`提示词`, icon: 'fa-solid fa-pen-to-square' },
  { id: 'worldinfo', label: t`世界书`, icon: 'fa-solid fa-book' },
  { id: 'regex', label: t`正则`, icon: 'fa-solid fa-filter' },
];
