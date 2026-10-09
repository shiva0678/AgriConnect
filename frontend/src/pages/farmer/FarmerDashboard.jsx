import { Link } from "react-router-dom";
import { m } from "framer-motion";
import { useAuth } from "../../context/AuthContext";
import { useFarmerDashboardQuery } from "../../queries/crops";

function FarmerDashboard() {
  const { user } = useAuth();
  const {
    data = { stats: [], recentCrops: [], recentOrders: [] },
    isLoading,
    isError,
    error,
  } = useFarmerDashboardQuery(user?.id);
  const firstName = user?.name?.split(" ")[0] || "Farmer";

  if (isLoading) {
    return (
      <div className="farmer-page reveal-up">
        <div className="page-loading">Loading dashboard…</div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="farmer-page reveal-up">
        <div className="form-error" role="alert">
          Unable to load dashboard data. {error?.message || "Please try again."}
        </div>
      </div>
    );
  }

  return (
    <div className="farmer-page reveal-up">
      <div className="farmer-welcome">
        <div>
          <p className="dashboard-eyebrow">
            Your workspace <span /> Farmer dashboard
          </p>
          <h2>
            Good morning, {firstName} <span aria-hidden="true">✳</span>
          </h2>
          <p>Here is how your farm is moving today.</p>
        </div>
        <Link
          className="farmer-button farmer-button--primary"
          to="/farmer/add-crop"
        >
          Add a crop <span>＋</span>
        </Link>
      </div>
      <m.div
        className="farmer-stats"
        initial="hidden"
        animate="visible"
        variants={{ visible: { transition: { staggerChildren: 0.055 } } }}
      >
        {data.stats.map((stat) => (
          <m.article
            className={`farmer-stat farmer-stat--${stat.tone}`}
            key={stat.label}
            variants={{
              hidden: { opacity: 0, y: 10 },
              visible: { opacity: 1, y: 0 },
            }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            <span className="farmer-stat__icon">{stat.icon}</span>
            <p>{stat.label}</p>
            <strong>{stat.value}</strong>
            <small>{stat.detail}</small>
          </m.article>
        ))}
      </m.div>
      <div className="farmer-dashboard-grid">
        <section className="farmer-panel farmer-panel--list">
          <div className="farmer-panel__heading">
            <div>
              <p className="dashboard-eyebrow">Your produce</p>
              <h3>Recent crop listings</h3>
            </div>
            <Link to="/farmer/crops">
              View all <span>↗</span>
            </Link>
          </div>
          <div className="dashboard-crop-list">
            {data.recentCrops.map((crop) => (
              <div className="dashboard-crop-row" key={crop.id}>
                <span
                  className={`crop-thumb crop-thumb--${crop.tone}`}
                  aria-hidden="true"
                />{" "}
                <div>
                  <strong>{crop.name}</strong>
                  <small>
                    {crop.category} · {crop.quantity}
                  </small>
                </div>
                <span className={`status status--${crop.status.toLowerCase()}`}>
                  {crop.status}
                </span>
                <b>{crop.price}</b>
              </div>
            ))}
          </div>
        </section>
        <section className="farmer-panel farmer-panel--list">
          <div className="farmer-panel__heading">
            <div>
              <p className="dashboard-eyebrow">Latest activity</p>
              <h3>Recent orders</h3>
            </div>
            <Link to="/farmer/orders">
              View all <span>↗</span>
            </Link>
          </div>
          <div className="dashboard-order-list">
            {data.recentOrders.map((order) => (
              <div className="dashboard-order-row" key={order.id}>
                <span className="buyer-avatar">{order.initials}</span>
                <div>
                  <strong>{order.buyer}</strong>
                  <small>
                    {order.crop} · {order.date}
                  </small>
                </div>
                <div className="dashboard-order-row__amount">
                  <b>{order.amount}</b>
                  <span
                    className={`status status--${order.status.toLowerCase()}`}
                  >
                    {order.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
      <section className="farmer-insight">
        <div className="farmer-insight__orb">↗</div>
        <div>
          <p className="dashboard-eyebrow">Your marketplace</p>
          <h3>Your listings are available to buyers.</h3>
          <p>
            Keep crop quantities and harvest details up to date so buyers can
            make informed orders.
          </p>
        </div>
        <Link
          to="/farmer/add-crop"
          className="farmer-button farmer-button--outline"
        >
          List your harvest <span>↗</span>
        </Link>
      </section>
    </div>
  );
}

export default FarmerDashboard;
