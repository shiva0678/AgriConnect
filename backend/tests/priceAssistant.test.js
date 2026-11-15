import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { createPriceAssistantController } from '../controllers/priceAssistantController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { generateGeminiExplanation } from '../services/geminiPriceAssistantService.js';
import { createPriceAssistantService } from '../services/priceAssistantService.js';
import { errorHandler } from '../middleware/errorHandler.js';
import { AppError } from '../utils/AppError.js';
import priceAssistantRoutes from '../routes/priceAssistantRoutes.js';
import { swaggerSpec } from '../swagger.js';

const app = express();
app.use(express.json());
app.use('/api', priceAssistantRoutes);
app.use(errorHandler);

const vocabulary = {
  commodities: ['Tomato', 'Onion'],
  markets: ['APMC Pune', 'Nashik Market'],
  districts: ['Pune', 'Nashik'],
  states: ['Maharashtra'],
};

function makeObservation(overrides = {}) {
  return {
    id: 'record-1',
    commodity: 'Tomato',
    variety: null,
    grade: null,
    market: 'APMC Pune',
    district: 'Pune',
    state: 'Maharashtra',
    arrival_date: '2024-12-24',
    min_price: 100,
    max_price: 160,
    modal_price: 130,
    ...overrides,
  };
}

function makeData(observations = [makeObservation()]) {
  const modalPrices = observations
    .map((row) => row.modal_price)
    .filter((price) => price !== null)
    .map(Number);
  const summary = {
    record_count: observations.length,
    distinct_date_count: new Set(observations.map((row) => row.arrival_date)).size,
    data_as_of: observations.length ? '2024-12-24' : null,
    dataset_as_of: '2024-12-24',
    minimum_modal_price: modalPrices.length ? Math.min(...modalPrices) : null,
    maximum_modal_price: modalPrices.length ? Math.max(...modalPrices) : null,
    average_modal_price: modalPrices.length
      ? (modalPrices.reduce((sum, price) => sum + price, 0) / modalPrices.length).toFixed(2)
      : null,
    minimum_reported_min_price: observations.length ? 100 : null,
    maximum_reported_max_price: observations.length ? 160 : null,
  };

  return {
    summary,
    marketBreakdown: observations.map((row) => ({
      market: row.market,
      district: row.district,
      state: row.state,
      average_modal_price: row.modal_price,
      minimum_modal_price: row.modal_price,
      maximum_modal_price: row.modal_price,
      record_count: 1,
    })),
    observations,
    lowestObservation: observations[0] || null,
    highestObservation: observations.at(-1) || null,
  };
}

function makeService({ data = makeData(), generateExplanation, env = { GEMINI_API_KEY: 'test-key' } } = {}) {
  const calls = { filters: [], generations: [] };
  const dependencies = {
    getVocabulary: async () => vocabulary,
    getData: async (filters) => {
      calls.filters.push(filters);
      return data;
    },
    env,
  };
  if (generateExplanation !== undefined) {
    dependencies.generateExplanation = async (options) => {
      calls.generations.push(options);
      return generateExplanation(options);
    };
  } else if (env.GEMINI_API_KEY) {
    dependencies.generateExplanation = async (options) => {
      calls.generations.push(options);
      return 'The recorded modal price is 130.';
    };
  }
  const service = createPriceAssistantService(dependencies);
  return { service, calls };
}

test('answers a commodity price question using database facts and the observation date', async () => {
  const { service, calls } = makeService();
  const result = await service('What was the Tomato price?');

  assert.equal(result.dataAsOf, '2024-12-24');
  assert.equal(result.source.table, 'price_history');
  assert.deepEqual(calls.filters[0].commodities, ['Tomato']);
  assert.equal(calls.generations.length, 1);
  assert.equal(calls.generations[0].facts.summary.averageModalPrice, 130);
  assert.match(result.answer, /Source observation date: 2024-12-24/);
  assert.match(result.answer, /single observation date/);
});

