import { pool } from '../config/db.js';
import { buildPriceHistoryFilters } from './priceHistoryModel.js';

export async function getPriceAnalytics(filters = {}) {
  const { whereClause, values } = buildPriceHistoryFilters(filters);
  const [summaryResult, trendResult, marketResult, stateResult, commodityResult] = await Promise.all([
    pool.query(
      `SELECT
         COUNT(*)::int AS total_records,
         ROUND(AVG(min_price), 2) AS average_min_price,
         ROUND(AVG(max_price), 2) AS average_max_price,
         ROUND(AVG(modal_price), 2) AS average_modal_price,
         MIN(modal_price) AS minimum_price,
         MAX(modal_price) AS maximum_price
       FROM price_history
       ${whereClause}`,
      values
    ),
    pool.query(
      `SELECT
         arrival_date::text AS date,
         ROUND(AVG(min_price), 2) AS average_min_price,
         ROUND(AVG(max_price), 2) AS average_max_price,
         ROUND(AVG(modal_price), 2) AS average_modal_price,
         MIN(modal_price) AS minimum_modal_price,
         MAX(modal_price) AS maximum_modal_price,
         COUNT(*)::int AS record_count
       FROM price_history
       ${whereClause}
       GROUP BY arrival_date
       ORDER BY arrival_date ASC`,
      values
    ),
    pool.query(
      `SELECT
         market,
         ROUND(AVG(modal_price), 2) AS average_modal_price,
         MIN(modal_price) AS minimum_modal_price,
         MAX(modal_price) AS maximum_modal_price,
         COUNT(*)::int AS record_count
       FROM price_history
       ${whereClause}
       GROUP BY market
       ORDER BY AVG(modal_price) DESC NULLS LAST, market ASC`,
      values
    ),
    pool.query(
      `SELECT
         state,
         ROUND(AVG(modal_price), 2) AS average_modal_price,
         MIN(modal_price) AS minimum_modal_price,
         MAX(modal_price) AS maximum_modal_price,
         COUNT(*)::int AS record_count
       FROM price_history
       ${whereClause}
       GROUP BY state
       ORDER BY AVG(modal_price) DESC NULLS LAST, state ASC`,
      values
    ),
    pool.query(
      `SELECT
         commodity,
         ROUND(AVG(modal_price), 2) AS average_modal_price,
         MIN(modal_price) AS minimum_modal_price,
         MAX(modal_price) AS maximum_modal_price,
         COUNT(*)::int AS record_count
       FROM price_history
       ${whereClause}
       GROUP BY commodity
       ORDER BY AVG(modal_price) DESC NULLS LAST, commodity ASC`,
      values
    ),
  ]);

  return {
    summary: summaryResult.rows[0],
    trend: trendResult.rows,
    marketBreakdown: marketResult.rows,
    stateBreakdown: stateResult.rows,
    commodityBreakdown: commodityResult.rows,
  };
}