import test from 'node:test';
import assert from 'node:assert/strict';
import { AppError } from '../utils/AppError.js';
import { createAdminChatAnalyticsModel } from '../models/adminChatAnalyticsModel.js';
import {
  createAdminChatContext,
  mergeAdminChatFollowUp,
} from '../utils/adminChatIntentValidator.js';

const EMPTY_FILTERS = {
  entity: null,
  role: null,
  status: null,
  category: null,
  orderStatus: null,
  dateRange: null,
  location: null,
  comparison: null,
};

function makeFilters(overrides = {}) {
  return { ...EMPTY_FILTERS, ...overrides };
}

function makeIntent(operation, filters = makeFilters()) {
  return {
    intent: 'analytics',
    operation,
    filters,
    clarificationQuestion: null,
  };
}

function makeDatabase({ rows = [], queryError = null, failAt = [] } = {}) {
  const calls = [];
  const failureStages = new Set(Array.isArray(failAt) ? failAt : [failAt]);
  const failure = queryError || Object.assign(new Error('mock database failure'), {
    code: 'XX000',
  });
  let connectCount = 0;
  let releaseCount = 0;
  const database = {
    async connect() {
      connectCount += 1;
      return {
        async query(text, values = []) {
          calls.push({ text, values });
          const isAggregateQuery = text.startsWith('SELECT ')
            && !text.startsWith('SELECT set_config');
          const stage = isAggregateQuery
            ? 'aggregate'
            : text.startsWith('SELECT set_config')
              ? 'set_config'
              : text;
          if (failureStages.has(stage) || failureStages.has(text)) {
            throw failure;
          }
          if (text.startsWith('SELECT set_config')) {
            return { rows: [] };
          }
          if (text.startsWith('SELECT ')) {
            return { rows };
          }
          return { rows: [] };
        },
        release() {
          releaseCount += 1;
        },
      };
    },
  };
  return {
    database,
    calls,
    get connectCount() { return connectCount; },
    get releaseCount() { return releaseCount; },
  };
}

function createExecutor(databaseFixture, { clock, logger, queryTimeoutMs } = {}) {
  return createAdminChatAnalyticsModel({
    database: databaseFixture.database,
    clock: clock || (() => new Date('2026-11-24T12:00:00.000Z')),
    logger: logger || { error() {} },
    queryTimeoutMs,
  });
}

function aggregateQuery(calls) {
  return calls.find(({ text }) => text.startsWith('SELECT ') && !text.startsWith('SELECT set_config'));
}

