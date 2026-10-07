import { AppError } from '../utils/AppError.js';
import { parsePriceHistoryFilters } from '../utils/priceHistoryFilters.js';
import { findPriceHistory } from '../models/priceHistoryModel.js';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const ALLOWED_SORTS = new Set(['newest', 'oldest', 'price_asc', 'price_desc']);

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

    const priceFilters = parsePriceHistoryFilters(request.query);
    const filters = {
      ...priceFilters,
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