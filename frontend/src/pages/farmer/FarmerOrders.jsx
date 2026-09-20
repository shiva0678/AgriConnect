import { farmerOrders } from "../../data/farmerMockData";

const statuses = ["All orders", "Pending", "Confirmed", "Shipped", "Delivered"];

function FarmerOrders() {
  return (
    <div className="farmer-page reveal-up">
      <div className="farmer-page-heading">
        <div>
          <p className="dashboard-eyebrow">Your sales · 24 total orders</p>
          <h2>Orders</h2>
          <p>Follow every order from first hello to final delivery.</p>
        </div>
        <div className="orders-summary">
          <span>April revenue</span>
          <strong>₹42,700</strong>
        </div>
      </div>
      <div className="crop-toolbar">
        <div className="crop-tabs crop-tabs--orders">
          {statuses.map((status, index) => (
            <button className={index === 0 ? "is-active" : ""} key={status}>
              {status}
              {index > 0 && (
                <b>
                  {
                    farmerOrders.filter((order) => order.status === status)
                      .length
                  }
                </b>
              )}
            </button>
          ))}
        </div>
        <button className="filter-button">
          ⌘ Filter <span>⌄</span>
        </button>
      </div>
      <div className="orders-cards">
        {farmerOrders.map((order) => (
          <article className="order-card" key={order.id}>
            <div className="order-card__top">
              <span className="buyer-avatar buyer-avatar--large">
                {order.initials}
              </span>
              <div>
                <strong>{order.buyer}</strong>
                <small>
                  {order.id} · Placed {order.date}
                </small>
              </div>
              <span className={`status status--${order.status.toLowerCase()}`}>
                {order.status}
              </span>
            </div>
            <div className="order-card__details">
              <div>
                <span>Crop</span>
                <strong>{order.crop}</strong>
              </div>
              <div>
                <span>Quantity</span>
                <strong>{order.quantity}</strong>
              </div>
              <div>
                <span>Order total</span>
                <strong>{order.amount}</strong>
              </div>
              <button className="row-action" aria-label={`View ${order.id}`}>
                ↗
              </button>
            </div>
            <div className="order-progress">
              <span
                className={
                  order.status === "Pending" ? "is-current" : "is-done"
                }
              >
                Order placed
              </span>
              <i className={order.status === "Pending" ? "" : "is-done"} />
              <span className={order.status === "Pending" ? "" : "is-done"}>
                Confirmed
              </span>
              <i
                className={
                  order.status === "Shipped" || order.status === "Delivered"
                    ? "is-done"
                    : ""
                }
              />
              <span className={order.status === "Delivered" ? "is-done" : ""}>
                Delivered
              </span>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

export default FarmerOrders;
