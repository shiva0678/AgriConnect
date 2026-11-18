const WEIGHT_UNITS_IN_KILOGRAMS = new Map([
  ['kg', 1],
  ['kilogram', 1],
  ['kilograms', 1],
  ['q', 100],
  ['quintal', 100],
  ['quintals', 100],
]);

const VERIFIED_HISTORY_DENOMINATION = Object.freeze({
  currency: 'INR',
  unit: 'quintal',
  unitKilograms: 100,
});
const CROP_LISTING_CURRENCY = 'INR';

function normalizeWeightUnit(value) {
  const unit = typeof value === 'string'
    ? value.trim().toLocaleLowerCase().replace(/\s+/g, ' ')
    : '';
  return WEIGHT_UNITS_IN_KILOGRAMS.has(unit) ? unit : null;
}

export function getFairPriceDenominationConfig() {
  if (VERIFIED_HISTORY_DENOMINATION.currency !== CROP_LISTING_CURRENCY) {
    return { status: 'incompatible' };
  }

  return {
    status: 'compatible',
    currency: VERIFIED_HISTORY_DENOMINATION.currency,
    historyUnit: VERIFIED_HISTORY_DENOMINATION.unit,
    historyUnitKilograms: VERIFIED_HISTORY_DENOMINATION.unitKilograms,
  };
}

export function getSupportedWeightUnit(unit) {
  const normalizedUnit = normalizeWeightUnit(unit);
  if (!normalizedUnit) return null;

  return {
    unit: WEIGHT_UNITS_IN_KILOGRAMS.get(normalizedUnit) === 1 ? 'kg' : 'quintal',
    kilograms: WEIGHT_UNITS_IN_KILOGRAMS.get(normalizedUnit),
  };
}
