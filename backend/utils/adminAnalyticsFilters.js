import { AppError } from './AppError.js';

const MAX_MONTHS = 36;
const MAX_LIMIT = 50;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parsePositiveInteger(value, fallback, label, maximum) {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new AppError(400, `${label} must be a positive integer.`);
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > maximum) {
    throw new AppError(400, `${label} must be between 1 and ${maximum}.`);
  }

  return parsed;
}

function parseDate(value, label) {
  if (value === undefined) {
    return null;
  }
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
    throw new AppError(400, `${label} must be a valid YYYY-MM-DD date.`);
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime())
    || parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new AppError(400, `${label} must be a valid YYYY-MM-DD date.`);
  }

  return value;
}

export function parseAnalyticsFilters(query = {}) {
  const months = parsePositiveInteger(query.months, 12, 'months', MAX_MONTHS);
  const fromDate = parseDate(query.fromDate, 'fromDate');
  const toDate = parseDate(query.toDate, 'toDate');

  if (Boolean(fromDate) !== Boolean(toDate)) {
    throw new AppError(400, 'fromDate and toDate must be provided together.');
  }
  if (fromDate && fromDate > toDate) {
    throw new AppError(400, 'fromDate must be on or before toDate.');
  }
  if (fromDate) {
    const from = new Date(`${fromDate}T00:00:00.000Z`);
    const to = new Date(`${toDate}T00:00:00.000Z`);
    const monthSpan = (
      (to.getUTCFullYear() - from.getUTCFullYear()) * 12
      + to.getUTCMonth()
      - from.getUTCMonth()
      + 1
    );
    if (monthSpan > MAX_MONTHS) {
      throw new AppError(400, `Date range cannot exceed ${MAX_MONTHS} months.`);
    }
  }

  return { months, fromDate, toDate };
}

export function parseAnalyticsLimit(query = {}) {
  return parsePositiveInteger(query.limit, 10, 'limit', MAX_LIMIT);
}
