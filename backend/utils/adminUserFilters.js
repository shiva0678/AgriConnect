import { AppError } from './AppError.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CURSOR_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/;
const MAX_SEARCH_LENGTH = 100;
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;
const DEFAULT_ACTIVITY_LIMIT = 20;
const MAX_ACTIVITY_LIMIT = 50;

export function parseAdminUserId(value) {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new AppError(400, 'A valid user ID is required.');
  }
  return value;
}

export function parseAdminUserListFilters(query = {}) {
  if (typeof query !== 'object' || query === null || Array.isArray(query)) {
    throw new AppError(400, 'Invalid user filters.');
  }

  const unexpected = Object.keys(query).filter((key) =>
    !['q', 'role', 'status', 'before', 'beforeId', 'limit'].includes(key),
  );
  if (unexpected.length) {
    throw new AppError(400, 'User filters contain unsupported parameters.');
  }

  let search = null;
  if (query.q !== undefined) {
    if (typeof query.q !== 'string' || query.q.trim().length > MAX_SEARCH_LENGTH) {
      throw new AppError(400, `q must contain at most ${MAX_SEARCH_LENGTH} characters.`);
    }
    const normalizedSearch = query.q.trim();
    search = normalizedSearch || null;
  }

  let role = null;
  if (query.role !== undefined) {
    if (typeof query.role !== 'string' || !['farmer', 'buyer'].includes(query.role)) {
      throw new AppError(400, 'role must be either farmer or buyer.');
    }
    role = query.role;
  }

  let status = null;
  if (query.status !== undefined) {
    if (typeof query.status !== 'string' || !['active', 'suspended'].includes(query.status)) {
      throw new AppError(400, 'status must be either active or suspended.');
    }
    status = query.status;
  }

  let limit = DEFAULT_LIMIT;
  if (query.limit !== undefined) {
    if (
      typeof query.limit !== 'string'
      || !/^\d{1,3}$/.test(query.limit)
    ) {
      throw new AppError(400, 'limit must be an integer from 1 to 100.');
    }
    limit = Number(query.limit);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      throw new AppError(400, 'limit must be an integer from 1 to 100.');
    }
  }

  let cursor = null;
  if (query.before !== undefined || query.beforeId !== undefined) {
    if (
      typeof query.before !== 'string'
      || !CURSOR_TIMESTAMP_PATTERN.test(query.before)
      || Number.isNaN(Date.parse(query.before))
      || typeof query.beforeId !== 'string'
      || !UUID_PATTERN.test(query.beforeId)
    ) {
      throw new AppError(400, 'A valid pagination cursor is required.');
    }
    cursor = { before: query.before, beforeId: query.beforeId };
  }

  return { search, role, status, limit, cursor };
}

export function parseAdminUserActivityLimit(query = {}) {
  if (typeof query !== 'object' || query === null || Array.isArray(query)) {
    throw new AppError(400, 'Invalid activity filters.');
  }
  const unexpected = Object.keys(query).filter((key) => key !== 'limit');
  if (unexpected.length) {
    throw new AppError(400, 'Activity filters contain unsupported parameters.');
  }
  if (query.limit === undefined) {
    return DEFAULT_ACTIVITY_LIMIT;
  }
  if (typeof query.limit !== 'string' || !/^\d{1,3}$/.test(query.limit)) {
    throw new AppError(400, 'limit must be an integer from 1 to 50.');
  }
  const limit = Number(query.limit);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_ACTIVITY_LIMIT) {
    throw new AppError(400, 'limit must be an integer from 1 to 50.');
  }
  return limit;
}

export function parseAdminUserActionReason(body = {}) {
  if (
    typeof body !== 'object'
    || body === null
    || Array.isArray(body)
    || typeof body.reason !== 'string'
  ) {
    throw new AppError(400, 'A suspension reason is required.');
  }
  const reason = body.reason.trim();
  const reasonLength = Array.from(reason).length;
  if (reasonLength < 3 || reasonLength > 500) {
    throw new AppError(400, 'The suspension reason must contain 3 to 500 characters.');
  }
  return reason;
}
