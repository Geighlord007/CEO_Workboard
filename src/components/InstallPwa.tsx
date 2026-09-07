import { useEffect, useState } from "react";

/**
 * PWA 安装引导（仅手机、非独立运行模式显示）
 *  - 浏览器抛 beforeinstallprompt → 直接唤起系统安装弹窗
 *  - 不支持的浏览器 → 内联提示菜单操作步骤
 *  - 已安装 / 已关闭 → 不再打扰（记忆在 localStorage）
 */

const KEY = "wtc-install-closed";

declare global {
  interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
  }
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
    appinstalled: Event;
  }
}

export function InstallPwa() {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(KEY) === "1";
    } catch {
      return false;
    }
  });
  const [installed, setInstalled] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [manual, setManual] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 760px)");
    const upd = () => setIsMobile(mq.matches);
    upd();
    mq.addEventListener("change", upd);
    return () => mq.removeEventListener("change", upd);
  }, []);

  useEffect(() => {
    const sm =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as { standalone?: boolean }).standalone === true;
    setStandalone(sm);
  }, []);

  useEffect(() => {
    const onBip = (e: BeforeInstallPromptEvent) => {
      e.preventDefault();
      setEvt(e);
    };
    const onInst = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onBip);
    window.addEventListener("appinstalled", onInst);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      window.removeEventListener("appinstalled", onInst);
    };
  }, []);

  const install = async () => {
    if (evt) {
      const e = evt;
      setEvt(null);
      try {
        await e.prompt();
      } catch {
        setManual(true);
      }
    } else {
      setManual(true);
    }
  };

  const close = () => {
    setDismissed(true);
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
  };

  const show = isMobile && !standalone && !installed && !dismissed;
  if (!show) return null;

  return (
    <div className="nx-install" role="note">
      <span className="nx-install-txt">
        {manual ? (
          <>
            打开浏览器右上角 <b>菜单</b> → <b>安装应用 / 添加到主屏幕</b>，即可像 App 一样使用
          </>
        ) : (
          <>
            把 <b>WTC</b> 装到手机桌面 · 全屏霓虹 + 离线可用
          </>
        )}
      </span>
      <button
        className="nbtn nbtn-accent"
        onClick={manual ? close : install}
        style={{ flex: "none", padding: "6px 14px", fontSize: 11 }}
      >
        {manual ? "知道了" : "安装"}
      </button>
      <button
        className="nicon"
        onClick={close}
        aria-label="关闭提示"
        style={{ flex: "none", fontSize: 15, lineHeight: 1, padding: "4px 7px" }}
      >
        ×
      </button>
    </div>
  );
}
