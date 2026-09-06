/* ============================================================================
 * 每周任务控制台 · 示例种子数据（原 DATA 配置区的全栈对应物）
 * ----------------------------------------------------------------------------
 * 所有数据均为脱敏示例：客户/供应商用代号，金额为示意。
 * 日期全部相对"今天"生成，任何时候运行种子，看板演示效果都完整。
 * 上线后直接在网页里增删改即可，无需改这里；想重置示例数据可清空表后重跑：
 *   npx tsx db/seed.ts
 * ==========================================================================*/
import { randomUUID } from "node:crypto";
import { getDb } from "../api/queries/connection";
import {
  tasks,
  events,
  milestones,
  notes,
  risks,
  deals,
  links,
  activity,
  settings,
} from "./schema";

/* ---------- 日期工具（本地时区，格式 YYYY-MM-DD） ---------- */
const pad = (n: number) => String(n).padStart(2, "0");
const fmt = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
/** 本周周一 */
const mondayOf = (d: Date) => {
  const x = new Date(d);
  const wd = (x.getDay() + 6) % 7; // 周一=0
  x.setDate(x.getDate() - wd);
  return x;
};
const TODAY = new Date();
const MON = mondayOf(TODAY); // 本周周一
const NEXT_MON = addDays(MON, 7); // 下周周一
const MON_S = fmt(MON);
const NEXT_MON_S = fmt(NEXT_MON);
/** 今天距周一过了几天（0-6） */
const DAYS_SINCE_MON = Math.round(
  (TODAY.getTime() - MON.getTime()) / 86400000,
);

/* ---------- 可复现伪随机（种子固定，演示数据稳定） ---------- */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260901);
const pick = <T>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];

/* ---------- 历史任务标题池（按业务线，热力图/趋势图的数据来源） ---------- */
const HISTORY_POOL: Record<string, string[]> = {
  bd: [
    "BD 线索跟进与纪要回传",
    "客户拜访并输出拜访报告",
    "渠道伙伴电话沟通",
    "更新 CRM 商机阶段",
    "报价单制作与内部审批",
    "行业展会线索整理",
  ],
  research: [
    "竞品动态周报",
    "行业政策扫描与摘要",
    "分子公司经营数据整理",
    "市场规模测算模型更新",
    "专家访谈纪要与洞察提炼",
    "细分市场资料搜集",
  ],
  supplier: [
    "供应商交付进度跟进",
    "比价表更新与谈判",
    "来料质量问题闭环跟进",
    "供应商记分卡维护",
    "备选供应商背调",
  ],
  ceo: [
    "老板日程与会务安排",
    "经营分析数据核对",
    "会议纪要并追踪待办",
    "跨部门协调推进专项",
    "投资人/董事会材料支持",
  ],
};

