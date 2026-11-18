import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { getWastageAlertConfig } from '../config/wastageAlertConfig.js';
import { createWastageAlertController } from '../controllers/wastageAlertController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { errorHandler } from '../middleware/errorHandler.js';
import { getFarmerCropsForWastageAlerts } from '../models/wastageAlertModel.js';
import {
  buildWastageAlerts,
  createWastageAlertService,
} from '../services/wastageAlertService.js';

const JWT_TEST_SECRET = 'wastage-alert-route-test-secret';
const originalJwtSecret = process.env.JWT_SECRET;
process.env.JWT_SECRET = JWT_TEST_SECRET;
const NOW = new Date('2026-11-16T12:00:00.000Z');

function makeCrop(overrides = {}) {
  return {
    crop_id: 'crop-1',
    crop_name: 'Tomato',
    remaining_quantity: 50,
    unit: 'kg',
    expiry_date: null,
    harvest_date: null,
    status: 'available',
    recent_order_count: 0,
    ...overrides,
  };
}

function createRouteApp(getAlerts) {
  const app = express();
  app.use(express.json());
  app.get(
    '/api/farmer/wastage-alerts',
    authenticateToken,
    createWastageAlertController({ getAlerts }),
  );
  app.use(errorHandler);
  return app;
}

function tokenFor(role, id = 'farmer-id') {
  return jwt.sign({ id, role }, JWT_TEST_SECRET);
}

test.after(() => {
  if (originalJwtSecret === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = originalJwtSecret;
  }
});

test('marks already-expired stock high priority and approaching expiry with configured severity', () => {
  const alerts = buildWastageAlerts([
    makeCrop({ crop_id: 'expired', expiry_date: '2026-11-15' }),
    makeCrop({ crop_id: 'expires-tomorrow', expiry_date: '2026-11-17' }),
    makeCrop({ crop_id: 'expires-in-three-days', expiry_date: '2026-11-19' }),
    makeCrop({ crop_id: 'expires-later', expiry_date: '2026-11-20' }),
  ], { now: NOW, expirySoonDays: 3, significantStockMinimum: 1000 });

  assert.deepEqual(
    alerts.map(({ cropId, type, severity, daysUntil }) => ({ cropId, type, severity, daysUntil })),
    [
      { cropId: 'expired', type: 'ALREADY_EXPIRED', severity: 'HIGH', daysUntil: -1 },
      { cropId: 'expires-tomorrow', type: 'EXPIRING_SOON', severity: 'HIGH', daysUntil: 1 },
      { cropId: 'expires-in-three-days', type: 'EXPIRING_SOON', severity: 'MEDIUM', daysUntil: 3 },
    ],
  );
});

test('creates harvest-approaching alerts within the configured date window', () => {
  const alerts = buildWastageAlerts([
    makeCrop({ crop_id: 'harvest-today', harvest_date: '2026-11-16' }),
    makeCrop({ crop_id: 'harvest-soon', harvest_date: '2026-11-23' }),
    makeCrop({ crop_id: 'harvest-later', harvest_date: '2026-11-24' }),
  ], { now: NOW, harvestApproachingDays: 7, significantStockMinimum: 1000 });

  assert.deepEqual(alerts.map((alert) => [alert.cropId, alert.type]), [
    ['harvest-today', 'HARVEST_APPROACHING'],
    ['harvest-soon', 'HARVEST_APPROACHING'],
  ]);
  assert.match(alerts[0].recommendation, /Harvest is due today/);
});

test('handles missing dates and zero stock without creating misleading alerts', () => {
  const alerts = buildWastageAlerts([
    makeCrop({ crop_id: 'missing-dates', expiry_date: null, harvest_date: null }),
    makeCrop({ crop_id: 'zero-stock', remaining_quantity: 0, expiry_date: '2026-11-17' }),
    makeCrop({ crop_id: 'sold-out', status: 'sold_out', expiry_date: '2026-11-17' }),
  ], { now: NOW, significantStockMinimum: 100 });

  assert.deepEqual(alerts, []);
});

test('flags partial remaining stock only when significant and without recent orders', () => {
  const alerts = buildWastageAlerts([
    makeCrop({ crop_id: 'partial-stock', remaining_quantity: 120, recent_order_count: 0 }),
    makeCrop({ crop_id: 'recent-order', remaining_quantity: 200, recent_order_count: 1 }),
    makeCrop({ crop_id: 'below-threshold', remaining_quantity: 99 }),
  ], { now: NOW, significantStockMinimum: 100 });

  assert.deepEqual(alerts.map((alert) => alert.cropId), ['partial-stock']);
  assert.equal(alerts[0].type, 'UNSOLD_STOCK');
  assert.equal(alerts[0].remainingQuantity, 120);
});