test('identifies and compares requested markets', async () => {
  const data = makeData([
    makeObservation(),
    makeObservation({
      id: 'record-2',
      market: 'Nashik Market',
      district: 'Nashik',
      modal_price: 150,
    }),
  ]);
  const { service, calls } = makeService({ data });
  const result = await service('Compare Tomato prices in APMC Pune and Nashik Market');

  assert.deepEqual(calls.filters[0].commodities, ['Tomato']);
  assert.deepEqual(calls.filters[0].markets, ['APMC Pune', 'Nashik Market']);
  assert.equal(result.supportingData.marketBreakdown.length, 2);
  assert.deepEqual(
    result.supportingData.marketBreakdown.map((row) => row.market),
    ['APMC Pune', 'Nashik Market'],
  );
});

test('reports no matching records without calling Gemini', async () => {
  const { service, calls } = makeService({ data: makeData([]) });
  const result = await service('What is the Tomato price?');

  assert.equal(result.supportingData.summary.recordCount, 0);
  assert.match(result.answer, /No matching price records were found/);
  assert.equal(result.dataAsOf, '2024-12-24');
  assert.equal(calls.generations.length, 0);

  const unknownCommodityResult = await service('What is the Dragonfruit price?');
  assert.equal(calls.filters[1].matchNothing, true);
  assert.match(unknownCommodityResult.answer, /No matching price records were found/);
});

test('does not present historical observations as current prices', async () => {
  for (const question of [
    'What is the current Tomato price today?',
    'What is the latest Tomato price?',
  ]) {
    const { service, calls } = makeService();
    const result = await service(question);

    assert.match(result.answer, /cannot establish today’s prices/);
    assert.match(result.answer, /2024-12-24/);
    assert.equal(calls.generations.length, 0);
  }
});

test('declines future price predictions and includes the source date', async () => {
  for (const question of [
    'Predict the Tomato price next week',
    'Will Tomato prices go up?',
  ]) {
    const { service, calls } = makeService();
    const result = await service(question);

    assert.match(result.answer, /does not support reliable future price predictions/);
    assert.match(result.answer, /2024-12-24/);
    assert.equal(calls.generations.length, 0);
  }
});

test('states the single-date limitation for ordinary explanations', async () => {
  const { service } = makeService({
    generateExplanation: async () => 'The available records show the supplied price values.',
  });
  const result = await service('Explain Tomato prices in APMC Pune');

  assert.match(result.answer, /single observation date/);
  assert.match(result.answer, /do not establish trends, seasonal patterns, or future prices/);
  assert.match(result.answer, /Source observation date: 2024-12-24/);
});

test('returns a clear configuration error when the Gemini API key is missing', async () => {
  const unconfiguredService = createPriceAssistantService({
    getVocabulary: async () => vocabulary,
    getData: async () => makeData(),
    env: {},
  });
  await assert.rejects(
    unconfiguredService('What was the Tomato price?'),
    (error) => error instanceof AppError
      && error.status === 503
      && /GEMINI_API_KEY is missing/.test(error.message),
  );
});

test('logs sanitized Gemini provider diagnostics and keeps the client error generic', async () => {
  const logs = [];
  const apiKey = 'secret-test-api-key';
  const question = 'What is my private Tomato price?';
  const providerError = new Error(JSON.stringify({
    error: {
      code: 403,
      status: 'PERMISSION_DENIED',
      message: `API key ${apiKey} rejected question ${question}; authorization: Bearer private-token`,
    },
  }));
  providerError.status = 403;

  await assert.rejects(
    generateGeminiExplanation({
      apiKey,
      question,
      facts: {},
      logger: { error: (...args) => logs.push(args) },
      clientFactory: () => ({
        models: {
          generateContent: async () => { throw providerError; },
        },
      }),
    }),
    (error) => error instanceof AppError
      && error.status === 503
      && error.message === 'The Price Assistant provider is temporarily unavailable. Please try again later.'
  );

  assert.equal(logs.length, 1);
  assert.equal(logs[0][0], 'Gemini provider request failed');
  assert.deepEqual(logs[0][1], {
    providerHttpStatus: 403,
    providerErrorCode: 'PERMISSION_DENIED',
    providerMessage: 'API key [REDACTED] rejected question [REDACTED]; authorization=[REDACTED] [REDACTED]',
  });
  assert.doesNotMatch(JSON.stringify(logs), /secret-test-api-key|private Tomato price|private-token/);
});

