import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import app from '../server.js';
import { pool } from '../config/db.js';
import { createAdminDashboardRouter } from '../routes/adminDashboardRoutes.js';
import { createAdminAnalyticsController } from '../controllers/adminAnalyticsController.js';
import { errorHandler } from '../middleware/errorHandler.js';

function createAuthorizedAdminApp() {
  const testApp = express();
  testApp.use('/api/admin', createAdminDashboardRouter({
    adminMiddleware: (request, response, next) => {
      request.user = { id: 'test-admin', role: 'admin' };
      next();
    },
  }));
  testApp.use(errorHandler);
  return testApp;
}

const authorizedAdminApp = createAuthorizedAdminApp();

function makeUser(role) {
  return {
    name: 'Analytics Test User',
    email: `analytics-auth-${randomUUID()}@example.com`,
    phone: '9876543210',
    password: 'test-password-123',
    role,
  };
}

async function registerAndTrack(testContext, payload) {
  let createdUserId = null;
  testContext.after(async () => {
    if (createdUserId) {
      await pool.query('DELETE FROM users WHERE id = $1', [createdUserId]);
    }
  });

  const response = await request(app)
    .post('/api/auth/register')
    .send(payload);
  if (response.status === 201) {
    createdUserId = response.body.user?.id || null;
  }
  return response;
}

function trackFixtureIds(testContext) {
  const ids = { userIds: [], cropIds: [], orderIds: [] };
  testContext.after(async () => {
    if (ids.orderIds.length) {
      await pool.query(
        'DELETE FROM orders WHERE id = ANY($1::uuid[])',
        [ids.orderIds],
      );
    }
    if (ids.cropIds.length) {
      await pool.query(
        'DELETE FROM crops WHERE id = ANY($1::uuid[])',
        [ids.cropIds],
      );
    }
    if (ids.userIds.length) {
      await pool.query(
        'DELETE FROM users WHERE id = ANY($1::uuid[])',
        [ids.userIds],
      );
    }
  });
  return ids;
}

