import { Link } from "react-router-dom";
import { m } from "framer-motion";
import {
  AdminBarChart,
  AdminTrendChart,
} from "../../components/admin/AdminCharts";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminPanel,
  AdminSkeleton,
} from "../../components/admin/AdminDashboardStates";
import {
  useAdminOverviewQuery,
  useAdminRecentActivityQuery,
  useAdminTrendsQuery,
} from "../../queries/adminDashboard";
import { formatActivityDate, formatAmount, formatCount, formatStatus } from "./adminFormat";

const DEFAULT_FILTERS = { months: 12, fromDate: null, toDate: null };

function StatCard({ label, value, note, icon, tone, loading }) {
  return (
    <article className={`admin-stat admin-stat--${tone}`}>
      <span className="admin-stat__icon" aria-hidden="true">{icon}</span>
      <span className="admin-stat__label">{label}</span>
      {loading ? (
        <span className="admin-skeleton__value" aria-hidden="true" />
      ) : (
        <strong>{value}</strong>
      )}
      <small>{note}</small>
    </article>
  );
}

function RecentSummary({ title, items, type, isLoading, isError, onRetry }) {
  return (
    <AdminPanel
      eyebrow="Latest activity"
      title={title}
      action={<Link className="admin-panel__link" to="/admin/activity">View all <span aria-hidden="true">↗</span></Link>}
      className="admin-activity-preview"
    >
      {isLoading ? (
        <AdminSkeleton variant="rows" count={3} />
      ) : isError ? (
        <AdminErrorState onRetry={onRetry} />
      ) : items?.length ? (
        <div className="admin-activity-list">
          {items.slice(0, 4).map((item) => (
            <div className="admin-activity-row" key={item.id}>
              <span className={`admin-activity-mark admin-activity-mark--${type}`} aria-hidden="true">
                {type === "user" ? "◎" : type === "crop" ? "◫" : "↗"}
              </span>
              <span className="admin-activity-row__body">
                {type === "user" ? (
                  <>
                    <strong>New {item.role} account</strong>
                    <small>{formatStatus(item.status)} · {formatActivityDate(item.createdAt)}</small>
                  </>
                ) : type === "crop" ? (
                  <>
                    <strong>{item.name}</strong>
                    <small>{item.category} · {formatActivityDate(item.createdAt)}</small>
                  </>
                ) : (
                  <>
                    <strong>Order {item.id.slice(0, 8)}</strong>
                    <small>{formatStatus(item.status)} · {formatActivityDate(item.createdAt)}</small>
                  </>
                )}
              </span>
              {type === "order" && (
                <b className="admin-activity-row__amount">{formatAmount(item.totalAmount)}</b>
              )}
            </div>
          ))}
        </div>
      ) : (
        <AdminEmptyState message={`No recent ${type === "user" ? "registrations" : `${type} activity`} yet.`} />
      )}
    </AdminPanel>
  );
}

function AdminOverview() {
  const overview = useAdminOverviewQuery();
  const trends = useAdminTrendsQuery(DEFAULT_FILTERS);
  const activity = useAdminRecentActivityQuery(6);
  const stats = overview.data
    ? [
      { label: "Total users", value: formatCount(overview.data.users.total), note: `${formatCount(overview.data.users.active)} active accounts`, icon: "◎", tone: "forest" },
      { label: "Farmers", value: formatCount(overview.data.users.farmers), note: "Registered growers", icon: "✳", tone: "leaf" },
      { label: "Buyers", value: formatCount(overview.data.users.buyers), note: "Registered buyers", icon: "⌕", tone: "blue" },
      { label: "Total crops", value: formatCount(overview.data.crops.total), note: `${formatCount(overview.data.crops.available)} currently available`, icon: "◫", tone: "gold" },
      { label: "Total orders", value: formatCount(overview.data.orders.total), note: `${formatCount(overview.data.orders.delivered)} delivered`, icon: "↗", tone: "rose" },
      { label: "Gross delivered value", value: formatAmount(overview.data.orders.grossDeliveredOrderValue), note: "Not platform revenue", icon: "◷", tone: "forest" },
    ]
    : [];

  async function refreshDashboard() {
    await Promise.all([
      overview.refetch(),
      trends.refetch(),
      activity.refetch(),
    ]);
  }

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
          <h2>Your platform, at a glance.</h2>
          <p>A live snapshot of activity across AgriConnect.</p>
        </div>
        <button
          className="admin-button admin-button--quiet"
          type="button"
          onClick={refreshDashboard}
          disabled={overview.isFetching || trends.isFetching || activity.isFetching}
        >
          <span aria-hidden="true">↻</span>
          {overview.isFetching || trends.isFetching || activity.isFetching ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {overview.isError ? (
        <AdminPanel eyebrow="Overview" title="Platform totals">
          <AdminErrorState onRetry={overview.refetch} />
        </AdminPanel>
      ) : (
        <div className="admin-stats-grid" aria-busy={overview.isLoading}>
          {overview.isLoading ? (
            <AdminSkeleton variant="stats" count={6} />
          ) : stats.map((stat) => <StatCard key={stat.label} {...stat} />)}
        </div>
      )}

      {overview.data?.financialNote && (
        <p className="admin-financial-note">
          <span aria-hidden="true">ⓘ</span>
          {overview.data.financialNote}
        </p>
      )}

      <div className="admin-overview-grid">
        <AdminPanel
          eyebrow="Last 12 months"
          title="Platform activity"
          action={<Link className="admin-panel__link" to="/admin/analytics">Explore analytics <span aria-hidden="true">↗</span></Link>}
          className="admin-overview-grid__wide"
        >
          {trends.isLoading ? (
            <AdminSkeleton variant="chart" />
          ) : trends.isError ? (
            <AdminErrorState onRetry={trends.refetch} />
          ) : (
            <AdminTrendChart
              data={trends.data.trends}
              label="Monthly user registrations, crop additions, and orders"
              series={[
                { key: "registrations", label: "Registrations", color: "#2f8061" },
                { key: "cropAdditions", label: "Crop additions", color: "#d9a13f" },
                { key: "orders", label: "Orders", color: "#718fa1" },
              ]}
            />
          )}
        </AdminPanel>
        <AdminPanel eyebrow="Marketplace health" title="Order pipeline">
          {overview.isLoading ? (
            <AdminSkeleton variant="rows" count={4} />
          ) : overview.isError ? (
            <AdminErrorState onRetry={overview.refetch} />
          ) : (
            <AdminBarChart
              data={[
                { month: "Pending", count: overview.data.orders.pending },
                { month: "Confirmed", count: overview.data.orders.confirmed },
                { month: "Shipped", count: overview.data.orders.shipped },
                { month: "Delivered", count: overview.data.orders.delivered },
                { month: "Cancelled", count: overview.data.orders.cancelled },
              ]}
              valueKey="count"
              label="Order count by status"
              color="#d39a3c"
            />
          )}
        </AdminPanel>
      </div>

      <div className="admin-activity-grid">
        <RecentSummary
          title="New registrations"
          type="user"
          items={activity.data?.users}
          isLoading={activity.isLoading}
          isError={activity.isError}
          onRetry={activity.refetch}
        />
        <RecentSummary
          title="Recent crops"
          type="crop"
          items={activity.data?.crops}
          isLoading={activity.isLoading}
          isError={activity.isError}
          onRetry={activity.refetch}
        />
        <RecentSummary
          title="Recent orders"
          type="order"
          items={activity.data?.orders}
          isLoading={activity.isLoading}
          isError={activity.isError}
          onRetry={activity.refetch}
        />
      </div>
    </m.div>
  );
}

export default AdminOverview;
