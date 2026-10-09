import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import app from '../server.js';
import { pool } from '../config/db.js';
import { insertManyPriceHistory } from '../models/priceHistoryModel.js';
import {
  calculatePriceChangePercent,
  classifyMarketOpportunity,
  classifyPriceDirection,
  getMarketOpportunityScore,
  getPriceTrendStatus,
} from '../controllers/demandOutlookController.js';

const marker = `DemandOutlook-${randomUUID()}`;

function shiftDate(date, days) {
  const shifted = new Date(`${date}T00:00:00.000Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

function observation(commodity, market, arrivalDate, modalPrice, overrides = {}) {
  return {
    commodity,
    variety: 'Standard',
    grade: 'FAQ',
    market,
    district: 'District Alpha',
    state: 'Karnataka',
    arrival_date: arrivalDate,
    min_price: modalPrice,
    max_price: modalPrice,
    modal_price: modalPrice,
    ...overrides,
  };
}

const databaseDateResult = await pool.query(
  'SELECT MAX(arrival_date)::text AS data_as_of FROM price_history'
);
const fixtureDateAsOf = shiftDate(databaseDateResult.rows[0].data_as_of, 60);
const recentDate = shiftDate(fixtureDateAsOf, -15);
const previousDate = shiftDate(fixtureDateAsOf, -45);
const fixtureRows = [];

for (let marketNumber = 1; marketNumber <= 4; marketNumber += 1) {
  fixtureRows.push(observation(
    `${marker} Wide`,
    `${marker} Wide Market ${marketNumber}`,
    fixtureDateAsOf,
    50
  ));
}

fixtureRows.push(
  observation(`${marker} Rising`, `${marker} Rising Old`, previousDate, 100),
  observation(`${marker} Rising`, `${marker} Rising Recent`, recentDate, 120),
  observation(`${marker} Rising`, `${marker} Rising Anchor`, fixtureDateAsOf, 120),
  observation(`${marker} Moderate`, `${marker} Moderate Old`, previousDate, 75),
  observation(`${marker} Moderate`, `${marker} Moderate Recent`, recentDate, 75),
  observation(`${marker} Moderate`, `${marker} Moderate Recent`, fixtureDateAsOf, 75),
  observation(`${marker} Stable`, `${marker} Stable Old`, previousDate, 100),
  observation(`${marker} Stable`, `${marker} Stable Recent`, recentDate, 100),
  observation(`${marker} Stable`, `${marker} Stable Recent`, fixtureDateAsOf, 100),
  observation(`${marker} Falling`, `${marker} Falling Same Market`, previousDate, 120),
  observation(`${marker} Falling`, `${marker} Falling Same Market`, recentDate, 90),
  observation(`${marker} Falling`, `${marker} Falling Same Market`, fixtureDateAsOf, 90),
  observation(
    `${marker} Single`,
    `${marker} Single Market`,
    fixtureDateAsOf,
    25,
    { variety: 'HiddenNeedle Variety' }
  )
);

await insertManyPriceHistory(fixtureRows);

test.after(async () => {
  await pool.query('DELETE FROM price_history WHERE commodity LIKE $1', [`${marker}%`]);
});

function outlookUrl(query = {}) {
  const parameters = new URLSearchParams(query);
  return `/api/prices/demand-outlook${parameters.size ? `?${parameters}` : ''}`;
}

async function fetchOutlook(query = {}) {
  return request(app).get(outlookUrl(query));
}

function findCommodity(response, suffix) {
  return response.body.outlook.find((item) => item.commodity === `${marker} ${suffix}`);
}

test('endpoint is public and available without authentication', async () => {
  const response = await fetchOutlook({ search: marker });

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
});

test('response includes the complete outlook metadata and item shape', async () => {
  const response = await fetchOutlook({ search: marker });

  assert.deepEqual(
    Object.keys(response.body).sort(),
    ['success', 'dataAsOf', 'forecastPeriod', 'comparisonPeriod', 'methodology', 'outlook'].sort()
  );
  assert.deepEqual(
    Object.keys(response.body.outlook[0]).sort(),
    [
      'rank',
      'commodity',
      'score',
      'outlook',
      'direction',
      'trendStatus',
      'currentAverageModalPrice',
      'previousAverageModalPrice',
      'priceChangePercent',
      'marketCount',
      'observationCount',
    ].sort()
  );
});

test('forecast and comparison windows are deterministic relative to the data-as-of date', async () => {
  const response = await fetchOutlook({ search: marker });

  assert.equal(response.body.dataAsOf, fixtureDateAsOf);
  assert.deepEqual(response.body.forecastPeriod, {
    from: shiftDate(fixtureDateAsOf, 1),
    to: shiftDate(fixtureDateAsOf, 30),
  });
  assert.deepEqual(response.body.comparisonPeriod, {
    recent: { from: shiftDate(fixtureDateAsOf, -29), to: fixtureDateAsOf },
    previous: {
      from: shiftDate(fixtureDateAsOf, -59),
      to: shiftDate(fixtureDateAsOf, -30),
    },
  });
});

test('ranking assigns sequential ranks and sorts by descending opportunity score', async () => {
  const response = await fetchOutlook({ search: marker });

  assert.deepEqual(response.body.outlook.map((item) => item.rank), [1, 2, 3, 4, 5, 6]);
  for (let index = 1; index < response.body.outlook.length; index += 1) {
    assert.ok(response.body.outlook[index - 1].score >= response.body.outlook[index].score);
  }
});

test('every returned score remains in the inclusive 0-to-100 range', async () => {
  const response = await fetchOutlook({ search: marker });

  assert.ok(response.body.outlook.every((item) => item.score >= 0 && item.score <= 100));
});

test('widest market coverage normalizes to a score of 100', async () => {
  const response = await fetchOutlook({ search: marker });

  assert.equal(findCommodity(response, 'Wide').score, 100);
  assert.equal(findCommodity(response, 'Wide').marketCount, 4);
});

test('market-coverage classification returns HIGH for the upper equal-width band', () => {
  assert.equal(classifyMarketOpportunity(100), 'HIGH');
  assert.equal(classifyMarketOpportunity(66.67), 'HIGH');
  assert.equal(classifyMarketOpportunity(66.66), 'MEDIUM');
});

test('market-coverage classification returns MEDIUM for the middle equal-width band', () => {
  assert.equal(classifyMarketOpportunity(50), 'MEDIUM');
  assert.equal(classifyMarketOpportunity(33.33), 'MEDIUM');
  assert.equal(classifyMarketOpportunity(33.32), 'LOW');
});

test('market-coverage classification returns LOW for the lowest equal-width band', () => {
  assert.equal(classifyMarketOpportunity(25), 'LOW');
  assert.equal(classifyMarketOpportunity(0), 'LOW');
});

test('price direction classifies positive movement as RISING', () => {
  assert.equal(classifyPriceDirection(0.01), 'RISING');
  assert.equal(classifyPriceDirection(20), 'RISING');
});

test('price direction classifies zero movement as STABLE', () => {
  assert.equal(classifyPriceDirection(0), 'STABLE');
});

test('price direction classifies negative movement as FALLING', () => {
  assert.equal(classifyPriceDirection(-0.01), 'FALLING');
  assert.equal(classifyPriceDirection(-25), 'FALLING');
});

test('price direction remains unavailable when comparison history is missing', () => {
  assert.equal(classifyPriceDirection(null), null);
  assert.equal(getPriceTrendStatus(120, null), 'INSUFFICIENT_HISTORY');
  assert.equal(getPriceTrendStatus(null, 100), 'INSUFFICIENT_HISTORY');
});

test('rising fixture derives a positive price change from the two windows', async () => {
  const response = await fetchOutlook({ commodity: `${marker} Rising` });
  const item = response.body.outlook[0];

  assert.equal(item.currentAverageModalPrice, 120);
  assert.equal(item.previousAverageModalPrice, 100);
  assert.equal(item.priceChangePercent, 20);
  assert.equal(item.direction, 'RISING');
  assert.equal(item.trendStatus, 'AVAILABLE');
});

test('stable fixture derives zero price change from the two windows', async () => {
  const response = await fetchOutlook({ commodity: `${marker} Stable` });
  const item = response.body.outlook[0];

  assert.equal(item.priceChangePercent, 0);
  assert.equal(item.direction, 'STABLE');
});

test('falling fixture derives negative price change from the two windows', async () => {
  const response = await fetchOutlook({ commodity: `${marker} Falling` });
  const item = response.body.outlook[0];

  assert.equal(item.currentAverageModalPrice, 90);
  assert.equal(item.previousAverageModalPrice, 120);
  assert.equal(item.priceChangePercent, -25);
  assert.equal(item.direction, 'FALLING');
});

test('one-snapshot commodity reports an unavailable direction, not an invented trend', async () => {
  const response = await fetchOutlook({ commodity: `${marker} Single` });
  const item = response.body.outlook[0];

  assert.equal(item.currentAverageModalPrice, 25);
  assert.equal(item.previousAverageModalPrice, null);
  assert.equal(item.priceChangePercent, null);
  assert.equal(item.direction, null);
  assert.equal(item.trendStatus, 'INSUFFICIENT_HISTORY');
});

test('market opportunity score handles zero and maximum coverage boundaries', () => {
  assert.equal(getMarketOpportunityScore(0, 4), 0);
  assert.equal(getMarketOpportunityScore(4, 4), 100);
  assert.equal(getMarketOpportunityScore(1, 4), 25);
  assert.equal(getMarketOpportunityScore(4, 0), 0);
});

test('percentage calculation is null when the previous average is zero', () => {
  assert.equal(calculatePriceChangePercent(10, 0), null);
  assert.equal(getPriceTrendStatus(10, 0), 'UNDEFINED_BASELINE');
});

test('commodity filter is exact and case-insensitive', async () => {
  const response = await fetchOutlook({ commodity: `${marker.toLowerCase()} rising` });

  assert.equal(response.status, 200);
  assert.equal(response.body.outlook.length, 1);
  assert.equal(response.body.outlook[0].commodity, `${marker} Rising`);
});

test('state filter is case-insensitive', async () => {
  const response = await fetchOutlook({ commodity: `${marker} Rising`, state: 'kArNaTaKa' });

  assert.equal(response.status, 200);
  assert.equal(response.body.outlook.length, 1);
  assert.equal(response.body.outlook[0].commodity, `${marker} Rising`);
});

test('district filter is case-insensitive', async () => {
  const response = await fetchOutlook({
    commodity: `${marker} Rising`,
    district: 'district alpha',
  });

  assert.equal(response.body.outlook.length, 1);
});

test('market filter is case-insensitive', async () => {
  const response = await fetchOutlook({
    commodity: `${marker} Rising`,
    market: `${marker.toLowerCase()} rising recent`,
  });

  assert.equal(response.body.outlook.length, 1);
  assert.equal(response.body.outlook[0].marketCount, 1);
});

test('search is case-insensitive and searches variety values', async () => {
  const response = await fetchOutlook({ search: 'hiddenneedle' });

  assert.equal(response.body.outlook.length, 1);
  assert.equal(response.body.outlook[0].commodity, `${marker} Single`);
});

test('fromDate filter includes its boundary date', async () => {
  const response = await fetchOutlook({
    commodity: `${marker} Rising`,
    fromDate: recentDate,
  });

  assert.equal(response.body.outlook[0].observationCount, 2);
  assert.equal(response.body.outlook[0].currentAverageModalPrice, 120);
});

test('toDate filter includes its boundary date', async () => {
  const response = await fetchOutlook({
    commodity: `${marker} Rising`,
    toDate: previousDate,
  });

  assert.equal(response.body.outlook[0].observationCount, 1);
  assert.equal(response.body.outlook[0].currentAverageModalPrice, null);
});

test('multiple text and date filters combine against the same observations', async () => {
  const response = await fetchOutlook({
    commodity: `${marker} Rising`,
    state: 'KARNATAKA',
    district: 'district alpha',
    market: `${marker} Rising Recent`,
    fromDate: recentDate,
    toDate: recentDate,
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.outlook.length, 1);
  assert.equal(response.body.outlook[0].observationCount, 1);
  assert.equal(response.body.outlook[0].currentAverageModalPrice, 120);
});

test('invalid fromDate is rejected', async () => {
  const response = await fetchOutlook({ fromDate: '2100-02-30' });

  assert.equal(response.status, 400);
});

test('invalid toDate is rejected', async () => {
  const response = await fetchOutlook({ toDate: '2100-1-01' });

  assert.equal(response.status, 400);
});

test('reversed date bounds are rejected', async () => {
  const response = await fetchOutlook({ fromDate: recentDate, toDate: previousDate });

  assert.equal(response.status, 400);
});

test('default limit returns all matching fixtures up to the default cap', async () => {
  const response = await fetchOutlook({ search: marker });

  assert.equal(response.body.outlook.length, 6);
});

test('limit of one returns only the top-ranked commodity', async () => {
  const response = await fetchOutlook({ search: marker, limit: '1' });

  assert.equal(response.status, 200);
  assert.equal(response.body.outlook.length, 1);
  assert.equal(response.body.outlook[0].commodity, `${marker} Wide`);
  assert.equal(response.body.outlook[0].rank, 1);
});

test('maximum allowed limit is accepted', async () => {
  const response = await fetchOutlook({ search: marker, limit: '50' });

  assert.equal(response.status, 200);
  assert.equal(response.body.outlook.length, 6);
});

test('limit above the maximum is rejected', async () => {
  const response = await fetchOutlook({ limit: '51' });

  assert.equal(response.status, 400);
});

test('zero, malformed, and repeated limits are rejected', async () => {
  const zero = await fetchOutlook({ limit: '0' });
  const malformed = await fetchOutlook({ limit: '1.5' });
  const repeated = await request(app).get('/api/prices/demand-outlook?limit=1&limit=2');

  assert.equal(zero.status, 400);
  assert.equal(malformed.status, 400);
  assert.equal(repeated.status, 400);
});

test('empty results return an empty outlook list', async () => {
  const response = await fetchOutlook({ commodity: `${marker} Missing` });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.outlook, []);
});

test('applying a smaller limit does not change the top commodity score', async () => {
  const full = await fetchOutlook({ search: marker });
  const limited = await fetchOutlook({ search: marker, limit: '1' });

  assert.equal(limited.body.outlook[0].score, full.body.outlook[0].score);
});

test('repeated calls return deterministic rankings and scores', async () => {
  const first = await fetchOutlook({ search: marker });
  const second = await fetchOutlook({ search: marker });

  assert.deepEqual(first.body.outlook, second.body.outlook);
});

test('generated Swagger includes filters, response schema, example, and caveat', async () => {
  const response = await request(app).get('/api/docs.json');
  const operation = response.body.paths['/api/prices/demand-outlook'].get;
  const schema = operation.responses['200'].content['application/json'].schema;

  assert.equal(response.status, 200);
  assert.deepEqual(
    operation.parameters.map((parameter) => parameter.name).sort(),
    ['state', 'district', 'market', 'commodity', 'fromDate', 'toDate', 'search', 'limit'].sort()
  );
  assert.equal(schema.properties.outlook.items.$ref, '#/components/schemas/DemandOutlookItem');
  assert.match(operation.description, /not measured buyer demand/i);
  assert.ok(operation.responses['200'].content['application/json'].example);
});

test('two commodities agree with direct PostgreSQL aggregate values', async () => {
  const response = await fetchOutlook({ search: marker });

  for (const suffix of ['Rising', 'Falling']) {
    const commodity = `${marker} ${suffix}`;
    const direct = await pool.query(
      `SELECT
         COUNT(*)::int AS observation_count,
         COUNT(DISTINCT market)::int AS market_count,
         ROUND(AVG(modal_price) FILTER (
           WHERE arrival_date BETWEEN $2::date - INTERVAL '29 days' AND $2::date
         ), 2) AS current_average,
         ROUND(AVG(modal_price) FILTER (
           WHERE arrival_date BETWEEN $2::date - INTERVAL '59 days'
             AND $2::date - INTERVAL '30 days'
         ), 2) AS previous_average
       FROM price_history
       WHERE commodity = $1`,
      [commodity, fixtureDateAsOf]
    );
    const item = findCommodity(response, suffix);
    const expected = direct.rows[0];

    assert.equal(item.observationCount, expected.observation_count);
    assert.equal(item.marketCount, expected.market_count);
    assert.equal(item.currentAverageModalPrice, Number(expected.current_average));
    assert.equal(item.previousAverageModalPrice, Number(expected.previous_average));
  }
});

test('SQL-looking filter input is treated as data and returns no matches', async () => {
  const response = await fetchOutlook({ commodity: `${marker}' OR '1'='1` });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.outlook, []);
});
