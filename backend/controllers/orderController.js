import { AppError } from '../utils/AppError.js';
import { createOrder } from '../models/orderModel.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
