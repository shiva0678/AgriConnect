import { pool } from '../config/db.js';

const MONTH_WINDOW_CTE = `
  WITH bounds AS (
    SELECT
      CASE
        WHEN $2::date IS NULL THEN
          date_trunc('month', NOW() AT TIME ZONE 'UTC')
          - (($1::int - 1) * INTERVAL '1 month')
        ELSE $2::date::timestamp
      END AS range_start,
      CASE
        WHEN $3::date IS NULL THEN
          date_trunc('month', NOW() AT TIME ZONE 'UTC') + INTERVAL '1 month'
        ELSE ($3::date + 1)::timestamp
      END AS range_end
  ),
  months AS (
    SELECT generate_series(
      date_trunc('month', range_start),
      date_trunc('month', range_end - INTERVAL '1 microsecond'),
      INTERVAL '1 month'
    ) AS month
    FROM bounds
  )
`;

const DATE_FILTER_VALUES = (filters) => [
  filters.months,
  filters.fromDate,
  filters.toDate,
];

const MONTHLY_COUNT_SOURCES = {
  registrations: { table: 'users' },
  crops: { table: 'crops' },
};

async function getMonthlyCounts(sourceName, filters) {
  const source = MONTHLY_COUNT_SOURCES[sourceName];
  const result = await pool.query(`
    ${MONTH_WINDOW_CTE},
    activity AS (
      SELECT
        date_trunc('month', source_rows.created_at AT TIME ZONE 'UTC') AS month,
        COUNT(*)::int AS count
      FROM ${source.table} source_rows
      CROSS JOIN bounds b
      WHERE source_rows.created_at >= (b.range_start AT TIME ZONE 'UTC')
        AND source_rows.created_at < (b.range_end AT TIME ZONE 'UTC')
      GROUP BY 1
    )
    SELECT
      TO_CHAR(m.month, 'YYYY-MM') AS month,
      COALESCE(a.count, 0)::int AS count
    FROM months m
    LEFT JOIN activity a ON a.month = m.month
    ORDER BY m.month ASC
  `, DATE_FILTER_VALUES(filters));
  return result.rows;
}

export async function getDashboardOverview() {
  const result = await pool.query(`
    WITH user_summary AS (
      SELECT
        COUNT(*)::int AS total_users,
        COUNT(*) FILTER (WHERE role = 'farmer')::int AS total_farmers,
        COUNT(*) FILTER (WHERE role = 'buyer')::int AS total_buyers,
        COUNT(*) FILTER (WHERE status = 'active')::int AS active_users,
        COUNT(*) FILTER (WHERE status = 'suspended')::int AS suspended_users
      FROM users
    ),
    crop_summary AS (
      SELECT
        COUNT(*)::int AS total_crops,
        COUNT(*) FILTER (WHERE status = 'available')::int AS available_crops,
        COUNT(*) FILTER (WHERE status = 'sold_out')::int AS sold_out_crops,
        COUNT(*) FILTER (WHERE status = 'inactive')::int AS inactive_crops
      FROM crops
    ),
    order_summary AS (
      SELECT
        COUNT(*)::int AS total_orders,
        COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_orders,
        COUNT(*) FILTER (WHERE status = 'confirmed')::int AS confirmed_orders,
        COUNT(*) FILTER (WHERE status = 'shipped')::int AS shipped_orders,
        COUNT(*) FILTER (WHERE status = 'delivered')::int AS delivered_orders,
        COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled_orders,
        COALESCE(
          SUM(total_amount) FILTER (WHERE status = 'delivered'),
          0
        )::text AS gross_delivered_order_value,
        AVG(total_amount) FILTER (WHERE status = 'delivered')::text
          AS average_delivered_order_value
      FROM orders
    )
    SELECT *
    FROM user_summary
    CROSS JOIN crop_summary
    CROSS JOIN order_summary
  `);

  return result.rows[0];
}

export async function getUserSummary() {
  const result = await pool.query(`
    SELECT
      COUNT(*)::int AS total_users,
      COUNT(*) FILTER (WHERE role = 'farmer')::int AS total_farmers,
      COUNT(*) FILTER (WHERE role = 'buyer')::int AS total_buyers,
      COUNT(*) FILTER (WHERE status = 'active')::int AS active_users,
      COUNT(*) FILTER (WHERE status = 'suspended')::int AS suspended_users
    FROM users
  `);
  return result.rows[0];
}

export async function getCropSummary() {
  const result = await pool.query(`
    SELECT
      COUNT(*)::int AS total_crops,
      COUNT(*) FILTER (WHERE status = 'available')::int AS available_crops,
      COUNT(*) FILTER (WHERE status = 'sold_out')::int AS sold_out_crops,
      COUNT(*) FILTER (WHERE status = 'inactive')::int AS inactive_crops
    FROM crops
  `);
  return result.rows[0];
}

export async function getCropCategoryDistribution() {
  const result = await pool.query(`
    SELECT category, COUNT(*)::int AS crop_count
    FROM crops
    GROUP BY category
    ORDER BY crop_count DESC, category ASC
  `);
  return result.rows;
}

