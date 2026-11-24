import { AppError } from './AppError.js';

export const ADMIN_CHAT_OPERATIONS = Object.freeze([
  'count_users',
  'count_crops',
  'count_orders',
  'delivered_order_value',
  'compare_periods',
]);

const INTENTS = new Set([
  'analytics',
  'general',
  'follow_up',
  'clarification',
  'unsupported',
]);
const USER_ROLES = new Set(['farmer', 'buyer']);
const USER_STATUSES = new Set(['active', 'suspended']);
const CROP_STATUSES = new Set(['available', 'sold_out', 'inactive']);
const ORDER_STATUSES = new Set([
  'pending',
  'confirmed',
  'shipped',
  'delivered',
  'cancelled',
]);
const CROP_CATEGORIES = new Map([
  ['vegetables', 'Vegetables'],
  ['fruits', 'Fruits'],
  ['grains', 'Grains'],
  ['spices', 'Spices'],
]);
const ENTITIES = new Set(['users', 'crops', 'orders']);
const RELATIVE_DATE_RANGES = new Set([
  'today',
  'last_7_days',
  'last_30_days',
  'this_month',
  'last_month',
]);
const TOP_LEVEL_KEYS = [
  'intent',
  'operation',
  'filters',
  'clarificationQuestion',
];
const FILTER_KEYS = [
  'role',
  'status',
  'category',
  'orderStatus',
  'dateRange',
  'location',
  'comparison',
];
const FILTER_KEYS_WITH_ENTITY = ['entity', ...FILTER_KEYS];
const MAX_CONTEXT_BYTES = 8000;
export const MAX_ADMIN_CHAT_DATE_RANGE_MONTHS = 36;
const SQL_STATEMENT_PATTERN = /[;]|--|\/\*|\*\/|\b(?:select\s+.+\s+from|insert\s+into|update\s+\w+\s+set|delete\s+from|drop\s+(?:table|database)|truncate\s+table|alter\s+table|create\s+table|union\s+select|execute\s+)/i;

function invalid(status) {
  throw new AppError(status, 'Invalid administrator chatbot intent or context.');
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value, expectedKeys) {
  if (!isRecord(value)) {
    return false;
  }
  const keys = Object.keys(value);
  return keys.length === expectedKeys.length
    && keys.every((key) => expectedKeys.includes(key));
}

