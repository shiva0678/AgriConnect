import { Link } from "react-router-dom";
import { m } from "framer-motion";
import { useAuth } from "../../context/AuthContext";
import { getCropImage } from "../../data/cropImagery";
import { buyerOrders, marketplaceCrops } from "../../data/buyerMockData";

function BuyerDashboard() {
  const { user } = useAuth();
  const firstName = user?.name?.split(" ")[0] || "Buyer";

  return (
    <div className="farmer-page reveal-up buyer-page">
      <div className="farmer-welcome">
        <div>
          <p className="dashboard-eyebrow">
            Tuesday, 14 April 2026 <span /> Buyer workspace
          </p>
          <h2>
            Good morning, {firstName} <span aria-hidden="true">✳</span>
          </h2>
          <p>Find the harvest that makes your next menu worth talking about.</p>
        </div>
        <Link
          className="farmer-button farmer-button--primary"
          to="/buyer/marketplace"
        >
          Explore marketplace <span>↗</span>
        </Link>
      </div>
      <m.div
        className="buyer-stats farmer-stats"
        initial="hidden"
        animate="visible"
        variants={{ visible: { transition: { staggerChildren: 0.055 } } }}
      >
        <m.article
          className="farmer-stat farmer-stat--green"
          variants={{
            hidden: { opacity: 0, y: 10 },
            visible: { opacity: 1, y: 0 },
          }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        >
          <span className="farmer-stat__icon">⌕</span>
          <p>Available crops</p>
          <strong>126</strong>
          <small>Across 9 regions</small>
        </m.article>
        <m.article
          className="farmer-stat farmer-stat--gold"
          variants={{
            hidden: { opacity: 0, y: 10 },
            visible: { opacity: 1, y: 0 },
          }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        >
          <span className="farmer-stat__icon">◷</span>
          <p>Active orders</p>
          <strong>04</strong>
          <small>1 needs your attention</small>
        </m.article>
        <m.article
          className="farmer-stat farmer-stat--blue"
          variants={{
            hidden: { opacity: 0, y: 10 },
            visible: { opacity: 1, y: 0 },
          }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        >
          <span className="farmer-stat__icon">✓</span>
          <p>Delivered this month</p>
          <strong>12</strong>
          <small>98% on time</small>
        </m.article>
        <m.article
          className="farmer-stat farmer-stat--rose"
          variants={{
            hidden: { opacity: 0, y: 10 },
            visible: { opacity: 1, y: 0 },
          }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        >
          <span className="farmer-stat__icon">⌁</span>
          <p>Saved farmers</p>
          <strong>08</strong>
          <small>Across 3 regions</small>
        </m.article>
      </m.div>
      <div className="buyer-dashboard-grid">
        <section className="farmer-panel buyer-market-preview">
          <div className="farmer-panel__heading">
            <div>
              <p className="dashboard-eyebrow">Fresh today</p>
              <h3>Find your next ingredient</h3>
            </div>
            <Link to="/buyer/marketplace">
              See all <span>↗</span>
            </Link>
          </div>
          <div className="buyer-preview-grid">
            {marketplaceCrops.slice(0, 3).map((crop) => (
              <Link
                className="buyer-mini-card"
                to={`/buyer/crop/${crop.id}`}
                key={crop.id}
              >
                <span className={`buyer-crop-art buyer-crop-art--${crop.tone}`}>
                  <img src={getCropImage(crop.tone)} alt="" loading="lazy" />
                </span>
                <span>
                  <strong>{crop.name}</strong>
                  <small>
                    {crop.shortRegion} · {crop.price}/kg
                  </small>
                </span>
              </Link>
            ))}
          </div>
        </section>
        <section className="farmer-panel buyer-orders-preview">
          <div className="farmer-panel__heading">
            <div>
              <p className="dashboard-eyebrow">In motion</p>
              <h3>Recent orders</h3>
            </div>
            <Link to="/buyer/orders">
              View all <span>↗</span>
            </Link>
          </div>
          {buyerOrders.slice(0, 3).map((order) => (
            <div className="buyer-order-row" key={order.id}>
              <span
                className={`buyer-crop-art buyer-crop-art--small buyer-crop-art--${order.tone}`}
              >
                <img src={getCropImage(order.tone)} alt="" loading="lazy" />
              </span>
              <div>
                <strong>{order.crop}</strong>
                <small>
                  {order.farmer} · {order.date}
                </small>
              </div>
              <span className={`status status--${order.status.toLowerCase()}`}>
                {order.status}
              </span>
            </div>
          ))}
        </section>
      </div>
      <section className="buyer-quote">
        <div className="buyer-quote__mark">“</div>
        <div>
          <p className="dashboard-eyebrow">The buyer's note</p>
          <h3>Source with a little more story.</h3>
          <p>
            Every crop on AgriConnect comes with the people and place behind it.
          </p>
        </div>
        <Link
          to="/buyer/marketplace"
          className="farmer-button farmer-button--outline"
        >
          Browse the field <span>↗</span>
        </Link>
      </section>
    </div>
  );
}

export default BuyerDashboard;
