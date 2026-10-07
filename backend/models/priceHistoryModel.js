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
  fromDate,
  toDate,
  limit = 100,
  offset = 0,
} = {}) {
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
      conditions.push(`${column} = $${values.length}`);
    }
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
  values.push(limit, offset);

  const result = await pool.query(
    `SELECT ${RETURNING_COLUMNS}
     FROM price_history
     ${whereClause}
     ORDER BY arrival_date DESC, created_at DESC, id DESC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );

  return result.rows;
}
