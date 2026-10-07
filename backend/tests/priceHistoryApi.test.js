import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import app from '../server.js';
import { pool } from '../config/db.js';
import { insertManyPriceHistory } from '../models/priceHistoryModel.js';

const marker = `PriceApiTest-${randomUUID()}`;
const fixtureRows = [
  {
    commodity: `${marker} Tomato`,
    variety: `${marker} Alpha Variety`,
    grade: 'FAQ',
    market: `${marker} Bangalore`,
    district: `${marker} North District`,
    state: 'Karnataka',
    arrival_date: '2024-01-01',
    min_price: 100,
    max_price: 200,
    modal_price: 150,
  },
  {
    commodity: `${marker} Tomato`,
    variety: 'Local',
    grade: 'FAQ',
    market: `${marker} Pune`,
    district: `${marker} West District`,
    state: 'Maharashtra',
    arrival_date: '2024-12-31',
    min_price: 50,
    max_price: 250,
    modal_price: 100,
  },
  {
    commodity: `${marker} Onion`,
    variety: `${marker} SearchToken Variety`,
    grade: 'FAQ',
    market: `${marker} Mysore`,
    district: `${marker} North District`,
    state: 'Karnataka',
    arrival_date: '2025-01-01',
    min_price: 10,
    max_price: 100,
    modal_price: 55,
  },
  {
    commodity: `${marker} SearchToken Commodity`,
    variety: 'Plain Variety',
    grade: 'FAQ',
    market: `${marker} Commodity Market`,
    district: `${marker} Commodity District`,
    state: `${marker} Commodity State`,
    arrival_date: '2024-06-01',
    min_price: 12,
    max_price: 42,
    modal_price: 28,
  },
  {
    commodity: `${marker} Search State Crop`,
    variety: 'Plain Variety',
    grade: 'FAQ',
    market: `${marker} State Market`,
    district: `${marker} State District`,
    state: `${marker} SearchToken State`,
    arrival_date: '2024-07-01',
    min_price: 12,
    max_price: 42,
    modal_price: 28,
  },
  {
    commodity: `${marker} Search District Crop`,
    variety: 'Plain Variety',
    grade: 'FAQ',
    market: `${marker} District Market`,
    district: `${marker} SearchToken District`,
    state: `${marker} District State`,
    arrival_date: '2024-08-01',
    min_price: 12,
    max_price: 42,
    modal_price: 28,
  },
  {
    commodity: `${marker} Search Market Crop`,
    variety: 'Plain Variety',
    grade: 'FAQ',
    market: `${marker} SearchToken Market`,
    district: `${marker} Market District`,
    state: `${marker} Market State`,
    arrival_date: '2024-09-01',
    min_price: 12,
    max_price: 42,
    modal_price: 28,
  },
];

await insertManyPriceHistory(fixtureRows);

test.after(async () => {
  await pool.query('DELETE FROM price_history WHERE commodity LIKE $1', [`${marker}%`]);
});