test('uses Gemini SDK v3 generateContent request shape and configured model name', async () => {
  let receivedRequest;
  const result = await generateGeminiExplanation({
    apiKey: 'test-key',
    modelName: 'gemini-3.5-flash-lite',
    question: 'What was the Tomato price?',
    dataAsOf: '2024-12-24',
    facts: { summary: { averageModalPrice: 130 } },
    clientFactory: () => ({
      models: {
        generateContent: async (requestOptions) => {
          receivedRequest = requestOptions;
          return { text: 'Recorded modal price: 130.' };
        },
      },
    }),
  });

  assert.equal(result, 'Recorded modal price: 130.');
  assert.equal(receivedRequest.model, 'gemini-3.5-flash-lite');
  assert.deepEqual(JSON.parse(receivedRequest.contents), {
    question: 'What was the Tomato price?',
    dataAsOf: '2024-12-24',
    verifiedPriceData: { summary: { averageModalPrice: 130 } },
  });
  assert.equal(receivedRequest.config.temperature, 0.1);
  assert.equal(receivedRequest.config.maxOutputTokens, 512);
  assert.equal(typeof receivedRequest.config.systemInstruction, 'string');
});

test('requires authentication before the assistant controller runs', async () => {
  const app = express();
  app.use(express.json());
  app.post(
    '/api/prices/assistant',
    authenticateToken,
    createPriceAssistantController(async () => {
      throw new Error('The controller should not run.');
    }),
  );
  app.use(errorHandler);

  const response = await request(app)
    .post('/api/prices/assistant')
    .send({ question: 'What was the Tomato price?' });

  assert.equal(response.status, 401);
  assert.equal(response.body.success, false);
});

test('mounts the assistant endpoint with JWT protection and matching Swagger security', async () => {
  const unauthenticatedResponse = await request(app)
    .post('/api/prices/assistant')
    .send({ question: '' });

  assert.equal(unauthenticatedResponse.status, 401);
  assert.equal(unauthenticatedResponse.body.success, false);
  assert.ok(swaggerSpec.paths['/api/prices/assistant']?.post);
  assert.deepEqual(
    swaggerSpec.paths['/api/prices/assistant'].post.security,
    [{ bearerAuth: [] }],
  );
});

test('accepts both farmer and buyer JWTs and validates their questions', async () => {
  for (const role of ['farmer', 'buyer']) {
    const token = jwt.sign(
      { id: `${role}-assistant-test`, role },
      process.env.JWT_SECRET,
    );
    const response = await request(app)
      .post('/api/prices/assistant')
      .set('Authorization', `Bearer ${token}`)
      .send({ question: '' });

    assert.equal(response.status, 400);
    assert.match(response.body.message, /question must be a non-empty string/);
  }
});

test('rejects invalid questions through the mounted endpoint', async () => {
  const token = jwt.sign(
    { id: 'buyer-assistant-test', role: 'buyer' },
    process.env.JWT_SECRET,
  );
  const response = await request(app)
    .post('/api/prices/assistant')
    .set('Authorization', `Bearer ${token}`)
    .send({ question: 'x'.repeat(1001) });

  assert.equal(response.status, 400);
  assert.match(response.body.message, /cannot exceed 1000 characters/);
});

test('rejects invalid and excessively long questions', async () => {
  const { service, calls } = makeService();

  await assert.rejects(
    service('  '),
    (error) => error instanceof AppError && error.status === 400,
  );
  await assert.rejects(
    service('x'.repeat(1001)),
    (error) => error instanceof AppError && error.status === 400,
  );
  assert.equal(calls.filters.length, 0);
});