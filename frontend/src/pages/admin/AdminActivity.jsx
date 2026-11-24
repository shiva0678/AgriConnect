import { m } from "framer-motion";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminPanel,
  AdminSkeleton,
} from "../../components/admin/AdminDashboardStates";
import { useAdminRecentActivityQuery } from "../../queries/adminDashboard";
import { formatActivityDate, formatAmount, formatStatus } from "./adminFormat";

function ActivityList({ type, items, isLoading, isError, onRetry }) {
  if (isLoading) return <AdminSkeleton variant="rows" count={5} />;
  if (isError) return <AdminErrorState onRetry={onRetry} />;
  if (!items?.length) {
    return <AdminEmptyState message={`No recent ${type} yet.`} />;
  }

  return (
    <div className="admin-activity-list admin-activity-list--full">
      {items.map((item) => (
        <article className="admin-activity-row" key={item.id}>
          <span className={`admin-activity-mark admin-activity-mark--${type}`} aria-hidden="true">
            {type === "registrations" ? "◎" : type === "crops" ? "◫" : "↗"}
          </span>
          <span className="admin-activity-row__body">
            {type === "registrations" ? (
              <>
                <strong>New {item.role} account</strong>
                <small>{formatStatus(item.status)} · {formatActivityDate(item.createdAt)}</small>
              </>
            ) : type === "crops" ? (
              <>
                <strong>{item.name}</strong>
                <small>{item.category} · {formatStatus(item.status)} · {formatActivityDate(item.createdAt)}</small>
              </>
            ) : (
              <>
                <strong>Order {item.id.slice(0, 8)}</strong>
                <small>{formatStatus(item.status)} · {formatActivityDate(item.createdAt)}</small>
              </>
            )}
          </span>
          {type === "orders" && (
            <b className="admin-activity-row__amount">{formatAmount(item.totalAmount)}</b>
          )}
        </article>
      ))}
    </div>
  );
}

function AdminActivity() {
  const activity = useAdminRecentActivityQuery(20);

  return (
    <m.div
      className="admin-page"
      initial={{ opacity: 0, y: 7 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.26, ease: "easeOut" }}
    >
      <div className="admin-page-heading">
        <div>
          <p className="admin-eyebrow">Platform pulse <span aria-hidden="true" /></p>
          <h2>Recent activity.</h2>
          <p>Latest registrations, crop listings, and orders. Personal contact details are not shown.</p>
        </div>
      </div>

      <div className="admin-activity-page-grid">
        <AdminPanel eyebrow="People" title="Latest registrations">
          <ActivityList
            type="registrations"
            items={activity.data?.users}
            isLoading={activity.isLoading}
            isError={activity.isError}
            onRetry={activity.refetch}
          />
        </AdminPanel>
        <AdminPanel eyebrow="Marketplace" title="Latest crops">
          <ActivityList
            type="crops"
            items={activity.data?.crops}
            isLoading={activity.isLoading}
            isError={activity.isError}
            onRetry={activity.refetch}
          />
        </AdminPanel>
        <AdminPanel eyebrow="Transactions" title="Latest orders" className="admin-activity-page-grid__wide">
          <ActivityList
            type="orders"
            items={activity.data?.orders}
            isLoading={activity.isLoading}
            isError={activity.isError}
            onRetry={activity.refetch}
          />
        </AdminPanel>
      </div>
    </m.div>
  );
}

export default AdminActivity;
