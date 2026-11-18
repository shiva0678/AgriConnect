import { getWastageAlertConfig } from '../config/wastageAlertConfig.js';
import { getFarmerCropsForWastageAlerts } from '../models/wastageAlertModel.js';

function parseDateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

function daysBetween(fromDate, toDate) {
  return Math.round((toDate.getTime() - fromDate.getTime()) / 86_400_000);
}

function recommendationFor(type, daysUntil) {
  if (type === 'ALREADY_EXPIRED') {
    return 'Review the crop condition and listing promptly. Remove or update the listing if the stock is no longer suitable for sale.';
  }
  if (type === 'EXPIRING_SOON') {
    return 'Prioritize this stock and consider contacting interested buyers or arranging timely distribution. Check the crop condition before sale.';
  }
  if (type === 'HARVEST_APPROACHING') {
    return daysUntil === 0
      ? 'Harvest is due today. Review readiness and prepare storage and distribution plans appropriate to this crop.'
      : 'Review harvest readiness and plan storage and distribution for the expected harvest date.';
  }
  return 'Review this listing and consider sharing its availability with potential buyers. No recent non-cancelled order was recorded within the configured window.';
}

function createAlert(crop, type, severity, relevantDate, daysUntil) {
  return {
    id: `${crop.crop_id}:${type}`,
    cropId: crop.crop_id,
    cropName: crop.crop_name,
    remainingQuantity: Number(crop.remaining_quantity),
    unit: crop.unit,
    expiryDate: crop.expiry_date || null,
    harvestDate: crop.harvest_date || null,
    type,
    severity,
    relevantDate,
    daysUntil: Number.isInteger(daysUntil) ? daysUntil : null,
    recommendation: recommendationFor(type, daysUntil),
  };
}

const SEVERITY_ORDER = { HIGH: 0, MEDIUM: 1, LOW: 2 };

export function buildWastageAlerts(crops, {
  now = new Date(),
  expirySoonDays = 3,
  harvestApproachingDays = 7,
  significantStockMinimum = 100,
} = {}) {
  const today = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  ));
  const alerts = [];

  for (const crop of crops) {
    const remainingQuantity = Number(crop.remaining_quantity);
    if (crop.status !== 'available' || !Number.isFinite(remainingQuantity) || remainingQuantity <= 0) {
      continue;
    }

    const expiryDate = parseDateOnly(crop.expiry_date);
    if (expiryDate) {
      const daysUntilExpiry = daysBetween(today, expiryDate);
      if (daysUntilExpiry < 0) {
        alerts.push(createAlert(crop, 'ALREADY_EXPIRED', 'HIGH', crop.expiry_date, daysUntilExpiry));
      } else if (daysUntilExpiry <= expirySoonDays) {
        alerts.push(createAlert(
          crop,
          'EXPIRING_SOON',
          daysUntilExpiry <= 1 ? 'HIGH' : 'MEDIUM',
          crop.expiry_date,
          daysUntilExpiry,
        ));
      }
    }

    const harvestDate = parseDateOnly(crop.harvest_date);
    if (harvestDate) {
      const daysUntilHarvest = daysBetween(today, harvestDate);
      if (daysUntilHarvest >= 0 && daysUntilHarvest <= harvestApproachingDays) {
        alerts.push(createAlert(
          crop,
          'HARVEST_APPROACHING',
          daysUntilHarvest <= 1 ? 'HIGH' : 'MEDIUM',
          crop.harvest_date,
          daysUntilHarvest,
        ));
      }
    }

    if (
      remainingQuantity >= significantStockMinimum
      && Number(crop.recent_order_count) === 0
    ) {
      alerts.push(createAlert(crop, 'UNSOLD_STOCK', 'MEDIUM', null, null));
    }
  }

  const uniqueAlerts = [...new Map(alerts.map((alert) => [alert.id, alert])).values()];
  return uniqueAlerts.sort((left, right) => (
    SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity]
    || (left.daysUntil ?? Number.MAX_SAFE_INTEGER) - (right.daysUntil ?? Number.MAX_SAFE_INTEGER)
    || left.cropName.localeCompare(right.cropName)
    || left.type.localeCompare(right.type)
  ));
}

function countDistinctCrops(alerts, type) {
  return new Set(
    alerts.filter((alert) => alert.type === type).map((alert) => alert.cropId),
  ).size;
}

export function createWastageAlertService({
  getCrops = getFarmerCropsForWastageAlerts,
  getConfig = getWastageAlertConfig,
  now = () => new Date(),
} = {}) {
  return async function getWastageAlerts(farmerId) {
    const config = getConfig();
    const crops = await getCrops(farmerId, config.recentOrderWindowDays);
    const generatedAt = now();
    const alerts = buildWastageAlerts(crops, { ...config, now: generatedAt });

    return {
      success: true,
      generatedAt: generatedAt.toISOString(),
      alerts,
      summary: {
        activeAlerts: alerts.length,
        highPriorityAlerts: alerts.filter((alert) => alert.severity === 'HIGH').length,
        expiringSoonCrops: countDistinctCrops(alerts, 'EXPIRING_SOON'),
        expiredCrops: countDistinctCrops(alerts, 'ALREADY_EXPIRED'),
        harvestApproachingCrops: countDistinctCrops(alerts, 'HARVEST_APPROACHING'),
        unsoldStockCrops: countDistinctCrops(alerts, 'UNSOLD_STOCK'),
      },
      thresholds: {
        expirySoonDays: config.expirySoonDays,
        harvestApproachingDays: config.harvestApproachingDays,
        recentOrderWindowDays: config.recentOrderWindowDays,
        significantStockMinimum: config.significantStockMinimum,
      },
    };
  };
}

export const getWastageAlerts = createWastageAlertService();