async function insertFixtureUser(ids, role, status, createdAt) {
  const result = await pool.query(
    `INSERT INTO users (name, email, phone, password, role, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      'Analytics Fixture',
      `analytics-fixture-${randomUUID()}@example.com`,
      '9876543210',
      'not-a-login-password-hash',
      role,
      status,
      createdAt,
    ],
  );
  const id = result.rows[0].id;
  ids.userIds.push(id);
  return id;
}

async function insertFixtureCrop(ids, farmerId, name, category, status, createdAt) {
  const result = await pool.query(
    `INSERT INTO crops (
       farmer_id, name, category, price, unit, quantity, location,
       harvest_date, status, created_at
     )
     VALUES ($1, $2, $3, 10, 'kg', 5, 'Test location', DATE '2026-06-01', $4, $5)
     RETURNING id`,
    [farmerId, name, category, status, createdAt],
  );
  const id = result.rows[0].id;
  ids.cropIds.push(id);
  return id;
}

async function insertFixtureOrder(ids, buyerId, farmerId, cropId, amount, status, createdAt) {
  const result = await pool.query(
    `INSERT INTO orders (
       buyer_id, farmer_id, crop_id, quantity, unit, unit_price,
       total_amount, status, created_at
     )
     VALUES ($1, $2, $3, 1, 'kg', $4, $4, $5, $6)
     RETURNING id`,
    [buyerId, farmerId, cropId, amount, status, createdAt],
  );
  const id = result.rows[0].id;
  ids.orderIds.push(id);
  return id;
}

async function login(payload) {
  return request(app)
    .post('/api/auth/login')
    .send({ email: payload.email, password: payload.password });
}

test('admin analytics routes reject unauthenticated, farmer, and buyer requests', async (testContext) => {
  const unauthenticated = await request(app)
    .get('/api/admin/dashboard/overview');
  assert.equal(unauthenticated.status, 401);

  for (const role of ['farmer', 'buyer']) {
    const payload = makeUser(role);
    const registered = await registerAndTrack(testContext, payload);
    assert.equal(registered.status, 201);

    const authenticated = await login(payload);
    assert.equal(authenticated.status, 200);

    const response = await request(app)
      .get('/api/admin/dashboard/overview')
      .set('Authorization', `Bearer ${authenticated.body.token}`);
    assert.equal(response.status, 403);
  }
});

test('authorized admin analytics report correct totals, status distributions, monthly filters, and gross delivered value', async (testContext) => {
  const ids = trackFixtureIds(testContext);
  const fromDate = '2026-01-01';
  const toDate = '2026-02-28';
  const baselineOverview = await request(authorizedAdminApp)
    .get('/api/admin/dashboard/overview');
  const baselineUsers = await request(authorizedAdminApp)
    .get(`/api/admin/dashboard/users?fromDate=${fromDate}&toDate=${toDate}`);
  const baselineCrops = await request(authorizedAdminApp)
    .get(`/api/admin/dashboard/crops?fromDate=${fromDate}&toDate=${toDate}`);
  const baselineOrders = await request(authorizedAdminApp)
    .get(`/api/admin/dashboard/orders?fromDate=${fromDate}&toDate=${toDate}`);

  assert.equal(baselineOverview.status, 200);
  assert.equal(baselineUsers.status, 200);
  assert.equal(baselineCrops.status, 200);
  assert.equal(baselineOrders.status, 200);

  const farmerId = await insertFixtureUser(
    ids,
    'farmer',
    'active',
    '2026-01-15T12:00:00.000Z',
  );
  const buyerId = await insertFixtureUser(
    ids,
    'buyer',
    'suspended',
    '2026-02-15T12:00:00.000Z',
  );
  const categoryA = `Analytics-A-${randomUUID().slice(0, 6)}`;
  const categoryB = `Analytics-B-${randomUUID().slice(0, 6)}`;
  const availableCropId = await insertFixtureCrop(
    ids,
    farmerId,
    'Analytics Available',
    categoryA,
    'available',
    '2026-01-16T12:00:00.000Z',
  );
  await insertFixtureCrop(
    ids,
    farmerId,
    'Analytics Sold Out',
    categoryA,
    'sold_out',
    '2026-01-17T12:00:00.000Z',
  );
  await insertFixtureCrop(
    ids,
    farmerId,
    'Analytics Inactive',
    categoryB,
    'inactive',
    '2026-02-16T12:00:00.000Z',
  );

  const fixtureOrders = [
    { amount: 70, status: 'pending', createdAt: '2026-01-18T12:00:00.000Z' },
    { amount: 10.25, status: 'delivered', createdAt: '2026-01-19T12:00:00.000Z' },
    { amount: 24, status: 'confirmed', createdAt: '2026-02-18T12:00:00.000Z' },
    { amount: 4, status: 'shipped', createdAt: '2026-02-19T12:00:00.000Z' },
    { amount: 21.5, status: 'delivered', createdAt: '2026-02-20T12:00:00.000Z' },
    { amount: 12, status: 'cancelled', createdAt: '2026-02-21T12:00:00.000Z' },
  ];
  for (const order of fixtureOrders) {
    await insertFixtureOrder(
      ids,
      buyerId,
      farmerId,
      availableCropId,
      order.amount,
      order.status,
      order.createdAt,
    );
  }

  const [overview, users, crops, orders, trends] = await Promise.all([
    request(authorizedAdminApp).get('/api/admin/dashboard/overview'),
    request(authorizedAdminApp)
      .get(`/api/admin/dashboard/users?fromDate=${fromDate}&toDate=${toDate}`),
    request(authorizedAdminApp)
      .get(`/api/admin/dashboard/crops?fromDate=${fromDate}&toDate=${toDate}`),
    request(authorizedAdminApp)
      .get(`/api/admin/dashboard/orders?fromDate=${fromDate}&toDate=${toDate}`),
    request(authorizedAdminApp)
      .get(`/api/admin/dashboard/trends?fromDate=${fromDate}&toDate=${toDate}`),
  ]);

  for (const response of [overview, users, crops, orders, trends]) {
    assert.equal(response.status, 200);
  }

  assert.equal(overview.body.users.total, baselineOverview.body.users.total + 2);
  assert.equal(overview.body.users.farmers, baselineOverview.body.users.farmers + 1);
  assert.equal(overview.body.users.buyers, baselineOverview.body.users.buyers + 1);
  assert.equal(overview.body.users.active, baselineOverview.body.users.active + 1);
  assert.equal(overview.body.users.suspended, baselineOverview.body.users.suspended + 1);
  assert.equal(overview.body.crops.total, baselineOverview.body.crops.total + 3);
  assert.equal(overview.body.crops.available, baselineOverview.body.crops.available + 1);
  assert.equal(overview.body.crops.soldOut, baselineOverview.body.crops.soldOut + 1);
  assert.equal(overview.body.crops.inactive, baselineOverview.body.crops.inactive + 1);
  assert.equal(overview.body.orders.total, baselineOverview.body.orders.total + 6);
  assert.equal(overview.body.orders.pending, baselineOverview.body.orders.pending + 1);
  assert.equal(overview.body.orders.confirmed, baselineOverview.body.orders.confirmed + 1);
  assert.equal(overview.body.orders.shipped, baselineOverview.body.orders.shipped + 1);
  assert.equal(overview.body.orders.delivered, baselineOverview.body.orders.delivered + 2);
  assert.equal(overview.body.orders.cancelled, baselineOverview.body.orders.cancelled + 1);
  assert.equal(
    overview.body.orders.grossDeliveredOrderValue,
    baselineOverview.body.orders.grossDeliveredOrderValue + 31.75,
  );

  const previousDeliveredCount = baselineOverview.body.orders.delivered;
  const previousAverage = baselineOverview.body.orders.averageDeliveredOrderValue || 0;
  const expectedAverage = (
    (previousAverage * previousDeliveredCount + 31.75)
    / (previousDeliveredCount + 2)
  );
  assert.ok(
    Math.abs(overview.body.orders.averageDeliveredOrderValue - expectedAverage) < 0.000001,
  );
  assert.match(overview.body.financialNote, /not actual platform revenue/i);

  assert.equal(users.body.summary.total, baselineUsers.body.summary.total + 2);
  assert.deepEqual(
    users.body.monthlyRegistrations.map(({ month, registrations }) => [month, registrations]),
    baselineUsers.body.monthlyRegistrations.map(({ month, registrations }) => [
      month,
      registrations + (month === '2026-01' || month === '2026-02' ? 1 : 0),
    ]),
  );
  assert.equal(crops.body.summary.total, baselineCrops.body.summary.total + 3);
  assert.equal(
    crops.body.categoryDistribution.find(({ category }) => category === categoryA).crops,
    2,
  );
  assert.equal(
    crops.body.categoryDistribution.find(({ category }) => category === categoryB).crops,
    1,
  );
  assert.equal(orders.body.summary.total, baselineOrders.body.summary.total + 6);
  assert.equal(
    orders.body.summary.grossDeliveredOrderValue,
    baselineOrders.body.summary.grossDeliveredOrderValue + 31.75,
  );

  const january = trends.body.trends.find(({ month }) => month === '2026-01');
  const february = trends.body.trends.find(({ month }) => month === '2026-02');
  assert.deepEqual(
    [january.registrations, january.cropAdditions, january.orders, january.grossDeliveredOrderValue],
    [1, 2, 2, 10.25],
  );
  assert.deepEqual(
    [february.registrations, february.cropAdditions, february.orders, february.grossDeliveredOrderValue],
    [1, 1, 4, 21.5],
  );
});

test('empty date ranges produce zero-valued monthly trends and recent activity is limited and sanitized', async () => {
  const emptyRange = await request(authorizedAdminApp)
    .get('/api/admin/dashboard/trends?fromDate=2099-01-01&toDate=2099-02-28');
  assert.equal(emptyRange.status, 200);
  assert.deepEqual(
    emptyRange.body.trends.map((row) => [
      row.registrations,
      row.cropAdditions,
      row.orders,
      row.grossDeliveredOrderValue,
    ]),
    [[0, 0, 0, 0], [0, 0, 0, 0]],
  );

  const activity = await request(authorizedAdminApp)
    .get('/api/admin/dashboard/recent-activity?limit=2');
  assert.equal(activity.status, 200);
  assert.equal(activity.body.users.length <= 2, true);
  assert.equal(activity.body.crops.length <= 2, true);
  assert.equal(activity.body.orders.length <= 2, true);
  for (const user of activity.body.users) {
    assert.equal(user.email, undefined);
    assert.equal(user.name, undefined);
    assert.equal(user.password, undefined);
  }
});

test('empty platform tables normalize to zero totals and a null delivered-order average', async () => {
  const controller = createAdminAnalyticsController({
    getDashboardOverview: async () => ({
      total_users: 0,
      total_farmers: 0,
      total_buyers: 0,
      active_users: 0,
      suspended_users: 0,
      total_crops: 0,
      available_crops: 0,
      sold_out_crops: 0,
      inactive_crops: 0,
      total_orders: 0,
      pending_orders: 0,
      confirmed_orders: 0,
      shipped_orders: 0,
      delivered_orders: 0,
      cancelled_orders: 0,
      gross_delivered_order_value: '0',
      average_delivered_order_value: null,
    }),
  });
  let responseBody;
  const response = {
    status(statusCode) {
      assert.equal(statusCode, 200);
      return this;
    },
    json(body) {
      responseBody = body;
    },
  };
  let nextError = null;

  await controller.getOverview({}, response, (error) => {
    nextError = error || null;
  });

  assert.equal(nextError, null);
  assert.equal(responseBody.users.total, 0);
  assert.equal(responseBody.crops.total, 0);
  assert.equal(responseBody.orders.total, 0);
  assert.equal(responseBody.orders.grossDeliveredOrderValue, 0);
  assert.equal(responseBody.orders.averageDeliveredOrderValue, null);
});

test('analytics date filters and limits are validated', async () => {
  const oneSidedDateRange = await request(authorizedAdminApp)
    .get('/api/admin/dashboard/trends?fromDate=2026-01-01');
  assert.equal(oneSidedDateRange.status, 400);

  const invalidDate = await request(authorizedAdminApp)
    .get('/api/admin/dashboard/trends?fromDate=2026-02-30&toDate=2026-03-01');
  assert.equal(invalidDate.status, 400);

  const excessiveMonths = await request(authorizedAdminApp)
    .get('/api/admin/dashboard/users?months=37');
  assert.equal(excessiveMonths.status, 400);

  const excessiveLimit = await request(authorizedAdminApp)
    .get('/api/admin/dashboard/recent-activity?limit=51');
  assert.equal(excessiveLimit.status, 400);
});
