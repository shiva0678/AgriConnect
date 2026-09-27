import { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function BrandMark({ inverse = false }) {
  return (
    <Link
      className={`brand-mark${inverse ? " brand-mark--inverse" : ""}`}
      to="/"
    >
      <img
        className="brand-mark__emblem"
        src="/agriconnect-emblem.png"
        alt=""
        aria-hidden="true"
      />
      <span>
        <strong>Agri</strong>Connect<small>Trade closer to the soil</small>
      </span>
    </Link>
  );
}

export function PublicHeader() {
  const navigate = useNavigate();
  const { user, isAuthenticated, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  function handleLogout() {
    logout();
    setMobileOpen(false);
    navigate("/login");
  }

  const navItems = [
    { to: "/", label: "Home" },
    {
      to: isAuthenticated
        ? user?.role === "farmer"
          ? "/farmer/crops"
          : "/buyer/marketplace"
        : "/login",
      label: "Marketplace",
    },
    { to: "/#about", label: "About" },
    { to: "/login", label: "Login" },
    { to: "/register", label: "Register" },
  ];

  return (
    <header className="site-header">
      <div className="page-width site-header__inner">
        <BrandMark />
        <nav className="main-nav" aria-label="Main navigation">
          {navItems.map((item) =>
            item.to.startsWith("/#") ? (
              <a key={item.label} className="main-nav__link" href={item.to}>
                {item.label}
              </a>
            ) : (
              <NavLink
                key={item.label}
                className={({ isActive }) =>
                  isActive ? "main-nav__link is-active" : "main-nav__link"
                }
                to={item.to}
              >
                {item.label}
              </NavLink>
            ),
          )}
        </nav>
        <div className="header-actions">
          {isAuthenticated ? (
            <>
              <Link
                className="text-link"
                to={
                  user?.role === "farmer"
                    ? "/farmer/dashboard"
                    : "/buyer/dashboard"
                }
              >
                Dashboard
              </Link>
              <button
                className="button button--small button--dark"
                type="button"
                onClick={handleLogout}
              >
                Log out
              </button>
            </>
          ) : (
            <>
              <Link className="text-link" to="/login">
                Log in
              </Link>
              <Link
                className="button button--small button--dark"
                to="/register"
              >
                Join AgriConnect <span aria-hidden="true">↗</span>
              </Link>
            </>
          )}
        </div>

        <button
          type="button"
          className="mobile-menu-toggle"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((open) => !open)}
        >
          <span />
          <span />
          <span />
        </button>
      </div>

      {mobileOpen && (
        <div
          className="mobile-nav-backdrop"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <nav
        className={`mobile-nav${mobileOpen ? " mobile-nav--open" : ""}`}
        aria-label="Mobile navigation"
      >
        {navItems.map((item) =>
          item.to.startsWith("/#") ? (
            <a
              key={item.label}
              href={item.to}
              onClick={() => setMobileOpen(false)}
            >
              {item.label}
            </a>
          ) : (
            <NavLink
              key={item.label}
              to={item.to}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                isActive ? "mobile-nav__link is-active" : "mobile-nav__link"
              }
            >
              {item.label}
            </NavLink>
          ),
        )}
        {isAuthenticated ? (
          <button
            type="button"
            onClick={handleLogout}
            className="mobile-nav__cta"
          >
            Log out
          </button>
        ) : (
          <Link
            to="/register"
            onClick={() => setMobileOpen(false)}
            className="mobile-nav__cta"
          >
            Create account
          </Link>
        )}
      </nav>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="site-footer">
      <div className="page-width site-footer__top">
        <div>
          <BrandMark inverse />
          <p className="site-footer__intro">
            Connecting farmers with better opportunities and smarter trade.
          </p>
          <Link className="footer-cta" to="/register">
            Grow your next connection <span aria-hidden="true">↗</span>
          </Link>
        </div>
        <div className="footer-links">
          <div>
            <span className="footer-label">Explore</span>
            <a href="#how-it-works">How it works</a>
            <a href="#stories">Field stories</a>
          </div>
          <div>
            <span className="footer-label">Start here</span>
            <Link to="/login">Log in</Link>
            <Link to="/register">Create an account</Link>
          </div>
          <div>
            <span className="footer-label">Technology</span>
            <span>React</span>
            <span>Node.js</span>
            <span>PostgreSQL</span>
          </div>
        </div>
      </div>
      <div className="page-width site-footer__bottom">
        <span>© 2026 AgriConnect</span>
        <span>Connecting growers to better commerce</span>
      </div>
    </footer>
  );
}
