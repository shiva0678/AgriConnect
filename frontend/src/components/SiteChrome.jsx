import { Link, NavLink } from "react-router-dom";

export function BrandMark({ inverse = false }) {
  return (
    <Link
      className={`brand-mark${inverse ? " brand-mark--inverse" : ""}`}
      to="/"
    >
      <span className="brand-mark__seed" aria-hidden="true">
        ✳
      </span>
      <span>
        <strong>Agri</strong>Connect<small>Trade closer to the soil</small>
      </span>
    </Link>
  );
}

export function PublicHeader() {
  return (
    <header className="site-header">
      <div className="page-width site-header__inner">
        <BrandMark />
        <nav className="main-nav" aria-label="Main navigation">
          <NavLink
            className={({ isActive }) =>
              isActive ? "main-nav__link is-active" : "main-nav__link"
            }
            to="/"
          >
            Our market
          </NavLink>
          <a className="main-nav__link" href="#how-it-works">
            How it works
          </a>
          <a className="main-nav__link" href="#stories">
            Field stories
          </a>
        </nav>
        <div className="header-actions">
          <Link className="text-link" to="/login">
            Log in
          </Link>
          <Link className="button button--small button--dark" to="/register">
            Join AgriConnect <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </div>
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
            Better harvests begin with a better connection.
          </p>
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
        </div>
      </div>
      <div className="page-width site-footer__bottom">
        <span>© 2026 AgriConnect</span>
        <span>Built for India's growing network</span>
      </div>
    </footer>
  );
}
