import { pool } from '../config/db.js';
import { AppError } from '../utils/AppError.js';
import { validateAdminChatIntent } from '../utils/adminChatIntentValidator.js';

export const ADMIN_CHAT_QUERY_TIMEOUT_MS = 5000;
const MAX_CONFIGURED_QUERY_TIMEOUT_MS = 10_000;

const SOURCES = Object.freeze({
  users: Object.freeze({
    from: 'users u',
    createdAt: 'u.created_at',
    location: 'u.location',
    role: 'u.role',
    status: 'u.status',
  }),
  crops: Object.freeze({
    from: 'crops c',
    createdAt: 'c.created_at',
    location: 'c.location',
    category: 'c.category',
    status: 'c.status',
  }),
  orders: Object.freeze({
    from: 'orders o JOIN crops c ON c.id = o.crop_id',
    createdAt: 'o.created_at',
    location: 'c.location',
    orderStatus: 'o.status',
  }),
});

function assertQueryTimeout(timeoutMs) {
  if (
    !Number.isSafeInteger(timeoutMs)
    || timeoutMs < 100
    || timeoutMs > MAX_CONFIGURED_QUERY_TIMEOUT_MS
  ) {
    throw new TypeError('Admin analytics query timeout must be between 100 and 10000 ms.');
  }
}

function getReferenceDate(clock) {
  const date = clock();
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new AppError(500, 'Admin analytics date resolution is unavailable.');
  }
  return date;
}

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function shiftUtcDays(date, days) {
  const shifted = new Date(date.getTime());
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted;
}

function resolveDateRange(range, referenceDate) {
  if (!range) {
    return null;
  }
  if (range.type === 'custom') {
    return { from: range.from, to: range.to };
  }

  const today = new Date(Date.UTC(
    referenceDate.getUTCFullYear(),
    referenceDate.getUTCMonth(),
    referenceDate.getUTCDate(),
  ));
  const todayText = toIsoDate(today);

  if (range.value === 'today') {
    return { from: todayText, to: todayText };
  }
  if (range.value === 'last_7_days') {
    return { from: toIsoDate(shiftUtcDays(today, -6)), to: todayText };
  }
  if (range.value === 'last_30_days') {
    return { from: toIsoDate(shiftUtcDays(today, -29)), to: todayText };
  }
  if (range.value === 'this_month') {
    const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    return { from: toIsoDate(monthStart), to: todayText };
  }
  if (range.value === 'last_month') {
    const previousMonthStart = new Date(Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth() - 1,
      1,
    ));
    const previousMonthEnd = new Date(Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth(),
      0,
    ));
    return {
      from: toIsoDate(previousMonthStart),
      to: toIsoDate(previousMonthEnd),
    };
  }

  throw new AppError(400, 'Unsupported administrator analytics date range.');
}

function addParameter(values, value) {
  values.push(value);
  return `$${values.length}`;
}

function buildDatePredicate(column, range, values, referenceDate) {
  const resolved = resolveDateRange(range, referenceDate);
  if (!resolved) {
    return { predicate: null, resolved: null };
  }

  const from = addParameter(values, resolved.from);
  const to = addParameter(values, resolved.to);
  return {
    predicate: `${column} >= (${from}::date::timestamp AT TIME ZONE 'UTC')`
      + ` AND ${column} < ((${to}::date + 1)::timestamp AT TIME ZONE 'UTC')`,
    resolved,
  };
}

function buildCommonFilters(entity, filters, values) {
  const source = SOURCES[entity];
  const conditions = [];

  if (filters.role !== null) {
    conditions.push(`${source.role} = ${addParameter(values, filters.role)}`);
  }
  if (filters.status !== null) {
    conditions.push(`${source.status} = ${addParameter(values, filters.status)}`);
  }
  if (filters.category !== null) {
    const category = addParameter(values, filters.category);
    conditions.push(`LOWER(${source.category}) = LOWER(${category})`);
  }
  if (filters.orderStatus !== null) {
    conditions.push(`${source.orderStatus} = ${addParameter(values, filters.orderStatus)}`);
  }
  if (filters.location !== null) {
    for (const value of [filters.location.state, filters.location.district]) {
      if (value !== null) {
        const locationTerm = addParameter(values, value);
        conditions.push(`POSITION(LOWER(${locationTerm}) IN LOWER(${source.location})) > 0`);
      }
    }
  }

  return conditions;
}