export async function getOrderSummary() {
  const result = await pool.query(`
    SELECT
      COUNT(*)::int AS total_orders,
      COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_orders,
      COUNT(*) FILTER (WHERE status = 'confirmed')::int AS confirmed_orders,
      COUNT(*) FILTER (WHERE status = 'shipped')::int AS shipped_orders,
      COUNT(*) FILTER (WHERE status = 'delivered')::int AS delivered_orders,
      COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled_orders,
      COALESCE(
        SUM(total_amount) FILTER (WHERE status = 'delivered'),
        0
      )::text AS gross_delivered_order_value,
      AVG(total_amount) FILTER (WHERE status = 'delivered')::text
        AS average_delivered_order_value
    FROM orders
  `);
  return result.rows[0];
}

export async function getMonthlyTrends(filters) {
  const result = await pool.query(`
    ${MONTH_WINDOW_CTE},
    user_months AS (
      SELECT
        date_trunc('month', u.created_at AT TIME ZONE 'UTC') AS month,
        COUNT(*)::int AS registrations
      FROM users u
      CROSS JOIN bounds b
      WHERE u.created_at >= (b.range_start AT TIME ZONE 'UTC')
        AND u.created_at < (b.range_end AT TIME ZONE 'UTC')
      GROUP BY 1
    ),
    crop_months AS (
      SELECT
        date_trunc('month', c.created_at AT TIME ZONE 'UTC') AS month,
        COUNT(*)::int AS crop_additions
      FROM crops c
      CROSS JOIN bounds b
      WHERE c.created_at >= (b.range_start AT TIME ZONE 'UTC')
        AND c.created_at < (b.range_end AT TIME ZONE 'UTC')
      GROUP BY 1
    ),
    order_months AS (
      SELECT
        date_trunc('month', o.created_at AT TIME ZONE 'UTC') AS month,
        COUNT(*)::int AS order_count,
        COALESCE(
          SUM(o.total_amount) FILTER (WHERE o.status = 'delivered'),
          0
        )::text AS gross_delivered_order_value
      FROM orders o
      CROSS JOIN bounds b
      WHERE o.created_at >= (b.range_start AT TIME ZONE 'UTC')
        AND o.created_at < (b.range_end AT TIME ZONE 'UTC')
      GROUP BY 1
    )
    SELECT
      TO_CHAR(m.month, 'YYYY-MM') AS month,
      COALESCE(u.registrations, 0)::int AS registrations,
      COALESCE(c.crop_additions, 0)::int AS crop_additions,
      COALESCE(o.order_count, 0)::int AS order_count,
      COALESCE(o.gross_delivered_order_value, '0') AS gross_delivered_order_value
    FROM months m
    LEFT JOIN user_months u ON u.month = m.month
    LEFT JOIN crop_months c ON c.month = m.month
    LEFT JOIN order_months o ON o.month = m.month
    ORDER BY m.month ASC
  `, DATE_FILTER_VALUES(filters));
  return result.rows;
}

export async function getMonthlyRegistrations(filters) {
  const rows = await getMonthlyCounts('registrations', filters);
  return rows.map((row) => ({
    month: row.month,
    registrations: row.count,
  }));
}

export async function getMonthlyCropAdditions(filters) {
  const rows = await getMonthlyCounts('crops', filters);
  return rows.map((row) => ({
    month: row.month,
    crop_additions: row.count,
  }));
}

export async function getMonthlyOrders(filters) {
  const result = await pool.query(`
    ${MONTH_WINDOW_CTE},
    activity AS (
      SELECT
        date_trunc('month', o.created_at AT TIME ZONE 'UTC') AS month,
        COUNT(*)::int AS order_count,
        COALESCE(
          SUM(o.total_amount) FILTER (WHERE o.status = 'delivered'),
          0
        )::text AS gross_delivered_order_value
      FROM orders o
      CROSS JOIN bounds b
      WHERE o.created_at >= (b.range_start AT TIME ZONE 'UTC')
        AND o.created_at < (b.range_end AT TIME ZONE 'UTC')
      GROUP BY 1
    )
    SELECT
      TO_CHAR(m.month, 'YYYY-MM') AS month,
      COALESCE(a.order_count, 0)::int AS order_count,
      COALESCE(a.gross_delivered_order_value, '0') AS gross_delivered_order_value
    FROM months m
    LEFT JOIN activity a ON a.month = m.month
    ORDER BY m.month ASC
  `, DATE_FILTER_VALUES(filters));
  return result.rows;
}

export async function getRecentRegistrations(limit) {
  const result = await pool.query(`
    SELECT id, role, status, created_at
    FROM users
    ORDER BY created_at DESC, id DESC
    LIMIT $1
  `, [limit]);
  return result.rows;
}

export async function getRecentCrops(limit) {
  const result = await pool.query(`
    SELECT id, name, category, status, created_at
    FROM crops
    ORDER BY created_at DESC, id DESC
    LIMIT $1
  `, [limit]);
  return result.rows;
}

export async function getRecentOrders(limit) {
  const result = await pool.query(`
    SELECT id, status, total_amount::text AS total_amount, created_at
    FROM orders
    ORDER BY created_at DESC, id DESC
    LIMIT $1
  `, [limit]);
  return result.rows;
}
