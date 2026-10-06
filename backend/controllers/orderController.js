import { AppError } from '../utils/AppError.js';
import {
  createOrder,
  getBuyerOrders,
  getFarmerOrders,
  updateFarmerOrderStatus,
} from '../models/orderModel.js';
import { ORDER_STATUSES } from '../utils/orderStatus.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parsePositiveInteger(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const stringValue = String(value).trim();
  if (!/^\d+$/.test(stringValue)) {
    return null;
  }

  const parsed = Number(stringValue);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function getBuyerOrdersHandler(request, response, next) {
  try {
    if (!request.user) {
      throw new AppError(401, 'Authentication token is required.');
    }

    if (request.user.role !== 'buyer') {
      throw new AppError(403, 'Only buyers can view their orders.');
    }

    const page = parsePositiveInteger(request.query.page, 1);
    if (page === null) {
      throw new AppError(400, 'Page must be a positive integer.');
    }

    const requestedLimit = parsePositiveInteger(request.query.limit, 10);
    if (requestedLimit === null) {
      throw new AppError(400, 'Limit must be a positive integer.');
    }

    const limit = Math.min(requestedLimit, 50);
    const rawStatus = typeof request.query.status === 'string'
      ? request.query.status.trim().toLowerCase()
      : '';

    if (rawStatus && !ORDER_STATUSES.has(rawStatus)) {
      throw new AppError(400, 'Status must be one of: pending, confirmed, shipped, delivered, cancelled.');
    }

    const { orders, total } = await getBuyerOrders({
      buyerId: request.user.id,
      status: rawStatus || null,
      page,
      limit,
    });

    response.status(200).json({
      success: true,
      orders: orders.map((order) => ({
        ...order,
        quantity: Number(order.quantity),
        unit_price: Number(order.unit_price),
        total_amount: Number(order.total_amount),
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

    next(new AppError(500, 'Unable to retrieve your orders.'));
  }
}

export async function getFarmerOrdersHandler(request, response, next) {
  try {
    if (!request.user) {
      throw new AppError(401, 'Authentication token is required.');
    }

    if (request.user.role !== 'farmer') {
      throw new AppError(403, 'Only farmers can view their orders.');
    }

    if (request.query.page === '' || request.query.limit === '') {
      throw new AppError(400, 'Page and limit must be positive integers.');
    }

    const page = parsePositiveInteger(request.query.page, 1);
    if (page === null) {
      throw new AppError(400, 'Page must be a positive integer.');
    }

    const limit = parsePositiveInteger(request.query.limit, 10);
    if (limit === null || limit > 50) {
      throw new AppError(400, 'Limit must be a positive integer no greater than 50.');
    }

    if (request.query.status !== undefined && typeof request.query.status !== 'string') {
      throw new AppError(400, 'Status must be a single supported value.');
    }

    if (request.query.status !== undefined && request.query.status.trim() === '') {
      throw new AppError(400, 'Status must be one of: pending, confirmed, shipped, delivered, cancelled.');
    }

    const rawStatus = typeof request.query.status === 'string'
      ? request.query.status.trim().toLowerCase()
      : '';

    if (rawStatus && !ORDER_STATUSES.has(rawStatus)) {
      throw new AppError(400, 'Status must be one of: pending, confirmed, shipped, delivered, cancelled.');
    }

    const { orders, total } = await getFarmerOrders({
      farmerId: request.user.id,
      status: rawStatus || null,
      page,
      limit,
    });

    response.status(200).json({
      success: true,
      orders: orders.map((order) => ({
        ...order,
        quantity: Number(order.quantity),
        unit_price: Number(order.unit_price),
        total_amount: Number(order.total_amount),
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

    next(new AppError(500, 'Unable to retrieve your orders.'));
  }
}

export async function updateFarmerOrderStatusHandler(request, response, next) {
  try {
    if (!request.user) {
      throw new AppError(401, 'Authentication token is required.');
    }

    if (request.user.role !== 'farmer') {
      throw new AppError(403, 'Only farmers can update order status.');
    }

    if (!UUID_PATTERN.test(request.params.id)) {
      throw new AppError(400, 'Invalid order ID.');
    }

    const rawStatus = request.body?.status;
    if (typeof rawStatus !== 'string' || !ORDER_STATUSES.has(rawStatus.trim().toLowerCase())) {
      throw new AppError(400, 'A valid order status is required.');
    }

    const order = await updateFarmerOrderStatus({
      orderId: request.params.id,
      farmerId: request.user.id,
      status: rawStatus.trim().toLowerCase(),
    });

    response.status(200).json({
      success: true,
      message: 'Order status updated successfully',
      order: {
        ...order,
        quantity: Number(order.quantity),
        unit_price: Number(order.unit_price),
        total_amount: Number(order.total_amount),
      },
    });
  } catch (error) {
    if (error instanceof AppError) {
      return next(error);
    }

    next(new AppError(500, 'Unable to update order status.'));
  }
}

export async function createOrderHandler(request, response, next) {
  try {
    if (!request.user) {
      throw new AppError(401, 'Authentication token is required.');
    }

    if (request.user.role !== 'buyer') {
      throw new AppError(403, 'Only buyers can place orders.');
    }

    const cropId = request.body?.cropId;
    const rawQuantity = request.body?.quantity;

    if (cropId === undefined || cropId === null || String(cropId).trim() === '') {
      throw new AppError(400, 'Crop ID is required.');
    }

    const normalizedCropId = String(cropId).trim();
    if (!UUID_PATTERN.test(normalizedCropId)) {
      throw new AppError(400, 'A valid cropId is required.');
    }

    if (rawQuantity === undefined || rawQuantity === null || rawQuantity === '') {
      throw new AppError(400, 'Quantity is required.');
    }

    if (typeof rawQuantity === 'boolean') {
      throw new AppError(400, 'Quantity must be a positive number.');
    }

    const quantity = Number(rawQuantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new AppError(400, 'Quantity must be a positive number.');
    }

    const order = await createOrder({
      buyerId: request.user.id,
      cropId: normalizedCropId,
      quantity,
    });

    const normalizedOrder = {
      ...order,
      quantity: Number(order.quantity),
      unit_price: Number(order.unit_price),
      total_amount: Number(order.total_amount),
    };

    response.status(201).json({
      success: true,
      message: 'Order created successfully',
      order: normalizedOrder,
    });
  } catch (error) {
    if (error instanceof AppError) {
      return next(error);
    }

    next(new AppError(500, 'Unable to create order.'));
  }
}
