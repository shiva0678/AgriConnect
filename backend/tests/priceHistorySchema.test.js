import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { pool, initializeDatabase } from '../config/db.js';
import {
  findPriceHistory,
  insertManyPriceHistory,
  insertPriceHistory,
} from '../models/priceHistoryModel.js';

await initializeDatabase();

const testCommodities = [];

function makeRecord(overrides = {}) {
  const commodity = `PriceTest-${randomUUID()}`;
  testCommodities.push(commodity);

  return {
    commodity,
    variety: 'Standard',
    grade: 'FAQ',
    market: 'Test Mandi',
    district: 'Test District',
    state: 'Test State',
    arrival_date: '2026-10-06',
    min_price: 10.25,
    max_price: 20.75,
    modal_price: 15.5,
    ...overrides,
  };
}

test.after(async () => {
  if (testCommodities.length) {
    await pool.query(
      'DELETE FROM price_history WHERE commodity = ANY($1::text[])',
      [testCommodities]
    );
  }
});

test('price_history table, expected columns, indexes, and existing application tables exist', async () => {
  const columnsResult = await pool.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = 'price_history'`
  );
  const columns = new Set(columnsResult.rows.map((row) => row.column_name));

  for (const column of [
    'id',
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
    'created_at',
  ]) {
    assert.ok(columns.has(column), `expected price_history.${column}`);
  }

  const indexesResult = await pool.query(
    `SELECT indexname
     FROM pg_indexes
     WHERE schemaname = current_schema() AND tablename = 'price_history'`
  );
  const indexes = new Set(indexesResult.rows.map((row) => row.indexname));
  for (const index of [
    'price_history_commodity_idx',
    'price_history_state_idx',
    'price_history_market_idx',
    'price_history_district_idx',
    'price_history_arrival_date_idx',
    'price_history_commodity_arrival_date_idx',
    'price_history_observation_uidx',
  ]) {
    assert.ok(indexes.has(index), `expected index ${index}`);
  }

  const tablesResult = await pool.query(
    `SELECT to_regclass('users') AS users_table,
            to_regclass('crops') AS crops_table,
            to_regclass('orders') AS orders_table`
  );
  assert.equal(tablesResult.rows[0].users_table, 'users');
  assert.equal(tablesResult.rows[0].crops_table, 'crops');
  assert.equal(tablesResult.rows[0].orders_table, 'orders');
});

test('price history model inserts valid records and normalizes nullable source fields', async () => {
  const record = makeRecord({ variety: null, grade: null, district: null });
  const inserted = await insertPriceHistory(record);

  assert.ok(inserted.id);
  assert.equal(inserted.commodity, record.commodity);
  assert.equal(inserted.market, record.market);
  assert.equal(inserted.state, record.state);
  assert.equal(inserted.variety, null);
  assert.equal(inserted.grade, null);
  assert.equal(inserted.district, null);
  assert.equal(Number(inserted.min_price), 10.25);
  assert.equal(Number(inserted.max_price), 20.75);
  assert.equal(Number(inserted.modal_price), 15.5);
  assert.ok(inserted.created_at);
});

test('price_history enforces required fields, non-negative prices, and price ordering', async () => {
  for (const overrides of [
    { commodity: '' },
    { market: '   ' },
    { state: null },
    { arrival_date: null },
    { min_price: -0.01 },
    { max_price: -0.01 },
    { modal_price: -0.01 },
    { min_price: 25, max_price: 20 },
    { min_price: 10, max_price: 20, modal_price: 25 },
  ]) {
    await assert.rejects(
      () => insertPriceHistory(makeRecord(overrides)),
      (error) => ['23502', '23514'].includes(error.code)
    );
  }
});

test('nullable prices are accepted when the source omits values', async () => {
  const inserted = await insertPriceHistory(makeRecord({
    variety: null,
    grade: null,
    district: null,
    min_price: null,
    max_price: null,
    modal_price: null,
  }));

  assert.ok(inserted.id);
  assert.equal(inserted.min_price, null);
  assert.equal(inserted.max_price, null);
  assert.equal(inserted.modal_price, null);
});

test('price history deduplicates exact observations but preserves changed prices', async () => {
  const observation = makeRecord({ variety: null, grade: null, district: null });
  const first = await insertPriceHistory(observation);
  const duplicate = await insertPriceHistory(observation);
  const revisedObservation = await insertPriceHistory({
    ...observation,
    modal_price: 16,
  });

  assert.ok(first.id);
  assert.equal(duplicate, null);
  assert.ok(revisedObservation.id);
  assert.notEqual(revisedObservation.id, first.id);

  const duplicateBatch = await insertManyPriceHistory([
    observation,
    { ...observation, market: 'Second Test Mandi' },
  ]);
  assert.equal(duplicateBatch.length, 1);
});

test('bulk insert and price history filters use parameterized queries and date ranges', async () => {
  const commodity = `BulkPriceTest-${randomUUID()}`;
  testCommodities.push(commodity);
  const records = [
    makeRecord({ commodity, arrival_date: '2026-10-04' }),
    makeRecord({ commodity, arrival_date: '2026-10-05' }),
  ];

  const inserted = await insertManyPriceHistory(records);
  assert.equal(inserted.length, 2);
  assert.deepEqual(await insertManyPriceHistory([]), []);

  const storedDates = await pool.query(
    'SELECT arrival_date::text FROM price_history WHERE commodity = $1 ORDER BY arrival_date',
    [commodity]
  );
  assert.deepEqual(storedDates.rows.map((row) => row.arrival_date), ['2026-10-04', '2026-10-05']);

  const results = await findPriceHistory({
    commodity,
    state: 'Test State',
    market: 'Test Mandi',
    district: 'Test District',
    fromDate: '2026-10-05',
    toDate: '2026-10-06',
    limit: 10,
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].arrival_date, '2026-10-05');
  assert.equal(results[0].commodity, commodity);
  assert.deepEqual(await findPriceHistory({ commodity: `Missing-${commodity}` }), []);
});
