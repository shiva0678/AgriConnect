import { AppError } from './AppError.js';

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDate(value, parameterName) {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new AppError(400, `${parameterName} must use YYYY-MM-DD format.`);
  }

  const match = DATE_PATTERN.exec(value);
  if (!match) {
    throw new AppError(400, `${parameterName} must use YYYY-MM-DD format.`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysPerMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  if (year === 0 || month < 1 || month > 12 || day < 1 || day > daysPerMonth[month - 1]) {
    throw new AppError(400, `${parameterName} must be a valid calendar date.`);
  }

  return value;
}

function parseTextFilter(value, parameterName) {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new AppError(400, `${parameterName} must be a single text value.`);
  }

  return value.trim();
}

export function parsePriceHistoryFilters(query) {
  const fromDate = parseDate(query.fromDate, 'fromDate');
  const toDate = parseDate(query.toDate, 'toDate');

  if (fromDate && toDate && fromDate > toDate) {
    throw new AppError(400, 'fromDate must be on or before toDate.');
  }

  return {
    commodity: parseTextFilter(query.commodity, 'commodity'),
    state: parseTextFilter(query.state, 'state'),
    district: parseTextFilter(query.district, 'district'),
    market: parseTextFilter(query.market, 'market'),
    search: parseTextFilter(query.search, 'search'),
    fromDate,
    toDate,
  };
}
