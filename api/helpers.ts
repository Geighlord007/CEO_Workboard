/** 服务端通用日期小工具（本地时区，YYYY-MM-DD） */
export const pad2 = (n: number) => String(n).padStart(2, "0");

export function dayFmt(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** 所在周的周一 */
export function mondayOf(d: Date): Date {
  const x = new Date(d);
  const wd = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - wd);
  return x;
}

export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
