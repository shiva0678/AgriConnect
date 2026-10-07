import { AppError } from '../utils/AppError.js';
import { parsePriceHistoryFilters } from '../utils/priceHistoryFilters.js';
import { getPriceAnalytics } from '../models/priceAnalyticsModel.js';

function numberOrNull(value) {
  return value === null || value === undefined ? null : Number(value);
}

function normalizePriceBreakdown(rows, key) {
  return rows.map((row) => ({
    [key]: row[key],
    averageModalPrice: numberOrNull(row.average_modal_price),
    minimumModalPrice: numberOrNull(row.minimum_modal_price),
    maximumModalPrice: numberOrNull(row.maximum_modal_price),
    recordCount: Number(row.record_count),
  }));
}

export async function getPriceAnalyticsController(request, response, next) {
  try {
    const filters = parsePriceHistoryFilters(request.query);
    const analytics = await getPriceAnalytics(filters);
    const summary = analytics.summary;

    response.status(200).json({
      success: true,
      filters: {
        commodity: filters.commodity || null,
        state: filters.state || null,
        district: filters.district || null,
        market: filters.market || null,
        search: filters.search || null,
        fromDate: filters.fromDate || null,
        toDate: filters.toDate || null,
      },
      summary: {
        totalRecords: Number(summary.total_records),
        averageMinPrice: numberOrNull(summary.average_min_price),
        averageMaxPrice: numberOrNull(summary.average_max_price),
        averageModalPrice: numberOrNull(summary.average_modal_price),
        minimumPrice: numberOrNull(summary.minimum_price),
        maximumPrice: numberOrNull(summary.maximum_price),
      },
      trend: analytics.trend.map((row) => ({
        date: row.date,
        avgMinPrice: numberOrNull(row.average_min_price),
        avgMaxPrice: numberOrNull(row.average_max_price),
        avgModalPrice: numberOrNull(row.average_modal_price),
        minModalPrice: numberOrNull(row.minimum_modal_price),
        maxModalPrice: numberOrNull(row.maximum_modal_price),
        recordCount: Number(row.record_count),
      })),
      marketBreakdown: normalizePriceBreakdown(analytics.marketBreakdown, 'market'),
      stateBreakdown: normalizePriceBreakdown(analytics.stateBreakdown, 'state'),
      commodityBreakdown: normalizePriceBreakdown(analytics.commodityBreakdown, 'commodity'),
    });
  } catch (error) {
    if (error instanceof AppError) {
      return next(error);
    }

    next(new AppError(500, 'Unable to retrieve price analytics.'));
  }
}