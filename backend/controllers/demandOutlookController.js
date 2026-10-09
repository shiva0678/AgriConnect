import { AppError } from '../utils/AppError.js';
import { parsePriceHistoryFilters } from '../utils/priceHistoryFilters.js';
import { getDemandOutlookData } from '../models/demandOutlookModel.js';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
const SCORE_HIGH_THRESHOLD = 66.67;
const SCORE_MEDIUM_THRESHOLD = 33.33;

function parseLimit(value) {
  if (value === undefined) {
    return DEFAULT_LIMIT;
  }

  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new AppError(400, 'limit must be a positive integer.');
  }

  const limit = Number(value);
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw new AppError(400, 'limit must be a positive integer.');
  }
  if (limit > MAX_LIMIT) {
    throw new AppError(400, `limit cannot exceed ${MAX_LIMIT}.`);
  }

  return limit;
}

function roundToTwo(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function getMarketOpportunityScore(marketCount, maximumMarketCount) {
  if (maximumMarketCount <= 0 || marketCount <= 0) {
    return 0;
  }

  return roundToTwo((marketCount / maximumMarketCount) * 100);
}

export function classifyMarketOpportunity(score) {
  if (score >= SCORE_HIGH_THRESHOLD) {
    return 'HIGH';
  }
  if (score >= SCORE_MEDIUM_THRESHOLD) {
    return 'MEDIUM';
  }
  return 'LOW';
}

export function calculatePriceChangePercent(currentAverage, previousAverage) {
  if (currentAverage === null || previousAverage === null || previousAverage === 0) {
    return null;
  }

  return roundToTwo(((currentAverage - previousAverage) / previousAverage) * 100);
}

export function classifyPriceDirection(priceChangePercent) {
  if (priceChangePercent === null) {
    return null;
  }
  if (priceChangePercent > 0) {
    return 'RISING';
  }
  if (priceChangePercent < 0) {
    return 'FALLING';
  }
  return 'STABLE';
}

export function getPriceTrendStatus(currentAverage, previousAverage) {
  if (currentAverage === null || previousAverage === null) {
    return 'INSUFFICIENT_HISTORY';
  }
  if (previousAverage === 0) {
    return 'UNDEFINED_BASELINE';
  }
  return 'AVAILABLE';
}

function numberOrNull(value) {
  return value === null || value === undefined ? null : Number(value);
}

function forecastPeriod(dataAsOf) {
  if (!dataAsOf) {
    return null;
  }

  const from = new Date(`${dataAsOf}T00:00:00.000Z`);
  from.setUTCDate(from.getUTCDate() + 1);
  const to = new Date(from);
  to.setUTCDate(to.getUTCDate() + 29);

  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

export async function getDemandOutlookController(request, response, next) {
  try {
    const filters = parsePriceHistoryFilters(request.query);
    const limit = parseLimit(request.query.limit);
    const data = await getDemandOutlookData(filters);
    const maximumMarketCount = data.rows.reduce(
      (maximum, row) => Math.max(maximum, Number(row.market_count)),
      0
    );
    const outlook = data.rows
      .map((row) => {
        const currentAverageModalPrice = numberOrNull(row.current_average_modal_price);
        const previousAverageModalPrice = numberOrNull(row.previous_average_modal_price);
        const priceChangePercent = calculatePriceChangePercent(
          currentAverageModalPrice,
          previousAverageModalPrice
        );
        const marketCount = Number(row.market_count);
        const score = getMarketOpportunityScore(marketCount, maximumMarketCount);

        return {
          commodity: row.commodity,
          score,
          outlook: classifyMarketOpportunity(score),
          direction: classifyPriceDirection(priceChangePercent),
          trendStatus: getPriceTrendStatus(
            currentAverageModalPrice,
            previousAverageModalPrice
          ),
          currentAverageModalPrice,
          previousAverageModalPrice,
          priceChangePercent,
          marketCount,
          observationCount: Number(row.observation_count),
        };
      })
      .sort((left, right) => (
        right.score - left.score
        || right.marketCount - left.marketCount
        || right.observationCount - left.observationCount
        || left.commodity.localeCompare(right.commodity)
      ))
      .slice(0, limit)
      .map((item, index) => ({ rank: index + 1, ...item }));

    response.status(200).json({
      success: true,
      dataAsOf: data.dataAsOf,
      forecastPeriod: forecastPeriod(data.dataAsOf),
      comparisonPeriod: data.comparisonPeriod,
      methodology: 'Market Opportunity Score is relative market coverage: a commodity’s distinct-market count divided by the highest such count in the matching results, expressed from 0 to 100. Observation counts are descriptive, not demand quantities. Price direction is only reported when both 30-day comparison windows contain modal-price observations.',
      outlook,
    });
  } catch (error) {
    if (error instanceof AppError) {
      return next(error);
    }

    next(new AppError(500, 'Unable to retrieve the market demand outlook.'));
  }
}
