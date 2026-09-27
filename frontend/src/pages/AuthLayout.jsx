import { BrandMark } from "../components/SiteChrome";
import { m } from "framer-motion";

export function AuthLayout({ children, label, title, description }) {
  return (
    <m.main
      className="auth-page"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: "easeOut" }}
    >
      <div className="auth-page__visual">
        <BrandMark inverse />
        <div className="auth-page__quote">
          <span className="quote-mark">“</span>
          <p>
            When the people who grow our food are closer to the people who value
            it, everyone eats better.
          </p>
          <span className="quote-byline">The AgriConnect principle</span>
        </div>
        <div className="auth-page__image">
          <img
            src="https://images.unsplash.com/photo-1501004318641-b39e6451bec6?auto=format&fit=crop&w=1000&q=85"
            alt="Sunlit plant leaves"
          />
        </div>
      </div>
      <div className="auth-page__form">
        <div className="auth-mobile-brand">
          <BrandMark />
        </div>
        <div className="auth-form__intro">
          <p className="eyebrow">{label}</p>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        {children}
      </div>
    </m.main>
  );
}
