import { getFairPriceDenominationConfig, getSupportedWeightUnit } from '../config/fairPriceConfig.js';
import { getFairPriceHistoryReference } from '../models/fairPriceModel.js';
import { AppError } from '../utils/AppError.js';

const MAX_COMMODITY_LENGTH = 120;
const MAX_UNIT_LENGTH = 20;
const MAX_LOCATION_LENGTH = 160;
const MAX_PRICE = 9_999_999_999.99;

function parseAskingPrice(value) {
  if (
    (typeof value !== 'number' && typeof value !== 'string')
    || (typeof value === 'string' && !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim()))
  ) {
    throw new AppError(400, 'askingPrice must be a non-negative number.');
  }

  const askingPrice = Number(value);
  if (!Number.isFinite(askingPrice) || askingPrice < 0 || askingPrice > MAX_PRICE) {
    throw new AppError(400, 'askingPrice must be a non-negative number within the supported range.');
  }

  return askingPrice;
}

export function validateFairPriceInput(payload = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new AppError(400, 'A comparison request object is required.');
  }

  const commodity = typeof payload.commodity === 'string'
    ? payload.commodity.trim()
    : '';
  const unit = typeof payload.unit === 'string' ? payload.unit.trim() : '';
  const location = typeof payload.location === 'string' ? payload.location.trim() : '';

  if (!commodity || commodity.length > MAX_COMMODITY_LENGTH) {
    throw new AppError(400, `commodity is required and cannot exceed ${MAX_COMMODITY_LENGTH} characters.`);
  }
  if (!unit || unit.length > MAX_UNIT_LENGTH) {
    throw new AppError(400, `unit is required and cannot exceed ${MAX_UNIT_LENGTH} characters.`);
  }
  if (!location || location.length > MAX_LOCATION_LENGTH) {
    throw new AppError(400, `location is required and cannot exceed ${MAX_LOCATION_LENGTH} characters.`);
  }

  return {
    commodity,
    askingPrice: parseAskingPrice(payload.askingPrice),
    unit,
    location,
  };
}

function responseBase(input, history) {
  return {
    success: true,
    available: false,
    status: 'COMPARISON_UNAVAILABLE',
    reason: null,
    message: null,
    dataAsOf: history.observationEndDate,
    askingPrice: {
      amount: input.askingPrice,
      unit: input.unit,
    },
    reference: null,
    supportingData: {
      commodity: input.commodity,
      observationCount: history.observationCount,
      relevantMarkets: history.relevantMarkets,
      relevantMarketCount: history.relevantMarketCount,
      observationStartDate: history.observationStartDate,
      observationEndDate: history.observationEndDate,
      locationMatched: history.locationMatched,
    },
  };
}

function unavailable(input, history, reason, message) {
  return {
    ...responseBase(input, history),
    reason,
    message,
  };
}

export function createFairPriceService({
  getHistoryReference = getFairPriceHistoryReference,
  getDenominationConfig = getFairPriceDenominationConfig,
} = {}) {
  return async function evaluateFairPrice(payload) {
    const input = validateFairPriceInput(payload);
    const history = await getHistoryReference({
      commodity: input.commodity,
      location: input.location,
    });

    if (history.observationCount === 0) {
      return unavailable(
        input,
        history,
        'NO_MATCHING_RECORDS',
        `No historical modal-price records were found for ${input.commodity}.`,
      );
    }

    const denomination = getDenominationConfig();
    if (denomination.status === 'unverified') {
      return unavailable(
        input,
        history,
        'DENOMINATION_UNVERIFIED',
        'Fair price comparison is unavailable because the historical price currency and measurement unit have not been verified.',
      );
    }
    if (denomination.status !== 'compatible') {
      return unavailable(
        input,
        history,
        'INCOMPATIBLE_DENOMINATION',
        'Fair price comparison is unavailable because historical and listing price denominations are incompatible or unsupported.',
      );
    }

    const listingUnit = getSupportedWeightUnit(input.unit);
    if (!listingUnit) {
      return unavailable(
        input,
        history,
        'INCOMPATIBLE_DENOMINATION',
        'Fair price comparison is unavailable because this listing measurement unit is not supported for verified conversion.',
      );
    }

    const askingPriceInHistoryUnit = input.askingPrice
      * denomination.historyUnitKilograms
      / listingUnit.kilograms;
    const minimumModalPrice = Number(history.minimumModalPrice);
    const maximumModalPrice = Number(history.maximumModalPrice);
    const averageModalPrice = Number(history.averageModalPrice);
    let status;
    let message;

    // The observed minimum-to-maximum band is the reference range; no extra threshold is invented.
    if (askingPriceInHistoryUnit < minimumModalPrice) {
      status = 'BELOW_REFERENCE';
      message = 'Your asking price is below the historical reference range. You may want to review it.';
    } else if (askingPriceInHistoryUnit > maximumModalPrice) {
      status = 'ABOVE_REFERENCE';
      message = 'Your asking price is above the historical reference range.';
    } else {
      status = 'FAIR_RANGE';
      message = 'Your price is within the historical reference range.';
    }

    return {
      ...responseBase(input, history),
      available: true,
      status,
      message,
      askingPrice: {
        amount: input.askingPrice,
        unit: input.unit,
        currency: denomination.currency,
      },
      reference: {
        currency: denomination.currency,
        unit: denomination.historyUnit,
        averageModalPrice,
        minimumModalPrice,
        maximumModalPrice,
      },
    };
  };
}

export const evaluateFairPrice = createFairPriceService();
