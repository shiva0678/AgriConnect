import { AppError } from '../utils/AppError.js';
import {
  parseAnalyticsFilters,
  parseAnalyticsLimit,
} from '../utils/adminAnalyticsFilters.js';
import * as adminAnalyticsModel from '../models/adminAnalyticsModel.js';

const FINANCIAL_NOTE = 'Gross delivered order value is the sum of orders.total_amount for delivered orders. It is not actual platform revenue; payment settlements and transaction records are not implemented.';

function count(value) {
  return Number(value ?? 0);
}

function amount(value) {
  return value === null || value === undefined ? null : Number(value);
}

function createAnalyticsHandler(loadData, failureMessage) {
  return async function adminAnalyticsHandler(request, response, next) {
    try {
      const data = await loadData(request);
      response.status(200).json({ success: true, ...data });
    } catch (error) {
      if (error instanceof AppError) {
        return next(error);
      }
      next(new AppError(500, failureMessage));
    }
  };
}

function normalizeUsers(summary) {
  return {
    total: count(summary.total_users),
    farmers: count(summary.total_farmers),
    buyers: count(summary.total_buyers),
    active: count(summary.active_users),
    suspended: count(summary.suspended_users),
  };
}

function normalizeCrops(summary) {
  return {
    total: count(summary.total_crops),
    available: count(summary.available_crops),
    soldOut: count(summary.sold_out_crops),
    inactive: count(summary.inactive_crops),
  };
}

function normalizeOrders(summary) {
  return {
    total: count(summary.total_orders),
    pending: count(summary.pending_orders),
    confirmed: count(summary.confirmed_orders),
    shipped: count(summary.shipped_orders),
    delivered: count(summary.delivered_orders),
    cancelled: count(summary.cancelled_orders),
    grossDeliveredOrderValue: amount(summary.gross_delivered_order_value),
    averageDeliveredOrderValue: amount(summary.average_delivered_order_value),
  };
}

function normalizeTrend(row) {
  return {
    month: row.month,
    registrations: count(row.registrations),
    cropAdditions: count(row.crop_additions),
    orders: count(row.order_count),
    grossDeliveredOrderValue: amount(row.gross_delivered_order_value),
  };
}

function filterResponse(filters) {
  return {
    months: filters.months,
    fromDate: filters.fromDate,
    toDate: filters.toDate,
    timeZone: 'UTC',
  };
}

export function createAdminAnalyticsController(model = adminAnalyticsModel) {
  return {
    getOverview: createAnalyticsHandler(async () => {
      const overview = await model.getDashboardOverview();
      return {
        users: normalizeUsers(overview),
        crops: normalizeCrops(overview),
        orders: normalizeOrders(overview),
        financialNote: FINANCIAL_NOTE,
      };
    }, 'Unable to retrieve administrator dashboard overview.'),

    getUsers: createAnalyticsHandler(async (request) => {
      const filters = parseAnalyticsFilters(request.query);
      const limit = parseAnalyticsLimit(request.query);
      const [summary, trends, recentRegistrations] = await Promise.all([
        model.getUserSummary(),
        model.getMonthlyRegistrations(filters),
        model.getRecentRegistrations(limit),
      ]);
      return {
        filters: filterResponse(filters),
        summary: normalizeUsers(summary),
        monthlyRegistrations: trends.map((row) => ({
          month: row.month,
          registrations: count(row.registrations),
        })),
        recentRegistrations: recentRegistrations.map((user) => ({
          id: user.id,
          role: user.role,
          status: user.status,
          createdAt: user.created_at,
        })),
      };
    }, 'Unable to retrieve administrator user analytics.'),

    getCrops: createAnalyticsHandler(async (request) => {
      const filters = parseAnalyticsFilters(request.query);
      const [summary, categories, trends] = await Promise.all([
        model.getCropSummary(),
        model.getCropCategoryDistribution(),
        model.getMonthlyCropAdditions(filters),
      ]);
      return {
        filters: filterResponse(filters),
        summary: normalizeCrops(summary),
        categoryDistribution: categories.map((row) => ({
          category: row.category,
          crops: count(row.crop_count),
        })),
        monthlyAdditions: trends.map((row) => ({
          month: row.month,
          crops: count(row.crop_additions),
        })),
      };
    }, 'Unable to retrieve administrator crop analytics.'),

    getOrders: createAnalyticsHandler(async (request) => {
      const filters = parseAnalyticsFilters(request.query);
      const [summary, trends] = await Promise.all([
        model.getOrderSummary(),
        model.getMonthlyOrders(filters),
      ]);
      return {
        filters: filterResponse(filters),
        summary: normalizeOrders(summary),
        monthlyOrders: trends.map((row) => ({
          month: row.month,
          orders: count(row.order_count),
          grossDeliveredOrderValue: amount(row.gross_delivered_order_value),
        })),
        financialNote: FINANCIAL_NOTE,
      };
    }, 'Unable to retrieve administrator order analytics.'),

    getTrends: createAnalyticsHandler(async (request) => {
      const filters = parseAnalyticsFilters(request.query);
      const trends = await model.getMonthlyTrends(filters);
      return {
        filters: filterResponse(filters),
        trends: trends.map(normalizeTrend),
        financialNote: FINANCIAL_NOTE,
      };
    }, 'Unable to retrieve administrator platform trends.'),

    getRecentActivity: createAnalyticsHandler(async (request) => {
      const limit = parseAnalyticsLimit(request.query);
      const [users, crops, orders] = await Promise.all([
        model.getRecentRegistrations(limit),
        model.getRecentCrops(limit),
        model.getRecentOrders(limit),
      ]);
      return {
        limit,
        users: users.map((user) => ({
          id: user.id,
          role: user.role,
          status: user.status,
          createdAt: user.created_at,
        })),
        crops: crops.map((crop) => ({
          id: crop.id,
          name: crop.name,
          category: crop.category,
          status: crop.status,
          createdAt: crop.created_at,
        })),
        orders: orders.map((order) => ({
          id: order.id,
          status: order.status,
          totalAmount: amount(order.total_amount),
          createdAt: order.created_at,
        })),
      };
    }, 'Unable to retrieve recent administrator activity.'),
  };
}

export const adminAnalyticsHandlers = createAdminAnalyticsController();
