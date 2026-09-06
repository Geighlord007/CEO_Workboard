import { useRef, type ReactNode } from "react";
import { CARD_DEFS, type CardId, type Span } from "./layout";

type Props = {
  id: CardId;
  /** 弹入序号（依次弹入动画延迟） */
  index: number;
  span: Span;
  stacked: boolean;
  onSpan: (id: CardId, span: Span) => void;
  onReset: (id: CardId) => void;
  /** 标题右侧的额外控件 */
  right?: ReactNode;
  children: ReactNode;
  bodyStyle?: React.CSSProperties;
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(Math.max(v, lo), hi);

/**
 * 卡片框架：标题栏 + 点阵缩放把手。
 * 拖动把手横向按十二列吸附、纵向按基础行高吸附；
 * CSS grid dense flow 会让其他卡片自动重排。双击把手恢复默认尺寸。
 */
export function Card({
  id,
  index,
  span,
  stacked,
  onSpan,
  onReset,
  right,
  children,
  bodyStyle,
}: Props) {
  const ref = useRef<HTMLElement>(null);
  const def = CARD_DEFS[id];

  const onGripDown = (e: React.PointerEvent) => {
    if (stacked) return;
    e.preventDefault();
    e.stopPropagation();
    const card = ref.current;
    const grid = card?.parentElement;
    if (!card || !grid) return;

    const cs = getComputedStyle(grid);
    const gap = parseFloat(cs.columnGap) || 12;
    const rowH = parseFloat(cs.gridAutoRows) || 84;
    const colPitch = (grid.clientWidth + gap) / 12; // 列距（含 gap）
    const rowPitch = rowH + gap; // 行距（含 gap）

    const startX = e.clientX;
    const startY = e.clientY;
    const start = { ...span };
    card.classList.add("resizing");

    const move = (ev: PointerEvent) => {
      const dw = Math.round((ev.clientX - startX) / colPitch);
      const dh = Math.round((ev.clientY - startY) / rowPitch);
      const w = clamp(start.w + dw, def.minW, 12);
      const h = clamp(start.h + dh, def.minH, 10);
      if (w !== span.w || h !== span.h) onSpan(id, { w, h });
    };
    const up = () => {
      card.classList.remove("resizing");
      window.removeEventListener("pointermove", move);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  };

  return (
    <section
      ref={ref}
      className="ncard n-pop"
      style={{
        gridColumn: `span ${span.w}`,
        gridRow: `span ${span.h}`,
        animationDelay: `${index * 45}ms`,
      }}
      aria-label={def.title}
    >
      <header className="ncard-head">
        <span className="nlabel">
          <span className="nlabel-accent" aria-hidden>
            ●&nbsp;
          </span>
          {def.title}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {right}
        </span>
      </header>
      <div className="ncard-body" style={bodyStyle}>
        {children}
      </div>
      {!stacked && (
        <div
          className="n-grip"
          title="拖动缩放 · 双击恢复默认"
          onPointerDown={onGripDown}
          onDoubleClick={() => onReset(id)}
        >
          {Array.from({ length: 9 }).map((_, i) => (
            <i key={i} />
          ))}
        </div>
      )}
    </section>
  );
}
