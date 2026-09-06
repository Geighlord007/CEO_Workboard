import { useEffect, useState } from "react";

const QUERY = "(max-width: 1150px), (max-height: 730px)";

/** 视口宽 <1150px 或高 <730px 时为堆叠（单列滚动）模式 */
export function useStacked(): boolean {
  const [stacked, setStacked] = useState(
    () => typeof window !== "undefined" && window.matchMedia(QUERY).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const on = () => setStacked(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return stacked;
}
