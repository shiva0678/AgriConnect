import { Link } from "react-router-dom";
import {
  cropListings,
  dashboardStats,
  farmerOrders,
  farmerProfile,
} from "../../data/farmerMockData";

function FarmerDashboard() {
  return (
    <div className="farmer-page reveal-up">
      <div className="farmer-welcome">
        <div>
          <p className="dashboard-eyebrow">
            Tuesday, 14 April 2026 <span /> Good morning
          </p>
          <h2>
            Good morning, {farmerProfile.name.split(" ")[0]}{" "}
            <span aria-hidden="true">✳</span>
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
      <div className="farmer-stats">
        {dashboardStats.map((stat) => (
          <article
            className={`farmer-stat farmer-stat--${stat.tone}`}
            key={stat.label}
          >
            <span className="farmer-stat__icon">{stat.icon}</span>
            <p>{stat.label}</p>
            <strong>{stat.value}</strong>
            <small>{stat.detail}</small>
          </article>
        ))}
      </div>
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
            {cropListings.slice(0, 3).map((crop) => (
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
            {farmerOrders.slice(0, 3).map((order) => (
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
          <p className="dashboard-eyebrow">Market note · Nashik</p>
          <h3>Tomato demand is up this week.</h3>
          <p>
            Buyers around your region are looking for consistent supply between
            1,000 and 2,000 kg.
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
