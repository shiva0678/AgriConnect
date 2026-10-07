import { pool } from '../config/db.js';

const PRICE_HISTORY_COLUMNS = [
  'commodity',
  'variety',
  'grade',
  'market',
  'district',
  'state',
  'arrival_date',
  'min_price',
  'max_price',
  'modal_price',
];
const RETURNING_COLUMNS = `
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
  modal_price,
  created_at`;
const PRICE_HISTORY_SORTS = {
  newest: 'arrival_date DESC, id DESC',
  oldest: 'arrival_date ASC, id ASC',
  price_asc: 'modal_price ASC NULLS LAST, id ASC',
  price_desc: 'modal_price DESC NULLS LAST, id DESC',
};
const PRICE_HISTORY_READ_COLUMNS = `
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

function normalizeOptionalText(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized || null;
}

function priceHistoryValues(record) {
  return [
    String(record.commodity ?? '').trim(),
    normalizeOptionalText(record.variety),
    normalizeOptionalText(record.grade),
    String(record.market ?? '').trim(),
    normalizeOptionalText(record.district),
    String(record.state ?? '').trim(),
    record.arrival_date,
    record.min_price ?? null,
    record.max_price ?? null,
    record.modal_price ?? null,
  ];
}

export async function insertPriceHistory(record) {
  const placeholders = PRICE_HISTORY_COLUMNS.map((_, index) => `$${index + 1}`);
  const result = await pool.query(
    `INSERT INTO price_history (${PRICE_HISTORY_COLUMNS.join(', ')})
     VALUES (${placeholders.join(', ')})
     ON CONFLICT DO NOTHING
    RETURNING ${RETURNING_COLUMNS}`,
    priceHistoryValues(record)
  );

  return result.rows[0] || null;
}

export async function insertManyPriceHistory(records, queryable = pool) {
  if (!Array.isArray(records)) {
    throw new TypeError('Price history records must be an array.');
  }

  if (records.length === 0) {
    return [];
  }

  const values = records.flatMap(priceHistoryValues);
  const tuples = records.map((_, rowIndex) => {
    const firstParameter = rowIndex * PRICE_HISTORY_COLUMNS.length + 1;
    const placeholders = PRICE_HISTORY_COLUMNS.map((__, columnIndex) => `$${firstParameter + columnIndex}`);
    return `(${placeholders.join(', ')})`;
  });

  const result = await queryable.query(
    `INSERT INTO price_history (${PRICE_HISTORY_COLUMNS.join(', ')})
     VALUES ${tuples.join(', ')}
     ON CONFLICT DO NOTHING
    RETURNING ${RETURNING_COLUMNS}`,
    values
  );

  return result.rows;
}

export async function findPriceHistory({
  commodity,
  state,
  market,
  district,
  search,
  fromDate,
  toDate,
  page = 1,
  limit = 100,
  offset = 0,
  sort = 'newest',
  includeTotal = false,
} = {}) {
  if (!Number.isSafeInteger(page) || page <= 0) {
    throw new TypeError('Price history page must be a positive integer.');
  }

  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw new TypeError('Price history limit must be a positive integer.');
  }

  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new TypeError('Price history offset must be a non-negative integer.');
  }

  const conditions = [];
  const values = [];

  for (const [column, value] of Object.entries({ commodity, state, market, district })) {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      values.push(String(value).trim());
      conditions.push(`${column} ILIKE $${values.length}`);
    }
  }

  if (search !== undefined && search !== null && String(search).trim() !== '') {
    values.push(`%${String(search).trim()}%`);
    const searchParameter = `$${values.length}`;
    conditions.push(`(
      commodity ILIKE ${searchParameter} OR
      variety ILIKE ${searchParameter} OR
      market ILIKE ${searchParameter} OR
      district ILIKE ${searchParameter} OR
      state ILIKE ${searchParameter}
    )`);
  }

  if (fromDate !== undefined && fromDate !== null) {
    values.push(fromDate);
    conditions.push(`arrival_date >= $${values.length}`);
  }

  if (toDate !== undefined && toDate !== null) {
    values.push(toDate);
    conditions.push(`arrival_date <= $${values.length}`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const orderBy = PRICE_HISTORY_SORTS[sort];
  if (!orderBy) {
    throw new TypeError('Unsupported price history sort value.');
  }

  const countValues = [...values];
  const listingValues = [...values, limit, (page - 1) * limit + offset];
  const [countResult, listingResult] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::int AS total
       FROM price_history
       ${whereClause}`,
      countValues
    ),
    pool.query(
      `SELECT ${PRICE_HISTORY_READ_COLUMNS}
       FROM price_history
       ${whereClause}
       ORDER BY ${orderBy}
       LIMIT $${listingValues.length - 1} OFFSET $${listingValues.length}`,
      listingValues
    ),
  ]);

  const result = {
    prices: listingResult.rows,
    total: Number(countResult.rows[0]?.total ?? 0),
  };

  return includeTotal ? result : result.prices;
}
