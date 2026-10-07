import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import app from '../server.js';
import { pool } from '../config/db.js';
import { insertManyPriceHistory } from '../models/priceHistoryModel.js';

const marker = `AnalyticsTest-${randomUUID()}`;
const fixtureRows = [
  {
    commodity: `${marker} Tomato`,
    variety: 'Plain Variety',
    grade: 'FAQ',
    market: 'MarketToken East',
    district: 'DistrictToken East',
    state: 'StateToken South',
    arrival_date: '2024-01-01',
    min_price: 10.11,
    max_price: 20.15,
    modal_price: 15.34,
  },
  {
    commodity: `${marker} Tomato`,
    variety: 'VarietyToken Local',
    grade: 'FAQ',
    market: 'MarketToken West',
    district: 'DistrictToken West',
    state: 'StateToken North',
    arrival_date: '2024-01-01',
    min_price: 20.12,
    max_price: 30.14,
    modal_price: 25.55,
  },
  {
    commodity: `${marker} Onion`,
    variety: 'Plain Variety',
    grade: 'FAQ',
    market: 'MarketToken East',
    district: 'DistrictToken Other',
    state: 'StateToken South',
    arrival_date: '2024-01-02',
    min_price: null,
    max_price: 40.5,
    modal_price: null,
  },
];

await insertManyPriceHistory(fixtureRows);

test.after(async () => {
  await pool.query('DELETE FROM price_history WHERE commodity LIKE $1', [`${marker}%`]);
});

test('Swagger documents the analytics response fields', async () => {
  const response = await request(app).get('/api/docs.json');

  assert.equal(response.status, 200);
  const operation = response.body.paths['/api/prices/analytics'].get;
  const responseSchema = operation.responses['200'].content['application/json'].schema;
  const trendSchema = responseSchema.properties.trend.items;

  assert.deepEqual(trendSchema.required, [
    'date',
    'avgMinPrice',
    'avgMaxPrice',
    'avgModalPrice',
    'minModalPrice',
    'maxModalPrice',
    'recordCount',
  ]);
  assert.equal(
    responseSchema.properties.marketBreakdown.items.$ref,
    '#/components/schemas/PriceBreakdown'
  );
});

test('GET /api/prices/analytics returns aggregate summary, chronological trend, and breakdowns', async () => {
  const response = await request(app)
    .get(`/api/prices/analytics?search=${encodeURIComponent(marker)}`);

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.deepEqual(response.body.filters, {
    commodity: null,
    state: null,
    district: null,
    market: null,
    search: marker,
    fromDate: null,
    toDate: null,
  });
  assert.deepEqual(response.body.summary, {
    totalRecords: 3,
    averageMinPrice: 15.12,
    averageMaxPrice: 30.26,
    averageModalPrice: 20.45,
    minimumPrice: 15.34,
    maximumPrice: 25.55,
  });

  assert.equal(response.body.trend.length, 2);
  assert.deepEqual(response.body.trend[0], {
    date: '2024-01-01',
    avgMinPrice: 15.12,
    avgMaxPrice: 25.15,
    avgModalPrice: 20.45,
    minModalPrice: 15.34,
    maxModalPrice: 25.55,
    recordCount: 2,
  });
  assert.deepEqual(response.body.trend[1], {
    date: '2024-01-02',
    avgMinPrice: null,
    avgMaxPrice: 40.5,
    avgModalPrice: null,
    minModalPrice: null,
    maxModalPrice: null,
    recordCount: 1,
  });

  assert.deepEqual(response.body.marketBreakdown, [
    { market: 'MarketToken West', averageModalPrice: 25.55, minimumModalPrice: 25.55, maximumModalPrice: 25.55, recordCount: 1 },
    { market: 'MarketToken East', averageModalPrice: 15.34, minimumModalPrice: 15.34, maximumModalPrice: 15.34, recordCount: 2 },
  ]);
  assert.deepEqual(response.body.stateBreakdown, [
    { state: 'StateToken North', averageModalPrice: 25.55, minimumModalPrice: 25.55, maximumModalPrice: 25.55, recordCount: 1 },
    { state: 'StateToken South', averageModalPrice: 15.34, minimumModalPrice: 15.34, maximumModalPrice: 15.34, recordCount: 2 },
  ]);
  assert.deepEqual(response.body.commodityBreakdown, [
    { commodity: `${marker} Tomato`, averageModalPrice: 20.45, minimumModalPrice: 15.34, maximumModalPrice: 25.55, recordCount: 2 },
    { commodity: `${marker} Onion`, averageModalPrice: null, minimumModalPrice: null, maximumModalPrice: null, recordCount: 1 },
  ]);
});

