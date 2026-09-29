/** 常用 OpenAI 兼容服务商预设：选预设自动填地址并给出示例模型（同 choice 的 api-presets 思路） */
export interface ApiPreset {
  name: string;
  baseUrl: string;
  models: string[];
}

export const API_PRESETS: ApiPreset[] = [
  { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com', models: ['deepseek-chat', 'deepseek-reasoner'] },
  { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', models: ['gpt-4o-mini', 'gpt-4.1-mini'] },
  { name: 'Moonshot', baseUrl: 'https://api.moonshot.cn/v1', models: ['moonshot-v1-8k', 'kimi-k2-0711-preview'] },
  { name: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', models: ['glm-4-flash', 'glm-4-plus'] },
  {
    name: '阿里云百炼',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: ['qwen-plus', 'qwen-turbo'],
  },
  {
    name: '硅基流动',
    baseUrl: 'https://api.siliconflow.cn/v1',
    models: ['deepseek-ai/DeepSeek-V3', 'Qwen/Qwen2.5-72B-Instruct'],
  },
  {
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: ['openai/gpt-4o-mini', 'anthropic/claude-3.5-haiku'],
  },
  { name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', models: ['llama-3.3-70b-versatile'] },
];

/** 按已保存地址反查服务商预设（匹配不到返回 null，UI 显示「自定义」） */
export function presetForApiUrl(url: string): ApiPreset | null {
  const clean = url.trim().replace(/\/+$/, '');
  if (!clean) {
    return null;
  }
  return API_PRESETS.find(preset => preset.baseUrl.replace(/\/+$/, '') === clean) ?? null;
}
