/** 前端日期工具：全部基于本地时区，日期字符串统一 YYYY-MM-DD */

export const pad2 = (n: number) => String(n).padStart(2, "0");

export function dayFmt(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** "YYYY-MM-DD" → 本地 Date（避免 new Date(str) 的 UTC 解析坑） */
export function parseDay(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** 所在周周一 */
export function mondayOf(d: Date): Date {
  const x = new Date(d);
  const wd = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - wd);
  return x;
}

export const todayStr = () => dayFmt(new Date());
export const thisMondayStr = () => dayFmt(mondayOf(new Date()));
export const nextMondayStr = () => dayFmt(addDays(mondayOf(new Date()), 7));

/** 两个日期串相差天数（b - a） */
export function diffDays(a: string, b: string): number {
  return Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / 86400000);
}

/** 分钟数 → "HH:MM" */
export function minToHHMM(m: number): string {
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
}

export const WEEKDAYS_CN = ["一", "二", "三", "四", "五", "六", "日"] as const;

/** ISO 周数 */
export function weekNo(d: Date): number {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (x.getUTCDay() + 6) % 7;
  x.setUTCDate(x.getUTCDate() - dayNum + 3);
  const firstThursday = x.getTime();
  x.setUTCMonth(0, 1);
  if (x.getUTCDay() !== 4) {
    x.setUTCMonth(0, 1 + ((4 - x.getUTCDay() + 7) % 7));
  }
  return 1 + Math.ceil((firstThursday - x.getTime()) / (7 * 86400000));
}
