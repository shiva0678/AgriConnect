import { buyerOrders } from "../../data/buyerMockData";

function BuyerOrders() {
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
      <div className="orders-cards buyer-orders-cards">
        {buyerOrders.map((order) => (
          <article className="order-card" key={order.id}>
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
          </article>
        ))}
      </div>
    </div>
  );
}

export default BuyerOrders;
