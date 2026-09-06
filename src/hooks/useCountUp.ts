import { useEffect, useRef, useState } from "react";

const prefersReduced = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** 克制的数字滚动动画（缓出 cubic，尊重 prefers-reduced-motion） */
export function useCountUp(target: number, duration = 700): number {
  const [value, setValue] = useState(0);
  const prevTarget = useRef(0);

  useEffect(() => {
    if (prefersReduced()) {
      setValue(target);
      prevTarget.current = target;
      return;
    }
    const from = prevTarget.current;
    prevTarget.current = target;
    if (from === target) {
      setValue(target);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const e = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(from + (target - from) * e));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return value;
}
