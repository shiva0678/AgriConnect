import { AppError } from '../utils/AppError.js';
import { findPriceHistory } from '../models/priceHistoryModel.js';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const ALLOWED_SORTS = new Set(['newest', 'oldest', 'price_asc', 'price_desc']);
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function parsePositiveInteger(value, fallback, parameterName) {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new AppError(400, `${parameterName} must be a positive integer.`);
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new AppError(400, `${parameterName} must be a positive integer.`);
  }

  return parsed;
}

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

export async function getPriceHistoryController(request, response, next) {
  try {
    const page = parsePositiveInteger(request.query.page, DEFAULT_PAGE, 'page');
    const limit = parsePositiveInteger(request.query.limit, DEFAULT_LIMIT, 'limit');
    if (limit > MAX_LIMIT) {
      throw new AppError(400, `limit cannot exceed ${MAX_LIMIT}.`);
    }

    const rawSort = request.query.sort === undefined
      ? 'newest'
      : typeof request.query.sort === 'string'
        ? request.query.sort.trim().toLowerCase()
        : '';
    if (!ALLOWED_SORTS.has(rawSort)) {
      throw new AppError(400, 'sort must be one of: newest, oldest, price_asc, price_desc.');
    }

    const fromDate = parseDate(request.query.fromDate, 'fromDate');
    const toDate = parseDate(request.query.toDate, 'toDate');
    if (fromDate && toDate && fromDate > toDate) {
      throw new AppError(400, 'fromDate must be on or before toDate.');
    }

    const filters = {
      commodity: parseTextFilter(request.query.commodity, 'commodity'),
      state: parseTextFilter(request.query.state, 'state'),
      district: parseTextFilter(request.query.district, 'district'),
      market: parseTextFilter(request.query.market, 'market'),
      search: parseTextFilter(request.query.search, 'search'),
      fromDate,
      toDate,
      page,
      limit,
      sort: rawSort,
      includeTotal: true,
    };

    const { prices, total } = await findPriceHistory(filters);
    response.status(200).json({
      success: true,
      prices: prices.map((price) => ({
        ...price,
        min_price: price.min_price === null ? null : Number(price.min_price),
        max_price: price.max_price === null ? null : Number(price.max_price),
        modal_price: price.modal_price === null ? null : Number(price.modal_price),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      },
    });
  } catch (error) {
    if (error instanceof AppError) {
      return next(error);
    }

    next(new AppError(500, 'Unable to retrieve price history.'));
  }
}