function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  if (value.startsWith('0000-')) {
    return false;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isWithinMaximumDateSpan(from, to) {
  const [fromYear, fromMonth] = from.split('-').map(Number);
  const [toYear, toMonth] = to.split('-').map(Number);
  return ((toYear - fromYear) * 12) + toMonth - fromMonth + 1
    <= MAX_ADMIN_CHAT_DATE_RANGE_MONTHS;
}

function normalizeDateRange(value, status) {
  if (value === null) {
    return null;
  }
  if (!isRecord(value) || typeof value.type !== 'string') {
    invalid(status);
  }

  if (value.type === 'relative') {
    if (
      !hasExactKeys(value, ['type', 'value'])
      || !RELATIVE_DATE_RANGES.has(value.value)
    ) {
      invalid(status);
    }
    return { type: 'relative', value: value.value };
  }

  if (value.type === 'custom') {
    if (
      !hasExactKeys(value, ['type', 'from', 'to'])
      || !isValidDate(value.from)
      || !isValidDate(value.to)
      || value.from > value.to
      || !isWithinMaximumDateSpan(value.from, value.to)
    ) {
      invalid(status);
    }
    return { type: 'custom', from: value.from, to: value.to };
  }

  invalid(status);
}

function normalizeComparisonPeriod(value, status) {
  if (isRecord(value) && hasExactKeys(value, ['from', 'to'])) {
    if (
      !isValidDate(value.from)
      || !isValidDate(value.to)
      || value.from > value.to
      || !isWithinMaximumDateSpan(value.from, value.to)
    ) {
      invalid(status);
    }
    return { type: 'custom', from: value.from, to: value.to };
  }
  return normalizeDateRange(value, status);
}

function normalizeComparison(value, status) {
  if (value === null) {
    return null;
  }
  if (!hasExactKeys(value, ['current', 'previous'])) {
    invalid(status);
  }

  const current = normalizeComparisonPeriod(value.current, status);
  const previous = normalizeComparisonPeriod(value.previous, status);
  const customPeriodsAreOrdered = current.type === 'custom'
    && previous.type === 'custom'
    && previous.to < current.from;
  const relativeMonthPeriodsAreOrdered = current.type === 'relative'
    && previous.type === 'relative'
    && current.value === 'this_month'
    && previous.value === 'last_month';
  if (!customPeriodsAreOrdered && !relativeMonthPeriodsAreOrdered) {
    invalid(status);
  }

  return { current, previous };
}

function normalizeLocation(value, status) {
  if (value === null) {
    return null;
  }
  if (!hasExactKeys(value, ['state', 'district'])) {
    invalid(status);
  }

  const location = {};
  for (const key of ['state', 'district']) {
    const part = value[key];
    if (part !== null && (
      typeof part !== 'string'
      || !part.trim()
      || part.trim().length > 80
      || /[\u0000-\u001f\u007f]/.test(part)
      || SQL_STATEMENT_PATTERN.test(part)
    )) {
      invalid(status);
    }
    location[key] = part === null ? null : part.trim();
  }

  if (location.state === null && location.district === null) {
    invalid(status);
  }
  return location;
}

function normalizeNullableEnum(value, allowed, status) {
  if (value === null) {
    return null;
  }
  if (typeof value !== 'string' || !allowed.has(value)) {
    invalid(status);
  }
  return value;
}

function getOperationEntity(operation) {
  if (operation === 'count_users') return 'users';
  if (operation === 'count_crops') return 'crops';
  if (operation === 'count_orders' || operation === 'delivered_order_value') return 'orders';
  return null;
}

function validateFilterCompatibility(operation, filters, status) {
  const expectedEntity = getOperationEntity(operation);
  const entity = expectedEntity || filters.entity;
  if (!ENTITIES.has(entity) || (expectedEntity && filters.entity !== null && filters.entity !== expectedEntity)) {
    invalid(status);
  }

  if (entity === 'users') {
    if (filters.status !== null && !USER_STATUSES.has(filters.status)) invalid(status);
    if (filters.category !== null || filters.orderStatus !== null) invalid(status);
  } else if (entity === 'crops') {
    if (filters.status !== null && !CROP_STATUSES.has(filters.status)) invalid(status);
    if (filters.category !== null && !CROP_CATEGORIES.has(filters.category.toLowerCase())) invalid(status);
    if (filters.role !== null || filters.orderStatus !== null) invalid(status);
  } else if (entity === 'orders') {
    if (filters.orderStatus !== null && !ORDER_STATUSES.has(filters.orderStatus)) invalid(status);
    if (filters.role !== null || filters.status !== null || filters.category !== null) invalid(status);
  }

  if (operation === 'compare_periods') {
    if (filters.comparison === null || filters.dateRange !== null) invalid(status);
  } else if (operation === 'delivered_order_value') {
    if (
      filters.orderStatus !== null
      && filters.orderStatus !== 'delivered'
    ) {
      invalid(status);
    }
    if (filters.dateRange !== null && filters.comparison !== null) invalid(status);
  } else if (filters.comparison !== null) {
    invalid(status);
  }

  return entity;
}

function normalizeFilters(value, operation, status) {
  if (
    !isRecord(value)
    || !FILTER_KEYS.every((key) => Object.hasOwn(value, key))
    || !Object.keys(value).every((key) => FILTER_KEYS_WITH_ENTITY.includes(key))
  ) {
    invalid(status);
  }

  const filters = {
    entity: value.entity ?? null,
    role: normalizeNullableEnum(value.role, USER_ROLES, status),
    status: value.status,
    category: value.category,
    orderStatus: normalizeNullableEnum(value.orderStatus, ORDER_STATUSES, status),
    dateRange: normalizeDateRange(value.dateRange, status),
    location: normalizeLocation(value.location, status),
    comparison: normalizeComparison(value.comparison, status),
  };

  if (filters.entity !== null && !ENTITIES.has(filters.entity)) {
    invalid(status);
  }
  if (filters.category !== null) {
    if (typeof filters.category !== 'string') invalid(status);
    filters.category = CROP_CATEGORIES.get(filters.category.toLowerCase()) || null;
    if (filters.category === null) invalid(status);
  }
  if (filters.status !== null && typeof filters.status !== 'string') {
    invalid(status);
  }

  const entity = validateFilterCompatibility(operation, filters, status);
  filters.entity = entity;
  return filters;
}

function validateIntent(value, status) {
  if (!hasExactKeys(value, TOP_LEVEL_KEYS) || !INTENTS.has(value.intent)) {
    invalid(status);
  }

  if (value.intent === 'analytics' || value.intent === 'follow_up') {
    if (
      !ADMIN_CHAT_OPERATIONS.includes(value.operation)
      || typeof value.clarificationQuestion !== 'object'
      || value.clarificationQuestion !== null
    ) {
      invalid(status);
    }
    return {
      intent: value.intent,
      operation: value.operation,
      filters: normalizeFilters(value.filters, value.operation, status),
      clarificationQuestion: null,
    };
  }

  if (value.operation !== null || value.filters !== null) {
    invalid(status);
  }
  if (value.intent === 'clarification') {
    if (
      typeof value.clarificationQuestion !== 'string'
      || !value.clarificationQuestion.trim()
      || value.clarificationQuestion.trim().length > 300
      || SQL_STATEMENT_PATTERN.test(value.clarificationQuestion)
    ) {
      invalid(status);
    }
    return {
      intent: value.intent,
      operation: null,
      filters: null,
      clarificationQuestion: value.clarificationQuestion.trim(),
    };
  }
  if (value.clarificationQuestion !== null) {
    invalid(status);
  }
  return {
    intent: value.intent,
    operation: null,
    filters: null,
    clarificationQuestion: null,
  };
}

export function validateAdminChatIntent(value, { status = 400 } = {}) {
  return validateIntent(value, status);
}

export function validateAdminChatContext(value) {
  if (
    !hasExactKeys(value, ['version', 'lastOperation', 'filters'])
    || value.version !== 1
    || !ADMIN_CHAT_OPERATIONS.includes(value.lastOperation)
  ) {
    invalid(400);
  }

  const validatedIntent = validateIntent({
    intent: 'analytics',
    operation: value.lastOperation,
    filters: value.filters,
    clarificationQuestion: null,
  }, 400);
  const context = {
    version: 1,
    lastOperation: validatedIntent.operation,
    filters: validatedIntent.filters,
  };
  if (Buffer.byteLength(JSON.stringify(context), 'utf8') > MAX_CONTEXT_BYTES) {
    invalid(400);
  }
  return context;
}

export function createAdminChatContext(intent) {
  const validatedIntent = validateAdminChatIntent(intent);
  if (!['analytics', 'follow_up'].includes(validatedIntent.intent)) {
    return null;
  }
  return validateAdminChatContext({
    version: 1,
    lastOperation: validatedIntent.operation,
    filters: validatedIntent.filters,
  });
}

export function mergeAdminChatFollowUp(intent, previousContext) {
  const next = validateAdminChatIntent(intent);
  if (next.intent !== 'follow_up') {
    return next;
  }
  if (!previousContext) {
    return {
      intent: 'clarification',
      operation: null,
      filters: null,
      clarificationQuestion: 'Which earlier result should I use as context?',
    };
  }

  const previous = validateAdminChatContext(previousContext);
  const previousFilters = previous.filters;
  const nextFilters = next.filters;
  const sameEntity = previousFilters.entity === nextFilters.entity;
  const merged = { ...nextFilters };

  for (const key of ['dateRange', 'location']) {
    if (nextFilters[key] === null) {
      merged[key] = previousFilters[key];
    }
  }
  if (nextFilters.comparison === null) {
    merged.comparison = previousFilters.comparison;
  }
  if (nextFilters.dateRange !== null) {
    merged.comparison = null;
  } else if (nextFilters.comparison !== null) {
    merged.dateRange = null;
  }
  if (sameEntity) {
    for (const key of ['role', 'status', 'category', 'orderStatus']) {
      if (nextFilters[key] === null) {
        merged[key] = previousFilters[key];
      }
    }
  }

  const compatibleComparison = (
    next.operation === 'compare_periods'
    || next.operation === 'delivered_order_value'
  );
  if (!compatibleComparison) {
    merged.comparison = null;
  }
  if (next.operation === 'compare_periods') {
    merged.dateRange = null;
  }
  if (next.operation === 'delivered_order_value' && merged.orderStatus !== 'delivered') {
    merged.orderStatus = null;
  }
  if (next.operation !== 'delivered_order_value' && next.operation !== 'compare_periods') {
    merged.comparison = null;
  }
  if (next.operation === 'compare_periods' && merged.comparison === null) {
    return {
      intent: 'clarification',
      operation: null,
      filters: null,
      clarificationQuestion: 'Which two date ranges should I compare?',
    };
  }

  return validateAdminChatIntent({
    ...next,
    filters: merged,
  });
}