test('executes parameterized user counts with role, status, location, and resolved dates', async () => {
  const fixture = makeDatabase({ rows: [{ count: '12' }] });
  const execute = createExecutor(fixture);
  const result = await execute(makeIntent('count_users', makeFilters({
    role: 'farmer',
    status: 'active',
    dateRange: { type: 'relative', value: 'last_7_days' },
    location: { state: 'Karnataka', district: 'Nashik' },
  })));

  assert.deepEqual(result, { operation: 'count_users', entity: 'users', count: 12 });
  const query = aggregateQuery(fixture.calls);
  assert.match(query.text, /FROM users u/);
  assert.match(query.text, /u\.role = \$1/);
  assert.match(query.text, /u\.status = \$2/);
  assert.match(query.text, /POSITION\(LOWER\(\$3\) IN LOWER\(u\.location\)\)/);
  assert.match(query.text, /u\.created_at >=/);
  assert.deepEqual(query.values, [
    'farmer',
    'active',
    'Karnataka',
    'Nashik',
    '2026-11-18',
    '2026-11-24',
  ]);
  assert.equal(fixture.calls[0].text, 'BEGIN READ ONLY');
  assert.match(fixture.calls[1].text, /set_config\('statement_timeout'/);
  assert.deepEqual(fixture.calls[1].values, ['5000ms']);
  assert.equal(fixture.calls.at(-1).text, 'COMMIT');
  assert.equal(fixture.releaseCount, 1);
});

test('executes crop counts using only schema-supported crop filters', async () => {
  const fixture = makeDatabase({ rows: [{ count: '4' }] });
  const execute = createExecutor(fixture);
  const result = await execute(makeIntent('count_crops', makeFilters({
    status: 'available',
    category: 'Vegetables',
    location: { state: null, district: 'Nashik' },
  })));

  assert.deepEqual(result, { operation: 'count_crops', entity: 'crops', count: 4 });
  const query = aggregateQuery(fixture.calls);
  assert.match(query.text, /FROM crops c/);
  assert.match(query.text, /c\.status = \$1/);
  assert.match(query.text, /LOWER\(c\.category\) = LOWER\(\$2\)/);
  assert.match(query.text, /c\.location/);
  assert.deepEqual(query.values, ['available', 'Vegetables', 'Nashik']);
});

test('executes order counts with status and crop-location join filters', async () => {
  const fixture = makeDatabase({ rows: [{ count: '3' }] });
  const execute = createExecutor(fixture);
  const result = await execute(makeIntent('count_orders', makeFilters({
    orderStatus: 'pending',
    location: { state: 'Maharashtra', district: null },
    dateRange: { type: 'custom', from: '2026-10-01', to: '2026-10-31' },
  })));

  assert.deepEqual(result, { operation: 'count_orders', entity: 'orders', count: 3 });
  const query = aggregateQuery(fixture.calls);
  assert.match(query.text, /FROM orders o JOIN crops c ON c\.id = o\.crop_id/);
  assert.match(query.text, /o\.status = \$1/);
  assert.match(query.text, /POSITION\(LOWER\(\$2\) IN LOWER\(c\.location\)\)/);
  assert.deepEqual(query.values, [
    'pending',
    'Maharashtra',
    '2026-10-01',
    '2026-10-31',
  ]);
});

test('reports delivered order value as gross value, not platform revenue', async () => {
  const fixture = makeDatabase({
    rows: [{ gross_delivered_order_value: '1234.50', delivered_order_count: '5' }],
  });
  const execute = createExecutor(fixture);
  const result = await execute(makeIntent('delivered_order_value'));

  assert.deepEqual(result, {
    operation: 'delivered_order_value',
    entity: 'orders',
    grossDeliveredOrderValue: '1234.50',
    deliveredOrderCount: 5,
    interpretation: 'Gross delivered order value; not platform revenue.',
  });
  const query = aggregateQuery(fixture.calls);
  assert.match(query.text, /o\.status = 'delivered'/);
  assert.match(query.text, /SUM\(o\.total_amount\)/);
});

test('compares periods using validated date bounds and aggregate counts', async () => {
  const fixture = makeDatabase({
    rows: [{ current_count: '8', previous_count: '6' }],
  });
  const execute = createExecutor(fixture);
  const result = await execute(makeIntent('compare_periods', makeFilters({
    entity: 'users',
    role: 'buyer',
    comparison: {
      current: { type: 'relative', value: 'this_month' },
      previous: { type: 'relative', value: 'last_month' },
    },
  })));

  assert.deepEqual(result, {
    operation: 'compare_periods',
    entity: 'users',
    metric: 'count',
    current: { from: '2026-11-01', to: '2026-11-24', count: 8 },
    previous: { from: '2026-10-01', to: '2026-10-31', count: 6 },
  });
  const query = aggregateQuery(fixture.calls);
  assert.match(query.text, /COUNT\(\*\) FILTER \(WHERE u\.created_at/);
  assert.deepEqual(query.values, [
    'buyer',
    '2026-11-01',
    '2026-11-24',
    '2026-10-01',
    '2026-10-31',
  ]);
});

test('compares delivered value with aggregate-only results and fixed order status', async () => {
  const fixture = makeDatabase({
    rows: [{
      current_value: '300.00',
      previous_value: '175.50',
      current_count: '2',
      previous_count: '1',
    }],
  });
  const execute = createExecutor(fixture);
  const result = await execute(makeIntent('delivered_order_value', makeFilters({
    comparison: {
      current: { type: 'custom', from: '2026-10-01', to: '2026-10-31' },
      previous: { type: 'custom', from: '2026-09-01', to: '2026-09-30' },
    },
  })));

  assert.equal(result.metric, 'gross_delivered_order_value');
  assert.equal(result.current.value, '300.00');
  assert.equal(result.previous.deliveredOrderCount, 1);
  assert.match(result.interpretation, /not platform revenue/i);
  const query = aggregateQuery(fixture.calls);
  assert.match(query.text, /o\.status = 'delivered'/);
  assert.deepEqual(query.values, [
    '2026-10-01',
    '2026-10-31',
    '2026-09-01',
    '2026-09-30',
  ]);
});

test('handles empty aggregate results with zero-valued output', async () => {
  const countFixture = makeDatabase({ rows: [] });
  const count = await createExecutor(countFixture)(makeIntent('count_crops'));
  assert.equal(count.count, 0);

  const valueFixture = makeDatabase({ rows: [] });
  const value = await createExecutor(valueFixture)(makeIntent('delivered_order_value'));
  assert.equal(value.grossDeliveredOrderValue, '0');
  assert.equal(value.deliveredOrderCount, 0);
});

test('rejects malformed, missing, null, extra, and multiple aggregate rows', async () => {
  const malformedRows = [
    [{}],
    [{ count: null }],
    [{ count: '2', email: 'private@example.test' }],
    [{ count: '2' }, { count: '3' }],
    null,
  ];

  for (const rows of malformedRows) {
    const fixture = makeDatabase({ rows });
    const execute = createExecutor(fixture);
    await assert.rejects(
      execute(makeIntent('count_users')),
      (error) => error instanceof AppError
        && error.status === 503
        && error.message === 'Unable to retrieve administrator analytics right now.',
    );
    assert.equal(fixture.calls.at(-1).text, 'ROLLBACK');
    assert.equal(fixture.releaseCount, 1);
  }
});

test('preserves validated follow-up filters and rejects overlapping comparison periods', async () => {
  const previousContext = createAdminChatContext(makeIntent('count_users', makeFilters({
    role: 'buyer',
    dateRange: { type: 'custom', from: '2026-10-01', to: '2026-10-31' },
  })));
  const followUp = mergeAdminChatFollowUp({
    intent: 'follow_up',
    operation: 'count_users',
    filters: makeFilters({ role: 'farmer' }),
    clarificationQuestion: null,
  }, previousContext);
  const fixture = makeDatabase({ rows: [{ count: '2' }] });
  const result = await createExecutor(fixture)(followUp);

  assert.equal(result.count, 2);
  assert.deepEqual(aggregateQuery(fixture.calls).values, [
    'farmer',
    '2026-10-01',
    '2026-10-31',
  ]);

  const overlappingFixture = makeDatabase();
  await assert.rejects(
    createExecutor(overlappingFixture)(makeIntent('compare_periods', makeFilters({
      entity: 'users',
      comparison: {
        current: { type: 'custom', from: '2026-10-01', to: '2026-10-31' },
        previous: { type: 'custom', from: '2026-09-20', to: '2026-10-02' },
      },
    }))),
    (error) => error instanceof AppError && error.status === 400,
  );
  assert.equal(overlappingFixture.connectCount, 0);
});

test('rejects unsupported operations, extra fields, and SQL-like filters before connecting', async () => {
  const fixture = makeDatabase();
  const execute = createExecutor(fixture);
  const invalidIntents = [
    { ...makeIntent('count_users'), operation: 'SELECT * FROM users' },
    { ...makeIntent('count_users'), sql: 'SELECT 1' },
    makeIntent('count_crops', makeFilters({
      location: { state: "Karnataka'; DROP TABLE users; --", district: null },
    })),
    makeIntent('count_users', makeFilters({ category: 'Vegetables' })),
  ];

  for (const intent of invalidIntents) {
    await assert.rejects(
      execute(intent),
      (error) => error instanceof AppError && error.status === 400,
    );
  }
  assert.equal(fixture.connectCount, 0);
  assert.equal(fixture.calls.length, 0);
});

test('maps database timeouts to a generic error, rolls back, and releases the client', async () => {
  const logs = [];
  const fixture = makeDatabase({
    queryError: Object.assign(new Error('private connection string and SQL text'), {
      code: '57014',
    }),
    failAt: ['aggregate'],
  });
  const execute = createExecutor(fixture, {
    logger: { error: (...args) => logs.push(args) },
  });

  await assert.rejects(
    execute(makeIntent('count_orders')),
    (error) => error instanceof AppError
      && error.status === 503
      && error.message === 'Unable to retrieve administrator analytics right now.',
  );
  assert.equal(fixture.calls.at(-1).text, 'ROLLBACK');
  assert.equal(fixture.releaseCount, 1);
  assert.equal(logs.length, 1);
  assert.doesNotMatch(JSON.stringify(logs), /private connection string|SQL text/);
});

test('rolls back and releases when transaction setup or commit fails', async () => {
  for (const stage of ['BEGIN READ ONLY', 'set_config', 'COMMIT']) {
    const fixture = makeDatabase({
      rows: [{ count: '1' }],
      failAt: [stage],
      queryError: Object.assign(new Error(`private failure at ${stage}`), { code: '08006' }),
    });
    const execute = createExecutor(fixture);
    await assert.rejects(
      execute(makeIntent('count_users')),
      (error) => error instanceof AppError && error.status === 503,
    );

    const statements = fixture.calls.map(({ text }) => text);
    assert.equal(statements.includes('ROLLBACK'), stage !== 'BEGIN READ ONLY');
    assert.equal(fixture.releaseCount, 1);
  }
});

test('logs rollback failure safely and still returns a generic database error', async () => {
  const logs = [];
  const fixture = makeDatabase({
    failAt: ['aggregate', 'ROLLBACK'],
    queryError: Object.assign(new Error('secret db host and SQL text'), { code: '08006' }),
  });
  const execute = createExecutor(fixture, {
    logger: { error: (...args) => logs.push(args) },
  });

  await assert.rejects(
    execute(makeIntent('count_crops')),
    (error) => error instanceof AppError && error.status === 503,
  );
  assert.equal(fixture.releaseCount, 1);
  assert.equal(logs.length, 2);
  assert.doesNotMatch(JSON.stringify(logs), /secret db host|SQL text/);
});

test('rejects excessive configured timeouts and never executes user SQL', async () => {
  const fixture = makeDatabase();
  assert.throws(
    () => createExecutor(fixture, { queryTimeoutMs: 60_000 }),
    /between 100 and 10000 ms/,
  );

  const execute = createExecutor(fixture);
  const intent = makeIntent('count_users');
  intent.filters.location = { state: 'users WHERE TRUE; SELECT 1', district: null };
  await assert.rejects(
    execute(intent),
    (error) => error instanceof AppError && error.status === 400,
  );
  assert.equal(fixture.calls.length, 0);
});
