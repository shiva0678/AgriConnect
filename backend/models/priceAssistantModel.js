import { pool } from '../config/db.js';

const PRICE_ASSISTANT_RECORD_LIMIT = 8;
const MARKET_BREAKDOWN_LIMIT = 10;

const PRICE_ASSISTANT_COLUMNS = `
  id,
  commodity,
  variety,
  grade,
  market,
  district,
  state,
  arrival_date::text AS arrival_date,
  min_price,
  max_price,
  modal_price`;

function buildPriceAssistantWhereClause(filters) {
  const conditions = filters.matchNothing ? ['FALSE'] : [];
  const values = [];

  for (const [column, filterValues] of Object.entries({
    commodity: filters.commodities,
    market: filters.markets,
    district: filters.districts,
    state: filters.states,
  })) {
    if (filterValues.length === 0) {
      continue;
    }

    values.push(filterValues);
    conditions.push(`${column} = ANY($${values.length}::text[])`);
  }

  return {
    whereClause: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    values,
  };
}

export async function getPriceAssistantVocabulary(queryable = pool) {
  const result = await queryable.query(
    `SELECT DISTINCT commodity, market, district, state
     FROM price_history`
  );

  return {
    commodities: [...new Set(result.rows.map((row) => row.commodity).filter(Boolean))],
    markets: [...new Set(result.rows.map((row) => row.market).filter(Boolean))],
    districts: [...new Set(result.rows.map((row) => row.district).filter(Boolean))],
    states: [...new Set(result.rows.map((row) => row.state).filter(Boolean))],
  };
}

export async function getPriceAssistantData(filters, queryable = pool) {
  const { whereClause, values } = buildPriceAssistantWhereClause(filters);
  const [summaryResult, marketResult, observationResult, lowestResult, highestResult] =
    await Promise.all([
      queryable.query(
        `SELECT
           COUNT(*)::int AS record_count,
           COUNT(DISTINCT arrival_date)::int AS distinct_date_count,
           MAX(arrival_date)::text AS data_as_of,
           (SELECT MAX(arrival_date)::text FROM price_history) AS dataset_as_of,
           MIN(modal_price) AS minimum_modal_price,
           MAX(modal_price) AS maximum_modal_price,
           ROUND(AVG(modal_price), 2) AS average_modal_price,
           MIN(min_price) AS minimum_reported_min_price,
           MAX(max_price) AS maximum_reported_max_price
         FROM price_history
         ${whereClause}`,
        values
      ),
      queryable.query(
        `SELECT
           market,
           district,
           state,
           ROUND(AVG(modal_price), 2) AS average_modal_price,
           MIN(modal_price) AS minimum_modal_price,
           MAX(modal_price) AS maximum_modal_price,
           COUNT(*)::int AS record_count
         FROM price_history
         ${whereClause}
         GROUP BY market, district, state
         ORDER BY AVG(modal_price) DESC NULLS LAST, market ASC
         LIMIT ${MARKET_BREAKDOWN_LIMIT}`,
        values
      ),
      queryable.query(
        `SELECT ${PRICE_ASSISTANT_COLUMNS}
         FROM price_history
         ${whereClause}
         ORDER BY arrival_date DESC, id DESC
         LIMIT ${PRICE_ASSISTANT_RECORD_LIMIT}`,
        values
      ),
      queryable.query(
        `SELECT ${PRICE_ASSISTANT_COLUMNS}
         FROM price_history
         ${whereClause}
         ORDER BY modal_price ASC NULLS LAST, arrival_date DESC, id ASC
         LIMIT 1`,
        values
      ),
      queryable.query(
        `SELECT ${PRICE_ASSISTANT_COLUMNS}
         FROM price_history
         ${whereClause}
         ORDER BY modal_price DESC NULLS LAST, arrival_date DESC, id DESC
         LIMIT 1`,
        values
      ),
    ]);

  return {
    summary: summaryResult.rows[0],
    marketBreakdown: marketResult.rows,
    observations: observationResult.rows,
    lowestObservation: lowestResult.rows[0] || null,
    highestObservation: highestResult.rows[0] || null,
  };
}