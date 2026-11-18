import { pool } from '../config/db.js';

export async function getFarmerCropsForWastageAlerts(
  farmerId,
  recentOrderWindowDays,
  queryable = pool,
) {
  const result = await queryable.query(
    `SELECT
       c.id AS crop_id,
       c.name AS crop_name,
       c.quantity AS remaining_quantity,
       c.unit,
       TO_CHAR(c.expiry_date, 'YYYY-MM-DD') AS expiry_date,
       TO_CHAR(c.harvest_date, 'YYYY-MM-DD') AS harvest_date,
       c.status,
       COALESCE(recent_orders.order_count, 0)::int AS recent_order_count,
       recent_orders.last_order_at
     FROM crops c
     LEFT JOIN LATERAL (
       SELECT
         COUNT(o.id)::int AS order_count,
         MAX(o.created_at) AS last_order_at
       FROM orders o
       WHERE o.crop_id = c.id
         AND o.farmer_id = c.farmer_id
         AND o.status <> 'cancelled'
         AND o.created_at >= NOW() - ($2::int * INTERVAL '1 day')
     ) recent_orders ON TRUE
     WHERE c.farmer_id = $1
       AND c.status = 'available'
     ORDER BY c.expiry_date ASC NULLS LAST, c.harvest_date ASC NULLS LAST, c.id ASC`,
    [farmerId, recentOrderWindowDays],
  );

  return result.rows;
}
