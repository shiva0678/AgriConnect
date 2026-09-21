import { useState } from "react";
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { BrandMark } from "./SiteChrome";
import { useAuth } from "../context/AuthContext";
import { farmerProfile } from "../data/farmerMockData";

const navigation = [
  { to: "/farmer/dashboard", label: "Overview", icon: "⌂" },
  { to: "/farmer/crops", label: "My crops", icon: "◫" },
  { to: "/farmer/orders", label: "Orders", icon: "◌", badge: "6" },
  { to: "/farmer/profile", label: "Profile", icon: "◎" },
];

function FarmerLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const current = navigation.find((item) =>
    location.pathname.startsWith(item.to),
  );
  const pageTitle = location.pathname.endsWith("/add-crop")
    ? "Add a crop"
    : current?.label || "Overview";

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div className="farmer-shell">
      <aside className={`farmer-sidebar${mobileOpen ? " is-open" : ""}`}>
        <div className="farmer-sidebar__brand">
          <BrandMark />
        </div>
        <div className="farmer-sidebar__context">
          <span className="sidebar-kicker">Farmer workspace</span>
          <strong>{farmerProfile.farm}</strong>
          <span>{farmerProfile.location}</span>
        </div>
        <nav className="farmer-nav" aria-label="Farmer navigation">
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
            <Link className="farmer-user" to="/farmer/profile">
              <span className="avatar avatar--small">
                {user?.name?.charAt(0)?.toUpperCase() || farmerProfile.initials}
              </span>
              <span>
                <strong>{user?.name || farmerProfile.name}</strong>
                <small>Farmer</small>
              </span>
              <b>⌄</b>
            </Link>
            <button
              className="button button--small button--dark"
              type="button"
              onClick={handleLogout}
            >
              Log out
            </button>
          </div>
        </header>
        <main className="farmer-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default FarmerLayout;
