import { m } from "framer-motion";
import { useFarmerOrdersQuery } from "../../queries/orders";

const statuses = ["All orders", "Pending", "Confirmed", "Shipped", "Delivered"];

function FarmerOrders() {
  const {
    data: farmerOrders = [],
    isLoading,
    isError,
    error,
  } = useFarmerOrdersQuery();

  if (isLoading) {
    return (
      <div className="farmer-page reveal-up">
        <div className="page-loading">Loading orders…</div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="farmer-page reveal-up">
        <div className="form-error" role="alert">
          Unable to load orders. {error?.message || "Please try again."}
        </div>
      </div>
    );
  }

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
      <m.div
        className="orders-cards"
        initial="hidden"
        animate="visible"
        variants={{ visible: { transition: { staggerChildren: 0.055 } } }}
      >
        {farmerOrders.map((order) => (
          <m.article
            className="order-card"
            key={order.id}
            variants={{
              hidden: { opacity: 0, y: 8 },
              visible: { opacity: 1, y: 0 },
            }}
            transition={{ duration: 0.28, ease: "easeOut" }}
          >
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
          </m.article>
        ))}
      </m.div>
    </div>
  );
}

export default FarmerOrders;
