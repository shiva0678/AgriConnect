import { m } from "framer-motion";
import { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import {
  useFarmerOrdersQuery,
  useUpdateFarmerOrderStatusMutation,
} from "../../queries/orders";
import { getApiErrorMessage } from "../../utils/apiErrorMessage";

const statuses = ["All orders", "Pending", "Confirmed", "Shipped", "Delivered"];

function FarmerOrders() {
  const { user } = useAuth();
  const [selectedStatus, setSelectedStatus] = useState("All orders");
  const [actionError, setActionError] = useState("");
  const updateStatusMutation = useUpdateFarmerOrderStatusMutation();
  const {
    data: farmerOrders = [],
    isLoading,
    isError,
    error,
  } = useFarmerOrdersQuery(user?.id);
  const filteredOrders = selectedStatus === "All orders"
    ? farmerOrders
    : farmerOrders.filter((order) => order.status === selectedStatus);
  const deliveredRevenue = farmerOrders
    .filter((order) => order.status === "Delivered")
    .reduce((total, order) => total + order.amountValue, 0);

  async function updateStatus(orderId, status) {
    setActionError("");
    try {
      await updateStatusMutation.mutateAsync({
        orderId,
        status: status.toLowerCase(),
      });
    } catch (mutationError) {
      setActionError(
        getApiErrorMessage(mutationError, "Unable to update this order."),
      );
    }
  }

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
          <p className="dashboard-eyebrow">Your sales · {farmerOrders.length} total orders</p>
          <h2>Orders</h2>
          <p>Follow every order from first hello to final delivery.</p>
        </div>
        <div className="orders-summary">
          <span>Delivered revenue</span>
          <strong>₹{new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(deliveredRevenue)}</strong>
        </div>
      </div>
      <div className="crop-toolbar">
        <div className="crop-tabs crop-tabs--orders">
          {statuses.map((status) => (
            <button
              className={selectedStatus === status ? "is-active" : ""}
              key={status}
              onClick={() => setSelectedStatus(status)}
            >
              {status}
              {status !== "All orders" && (
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
            {order.status === "Pending" && (
              <button
                className="farmer-button farmer-button--outline"
                disabled={updateStatusMutation.isPending}
                onClick={() => updateStatus(order.id, "confirmed")}
              >
                Confirm order
              </button>
            )}
            {order.status === "Confirmed" && (
              <button
                className="farmer-button farmer-button--outline"
                disabled={updateStatusMutation.isPending}
                onClick={() => updateStatus(order.id, "shipped")}
              >
                Mark shipped
              </button>
            )}
            {order.status === "Shipped" && (
              <button
                className="farmer-button farmer-button--outline"
                disabled={updateStatusMutation.isPending}
                onClick={() => updateStatus(order.id, "delivered")}
              >
                Mark delivered
              </button>
            )}
          </m.article>
        ))}
      </m.div>
      {actionError && <p className="form-error" role="alert">{actionError}</p>}
      {!isLoading && !isError && filteredOrders.length === 0 && (
        <p>No orders match this status.</p>
      )}
    </div>
  );
}

export default FarmerOrders;
