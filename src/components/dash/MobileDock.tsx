import { Link, useLocation } from "react-router";
import { ArrowUp, LayoutGrid, UsersRound } from "lucide-react";

/**
 * 底部应用 Dock（仅手机显示）
 * 看板 / CRM 两处主场景 + 置顶，玻璃拟态悬浮胶囊，App 感十足
 */
export function MobileDock() {
  const { pathname } = useLocation();
  const isCrm = pathname.startsWith("/crm");
  return (
    <nav className="nx-dock" aria-label="底部导航">
      <Link
        to="/"
        className={`nx-item${isCrm ? "" : " is-active"}`}
        aria-label="看板"
      >
        <span className="nx-item-ico">
          <LayoutGrid size={15} strokeWidth={2.2} />
        </span>
        <span className="nx-item-lbl">看板</span>
      </Link>
      <Link
        to="/crm"
        className={`nx-item${isCrm ? " is-active" : ""}`}
        aria-label="CRM 关系管理"
      >
        <span className="nx-item-ico">
          <UsersRound size={15} strokeWidth={2.2} />
        </span>
        <span className="nx-item-lbl">CRM</span>
      </Link>
      <button
        type="button"
        className="nx-item"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        aria-label="回到顶部"
      >
        <span className="nx-item-ico">
          <ArrowUp size={15} strokeWidth={2.2} />
        </span>
        <span className="nx-item-lbl">置顶</span>
      </button>
    </nav>
  );
}
