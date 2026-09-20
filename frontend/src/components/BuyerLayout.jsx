import { useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { BrandMark } from "./SiteChrome";
import { buyerProfile } from "../data/buyerMockData";

const navigation = [
  { to: "/buyer/dashboard", label: "Overview", icon: "⌂" },
  { to: "/buyer/marketplace", label: "Marketplace", icon: "⌕" },
  { to: "/buyer/orders", label: "My orders", icon: "◌", badge: "4" },
  { to: "/buyer/profile", label: "Profile", icon: "◎" },
];

function BuyerLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const current = navigation.find((item) =>
    location.pathname.startsWith(item.to),
  );
  const pageTitle = location.pathname.includes("/crop/")
    ? "Crop details"
    : current?.label || "Overview";

  return (
    <div className="farmer-shell buyer-shell">
      <aside className={`farmer-sidebar${mobileOpen ? " is-open" : ""}`}>
        <div className="farmer-sidebar__brand">
          <BrandMark />
        </div>
        <div className="farmer-sidebar__context">
          <span className="sidebar-kicker">Buyer workspace</span>
          <strong>{buyerProfile.company}</strong>
          <span>{buyerProfile.location}</span>
        </div>
        <nav className="farmer-nav" aria-label="Buyer navigation">
          <span className="sidebar-label">Workspace</span>
          {navigation.map((item) => (
            <NavLink
              key={item.to}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `farmer-nav__link${isActive ? " is-active" : ""}`
              }
              to={item.to}
            >
              <span className="farmer-nav__icon">{item.icon}</span>
              <span>{item.label}</span>
              {item.badge && <b>{item.badge}</b>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-help">
          <span className="sidebar-help__mark">?</span>
          <div>
            <strong>Need a hand?</strong>
            <p>Our field team is here.</p>
          </div>
          <span>↗</span>
        </div>
        <Link className="farmer-sidebar__back" to="/">
          ← Back to marketplace
        </Link>
      </aside>
      {mobileOpen && (
        <button
          className="farmer-overlay"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <div className="farmer-main">
        <header className="farmer-topbar">
          <button
            className="farmer-menu"
            aria-label="Open navigation"
            onClick={() => setMobileOpen(true)}
          >
            ☰
          </button>
          <div>
            <span className="farmer-topbar__kicker">{pageTitle}</span>
            <h1>{pageTitle}</h1>
          </div>
          <div className="farmer-topbar__actions">
            <button className="icon-button" aria-label="Notifications">
              ♧<span />
            </button>
            <Link className="farmer-user" to="/buyer/profile">
              <span className="avatar avatar--small avatar--buyer">
                {buyerProfile.initials}
              </span>
              <span>
                <strong>{buyerProfile.name}</strong>
                <small>Buyer</small>
              </span>
              <b>⌄</b>
            </Link>
          </div>
        </header>
        <main className="farmer-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default BuyerLayout;
