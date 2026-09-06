import { useCallback, useState } from "react";

/** 卡片尺寸（十二列网格单位：w=列数 1-12，h=基础行数） */
export type Span = { w: number; h: number };

export const CARD_ORDER = [
  "clock",
  "calendar",
  "schedule",
  "notes",
  "tasks",
  "battery",
  "trend",
  "offwork",
  "heatmap",
  "risks",
  "pipeline",
  "suppliers",
  "links",
] as const;

export type CardId = (typeof CARD_ORDER)[number];

export const CARD_DEFS: Record<
  CardId,
  { title: string; def: Span; minW: number; minH: number }
> = {
  clock: { title: "时钟 · 节点倒计时", def: { w: 3, h: 3 }, minW: 2, minH: 2 },
  calendar: { title: "月历 · 事项", def: { w: 3, h: 3 }, minW: 2, minH: 2 },
  schedule: { title: "今日日程", def: { w: 3, h: 3 }, minW: 2, minH: 2 },
  notes: { title: "备忘便签", def: { w: 3, h: 3 }, minW: 2, minH: 2 },
  tasks: { title: "本周任务", def: { w: 4, h: 3 }, minW: 3, minH: 2 },
  battery: { title: "本周完成率", def: { w: 2, h: 3 }, minW: 2, minH: 2 },
  trend: { title: "近 14 天完成趋势", def: { w: 3, h: 3 }, minW: 2, minH: 2 },
  offwork: { title: "近 14 天收工时间", def: { w: 3, h: 3 }, minW: 2, minH: 2 },
  heatmap: { title: "产出打卡热力图 · 12 周", def: { w: 12, h: 2 }, minW: 4, minH: 2 },
  risks: { title: "风险与阻塞", def: { w: 4, h: 2 }, minW: 3, minH: 2 },
  pipeline: { title: "客户推进", def: { w: 4, h: 3 }, minW: 3, minH: 2 },
  suppliers: { title: "供应商推进", def: { w: 4, h: 3 }, minW: 3, minH: 2 },
  links: { title: "快捷入口", def: { w: 4, h: 2 }, minW: 2, minH: 2 },
};

const KEY = "wtc-layout-v1";

type LayoutMap = Partial<Record<CardId, Span>>;

function load(): LayoutMap {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as LayoutMap) : {};
  } catch {
    return {};
  }
}

/** 自定义布局：span 覆盖存 localStorage，刷新后恢复 */
export function useLayout() {
  const [over, setOver] = useState<LayoutMap>(load);

  const spanOf = useCallback(
    (id: CardId): Span => over[id] ?? CARD_DEFS[id].def,
    [over],
  );

  const persist = (next: LayoutMap) => {
    setOver(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const setSpan = useCallback(
    (id: CardId, span: Span) => {
      setOver((prev) => {
        const next = { ...prev, [id]: span };
        try {
          localStorage.setItem(KEY, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
    },
    [],
  );

  const resetOne = useCallback((id: CardId) => {
    setOver((prev) => {
      const next = { ...prev };
      delete next[id];
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const resetAll = useCallback(() => persist({}), []);

  const isCustom = Object.keys(over).length > 0;

  return { spanOf, setSpan, resetOne, resetAll, isCustom };
}
