import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { getFairPriceHistoryReference } from '../models/fairPriceModel.js';
import { createFairPriceController } from '../controllers/fairPriceController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { errorHandler } from '../middleware/errorHandler.js';
import {
  createFairPriceService,
  validateFairPriceInput,
} from '../services/fairPriceService.js';
import { getFairPriceDenominationConfig, getSupportedWeightUnit } from '../config/fairPriceConfig.js';

const JWT_TEST_SECRET = 'fair-price-route-test-secret';
const originalJwtSecret = process.env.JWT_SECRET;
process.env.JWT_SECRET = JWT_TEST_SECRET;

const baseInput = {
  commodity: 'Tomato',
  askingPrice: 25,
  unit: 'kg',
  location: 'Nashik, Maharashtra',
};

const baseHistory = {
  observationCount: 3,
  averageModalPrice: 2500,
  minimumModalPrice: 2000,
  maximumModalPrice: 3000,
  observationStartDate: '2024-12-24',
  observationEndDate: '2024-12-24',
  relevantMarkets: ['Nashik APMC'],
  relevantMarketCount: 1,
  locationMatched: true,
};

function createRouteApp(evaluatePrice = async () => ({ success: true })) {
  const app = express();
  app.use(express.json());
  app.post(
    '/api/prices/fair-price',
    authenticateToken,
    createFairPriceController({ evaluatePrice }),
  );
  app.use(errorHandler);
  return app;
}

function bearerToken(role) {
  return jwt.sign({ id: 'user-id', role }, JWT_TEST_SECRET);
}

test.after(() => {
  if (originalJwtSecret === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = originalJwtSecret;
  }
});

test('returns unavailable without exposing historical prices when denomination is explicitly unverified', async () => {
  const evaluate = createFairPriceService({
    getHistoryReference: async () => baseHistory,
    getDenominationConfig: () => ({ status: 'unverified' }),
  });
  const result = await evaluate(baseInput);

  assert.equal(result.success, true);
  assert.equal(result.available, false);
  assert.equal(result.status, 'COMPARISON_UNAVAILABLE');
  assert.equal(result.reason, 'DENOMINATION_UNVERIFIED');
  assert.equal(result.dataAsOf, '2024-12-24');
  assert.deepEqual(result.askingPrice, { amount: 25, unit: 'kg' });
  assert.equal(result.reference, null);
  assert.deepEqual(result.supportingData.relevantMarkets, ['Nashik APMC']);
  assert.equal(result.supportingData.observationCount, 3);
  assert.doesNotMatch(JSON.stringify(result), /averageModalPrice|minimumModalPrice|maximumModalPrice/);
});

test('returns a clear unavailable result when there are no matching records', async () => {
  const evaluate = createFairPriceService({
    getHistoryReference: async () => ({
      ...baseHistory,
      observationCount: 0,
      averageModalPrice: null,
      minimumModalPrice: null,
      maximumModalPrice: null,
      observationStartDate: null,
      observationEndDate: null,
      relevantMarkets: [],
      relevantMarketCount: 0,
      locationMatched: false,
    }),
  });
  const result = await evaluate(baseInput);

  assert.equal(result.reason, 'NO_MATCHING_RECORDS');
  assert.match(result.message, /No historical modal-price records/);
  assert.equal(result.dataAsOf, null);
});

test('classifies asking price against the INR per quintal modal-price range after conversion', async (t) => {
  const evaluate = createFairPriceService({
    getHistoryReference: async () => baseHistory,
  });

  await t.test('below observed range', async () => {
    const result = await evaluate({ ...baseInput, askingPrice: 19.99 });
    assert.equal(result.available, true);
    assert.equal(result.status, 'BELOW_REFERENCE');
    assert.equal(result.reference.averageModalPrice, 2500);
    assert.equal(result.reference.minimumModalPrice, 2000);
    assert.equal(result.dataAsOf, '2024-12-24');
  });

  await t.test('within observed range', async () => {
    const result = await evaluate({ ...baseInput, askingPrice: 25 });
    assert.equal(result.status, 'FAIR_RANGE');
    assert.equal(result.message, 'Your price is within the historical reference range.');
  });

  await t.test('above observed range', async () => {
    const result = await evaluate({ ...baseInput, askingPrice: 30.01 });
    assert.equal(result.status, 'ABOVE_REFERENCE');
  });
});

test('compares INR per quintal listing prices directly to the reference', async () => {
  const evaluate = createFairPriceService({
    getHistoryReference: async () => baseHistory,
  });

  const result = await evaluate({ ...baseInput, askingPrice: 2500, unit: 'quintal' });
  assert.equal(result.status, 'FAIR_RANGE');
  assert.equal(result.reference.unit, 'quintal');
  assert.equal(result.reference.currency, 'INR');
});

test('converts INR per kg listing prices to the historical INR per quintal reference', async () => {
  const evaluate = createFairPriceService({
    getHistoryReference: async () => baseHistory,
  });
  const result = await evaluate({ ...baseInput, askingPrice: 25, unit: 'kg' });

  assert.equal(result.status, 'FAIR_RANGE');
  assert.deepEqual(result.askingPrice, { amount: 25, unit: 'kg', currency: 'INR' });
  assert.deepEqual(result.reference, {
    currency: 'INR',
    unit: 'quintal',
    averageModalPrice: 2500,
    minimumModalPrice: 2000,
    maximumModalPrice: 3000,
  });
});

