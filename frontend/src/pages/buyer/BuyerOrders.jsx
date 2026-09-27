import { m } from "framer-motion";
import { useBuyerOrdersQuery } from "../../queries/orders";

function BuyerOrders() {
  const {
    data: buyerOrders = [],
    isLoading,
    isError,
    error,
  } = useBuyerOrdersQuery();

  if (isLoading) {
    return (
      <div className="farmer-page reveal-up buyer-page">
        <div className="page-loading">Loading orders…</div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="farmer-page reveal-up buyer-page">
        <div className="form-error" role="alert">
          Unable to load orders. {error?.message || "Please try again."}
        </div>
      </div>
    );
  }

  return (
    <div className="farmer-page reveal-up buyer-page">
      <div className="farmer-page-heading">
        <div>
          <p className="dashboard-eyebrow">Your sourcing · 18 total orders</p>
          <h2>My orders</h2>
          <p>Keep an eye on every ingredient making its way to you.</p>
        </div>
        <div className="orders-summary">
          <span>April spend</span>
          <strong>₹56,800</strong>
        </div>
      </div>
      <div className="crop-toolbar">
        <div className="crop-tabs crop-tabs--orders">
          <button className="is-active">
            All orders <b>18</b>
          </button>
          <button>
            Pending <b>3</b>
          </button>
          <button>
            In transit <b>2</b>
          </button>
          <button>
            Delivered <b>13</b>
          </button>
        </div>
        <button className="filter-button">
          ⌘ Filter <span>⌄</span>
        </button>
      </div>
      <m.div
        className="orders-cards buyer-orders-cards"
        initial="hidden"
        animate="visible"
        variants={{ visible: { transition: { staggerChildren: 0.055 } } }}
      >
        {buyerOrders.map((order) => (
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
              <span
                className={`buyer-crop-art buyer-crop-art--small buyer-crop-art--${order.tone}`}
              />
              <div>
                <strong>{order.crop}</strong>
                <small>
                  {order.id} · Ordered {order.date}
                </small>
              </div>
              <span className={`status status--${order.status.toLowerCase()}`}>
                {order.status}
              </span>
            </div>
            <div className="buyer-order-farmer">
              <span className="buyer-avatar">{order.initials}</span>
              <span>
                From <strong>{order.farmer}</strong>
              </span>
            </div>
            <div className="order-card__details">
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
                Placed
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

export default BuyerOrders;