async function seed() {
  const db = getDb();
  console.log("检查现有数据…");
  const existing = await db.select({ id: tasks.id }).from(tasks).limit(1);
  if (existing.length > 0) {
    console.log("已有数据，跳过种子（如需重置请先清空业务表）。");
    process.exit(0);
  }
  console.log("写入示例数据…");

  /* ============ 1. 关键节点（倒计时） ============ */
  await db.insert(milestones).values([
    { title: "XX 项目投标截止", startDate: fmt(addDays(TODAY, -12)), targetDate: fmt(addDays(TODAY, 9)) },
    { title: "Q3 董事会", startDate: fmt(addDays(TODAY, -24)), targetDate: fmt(addDays(TODAY, 18)) },
    { title: "供应商首批交付", startDate: fmt(addDays(TODAY, -5)), targetDate: fmt(addDays(TODAY, 26)) },
  ]);

  /* ============ 2. 历史完成任务（最近 12 周，驱动热力图与趋势线） ============ */
  const history: (typeof tasks.$inferInsert)[] = [];
  for (let back = 83; back >= 1; back--) {
    const day = addDays(TODAY, -back);
    // 本周的历史由下方"本周任务"精心编排，跳过避免混入随机标题
    if (mondayOf(day).getTime() === MON.getTime()) continue;
    const wd = (day.getDay() + 6) % 7; // 0=周一
    // 工作日完成 0-5 项（加权），周末大概率 0，偶尔 1
    let n = 0;
    const r = rnd();
    if (wd <= 4) {
      n = r < 0.12 ? 0 : r < 0.3 ? 1 : r < 0.55 ? 2 : r < 0.78 ? 3 : r < 0.93 ? 4 : 5;
    } else {
      n = r < 0.82 ? 0 : 1;
    }
    for (let i = 0; i < n; i++) {
      const track = pick(["bd", "research", "supplier", "ceo"] as const);
      const doneAt = new Date(day);
      doneAt.setHours(10 + Math.floor(rnd() * 10), Math.floor(rnd() * 59), 0, 0);
      history.push({
        title: pick(HISTORY_POOL[track]),
        track,
        priority: Math.floor(rnd() * 3),
        done: true,
        completedAt: doneAt,
        completedDay: fmt(day),
        weekOf: fmt(mondayOf(day)),
      });
    }
  }
  for (let i = 0; i < history.length; i += 50) {
    await db.insert(tasks).values(history.slice(i, i + 50));
  }

  /* ============ 3. 本周任务（部分已完成） ============ */
  const doneDay = (i: number) =>
    fmt(addDays(MON, Math.min(i, Math.max(DAYS_SINCE_MON, 0))));
  const mkDone = (t: (typeof tasks.$inferInsert), i: number) => {
    const d = addDays(MON, Math.min(i, Math.max(DAYS_SINCE_MON, 0)));
    d.setHours(17, 30, 0, 0);
    return { ...t, done: true, completedAt: d, completedDay: doneDay(i) };
  };
  await db.insert(tasks).values([
    // —— BD 拓展 ——
    { title: "华东智造客户 A：二轮方案纪要回传并发正式报价", track: "bd", priority: 0, dueDate: fmt(addDays(TODAY, 1)), link: "https://docs.google.com/document/d/demo-bd-a", weekOf: MON_S, sortOrder: 1 },
    mkDone({ title: "跟进华南电子客户 B 合同流程（法务用印）", track: "bd", priority: 1, weekOf: MON_S, sortOrder: 2 }, 0),
    { title: "梳理 Q3 渠道伙伴名单（30 家）并按意向分级", track: "bd", priority: 1, dueDate: fmt(addDays(TODAY, 3)), weekOf: MON_S, sortOrder: 3 },
    { title: "安排下周深圳客户拜访行程（2 家）", track: "bd", priority: 2, weekOf: MON_S, sortOrder: 4 },
    // —— 战略与市场调研 ——
    { title: "完成竞品 X 定价策略拆解（10 页以内）", track: "research", priority: 0, dueDate: fmt(addDays(TODAY, 2)), link: "https://docs.google.com/presentation/d/demo-comp-x", weekOf: MON_S, sortOrder: 11 },
    mkDone({ title: "行业月报：8 月市场规模与政策动态", track: "research", priority: 1, weekOf: MON_S, sortOrder: 12 }, 1),
    mkDone({ title: "整理 3 位渠道商访谈纪要", track: "research", priority: 2, weekOf: MON_S, sortOrder: 13 }, 1),
    { title: "分子公司人效数据核对（与财务对齐口径）", track: "research", priority: 1, dueDate: fmt(addDays(TODAY, 4)), weekOf: MON_S, sortOrder: 14 },
    // —— 供应商协调 ——
    { title: "供应商 S 二供打样确认 + 更新比价表", track: "supplier", priority: 0, dueDate: fmt(addDays(TODAY, 1)), link: "https://docs.google.com/spreadsheets/d/demo-sup-s", weekOf: MON_S, sortOrder: 21 },
    mkDone({ title: "供应商 K 交付延期风险沟通会", track: "supplier", priority: 1, weekOf: MON_S, sortOrder: 22 }, 2),
    { title: "更新供应商记分卡（质量 / 交期 / 价格）", track: "supplier", priority: 2, weekOf: MON_S, sortOrder: 23 },
    // —— CEO 支持 ——
    { title: "董事会材料：Q3 经营分析初稿（加华南毛利拆解页）", track: "ceo", priority: 0, dueDate: fmt(addDays(TODAY, 6)), link: "https://docs.google.com/presentation/d/demo-board-q3", weekOf: MON_S, sortOrder: 31 },
    mkDone({ title: "老板下周出差行程与会务安排", track: "ceo", priority: 1, weekOf: MON_S, sortOrder: 32 }, 0),
    { title: "回复投资人月度问答邮件", track: "ceo", priority: 2, dueDate: fmt(addDays(TODAY, 2)), weekOf: MON_S, sortOrder: 33 },
    // —— 下周计划 ——
    { title: "深圳客户拜访（2 家）并输出拜访报告", track: "bd", priority: 1, weekOf: NEXT_MON_S, sortOrder: 1 },
    { title: "竞品 X 拆解终稿评审（内部）", track: "research", priority: 1, weekOf: NEXT_MON_S, sortOrder: 2 },
    { title: "供应商 S：小批量试产启动会", track: "supplier", priority: 0, weekOf: NEXT_MON_S, sortOrder: 3 },
    { title: "董事会预演（内部试讲 + 计时）", track: "ceo", priority: 0, weekOf: NEXT_MON_S, sortOrder: 4 },
  ]);

  /* ============ 4. 日历事项（会议/里程碑/截止日/出差） ============ */
  const ev: (typeof events.$inferInsert)[] = [];
  const D = (offset: number) => fmt(addDays(MON, offset));
  const M = (h: number, m = 0) => h * 60 + m;
  // 周一
  ev.push(
    { date: D(0), title: "周例会 · 各部门对齐", kind: "meeting", startMin: M(9, 30), endMin: M(10), location: "3F 会议室 A" },
    { date: D(0), title: "供应商 K 交付风险沟通", kind: "meeting", startMin: M(14), endMin: M(15), location: "线上 · 腾讯会议" },
  );
  // 周二
  ev.push(
    { date: D(1), title: "客户 A 二轮方案评审", kind: "meeting", startMin: M(10), endMin: M(11, 30), location: "2F 洽谈室" },
    { date: D(1), title: "竞品调研中期同步", kind: "meeting", startMin: M(16), endMin: M(17), location: "线上" },
  );
  // 周三
  ev.push(
    { date: D(2), title: "晨会 · 今日重点", kind: "meeting", startMin: M(9, 30), endMin: M(10), location: "3F 会议室 A" },
    { date: D(2), title: "董事会材料工作坊", kind: "meeting", startMin: M(13, 30), endMin: M(15), location: "3F 会议室 B" },
    { date: D(2), title: "海外渠道伙伴时差会", kind: "meeting", startMin: M(20), endMin: M(21), location: "线上 · Zoom" },
  );
  // 周四
  ev.push(
    { date: D(3), title: "法务合同用印跟进", kind: "meeting", startMin: M(11), endMin: M(12), location: "法务部" },
    { date: D(3), title: "供应商 S 打样评审", kind: "meeting", startMin: M(15), endMin: M(16, 30), location: "S 厂 · 东莞" },
  );
  // 周五
  ev.push(
    { date: D(4), title: "晨会 · 今日重点", kind: "meeting", startMin: M(9, 30), endMin: M(10), location: "3F 会议室 A" },
    { date: D(4), title: "Q3 经营分析数据核对", kind: "meeting", startMin: M(14), endMin: M(15, 30), location: "财务室" },
    { date: D(4), title: "本周复盘 · 给老板的一周小结", kind: "meeting", startMin: M(17), endMin: M(17, 30), location: "老板办公室" },
  );
  // 关键节点同步进日历（红点）
  ev.push(
    { date: fmt(addDays(TODAY, 9)), title: "XX 项目投标截止", kind: "deadline" },
    { date: fmt(addDays(TODAY, 18)), title: "Q3 董事会", kind: "milestone", startMin: M(14), endMin: M(16), location: "3F 大会议室" },
    { date: fmt(addDays(TODAY, 26)), title: "供应商首批交付", kind: "deadline" },
  );
  // 下周出差
  ev.push(
    { date: fmt(addDays(NEXT_MON, 1)), title: "深圳客户拜访（出差 D1）", kind: "trip", location: "深圳" },
    { date: fmt(addDays(NEXT_MON, 2)), title: "深圳客户拜访（出差 D2）", kind: "trip", location: "深圳" },
  );
  // 保证"今天"至少有日程可演示
  const todayStr = fmt(TODAY);
  if (!ev.some((e) => e.date === todayStr)) {
    ev.push(
      { date: todayStr, title: "晨会 · 今日重点对齐", kind: "meeting", startMin: M(9, 30), endMin: M(10), location: "3F 会议室 A" },
      { date: todayStr, title: "跨部门项目同步会", kind: "meeting", startMin: M(14), endMin: M(15), location: "线上 · 腾讯会议" },
      { date: todayStr, title: "BD 线索复盘", kind: "meeting", startMin: M(19, 30), endMin: M(20), location: "线上" },
    );
  }
  await db.insert(events).values(ev);

  /* ============ 5. 便签 ============ */
  await db.insert(notes).values([
    { content: "老板临时交代：董事会材料加一页华南区毛利拆解，周三前要。", sortOrder: 1 },
    { content: "给供应商 K 的新报价单用 8 月版模板，别发旧版。", sortOrder: 2 },
    { content: "竞品 X 拆解稿定稿后同步到 Drive「战略调研」文件夹。", sortOrder: 3 },
    { content: "周五下班前给客户 A 项目负责人回电话。", sortOrder: 4 },
  ]);

  /* ============ 6. 风险与阻塞 ============ */
  await db.insert(risks).values([
    { title: "供应商 K 首批交付或延期 2 周", detail: "模具进度落后；备选供应商 S 产能尚未书面确认。", needFrom: "老板出面与 K 高层通话", level: "high" },
    { title: "竞品数据采购合规待确认", detail: "第三方数据源授权范围未覆盖商用场景。", needFrom: "法务", level: "mid" },
    { title: "董事会材料数据口径未统一", detail: "财务与业务线的毛利口径不一致，影响经营分析页。", needFrom: "财务负责人", level: "mid" },
    { title: "周三会议室预订冲突", detail: "已与行政协调换到 3F 会议室 B。", needFrom: "行政", level: "low", resolved: true },
  ]);

  /* ============ 7. BD pipeline（客户代号脱敏） ============ */
  await db.insert(deals).values([
    { name: "华北 · 新能源 D", stage: "contact", note: "展会结识，待首访", sortOrder: 1 },
    { name: "西南 · 食品 E", stage: "contact", note: "渠道转介绍", sortOrder: 2 },
    { name: "华东 · 智造 A", stage: "proposal", note: "二轮方案已讲，等反馈", sortOrder: 3 },
    { name: "华南 · 电子 B", stage: "proposal", note: "方案微调中", sortOrder: 4 },
    { name: "华中 · 物流 C", stage: "quote", note: "报价已发，催决策", sortOrder: 5 },
    { name: "华东 · 零售 F", stage: "won", note: "年框已签，交付启动", sortOrder: 6 },
  ]);

  /* ============ 8. 快捷入口 ============ */
  await db.insert(links).values([
    { label: "Slack", url: "https://app.slack.com", sortOrder: 1 },
    { label: "Gmail", url: "https://mail.google.com", sortOrder: 2 },
    { label: "Drive", url: "https://drive.google.com", sortOrder: 3 },
    { label: "Calendar", url: "https://calendar.google.com", sortOrder: 4 },
    { label: "Docs", url: "https://docs.google.com", sortOrder: 5 },
  ]);

  /* ============ 9. 近 14 天收工时间（散点图数据，分钟） ============ */
  const offRows: (typeof activity.$inferInsert)[] = [];
  for (let back = 13; back >= 0; back--) {
    const day = addDays(TODAY, -back);
    const wd = (day.getDay() + 6) % 7;
    if (wd >= 5) continue; // 周末不记
    // 平日 18:10 - 23:40 之间，越靠近今天越晚（最近冲刺期）
    const base = 18 * 60 + 10 + Math.floor(rnd() * 240);
    const crunch = back <= 4 ? 40 + Math.floor(rnd() * 60) : 0;
    offRows.push({ day: fmt(day), offworkMin: Math.min(base + crunch, 23 * 60 + 59) });
  }
  await db.insert(activity).values(offRows);

  /* ============ 10. 老板周报只读链接的分享令牌 ============ */
  await db.insert(settings).values({ k: "shareToken", v: randomUUID() });

  console.log(`完成：历史任务 ${history.length} 条、本周/下周任务 18 条、日历事项 ${ev.length} 条。`);
  process.exit(0);
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
