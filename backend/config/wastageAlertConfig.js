function positiveInteger(value, fallback, maximum) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= maximum
    ? parsed
    : fallback;
}

function positiveQuantity(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getWastageAlertConfig(env = process.env) {
  return {
    expirySoonDays: positiveInteger(env.WASTAGE_EXPIRY_SOON_DAYS, 3, 365),
    harvestApproachingDays: positiveInteger(env.WASTAGE_HARVEST_APPROACHING_DAYS, 7, 365),
    recentOrderWindowDays: positiveInteger(env.WASTAGE_RECENT_ORDER_DAYS, 14, 365),
    significantStockMinimum: positiveQuantity(env.WASTAGE_SIGNIFICANT_STOCK_MINIMUM, 100),
  };
}