test('deduplicates repeated crop rows by crop and alert condition', async () => {
  const crop = makeCrop({
    expiry_date: '2026-11-17',
    harvest_date: '2026-11-17',
    remaining_quantity: 150,
  });
  const getAlerts = createWastageAlertService({
    getCrops: async () => [crop, crop],
    getConfig: () => ({
      expirySoonDays: 3,
      harvestApproachingDays: 7,
      recentOrderWindowDays: 14,
      significantStockMinimum: 100,
    }),
    now: () => NOW,
  });
  const result = await getAlerts('farmer-1');

  assert.equal(result.summary.activeAlerts, 3);
  assert.equal(new Set(result.alerts.map((alert) => alert.id)).size, 3);
  assert.equal(result.summary.highPriorityAlerts, 2);
});

test('returns an empty summary for farmers with no alertable crops', async () => {
  const getAlerts = createWastageAlertService({
    getCrops: async () => [],
    getConfig: () => ({
      expirySoonDays: 3,
      harvestApproachingDays: 7,
      recentOrderWindowDays: 14,
      significantStockMinimum: 100,
    }),
    now: () => NOW,
  });
  const result = await getAlerts('farmer-1');

  assert.deepEqual(result.alerts, []);
  assert.deepEqual(result.summary, {
    activeAlerts: 0,
    highPriorityAlerts: 0,
    expiringSoonCrops: 0,
    expiredCrops: 0,
    harvestApproachingCrops: 0,
    unsoldStockCrops: 0,
  });
});

test('uses safe, configurable defaults and falls back on invalid threshold values', () => {
  assert.deepEqual(getWastageAlertConfig({}), {
    expirySoonDays: 3,
    harvestApproachingDays: 7,
    recentOrderWindowDays: 14,
    significantStockMinimum: 100,
  });
  assert.deepEqual(getWastageAlertConfig({
    WASTAGE_EXPIRY_SOON_DAYS: '5',
    WASTAGE_HARVEST_APPROACHING_DAYS: '10',
    WASTAGE_RECENT_ORDER_DAYS: '21',
    WASTAGE_SIGNIFICANT_STOCK_MINIMUM: '250',
  }), {
    expirySoonDays: 5,
    harvestApproachingDays: 10,
    recentOrderWindowDays: 21,
    significantStockMinimum: 250,
  });
  assert.equal(getWastageAlertConfig({ WASTAGE_EXPIRY_SOON_DAYS: '-2' }).expirySoonDays, 3);
});

test('queries only the authenticated farmer crops and recent orders with bound parameters', async () => {
  let captured;
  await getFarmerCropsForWastageAlerts('farmer-42', 14, {
    query: async (sql, values) => {
      captured = { sql, values };
      return { rows: [] };
    },
  });

  assert.deepEqual(captured.values, ['farmer-42', 14]);
  assert.match(captured.sql, /WHERE c\.farmer_id = \$1/);
  assert.match(captured.sql, /o\.farmer_id = c\.farmer_id/);
  assert.match(captured.sql, /o\.created_at >= NOW\(\) - \(\$2::int \* INTERVAL '1 day'\)/);
  assert.match(captured.sql, /o\.status <> 'cancelled'/);
});

test('requires authentication, rejects buyers, and scopes service call to the farmer ID', async (t) => {
  const calledWith = [];
  const app = createRouteApp(async (farmerId) => {
    calledWith.push(farmerId);
    return { success: true, alerts: [], summary: { activeAlerts: 0 } };
  });

  await t.test('rejects unauthenticated requests', async () => {
    const response = await request(app).get('/api/farmer/wastage-alerts');
    assert.equal(response.status, 401);
  });

  await t.test('rejects buyer role', async () => {
    const response = await request(app)
      .get('/api/farmer/wastage-alerts')
      .set('Authorization', `Bearer ${tokenFor('buyer')}`);
    assert.equal(response.status, 403);
    assert.deepEqual(calledWith, []);
  });

  await t.test('passes authenticated farmer identity only', async () => {
    const response = await request(app)
      .get('/api/farmer/wastage-alerts')
      .set('Authorization', `Bearer ${tokenFor('farmer', 'farmer-123')}`);
    assert.equal(response.status, 200);
    assert.deepEqual(calledWith, ['farmer-123']);
    assert.deepEqual(response.body.alerts, []);
  });
});

test('returns a generic API error when alert retrieval fails', async () => {
  const app = createRouteApp(async () => {
    throw new Error('database connection detail');
  });
  const response = await request(app)
    .get('/api/farmer/wastage-alerts')
    .set('Authorization', `Bearer ${tokenFor('farmer')}`);

  assert.equal(response.status, 500);
  assert.equal(response.body.message, 'Unable to retrieve crop wastage alerts.');
  assert.doesNotMatch(response.body.message, /database connection/);
});