test('GET /api/prices returns a public, paginated response with selected safe fields', async () => {
  const response = await request(app).get('/api/prices');

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.ok(Array.isArray(response.body.prices));
  assert.equal(response.body.prices.length, 20);
  assert.equal(response.body.pagination.page, 1);
  assert.equal(response.body.pagination.limit, 20);
  assert.ok(response.body.pagination.total >= fixtureRows.length);
  assert.equal(response.body.pagination.totalPages, Math.ceil(response.body.pagination.total / 20));
  assert.deepEqual(
    Object.keys(response.body.prices[0]).sort(),
    ['arrival_date', 'commodity', 'district', 'grade', 'id', 'market', 'max_price', 'min_price', 'modal_price', 'state', 'variety'].sort()
  );
  assert.equal(typeof response.body.prices[0].arrival_date, 'string');
  assert.match(response.body.prices[0].arrival_date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(typeof response.body.prices[0].modal_price, 'number');
});

test('GET /api/prices paginates, caps the maximum, and sorts both ways', async () => {
  const firstPage = await request(app)
    .get(`/api/prices?commodity=${encodeURIComponent(`${marker} Tomato`)}&limit=1&page=1`);
  const secondPage = await request(app)
    .get(`/api/prices?commodity=${encodeURIComponent(`${marker} Tomato`)}&limit=1&page=2`);
  const capped = await request(app).get('/api/prices?limit=50');

  assert.equal(firstPage.status, 200);
  assert.equal(firstPage.body.prices.length, 1);
  assert.equal(firstPage.body.pagination.page, 1);
  assert.equal(firstPage.body.pagination.limit, 1);
  assert.equal(firstPage.body.pagination.total, 2);
  assert.equal(secondPage.body.pagination.page, 2);
  assert.notEqual(firstPage.body.prices[0].id, secondPage.body.prices[0].id);
  assert.equal(capped.body.pagination.limit, 50);

  const oldest = await request(app)
    .get(`/api/prices?commodity=${encodeURIComponent(`${marker} Tomato`)}&sort=oldest`);
  const newest = await request(app)
    .get(`/api/prices?commodity=${encodeURIComponent(`${marker} Tomato`)}&sort=newest`);
  const ascending = await request(app)
    .get(`/api/prices?commodity=${encodeURIComponent(`${marker} Tomato`)}&sort=price_asc`);
  const descending = await request(app)
    .get(`/api/prices?commodity=${encodeURIComponent(`${marker} Tomato`)}&sort=price_desc`);

  assert.equal(oldest.body.prices[0].arrival_date, '2024-01-01');
  assert.equal(newest.body.prices[0].arrival_date, '2024-12-31');
  assert.equal(ascending.body.prices[0].modal_price, 100);
  assert.equal(descending.body.prices[0].modal_price, 150);
});

test('GET /api/prices applies case-insensitive filters and multi-filter search', async () => {
  const commodity = await request(app)
    .get(`/api/prices?commodity=${encodeURIComponent(`${marker.toLowerCase()} tomato`)}`);
  const state = await request(app).get('/api/prices?state=karnataka');
  const fixtureState = await request(app)
    .get(`/api/prices?state=${encodeURIComponent(`${marker.toLowerCase()} searchtoken state`)}`);
  const district = await request(app)
    .get(`/api/prices?district=${encodeURIComponent(`${marker.toLowerCase()} north district`)}`);
  const market = await request(app)
    .get(`/api/prices?market=${encodeURIComponent(`${marker.toLowerCase()} bangalore`)}`);
  const search = await request(app).get('/api/prices?search=searchtoken');
  const combined = await request(app)
    .get(`/api/prices?commodity=${encodeURIComponent(`${marker.toLowerCase()} tomato`)}&state=karnataka&district=${encodeURIComponent(`${marker.toLowerCase()} north district`)}&market=${encodeURIComponent(`${marker.toLowerCase()} bangalore`)}`);

  assert.equal(commodity.body.pagination.total, 2);
  assert.ok(state.body.prices.every((price) => price.state.toLowerCase() === 'karnataka'));
  assert.equal(fixtureState.body.pagination.total, 1);
  assert.ok(district.body.prices.some((price) => price.commodity === `${marker} Tomato`));
  assert.equal(market.body.pagination.total, 1);
  assert.ok(search.body.prices.some((price) => price.commodity.includes('SearchToken Commodity')));
  assert.ok(search.body.prices.some((price) => price.variety.includes('SearchToken')));
  assert.ok(search.body.prices.some((price) => price.market.includes('SearchToken Market')));
  assert.ok(search.body.prices.some((price) => price.district.includes('SearchToken District')));
  assert.ok(search.body.prices.some((price) => price.state.includes('SearchToken State')));
  assert.equal(combined.body.pagination.total, 1);
  assert.equal(combined.body.prices[0].market, `${marker} Bangalore`);
});

test('GET /api/prices applies inclusive date bounds and rejects invalid dates', async () => {
  const basePath = `/api/prices?commodity=${encodeURIComponent(`${marker} Tomato`)}`;
  const fromDate = await request(app).get(`${basePath}&fromDate=2024-12-31`);
  const toDate = await request(app).get(`${basePath}&toDate=2024-01-01`);
  const bothDates = await request(app).get(`${basePath}&fromDate=2024-01-01&toDate=2024-12-31`);
  const malformed = await request(app).get(`${basePath}&fromDate=2024-02-30`);
  const wrongFormat = await request(app).get(`${basePath}&toDate=2024-1-01`);
  const reversed = await request(app).get(`${basePath}&fromDate=2024-12-31&toDate=2024-01-01`);

  assert.equal(fromDate.body.pagination.total, 1);
  assert.equal(fromDate.body.prices[0].arrival_date, '2024-12-31');
  assert.equal(toDate.body.pagination.total, 1);
  assert.equal(toDate.body.prices[0].arrival_date, '2024-01-01');
  assert.equal(bothDates.body.pagination.total, 2);
  assert.equal(malformed.status, 400);
  assert.equal(wrongFormat.status, 400);
  assert.equal(reversed.status, 400);
});

test('GET /api/prices validates pagination and sort and safely handles empty/injection-style filters', async () => {
  for (const query of ['?page=0', '?page=invalid', '?page=', '?limit=0', '?limit=51', '?limit=bad']) {
    const response = await request(app).get(`/api/prices${query}`);
    assert.equal(response.status, 400, `${query} should be rejected`);
  }

  const invalidSort = await request(app).get('/api/prices?sort=price;DROP%20TABLE%20price_history');
  const empty = await request(app)
    .get(`/api/prices?commodity=${encodeURIComponent(`${marker} Missing`)}`);
  const injection = await request(app)
    .get(`/api/prices?commodity=${encodeURIComponent(`${marker}' OR 1=1 --`)}`);
  const writeAttempt = await request(app).post('/api/prices').send({ commodity: 'No writes' });
  const patchAttempt = await request(app).patch('/api/prices').send({ commodity: 'No writes' });
  const deleteAttempt = await request(app).delete('/api/prices');

  assert.equal(invalidSort.status, 400);
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.body.prices, []);
  assert.equal(empty.body.pagination.total, 0);
  assert.equal(injection.status, 200);
  assert.equal(injection.body.pagination.total, 0);
  assert.equal(writeAttempt.status, 404);
  assert.equal(patchAttempt.status, 404);
  assert.equal(deleteAttempt.status, 404);
});