function buildQuery(intent, referenceDate) {
  const { operation, filters } = intent;
  const entity = filters.entity;
  const source = SOURCES[entity];
  const values = [];
  const conditions = buildCommonFilters(entity, filters, values);

  if (operation === 'delivered_order_value') {
    conditions.push("o.status = 'delivered'");
  }

  if (operation === 'compare_periods') {
    const currentPeriod = buildDatePredicate(
      source.createdAt,
      filters.comparison.current,
      values,
      referenceDate,
    );
    const previousPeriod = buildDatePredicate(
      source.createdAt,
      filters.comparison.previous,
      values,
      referenceDate,
    );
    const select = operation === 'compare_periods'
      ? `COUNT(*) FILTER (WHERE ${currentPeriod.predicate})::text AS current_count, `
        + `COUNT(*) FILTER (WHERE ${previousPeriod.predicate})::text AS previous_count`
      : '';
    return {
      text: `SELECT ${select} FROM ${source.from} WHERE ${conditions.join(' AND ') || 'TRUE'}`,
      values,
      kind: 'comparison',
      operation,
      entity,
      currentPeriod: currentPeriod.resolved,
      previousPeriod: previousPeriod.resolved,
    };
  }

  if (operation === 'delivered_order_value' && filters.comparison !== null) {
    const currentPeriod = buildDatePredicate(
      source.createdAt,
      filters.comparison.current,
      values,
      referenceDate,
    );
    const previousPeriod = buildDatePredicate(
      source.createdAt,
      filters.comparison.previous,
      values,
      referenceDate,
    );
    return {
      text: `SELECT `
        + `COALESCE(SUM(o.total_amount) FILTER (WHERE ${currentPeriod.predicate}), 0)::text AS current_value, `
        + `COALESCE(SUM(o.total_amount) FILTER (WHERE ${previousPeriod.predicate}), 0)::text AS previous_value, `
        + `COUNT(*) FILTER (WHERE ${currentPeriod.predicate})::text AS current_count, `
        + `COUNT(*) FILTER (WHERE ${previousPeriod.predicate})::text AS previous_count `
        + `FROM ${source.from} WHERE ${conditions.join(' AND ') || 'TRUE'}`,
      values,
      kind: 'delivered_comparison',
      operation,
      entity,
      currentPeriod: currentPeriod.resolved,
      previousPeriod: previousPeriod.resolved,
    };
  }

  if (filters.dateRange !== null) {
    const dateFilter = buildDatePredicate(
      source.createdAt,
      filters.dateRange,
      values,
      referenceDate,
    );
    conditions.push(dateFilter.predicate);
  }

  if (operation === 'delivered_order_value') {
    return {
      text: `SELECT COALESCE(SUM(o.total_amount), 0)::text AS gross_delivered_order_value, `
        + `COUNT(*)::text AS delivered_order_count FROM ${source.from} `
        + `WHERE ${conditions.join(' AND ') || 'TRUE'}`,
      values,
      kind: 'delivered_value',
      operation,
      entity,
    };
  }

  return {
    text: `SELECT COUNT(*)::text AS count FROM ${source.from} `
      + `WHERE ${conditions.join(' AND ') || 'TRUE'}`,
    values,
    kind: 'count',
    operation,
    entity,
  };
}

function normalizeCount(value) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new Error('Invalid aggregate count returned by PostgreSQL.');
  }
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error('Invalid aggregate count returned by PostgreSQL.');
  }
  return count;
}

function normalizeMoney(value) {
  if (typeof value !== 'string' || !/^\d+(?:\.\d{1,2})?$/.test(value)) {
    throw new Error('Invalid aggregate value returned by PostgreSQL.');
  }
  return value;
}

const AGGREGATE_FIELDS = Object.freeze({
  count: ['count'],
  delivered_value: ['gross_delivered_order_value', 'delivered_order_count'],
  comparison: ['current_count', 'previous_count'],
  delivered_comparison: [
    'current_value',
    'previous_value',
    'current_count',
    'previous_count',
  ],
});

