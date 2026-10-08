/** 本地日期字符串 YYYY-MM-DD（按自然日判定每日签到） */
export function todayDateStr(date = new Date()): string {
  return formatDate(date);
}

/** 相对今天的偏移日（days 可为负=昨天）的本地日期字符串 */
export function dateStrOffset(days: number, date = new Date()): string {
  const shifted = new Date(date);
  shifted.setDate(shifted.getDate() + days);
  return formatDate(shifted);
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