test('uses the verified AGMARKNET denomination and supports only kg and quintal listing units', () => {
  assert.deepEqual(getFairPriceDenominationConfig(), {
    status: 'compatible',
    currency: 'INR',
    historyUnit: 'quintal',
    historyUnitKilograms: 100,
  });
  assert.deepEqual(getSupportedWeightUnit('kg'), { unit: 'kg', kilograms: 1 });
  assert.deepEqual(getSupportedWeightUnit('quintal'), { unit: 'quintal', kilograms: 100 });
  assert.deepEqual(getSupportedWeightUnit('kilograms'), { unit: 'kg', kilograms: 1 });
  assert.equal(getSupportedWeightUnit('g'), null);
});

test('returns unavailable for unsupported listing units or incompatible configured currencies', async (t) => {
  const getHistoryReference = async () => baseHistory;

  await t.test('unsupported listing unit', async () => {
    const evaluate = createFairPriceService({
      getHistoryReference,
    });
    const result = await evaluate({ ...baseInput, unit: 'crate' });
    assert.equal(result.reason, 'INCOMPATIBLE_DENOMINATION');
    assert.equal(result.reference, null);
  });

  await t.test('different currencies', async () => {
    const evaluate = createFairPriceService({
      getHistoryReference,
      getDenominationConfig: () => ({ status: 'incompatible' }),
    });
    const result = await evaluate(baseInput);
    assert.equal(result.reason, 'INCOMPATIBLE_DENOMINATION');
    assert.equal(result.reference, null);
  });
});

test('rejects invalid comparison input', async () => {
  const evaluate = createFairPriceService({ getHistoryReference: async () => baseHistory });
  for (const payload of [
    null,
    [],
    { ...baseInput, commodity: '' },
    { ...baseInput, askingPrice: -1 },
    { ...baseInput, askingPrice: '1e3' },
    { ...baseInput, askingPrice: 'not-a-price' },
    { ...baseInput, unit: '' },
    { ...baseInput, location: '' },
    { ...baseInput, location: 'x'.repeat(161) },
  ]) {
    await assert.rejects(() => evaluate(payload), { status: 400 });
  }
  const fractionalPriceResult = await evaluate({ ...baseInput, askingPrice: '.5' });
  assert.equal(fractionalPriceResult.status, 'BELOW_REFERENCE');
});

test('uses parameterized SQL for commodity and location inputs', async () => {
  let captured;
  await getFairPriceHistoryReference(
    {
      commodity: "Tomato' OR 1=1 --",
      location: 'Nashik, Maharashtra',
    },
    {
      query: async (text, values) => {
        captured = { text, values };
        return { rows: [] };
      },
    },
  );

  assert.deepEqual(captured.values, ["Tomato' OR 1=1 --", 'Nashik', 'Maharashtra']);
  assert.ok(captured.text.includes('$1'));
  assert.ok(captured.text.includes('$2'));
  assert.ok(captured.text.includes('$3'));
  assert.ok(!captured.text.includes("Tomato' OR 1=1 --"));
  assert.ok(!captured.text.includes('Nashik'));
});

test('fair price route requires authentication and a farmer role', async (t) => {
  const calls = [];
  const app = createRouteApp(async (payload) => {
    calls.push(payload);
    return { success: true, available: false, reason: 'DENOMINATION_UNVERIFIED' };
  });

  await t.test('unauthenticated request is rejected', async () => {
    const response = await request(app).post('/api/prices/fair-price').send(baseInput);
    assert.equal(response.status, 401);
  });

  await t.test('buyer is rejected', async () => {
    const response = await request(app)
      .post('/api/prices/fair-price')
      .set('Authorization', `Bearer ${bearerToken('buyer')}`)
      .send(baseInput);
    assert.equal(response.status, 403);
    assert.equal(calls.length, 0);
  });

  await t.test('farmer receives the unavailable response', async () => {
    const response = await request(app)
      .post('/api/prices/fair-price')
      .set('Authorization', `Bearer ${bearerToken('farmer')}`)
      .send(baseInput);
    assert.equal(response.status, 200);
    assert.equal(response.body.reason, 'DENOMINATION_UNVERIFIED');
    assert.equal(calls.length, 1);
  });
});

test('authenticated fair price requests return validation errors for invalid input', async () => {
  const app = createRouteApp(validateFairPriceInput);
  const response = await request(app)
    .post('/api/prices/fair-price')
    .set('Authorization', `Bearer ${bearerToken('farmer')}`)
    .send({ ...baseInput, askingPrice: -1 });

  assert.equal(response.status, 400);
  assert.match(response.body.message, /askingPrice must be a non-negative number/);
});

test('fair price route hides unexpected internal errors', async () => {
  const app = createRouteApp(async () => {
    throw new Error('database connection string and query details');
  });
  const response = await request(app)
    .post('/api/prices/fair-price')
    .set('Authorization', `Bearer ${bearerToken('farmer')}`)
    .send(baseInput);

  assert.equal(response.status, 500);
  assert.equal(response.body.message, 'Unable to compare your price with historical data.');
  assert.doesNotMatch(response.body.message, /database connection/);
});
