import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type TipContent = { title: string; lines?: string[] };

type TipApi = {
  show: (c: TipContent, x: number, y: number) => void;
  move: (x: number, y: number) => void;
  hide: () => void;
};

const TipCtx = createContext<TipApi | null>(null);

/** 反色跟随光标的信息标签（悬停图表数据点 / 热力图格子时使用） */
export function TooltipProvider({ children }: { children: ReactNode }) {
  const [st, setSt] = useState<{
    c: TipContent;
    x: number;
    y: number;
    vis: boolean;
  }>({ c: { title: "" }, x: 0, y: 0, vis: false });

  const api = useMemo<TipApi>(
    () => ({
      show: (c, x, y) => setSt({ c, x, y, vis: true }),
      move: (x, y) => setSt((s) => (s.vis ? { ...s, x, y } : s)),
      hide: () => setSt((s) => ({ ...s, vis: false })),
    }),
    [],
  );

  const W = 240;
  const left = Math.min(Math.max(st.x + 14, 4), window.innerWidth - W - 8);
  const top = Math.min(st.y + 16, window.innerHeight - 90);

  return (
    <TipCtx.Provider value={api}>
      {children}
      {st.vis && (
        <div className="n-tip" style={{ left, top }}>
          <div style={{ fontWeight: 600, letterSpacing: "0.12em" }}>
            {st.c.title}
          </div>
          {st.c.lines?.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}
    </TipCtx.Provider>
  );
}

export function useTip(): TipApi {
  const ctx = useContext(TipCtx);
  if (!ctx) {
    // 兜底：无 Provider 时给空调用，避免组件报错
    return { show: () => {}, move: () => {}, hide: () => {} };
  }
  return ctx;
}

/** 生成一组鼠标事件处理器，直接铺到元素上 */
export function useTipHandlers(content: TipContent) {
  const tip = useTip();
  const show = useCallback(
    (e: React.MouseEvent) => tip.show(content, e.clientX, e.clientY),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tip, JSON.stringify(content)],
  );
  return {
    onMouseEnter: show,
    onMouseMove: (e: React.MouseEvent) => tip.move(e.clientX, e.clientY),
    onMouseLeave: tip.hide,
  };
}
