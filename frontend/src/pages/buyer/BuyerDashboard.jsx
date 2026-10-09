import { Link } from "react-router-dom";
import { m } from "framer-motion";
import { useAuth } from "../../context/AuthContext";
import { getCropImage } from "../../data/cropImagery";
import { useMarketplaceCropsQuery } from "../../queries/crops";
import { useBuyerOrdersQuery } from "../../queries/orders";

function BuyerDashboard() {
  const { user } = useAuth();
  const {
    data: marketplaceCrops = [],
    isLoading: cropsLoading,
    isError: cropsError,
  } = useMarketplaceCropsQuery();
  const {
    data: buyerOrders = [],
    isLoading: ordersLoading,
    isError: ordersError,
  } = useBuyerOrdersQuery(user?.id);
  const firstName = user?.name?.split(" ")[0] || "Buyer";
  const activeOrders = buyerOrders.filter(
    (order) => !["Delivered", "Cancelled"].includes(order.status),
  ).length;
  const deliveredOrders = buyerOrders.filter(
    (order) => order.status === "Delivered",
  ).length;
  const deliveredRate = buyerOrders.length
    ? Math.round((deliveredOrders / buyerOrders.length) * 100)
    : 0;

  return (
    <div className="farmer-page reveal-up buyer-page">
      <div className="farmer-welcome">
        <div>
          <p className="dashboard-eyebrow">
            Your workspace <span /> Buyer dashboard
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
          <strong>{cropsLoading ? "…" : cropsError ? "—" : marketplaceCrops.length}</strong>
          <small>Live marketplace listings</small>
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
          <strong>{ordersLoading ? "…" : ordersError ? "—" : activeOrders}</strong>
          <small>Pending, confirmed, or shipped</small>
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
          <strong>{ordersLoading ? "…" : ordersError ? "—" : deliveredOrders}</strong>
          <small>{deliveredRate}% of loaded orders</small>
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
          <p>Farmers sourced from</p>
          <strong>{buyerOrders.length ? new Set(buyerOrders.map((order) => order.farmer)).size : 0}</strong>
          <small>Farmers you have ordered from</small>
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
                    {crop.shortRegion} · {crop.price}/{crop.unit}
                  </small>
                </span>
              </Link>
            ))}
            {!cropsLoading && !cropsError && marketplaceCrops.length === 0 && (
              <p>No available listings yet.</p>
            )}
            {cropsError && <p className="form-error" role="alert">Marketplace is unavailable right now.</p>}
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
          {!ordersLoading && !ordersError && buyerOrders.length === 0 && (
            <p>You have not placed any orders yet.</p>
          )}
          {ordersError && <p className="form-error" role="alert">Unable to load your orders.</p>}
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
