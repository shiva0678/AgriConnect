import { useState } from "react";
import { AnimatePresence, m } from "framer-motion";
import {
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { useMotionDrawer } from "../hooks/useMotionDrawer";
import { BrandMark } from "./SiteChrome";
import "./admin/AdminDashboard.css";

const navigation = [
  { to: "/admin", label: "Overview", icon: "⌂", end: true },
  { to: "/admin/analytics", label: "Analytics", icon: "⌁" },
  { to: "/admin/activity", label: "Recent activity", icon: "◷" },
  { to: "/admin/chat", label: "AI chatbot", icon: "✳" },
  { to: "/admin/users", label: "User management", icon: "◎" },
];

function getPageTitle(pathname) {
  if (pathname.startsWith("/admin/users/")) return "User details";
  if (pathname.startsWith("/admin/users")) return "User management";
  if (pathname.startsWith("/admin/analytics")) return "Platform analytics";
  if (pathname.startsWith("/admin/activity")) return "Recent activity";
  if (pathname.startsWith("/admin/chat")) return "AI chatbot";
  return "Dashboard overview";
}

function AdminLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { isMobile, panelRef, triggerRef } = useMotionDrawer(
    mobileOpen,
    setMobileOpen,
  );
  const pageTitle = getPageTitle(location.pathname);
  const displayName = user?.name || "Administrator";
  const initial = displayName.trim().charAt(0).toUpperCase() || "A";

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="admin-shell">
      <m.aside
        id="admin-navigation-drawer"
        ref={panelRef}
        className={`admin-sidebar${mobileOpen ? " is-open" : ""}`}
        initial={false}
        animate={{ x: isMobile && !mobileOpen ? -290 : 0 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
        aria-hidden={isMobile && !mobileOpen}
        inert={isMobile && !mobileOpen}
        role={isMobile ? "dialog" : undefined}
        aria-modal={isMobile && mobileOpen ? true : undefined}
        aria-label="Administrator navigation"
      >
        <div className="admin-sidebar__brand">
          <BrandMark />
          <span className="admin-brand-tag">CONTROL ROOM</span>
        </div>
        <div className="admin-profile">
          <span className="admin-profile__avatar" aria-hidden="true">{initial}</span>
          <span className="admin-profile__details">
            <strong>{displayName}</strong>
            <small>Authorized administrator</small>
          </span>
          <span className="admin-profile__status" aria-label="Account active" />
        </div>
        <nav className="admin-nav" aria-label="Dashboard sections">
          <span className="admin-nav__label">Workspace</span>
          {navigation.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `admin-nav__link${isActive ? " is-active" : ""}`
              }
            >
              <span className="admin-nav__icon" aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
              {item.end && <span className="admin-nav__live">LIVE</span>}
            </NavLink>
          ))}
        </nav>
        <div className="admin-sidebar__footer">
          <span className="admin-sidebar__footer-mark" aria-hidden="true">✳</span>
          <div>
            <strong>AgriConnect</strong>
            <small>Platform operations</small>
          </div>
        </div>
      </m.aside>

      <AnimatePresence>
        {mobileOpen && (
          <m.button
            type="button"
            className="admin-overlay"
            aria-label="Close navigation"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMobileOpen(false)}
          />
        )}
      </AnimatePresence>

      <div className="admin-main">
        <header className="admin-topbar">
          <button
            className="admin-menu-button"
            type="button"
            aria-label="Open navigation"
            aria-expanded={mobileOpen}
            aria-controls="admin-navigation-drawer"
            ref={triggerRef}
            onClick={() => setMobileOpen(true)}
          >
            <span />
            <span />
            <span />
          </button>
          <div className="admin-topbar__title">
            <span className="admin-topbar__kicker">ADMINISTRATION / PLATFORM</span>
            <h1>{pageTitle}</h1>
          </div>
          <div className="admin-topbar__actions">
            <span className="admin-live-indicator">
              <i aria-hidden="true" />
              Live platform data
            </span>
            <div className="admin-topbar__identity">
              <span className="admin-profile__avatar" aria-hidden="true">{initial}</span>
              <span>
                <strong>{displayName}</strong>
                <small>Administrator</small>
              </span>
            </div>
            <button className="admin-logout" type="button" onClick={handleLogout}>
              Log out <span aria-hidden="true">↗</span>
            </button>
          </div>
        </header>
        <main className="admin-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default AdminLayout;
