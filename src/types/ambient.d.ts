/**
 * 环境类型补充声明。
 *
 * 为什么放在这里而不是依赖 auto-imports.d.ts：auto-imports.d.ts 是 unplugin 生成物，
 * 其中的全局 `const t` 只对 <script> 生效；Vue 模板里的标识符按「组件实例属性」查找，
 * 因此必须通过 ComponentCustomProperties 增强让模板拿到 t 的类型。
 */
declare module 'vue' {
  interface ComponentCustomProperties {
    /** 酒馆全局翻译函数，签名见 SillyTavern/public/scripts/i18n.js 的 export function t */
    t: (typeof import('@sillytavern/scripts/i18n'))['t'];
  }
}

declare global {
  interface Window {
    /**
     * 酒馆主页面注入的稳定接口。仅声明扩展实际用到的最小面：
     * 完整接口见 SillyTavern/public/scripts/st-context.js（酒馆源码，非 npm 包）。
     * 字段保留可选——调用点已用 ?. 兜底，运行时缺 getContext 不应抛类型错误。
     */
    SillyTavern?: {
      getContext?: () => any;
    };
  }

  /**
   * ST 原生楼层消息（SillyTavern/public/script.js 中 chat[] 的元素）。
   * 从 @sillytavern/script 导入的 chat[] 元素类型是推断出的子集，
   * 访问 mes/is_user/is_system 等字段时用本类型断言，不要凭推断类型猜字段名。
   */
  type StChatMessage = {
    name?: string;
    /** 楼层正文 */
    mes?: string;
    send_date?: string | number | Date;
    is_user?: boolean;
    is_system?: boolean;
    swipes?: string[];
    swipe_id?: number;
    extra?: Record<string, any>;
  };
}

export {};
