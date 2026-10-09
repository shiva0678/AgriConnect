import { pool } from '../config/db.js';
import { buildPriceHistoryFilters } from './priceHistoryModel.js';

function shiftDate(date, days) {
  const shifted = new Date(`${date}T00:00:00.000Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

export async function getDemandOutlookData(filters = {}) {
  const anchorResult = await pool.query(
    'SELECT MAX(arrival_date)::text AS data_as_of FROM price_history'
  );
  const dataAsOf = anchorResult.rows[0]?.data_as_of ?? null;

  if (!dataAsOf) {
    return {
      dataAsOf: null,
      comparisonPeriod: null,
      rows: [],
    };
  }

  const { whereClause, values } = buildPriceHistoryFilters(filters);
  const recentStart = shiftDate(dataAsOf, -29);
  const previousStart = shiftDate(dataAsOf, -59);
  const previousEnd = shiftDate(dataAsOf, -30);
  const queryValues = [...values, recentStart, dataAsOf, previousStart, previousEnd];
  const recentStartParameter = values.length + 1;
  const recentEndParameter = values.length + 2;
  const previousStartParameter = values.length + 3;
  const previousEndParameter = values.length + 4;

  const result = await pool.query(
    `SELECT
       commodity,
       COUNT(*)::int AS observation_count,
       COUNT(DISTINCT market)::int AS market_count,
       ROUND(AVG(modal_price) FILTER (
         WHERE arrival_date BETWEEN $${recentStartParameter} AND $${recentEndParameter}
       ), 2) AS current_average_modal_price,
       ROUND(AVG(modal_price) FILTER (
         WHERE arrival_date BETWEEN $${previousStartParameter} AND $${previousEndParameter}
       ), 2) AS previous_average_modal_price
     FROM price_history
     ${whereClause}
     GROUP BY commodity`,
    queryValues
  );

  return {
    dataAsOf,
    comparisonPeriod: {
      recent: { from: recentStart, to: dataAsOf },
      previous: { from: previousStart, to: previousEnd },
    },
    rows: result.rows,
  };
}
