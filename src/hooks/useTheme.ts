import { useCallback, useEffect, useState } from "react";

export type Theme = "dark" | "light";
const KEY = "wtc-theme";

function readTheme(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    return t === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

function apply(t: Theme) {
  document.documentElement.dataset.theme = t;
  // 同步 shadcn 暗色类，登录页等脚手架组件也跟随主题
  document.documentElement.classList.toggle("dark", t === "dark");
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* ignore */
  }
}

/** 深浅主题：右上角胶囊按钮或 T 键切换，选择存入 localStorage */
export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(readTheme);

  useEffect(() => apply(theme), [theme]);

  const toggle = useCallback(() => {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }, []);

  // T 键快捷切换（输入框内不触发）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "t" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable)
      )
        return;
      toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  return [theme, toggle];
}
