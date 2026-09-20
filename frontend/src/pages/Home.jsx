import { Link } from "react-router-dom";

const features = [
  {
    number: "01",
    title: "Clearer market signals",
    text: "See what crops are moving for before you decide where to take them.",
  },
  {
    number: "02",
    title: "Conversations that matter",
    text: "Meet serious buyers directly, without losing the story behind your harvest.",
  },
  {
    number: "03",
    title: "A fairer next step",
    text: "Make decisions with context, confidence, and fewer layers in the way.",
  },
];

function Home() {
  return (
    <main>
      <section className="hero page-width">
        <div className="hero__copy reveal-up">
          <p className="eyebrow">
            <span className="eyebrow__dot" /> A marketplace with roots
          </p>
          <h1>
            Good food starts with a <em>good connection.</em>
          </h1>
          <p className="hero__lede">
            AgriConnect brings farmers and buyers to the same table, with the
            market context to make every conversation count.
          </p>
          <div className="hero__actions">
            <Link className="button button--accent" to="/register">
              Find your next harvest <span aria-hidden="true">↗</span>
            </Link>
            <a className="button button--quiet" href="#how-it-works">
              See how it works <span aria-hidden="true">↓</span>
            </a>
          </div>
          <div className="hero__aside-note">
            <span>01</span>
            <p>
              From the first seed
              <br />
              to the final shelf.
            </p>
          </div>
        </div>
        <div className="hero__visual reveal-up reveal-delay">
          <div className="hero__image-wrap">
            <img
              src="https://images.unsplash.com/photo-1464226184884-fa280b87c399?auto=format&fit=crop&w=1200&q=85"
              alt="A farmer walking through a green crop field"
            />
            <span className="image-stamp">
              EST. 2026
              <br />
              <strong>
                DIRECT
                <br />
                TRADE
              </strong>
            </span>
          </div>
          <div className="hero__caption">
            <span>01 / 04</span>
            <span>Local harvest, wider reach</span>
            <span className="caption-line" />
          </div>
        </div>
      </section>
      <section className="signal-strip">
        <div className="page-width signal-strip__inner">
          <span>Grow with confidence</span>
          <span className="signal-strip__line" />
          <span>Buy with context</span>
          <span className="signal-strip__line" />
          <span>Build a better chain</span>
        </div>
      </section>
      <section className="section page-width feature-section" id="stories">
        <div className="section-heading">
          <p className="eyebrow">Why AgriConnect</p>
          <h2>
            The distance between a farm and a fair deal should be{" "}
            <em>short.</em>
          </h2>
        </div>
        <div className="feature-grid">
          {features.map((feature) => (
            <article className="feature-item" key={feature.number}>
              <span className="feature-item__number">{feature.number}</span>
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
              <span className="feature-item__arrow" aria-hidden="true">
                ↗
              </span>
            </article>
          ))}
        </div>
      </section>
      <section className="process-section" id="how-it-works">
        <div className="page-width process-section__inner">
          <div className="process-section__title">
            <p className="eyebrow eyebrow--light">The simple route</p>
            <h2>
              From soil
              <br />
              to <em>sold.</em>
            </h2>
          </div>
          <div className="process-list">
            <div>
              <span>01</span>
              <div>
                <h3>Make your market visible</h3>
                <p>Farmers share what's coming. Buyers see what's real.</p>
              </div>
            </div>
            <div>
              <span>02</span>
              <div>
                <h3>Find the right fit</h3>
                <p>Browse produce and intent, not just endless listings.</p>
              </div>
            </div>
            <div>
              <span>03</span>
              <div>
                <h3>Take it forward</h3>
                <p>Start a direct conversation and plan the next move.</p>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="section page-width visual-section">
        <div className="visual-section__image">
          <img
            src="https://images.unsplash.com/photo-1464226184884-fa280b87c399?auto=format&fit=crop&w=1200&q=85"
            alt="Fresh vegetables in a market basket"
          />
          <div className="visual-section__label">
            Fresh from the field
            <br />
            <strong>• &nbsp;Worth finding</strong>
          </div>
        </div>
        <div className="visual-section__copy">
          <p className="eyebrow">A better kind of marketplace</p>
          <h2>
            Every harvest has a story. <em>Help yours travel.</em>
          </h2>
          <p>
            Whether you grow for a living or source for a community, AgriConnect
            gives your work the visibility it deserves.
          </p>
          <Link className="text-link text-link--arrow" to="/register">
            Become part of it <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </section>
    </main>
  );
}

export default Home;
