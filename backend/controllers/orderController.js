import { AppError } from '../utils/AppError.js';
import { createOrder, getBuyerOrders } from '../models/orderModel.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ORDER_STATUSES = new Set(['pending', 'confirmed', 'shipped', 'delivered', 'cancelled']);

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
