import { useState } from "react";
import { m } from "framer-motion";
import {
  AdminBarChart,
  AdminDistributionBars,
  AdminDonutChart,
  AdminTrendChart,
} from "../../components/admin/AdminCharts";
import {
  AdminErrorState,
  AdminPanel,
  AdminSkeleton,
} from "../../components/admin/AdminDashboardStates";
import {
  useAdminCropsQuery,
  useAdminOrdersQuery,
  useAdminTrendsQuery,
  useAdminUsersQuery,
} from "../../queries/adminDashboard";

const INITIAL_FILTERS = { months: 12, fromDate: null, toDate: null };
const compactAmountFormatter = new Intl.NumberFormat(undefined, {
  notation: "compact",
  maximumFractionDigits: 1,
});

function QueryPanel({ query, children, skeleton = "chart" }) {
  if (query.isLoading) return <AdminSkeleton variant={skeleton} />;
  if (query.isError) return <AdminErrorState onRetry={query.refetch} />;
  return children;
}

function AdminAnalytics() {
  const [months, setMonths] = useState("12");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [filterError, setFilterError] = useState("");
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const users = useAdminUsersQuery(filters);
  const crops = useAdminCropsQuery(filters);
  const orders = useAdminOrdersQuery(filters);
  const trends = useAdminTrendsQuery(filters);

  function applyFilters(event) {
    event.preventDefault();
    setFilterError("");
    if (Boolean(fromDate) !== Boolean(toDate)) {
      setFilterError("Choose both a start date and an end date.");
      return;
    }
    if (fromDate && fromDate > toDate) {
      setFilterError("The start date must be on or before the end date.");
      return;
    }
    if (fromDate) {
      const [fromYear, fromMonth] = fromDate.split("-").map(Number);
      const [toYear, toMonth] = toDate.split("-").map(Number);
      const monthSpan = (toYear - fromYear) * 12 + toMonth - fromMonth + 1;
      if (monthSpan > 36) {
        setFilterError("Choose a date range of 36 months or less.");
        return;
      }
    }
    setFilters({
      months: Number(months),
      fromDate: fromDate || null,
      toDate: toDate || null,
    });
  }

  function resetFilters() {
    setMonths("12");
    setFromDate("");
    setToDate("");
    setFilterError("");
    setFilters(INITIAL_FILTERS);
  }

  const userSummary = users.data?.summary;
  const roleItems = userSummary
    ? [
      { label: "Farmers", value: userSummary.farmers },
      { label: "Buyers", value: userSummary.buyers },
      { label: "Administrators", value: Math.max(0, userSummary.total - userSummary.farmers - userSummary.buyers) },
    ]
    : [];
  const orderSummary = orders.data?.summary;
  const statusItems = orderSummary
    ? [
      { label: "Pending", value: orderSummary.pending },
      { label: "Confirmed", value: orderSummary.confirmed },
      { label: "Shipped", value: orderSummary.shipped },
      { label: "Delivered", value: orderSummary.delivered },
      { label: "Cancelled", value: orderSummary.cancelled },
    ]
    : [];

  return (
    <m.div
      className="admin-page"
      initial={{ opacity: 0, y: 7 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.26, ease: "easeOut" }}
    >
      <div className="admin-page-heading">
        <div>
          <p className="admin-eyebrow">Data explorer <span aria-hidden="true" /></p>
          <h2>Understand the platform.</h2>
          <p>Compare registrations, listings, and order activity over time.</p>
        </div>
      </div>

      <form className="admin-filter" onSubmit={applyFilters}>
        <div className="admin-filter__intro">
          <span className="admin-filter__icon" aria-hidden="true">⌁</span>
          <span>
            <strong>Trend period</strong>
            <small>Totals remain all-time; filters apply to monthly series.</small>
          </span>
        </div>
        <label>
          <span>Months</span>
          <select value={months} onChange={(event) => setMonths(event.target.value)}>
            <option value="6">Last 6 months</option>
            <option value="12">Last 12 months</option>
            <option value="24">Last 24 months</option>
            <option value="36">Last 36 months</option>
          </select>
        </label>
        <label>
          <span>From</span>
          <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
        </label>
        <label>
          <span>To</span>
          <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
        </label>
        <div className="admin-filter__actions">
          <button className="admin-button admin-button--primary" type="submit">Apply filters <span aria-hidden="true">↗</span></button>
          <button className="admin-button admin-button--quiet" type="button" onClick={resetFilters}>Reset</button>
        </div>
        {filterError && <p className="admin-filter__error" role="alert">{filterError}</p>}
      </form>

      <div className="admin-analytics-grid">
        <AdminPanel eyebrow="Growth" title="Monthly registrations" className="admin-analytics-panel admin-analytics-panel--growth">
          <QueryPanel query={users}>
            <AdminBarChart
              data={users.data?.monthlyRegistrations}
              valueKey="registrations"
              label="Monthly user registrations"
            />
          </QueryPanel>
        </AdminPanel>
        <AdminPanel eyebrow="Demand" title="Monthly orders" className="admin-analytics-panel admin-analytics-panel--orders">
          <QueryPanel query={orders}>
            <AdminBarChart
              data={orders.data?.monthlyOrders}
              valueKey="orders"
              label="Monthly order counts"
              color="#4d8cff"
            />
          </QueryPanel>
        </AdminPanel>
        <AdminPanel eyebrow="Delivered orders" title="Monthly gross order value" className="admin-analytics-panel admin-analytics-panel--value">
          <QueryPanel query={orders}>
            <AdminBarChart
              data={orders.data?.monthlyOrders}
              valueKey="grossDeliveredOrderValue"
              label="Monthly gross delivered order value, not platform revenue"
              color="#f0a53a"
              formatTick={(value) => compactAmountFormatter.format(value)}
            />
          </QueryPanel>
        </AdminPanel>
        <AdminPanel eyebrow="Marketplace" title="Crop categories" className="admin-analytics-panel admin-analytics-panel--crops">
          <QueryPanel query={crops}>
            <AdminDistributionBars
              items={(crops.data?.categoryDistribution || []).map((item) => ({
                label: item.category,
                value: item.crops,
              }))}
              label="Crop counts by category"
            />
          </QueryPanel>
        </AdminPanel>
        <AdminPanel eyebrow="Fulfillment" title="Order status" className="admin-analytics-panel admin-analytics-panel--status">
          <QueryPanel query={orders}>
            <AdminDonutChart
              items={statusItems}
              label="Order distribution by status"
              centerLabel="Orders"
            />
          </QueryPanel>
        </AdminPanel>
        <AdminPanel eyebrow="Community" title="User roles" className="admin-analytics-panel admin-analytics-panel--roles">
          <QueryPanel query={users}>
            <AdminDonutChart
              items={roleItems}
              label="User distribution by role"
              centerLabel="Accounts"
            />
          </QueryPanel>
        </AdminPanel>
        <AdminPanel
          eyebrow="Cross-platform"
          title="Activity trends"
          className="admin-analytics-grid__wide admin-analytics-panel admin-analytics-panel--trends"
        >
          <QueryPanel query={trends}>
            <AdminTrendChart
              data={trends.data?.trends}
              label="Monthly registrations, crop additions, and orders"
              series={[
                { key: "registrations", label: "Registrations", color: "#20b486" },
                { key: "cropAdditions", label: "Crop additions", color: "#f0a53a" },
                { key: "orders", label: "Orders", color: "#4d8cff" },
              ]}
            />
          </QueryPanel>
        </AdminPanel>
      </div>

      {(orders.data?.financialNote) && (
        <p className="admin-financial-note">
          <span aria-hidden="true">ⓘ</span>
          {orders.data.financialNote}
        </p>
      )}
    </m.div>
  );
}

export default AdminAnalytics;
