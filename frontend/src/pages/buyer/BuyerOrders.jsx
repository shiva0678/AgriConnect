import { m } from "framer-motion";
import { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { useBuyerOrdersQuery } from "../../queries/orders";

function BuyerOrders() {
  const { user } = useAuth();
  const [selectedStatus, setSelectedStatus] = useState("All orders");
  const {
    data: buyerOrders = [],
    isLoading,
    isError,
    error,
  } = useBuyerOrdersQuery(user?.id);
  const filteredOrders = selectedStatus === "All orders"
    ? buyerOrders
    : buyerOrders.filter((order) => {
        if (selectedStatus === "In transit") return order.status === "Shipped";
        return order.status === selectedStatus;
      });
  const deliveredTotal = buyerOrders
    .filter((order) => order.status === "Delivered")
    .reduce((total, order) => total + order.amountValue, 0);
  const orderStatuses = ["All orders", "Pending", "In transit", "Delivered"];

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
          <p className="dashboard-eyebrow">Your sourcing · {buyerOrders.length} total orders</p>
          <h2>My orders</h2>
          <p>Keep an eye on every ingredient making its way to you.</p>
        </div>
        <div className="orders-summary">
          <span>Delivered spend</span>
          <strong>₹{new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(deliveredTotal)}</strong>
        </div>
      </div>
      <div className="crop-toolbar">
        <div className="crop-tabs crop-tabs--orders">
          {orderStatuses.map((status) => (
            <button
              className={selectedStatus === status ? "is-active" : ""}
              key={status}
              onClick={() => setSelectedStatus(status)}
            >
              {status}
              <b>
                {status === "All orders"
                  ? buyerOrders.length
                  : status === "In transit"
                    ? buyerOrders.filter((order) => order.status === "Shipped").length
                    : buyerOrders.filter((order) => order.status === status).length}
              </b>
            </button>
          ))}
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
        {filteredOrders.map((order) => (
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
      {!isLoading && !isError && filteredOrders.length === 0 && (
        <p>No orders match this status.</p>
      )}
    </div>
  );
}

export default BuyerOrders;
