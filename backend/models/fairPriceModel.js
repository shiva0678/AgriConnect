import { pool } from '../config/db.js';

const MAX_LOCATION_TERMS = 5;

function getLocationTerms(location) {
  return String(location ?? '')
    .split(',')
    .map((term) => term.trim())
    .filter(Boolean)
    .slice(0, MAX_LOCATION_TERMS);
}

export async function getFairPriceHistoryReference(
  { commodity, location },
  queryable = pool,
) {
  const values = [commodity];
  const locationConditions = [];

  for (const term of getLocationTerms(location)) {
    values.push(term);
    const parameter = `$${values.length}`;
    locationConditions.push(`(
      LOWER(BTRIM(market)) = LOWER(BTRIM(${parameter})) OR
      LOWER(BTRIM(district)) = LOWER(BTRIM(${parameter})) OR
      LOWER(BTRIM(state)) = LOWER(BTRIM(${parameter}))
    )`);
  }

  const hasLocationConditions = locationConditions.length > 0;
  const locationMatchExpression = hasLocationConditions
    ? `COALESCE((${locationConditions.join(' OR ')}), FALSE)`
    : 'FALSE';

  const result = await queryable.query(
    `WITH matching_prices AS (
       SELECT
         modal_price,
         market,
         arrival_date,
         ${locationMatchExpression} AS location_matched
       FROM price_history
       WHERE LOWER(BTRIM(commodity)) = LOWER(BTRIM($1))
         AND modal_price IS NOT NULL
     )
     SELECT
       location_matched,
       COUNT(*)::int AS observation_count,
       ROUND(AVG(modal_price), 2) AS average_modal_price,
       MIN(modal_price) AS minimum_modal_price,
       MAX(modal_price) AS maximum_modal_price,
       TO_CHAR(MIN(arrival_date), 'YYYY-MM-DD') AS observation_start_date,
       TO_CHAR(MAX(arrival_date), 'YYYY-MM-DD') AS observation_end_date,
       (ARRAY_AGG(DISTINCT market ORDER BY market))[1:10] AS relevant_markets,
       COUNT(DISTINCT market)::int AS relevant_market_count
     FROM matching_prices
     GROUP BY location_matched
     ORDER BY location_matched DESC
     LIMIT 1`,
    values,
  );

  const row = result.rows[0];
  if (!row) {
    return {
      observationCount: 0,
      averageModalPrice: null,
      minimumModalPrice: null,
      maximumModalPrice: null,
      observationStartDate: null,
      observationEndDate: null,
      relevantMarkets: [],
      relevantMarketCount: 0,
      locationMatched: false,
    };
  }

  return {
    observationCount: Number(row.observation_count),
    averageModalPrice: row.average_modal_price === null
      ? null
      : Number(row.average_modal_price),
    minimumModalPrice: row.minimum_modal_price === null
      ? null
      : Number(row.minimum_modal_price),
    maximumModalPrice: row.maximum_modal_price === null
      ? null
      : Number(row.maximum_modal_price),
    observationStartDate: row.observation_start_date,
    observationEndDate: row.observation_end_date,
    relevantMarkets: row.relevant_markets || [],
    relevantMarketCount: Number(row.relevant_market_count),
    locationMatched: row.location_matched,
  };
}
