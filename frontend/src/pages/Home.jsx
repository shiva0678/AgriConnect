import { useEffect } from "react";
import { Link } from "react-router-dom";
import {
  m,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "framer-motion";
import { getCropImage } from "../data/cropImagery";

const features = [
  {
    number: "01",
    title: "Direct farm-to-buyer trust",
    text: "Buyers see real crop availability, while farmers connect with the right market faster.",
  },
  {
    number: "02",
    title: "Transparent pricing",
    text: "Clear, grounded price signals reduce guesswork and create calmer, fairer trade decisions.",
  },
  {
    number: "03",
    title: "Better harvest visibility",
    text: "From listing to order, the full story of the produce stays present and understandable.",
  },
];

function Home() {
  const reduceMotion = useReducedMotion();
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const smoothX = useSpring(pointerX, {
    stiffness: 70,
    damping: 22,
    mass: 0.5,
  });
  const smoothY = useSpring(pointerY, {
    stiffness: 70,
    damping: 22,
    mass: 0.5,
  });
  const rotateY = useTransform(smoothX, [-1, 1], [-3, 3]);
  const rotateX = useTransform(smoothY, [-1, 1], [2, -2]);

  useEffect(() => {
    if (!reduceMotion) return;
    pointerX.set(0);
    pointerY.set(0);
  }, [pointerX, pointerY, reduceMotion]);

  function handleHeroPointerMove(event) {
    if (reduceMotion || event.pointerType === "touch") return;
    const bounds = event.currentTarget.getBoundingClientRect();
    pointerX.set(((event.clientX - bounds.left) / bounds.width - 0.5) * 2);
    pointerY.set(((event.clientY - bounds.top) / bounds.height - 0.5) * 2);
  }

  function resetHeroPointer() {
    pointerX.set(0);
    pointerY.set(0);
  }

  return (
    <main className="landing-shell">
      <section
        className="hero page-width"
        onPointerMove={handleHeroPointerMove}
        onPointerLeave={resetHeroPointer}
      >
        <m.div
          className="hero__copy"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.42, ease: "easeOut" }}
        >
          <p className="eyebrow">
            <span className="eyebrow__dot" /> Connected by the field
          </p>
          <h1>
            From farm
            <span>to market.</span>
          </h1>
          <p className="hero__lede">
            Smarter. Fairer. Fresher. A direct line between the people who grow
            good food and the people ready to bring it to more tables.
          </p>
          <div className="hero__actions">
            <m.div whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }}>
              <Link className="button button--primary" to="/register">
                Explore marketplace <span aria-hidden="true">↗</span>
              </Link>
            </m.div>
            <m.div whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }}>
              <a className="button button--ghost" href="#how-it-works">
                See how it works <span aria-hidden="true">↓</span>
              </a>
            </m.div>
          </div>
          <div className="hero__aside-note">
            <span>01</span>
            <p>
              From the first harvest
              <br />
              to the final table.
            </p>
          </div>
        </m.div>

        <m.div
          className="hero__visual"
          style={{ rotateX, rotateY, transformPerspective: 1200 }}
          initial={{ opacity: 0, scale: 0.985 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.08, ease: "easeOut" }}
        >
          <div className="hero-visual__pane">
            <m.div
              className="hero-floating hero-floating--primary"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: [12, 0, -3, 0] }}
              transition={{ duration: 0.62, delay: 0.18, ease: "easeOut" }}
              whileHover={{ y: -5, rotateX: 2, rotateY: -2 }}
            >
              <img src={getCropImage("tomato")} alt="" />
              <div className="hero-floating__copy">
                <span className="floating-label">Picked today · Tomatoes</span>
                <strong>
                  ₹32 <small>/ kg</small>
                </strong>
                <small>Nashik · 1,200 kg</small>
              </div>
            </m.div>
            <m.div
              className="hero-floating hero-floating--secondary"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: [10, 0, -2, 0] }}
              transition={{ duration: 0.62, delay: 0.25, ease: "easeOut" }}
              whileHover={{ y: -5, rotateX: 2, rotateY: 2 }}
            >
              <img src={getCropImage("mango")} alt="" />
              <div className="hero-floating__copy">
                <span className="floating-label">Konkan · In season</span>
                <strong>Alphonso mangoes</strong>
                <small>₹180 / kg · 800 kg</small>
              </div>
            </m.div>
            <div className="hero-visual__card">
              <span className="hero-badge">Live local market</span>
              <div className="hero-visual__bar" />
              <div className="hero-visual__stats">
                <div>
                  <strong>2.4k</strong>
                  <span>kg traded</span>
                </div>
                <div>
                  <strong>96%</strong>
                  <span>trust score</span>
                </div>
              </div>
            </div>
            <div className="hero-visual__image-wrap">
              <img
                src="https://images.unsplash.com/photo-1464226184884-fa280b87c399?auto=format&fit=crop&w=1200&q=85"
                alt="A farmer walking through a green crop field"
              />
            </div>
          </div>
        </m.div>
      </section>

      <section className="trust-strip" id="about">
        <div className="page-width trust-strip__inner">
          <div>
            <span>Farmers</span>
            <strong>Direct access</strong>
          </div>
          <div>
            <span>Buyers</span>
            <strong>Real inventory</strong>
          </div>
          <div>
            <span>Pricing</span>
            <strong>Transparent</strong>
          </div>
          <div>
            <span>Produce</span>
            <strong>Fresh by design</strong>
          </div>
        </div>
      </section>

      <section className="section page-width feature-section" id="stories">
        <m.div
          className="section-heading"
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.18 }}
          transition={{ duration: 0.35 }}
        >
          <p className="eyebrow">Why AgriConnect</p>
          <h2>
            The distance between a farm and a fair deal should feel{" "}
            <em>short.</em>
          </h2>
        </m.div>

        <div className="bento-grid">
          {features.map((feature, index) => (
            <m.article
              className={`bento-card bento-card--${index === 0 ? "large" : index === 1 ? "medium" : "small"}`}
              key={feature.number}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.18 }}
              transition={{ duration: 0.35, delay: index * 0.06 }}
            >
              <span className="feature-item__number">{feature.number}</span>
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
              <span className="feature-item__arrow" aria-hidden="true">
                ↗
              </span>
            </m.article>
          ))}

          <m.article
            className="bento-card bento-card--ai"
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.18 }}
            transition={{ duration: 0.35 }}
          >
            <span className="feature-item__number">04</span>
            <h3>AI-ready in the background</h3>
            <p>
              Insights, planning, and market readiness are designed into the
              experience.
            </p>
          </m.article>

          <m.article
            className="bento-card bento-card--analytics"
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.18 }}
            transition={{ duration: 0.35, delay: 0.06 }}
          >
            <span className="feature-item__number">05</span>
            <h3>Price analytics</h3>
            <p>
              Market rhythm, crop movement, and opportunity are made easier to
              understand.
            </p>
          </m.article>
        </div>
      </section>

      <section className="process-section" id="how-it-works">
        <div className="page-width process-section__inner">
          <m.div
            className="process-section__title"
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.35 }}
          >
            <p className="eyebrow eyebrow--light">The simple route</p>
            <h2>
              From soil
              <br />
              to <em>sold.</em>
            </h2>
          </m.div>
          <m.div
            className="process-list"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
            variants={{ visible: { transition: { staggerChildren: 0.08 } } }}
          >
            <m.div
              variants={{
                hidden: { opacity: 0, y: 8 },
                visible: { opacity: 1, y: 0 },
              }}
              transition={{ duration: 0.28 }}
            >
              <span>01</span>
              <div>
                <h3>List the harvest</h3>
                <p>Farmers share what's coming and what makes it valuable.</p>
              </div>
            </m.div>
            <m.div
              variants={{
                hidden: { opacity: 0, y: 8 },
                visible: { opacity: 1, y: 0 },
              }}
              transition={{ duration: 0.28 }}
            >
              <span>02</span>
              <div>
                <h3>Explore the market</h3>
                <p>
                  Buyers discover produce with quality, quantity, and context in
                  view.
                </p>
              </div>
            </m.div>
            <m.div
              variants={{
                hidden: { opacity: 0, y: 8 },
                visible: { opacity: 1, y: 0 },
              }}
              transition={{ duration: 0.28 }}
            >
              <span>03</span>
              <div>
                <h3>Trade with clarity</h3>
                <p>
                  From shortlist to order, the path stays direct and grounded.
                </p>
              </div>
            </m.div>
          </m.div>
        </div>
      </section>

      <m.section
        className="section page-width visual-section"
        initial={{ opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.15 }}
        transition={{ duration: 0.35 }}
      >
        <div className="visual-section__image">
          <img
            src="https://images.unsplash.com/photo-1464226184884-fa280b87c399?auto=format&fit=crop&w=1200&q=85"
            alt="Fresh vegetables in a market basket"
          />
          <div className="visual-section__label">
            Fresh from the field
            <br />
            <strong>• Worth finding</strong>
          </div>
        </div>
        <div className="visual-section__copy">
          <p className="eyebrow">A better kind of marketplace</p>
          <h2>
            Every harvest has a story. <em>Help it travel.</em>
          </h2>
          <p>
            The platform is designed to help farmers sell honestly and buyers
            source with confidence — without losing the human context behind the
            produce.
          </p>
          <Link className="text-link text-link--arrow" to="/register">
            Become part of it <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </m.section>

      <m.section
        className="section page-width impact-section"
        initial={{ opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.35 }}
      >
        <div className="impact-panel">
          <div>
            <p className="eyebrow">Built for agriculture</p>
            <h2>
              Grow better. <em>Trade fairer.</em>
            </h2>
          </div>
          <div className="impact-stats">
            <div>
              <strong>126+</strong>
              <span>Fresh listings</span>
            </div>
            <div>
              <strong>9</strong>
              <span>Regions served</span>
            </div>
            <div>
              <strong>24/7</strong>
              <span>Market visibility</span>
            </div>
          </div>
        </div>
      </m.section>
    </main>
  );
}

export default Home;
