import { z } from 'zod';

/** 候选顺序：裸区间 > 代码围栏 > 原文（多数模型会加前后缀或围栏） */
export function extractJsonCandidates(raw: string, bracket: '{' | '[' = '{'): string[] {
  const close = bracket === '{' ? '}' : ']';
  const trimmed = raw.trim();
  const candidates = [trimmed];
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    candidates.unshift(fenced[1].trim());
  }
  const start = trimmed.indexOf(bracket);
  const end = trimmed.lastIndexOf(close);
  if (start >= 0 && end > start) {
    candidates.unshift(trimmed.slice(start, end + 1));
  }
  return candidates;
}

/** 从 LLM 自由文本里抠 JSON 并按 schema 校验；全部候选失败返回 null（调用方决定报错方式） */
export function parseJsonFromText<T>(raw: string, schema: z.ZodType<T>, bracket: '{' | '[' = '{'): T | null {
  for (const candidate of extractJsonCandidates(raw, bracket)) {
    try {
      const result = schema.safeParse(JSON.parse(candidate));
      if (result.success) {
        return result.data;
      }
    } catch {
      // 尝试下一种提取方式
    }
  }
  return null;
}
