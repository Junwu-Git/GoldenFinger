import toastr from 'toastr';
import { generateRaw } from '@sillytavern/script';
import { useSettingsStore } from '@/store/settings';
import type { ApiSettings } from '@/type/settings';

/** 与酒馆 generate 端点对接的消息格式：system/user/assistant 三态分离，
 *  不拼成单段字符串塞进单条消息，遵循「提示词组装走角色结构」的约束。 */
export type ChatMsg = { role: 'system' | 'user' | 'assistant'; content: string };

const GENERATE_URL = '/api/backends/chat-completions/generate';

/** 规范化 OpenAI 兼容 API 地址，交给酒馆后端作为 base，酒馆后端总会再拼一次 /chat/completions。
 *  1) 去尾部斜杠；2) 剥尾部 /chat/completions（用户填完整端点时防双拼）；
 *  3) 已有路径段（如 /v2、/v1beta/openai）则尊重所填；4) 仅裸域名补 OpenAI 默认 /v1。 */
export function normalizeApiUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) {
    return trimmed;
  }
  let clean = trimmed.replace(/\/+$/, '');
  clean = clean.replace(/\/chat\/completions$/i, '').replace(/\/+$/, '');
  const hasPath = /^[a-z][a-z0-9+.-]*:\/\/[^/]+(\/.+)$/i.test(clean);
  return hasPath ? clean : `${clean}/v1`;
}

/** 副 API 直连酒馆 generate 端点（chat_completion_source: openai + reverse_proxy）。
 *  附带 tool_choice:"none"：酒馆助手类前端脚本会 patch window.fetch 拦截 generate
 *  请求并注入工具调用指令，该字段是这类脚本 callerControlsTools 的设计内绕过信号
 *  （本扩展只要纯文本任务 JSON，不要工具调用）；无脚本启用时该字段对上游惰性。 */
async function callSecondaryApi(messages: ChatMsg[], api: ApiSettings): Promise<string> {
  const context = window.SillyTavern?.getContext?.();
  const resp = await fetch(GENERATE_URL, {
    method: 'POST',
    headers: context?.getRequestHeaders?.() ?? {},
    body: JSON.stringify({
      chat_completion_source: 'openai',
      reverse_proxy: normalizeApiUrl(api.url),
      proxy_password: api.key || '',
      model: api.model,
      messages,
      temperature: api.temperature,
      max_tokens: api.maxTokens,
      stream: false,
      tool_choice: 'none',
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`API 请求失败 (${resp.status}): ${text.slice(0, 300)}`);
  }

  const data = await resp.json();
  if (data?.error) {
    throw new Error(data.error.message || 'API 返回错误');
  }
  return data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? '';
}

export interface ApiRequest {
  messages: ChatMsg[];
  /** 走主 API（酒馆当前连接）时的回复长度上限 */
  mainResponseLength: number;
}

/** 统一任务生成入口：主 API 走 generateRaw（自动带酒馆连接与预设），
 *  副 API 直连自定义 OpenAI 兼容端点。两路都返回纯文本。 */
export async function requestTaskCompletion({ messages, mainResponseLength }: ApiRequest): Promise<string> {
  const { api } = useSettingsStore().settings;

  if (api.mode !== 'secondary') {
    if (!messages.some(m => m.role === 'user')) {
      throw new Error('任务提示词缺少 user 消息');
    }
    // 主 API 把完整 messages 数组作为 prompt 交给酒馆核心 generateRaw 发出（GenerateRawParams.prompt
    // 接受 string | object[]，createRawPrompt 逐条保留 role/content）。原实现只取首条 system + 末条 user
    // 压缩成单段 prompt，导致 gen_story 剧情摘要/gen_world/gen_state/契约/预填等中间消息全部丢失——
    // 聊天记录从未真正到达 AI。改为整段发出，与副 API 直连（messages 原样）语义一致。
    return await generateRaw({
      prompt: messages,
      trimNames: false,
      responseLength: mainResponseLength,
    });
  }

  if (!api.url.trim() || !api.model.trim()) {
    toastr.warning(t`请在扩展设置中填写副 API 地址与模型`, t`金手指系统`);
    throw new Error(t`副 API 未配置`);
  }
  return await callSecondaryApi(messages, api);
}