function getAggregateRow(result, expectedFields) {
  if (!Array.isArray(result?.rows) || result.rows.length > 1) {
    throw new Error('Unexpected aggregate query result shape.');
  }
  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  if (
    row === null
    || typeof row !== 'object'
    || Array.isArray(row)
    || Object.keys(row).length !== expectedFields.length
    || !expectedFields.every((field) => Object.hasOwn(row, field))
  ) {
    throw new Error('Unexpected aggregate query result shape.');
  }
  return row;
}

function formatResult(plan, row) {
  const aggregate = row || Object.fromEntries(
    AGGREGATE_FIELDS[plan.kind].map((field) => [field, '0']),
  );
  if (plan.kind === 'count') {
    return {
      operation: plan.operation,
      entity: plan.entity,
      count: normalizeCount(aggregate.count),
    };
  }

  if (plan.kind === 'delivered_value') {
    return {
      operation: plan.operation,
      entity: 'orders',
      grossDeliveredOrderValue: normalizeMoney(aggregate.gross_delivered_order_value),
      deliveredOrderCount: normalizeCount(aggregate.delivered_order_count),
      interpretation: 'Gross delivered order value; not platform revenue.',
    };
  }

  if (plan.kind === 'comparison') {
    return {
      operation: plan.operation,
      entity: plan.entity,
      metric: 'count',
      current: {
        from: plan.currentPeriod.from,
        to: plan.currentPeriod.to,
        count: normalizeCount(aggregate.current_count),
      },
      previous: {
        from: plan.previousPeriod.from,
        to: plan.previousPeriod.to,
        count: normalizeCount(aggregate.previous_count),
      },
    };
  }

  return {
    operation: plan.operation,
    entity: 'orders',
    metric: 'gross_delivered_order_value',
    interpretation: 'Gross delivered order value; not platform revenue.',
    current: {
      from: plan.currentPeriod.from,
      to: plan.currentPeriod.to,
      value: normalizeMoney(aggregate.current_value),
      deliveredOrderCount: normalizeCount(aggregate.current_count),
    },
    previous: {
      from: plan.previousPeriod.from,
      to: plan.previousPeriod.to,
      value: normalizeMoney(aggregate.previous_value),
      deliveredOrderCount: normalizeCount(aggregate.previous_count),
    },
  };
}

function safeErrorCode(error) {
  const code = error?.code;
  return typeof code === 'string' || typeof code === 'number'
    ? String(code).replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 80) || null
    : null;
}

export function createAdminChatAnalyticsModel({
  database = pool,
  clock = () => new Date(),
  queryTimeoutMs = ADMIN_CHAT_QUERY_TIMEOUT_MS,
  logger = console,
} = {}) {
  assertQueryTimeout(queryTimeoutMs);

  return async function executeAdminChatAnalytics(rawIntent) {
    const intent = validateAdminChatIntent(rawIntent);
    if (!['analytics', 'follow_up'].includes(intent.intent)) {
      throw new AppError(400, 'Only validated analytics intents can be executed.');
    }

    const referenceDate = getReferenceDate(clock);
    const plan = buildQuery(intent, referenceDate);
    let client;
    let transactionOpen = false;

    try {
      client = await database.connect();
      await client.query('BEGIN READ ONLY');
      transactionOpen = true;
      await client.query(
        "SELECT set_config('statement_timeout', $1, true)",
        [`${queryTimeoutMs}ms`],
      );
      const result = await client.query(plan.text, plan.values);
      const aggregate = formatResult(
        plan,
        getAggregateRow(result, AGGREGATE_FIELDS[plan.kind]),
      );
      await client.query('COMMIT');
      transactionOpen = false;
      return aggregate;
    } catch (error) {
      if (client && transactionOpen) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          logger.error('Admin analytics rollback failed', {
            code: safeErrorCode(rollbackError),
          });
        }
      }
      logger.error('Admin analytics query failed', {
        operation: plan.operation,
        code: safeErrorCode(error),
      });
      throw new AppError(503, 'Unable to retrieve administrator analytics right now.');
    } finally {
      if (client) {
        client.release();
      }
    }
  };
}

export const executeAdminChatAnalyticsIntent = createAdminChatAnalyticsModel();