test('analytics applies all text/search filters case-insensitively and combines them', async () => {
  const tomato = await request(app)
    .get(`/api/prices/analytics?commodity=${encodeURIComponent(`${marker.toLowerCase()} tomato`)}`);
  const state = await request(app).get('/api/prices/analytics?state=statetoken%20south');
  const district = await request(app).get('/api/prices/analytics?district=districttoken%20east');
  const market = await request(app).get('/api/prices/analytics?market=markettoken%20east');
  const varietySearch = await request(app).get('/api/prices/analytics?search=varietytoken');
  const marketSearch = await request(app).get('/api/prices/analytics?search=markettoken%20west');
  const districtSearch = await request(app).get('/api/prices/analytics?search=districttoken%20east');
  const stateSearch = await request(app).get('/api/prices/analytics?search=statetoken%20north');
  const combined = await request(app)
    .get(`/api/prices/analytics?commodity=${encodeURIComponent(`${marker.toLowerCase()} tomato`)}&state=statetoken%20south&district=districttoken%20east&market=markettoken%20east&search=analytics`);

  assert.equal(tomato.body.summary.totalRecords, 2);
  assert.equal(state.body.summary.totalRecords, 2);
  assert.equal(district.body.summary.totalRecords, 1);
  assert.equal(market.body.summary.totalRecords, 2);
  assert.equal(varietySearch.body.summary.totalRecords, 1);
  assert.equal(marketSearch.body.summary.totalRecords, 1);
  assert.equal(districtSearch.body.summary.totalRecords, 1);
  assert.equal(stateSearch.body.summary.totalRecords, 1);
  assert.equal(combined.body.summary.totalRecords, 1);
});

test('analytics applies inclusive date filters and validates malformed or reversed dates', async () => {
  const prefix = '/api/prices/analytics?search=' + encodeURIComponent(marker);
  const fromDate = await request(app).get(`${prefix}&fromDate=2024-01-02`);
  const toDate = await request(app).get(`${prefix}&toDate=2024-01-01`);
  const bothDates = await request(app).get(`${prefix}&fromDate=2024-01-01&toDate=2024-01-02`);
  const malformed = await request(app).get(`${prefix}&fromDate=2024-02-30`);
  const badFormat = await request(app).get(`${prefix}&toDate=2024-1-02`);
  const reversed = await request(app).get(`${prefix}&fromDate=2024-01-02&toDate=2024-01-01`);

  assert.equal(fromDate.body.summary.totalRecords, 1);
  assert.equal(toDate.body.summary.totalRecords, 2);
  assert.equal(bothDates.body.summary.totalRecords, 3);
  assert.equal(malformed.status, 400);
  assert.equal(badFormat.status, 400);
  assert.equal(reversed.status, 400);
});

test('analytics returns null aggregates and empty breakdowns for no matches and does not modify observations', async () => {
  const before = await pool.query('SELECT COUNT(*)::int AS total FROM price_history');
  const response = await request(app)
    .get(`/api/prices/analytics?commodity=${encodeURIComponent(`${marker} Missing`)}`);

  assert.equal(response.status, 200);
  assert.equal(response.body.summary.totalRecords, 0);
  assert.equal(response.body.summary.averageMinPrice, null);
  assert.equal(response.body.summary.averageMaxPrice, null);
  assert.equal(response.body.summary.averageModalPrice, null);
  assert.equal(response.body.summary.minimumPrice, null);
  assert.equal(response.body.summary.maximumPrice, null);
  assert.deepEqual(response.body.trend, []);
  assert.deepEqual(response.body.marketBreakdown, []);
  assert.deepEqual(response.body.stateBreakdown, []);
  assert.deepEqual(response.body.commodityBreakdown, []);

  const injection = await request(app)
    .get(`/api/prices/analytics?commodity=${encodeURIComponent(`${marker}' OR 1=1 --`)}`);
  assert.equal(injection.status, 200);
  assert.equal(injection.body.summary.totalRecords, 0);

  const after = await pool.query('SELECT COUNT(*)::int AS total FROM price_history');
  assert.equal(after.rows[0].total, before.rows[0].total);
});
