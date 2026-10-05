import { AppError } from '../utils/AppError.js';
import {
  validateCropInput,
  validateCropUpdateInput,
} from '../utils/validation.js';
import {
  createCrop,
  deleteCrop,
  findCropById,
  findCropsByFarmerId,
  updateCrop,
} from '../models/cropModel.js';

function sanitizeCropPayload(payload = {}) {
  return {
    name: typeof payload.name === 'string' ? payload.name.trim() : payload.name,
    category: typeof payload.category === 'string' ? payload.category.trim() : payload.category,
    description: typeof payload.description === 'string' ? payload.description.trim() : payload.description,
    price: payload.price,
    unit: typeof payload.unit === 'string' ? payload.unit.trim() : payload.unit,
    quantity: payload.quantity,
    location: typeof payload.location === 'string' ? payload.location.trim() : payload.location,
    harvest_date: payload.harvest_date,
    expiry_date: payload.expiry_date,
  };
}

export async function createCropController(request, response, next) {
  try {
    if (request.user.role !== 'farmer') {
      throw new AppError(403, 'Only farmers can create crops.');
    }

    const payload = sanitizeCropPayload(request.body);
    const validationError = validateCropInput(payload);
    if (validationError) {
      throw new AppError(400, validationError);
    }

    const crop = await createCrop({
      farmer_id: request.user.id,
      name: payload.name,
      category: payload.category,
      description: payload.description || null,
      price: Number(payload.price),
      unit: payload.unit,
      quantity: Number(payload.quantity),
      location: payload.location,
      harvest_date: payload.harvest_date,
      expiry_date: payload.expiry_date || null,
      status: 'available',
    });

    response.status(201).json({
      success: true,
      crop,
    });
  } catch (error) {
    next(error);
  }
}

export async function getFarmerCropsController(request, response, next) {
  try {
    if (request.user.role !== 'farmer') {
      throw new AppError(403, 'Only farmers can view their crop inventory.');
    }

    const crops = await findCropsByFarmerId(request.user.id);

    response.status(200).json({
      success: true,
      crops,
    });
  } catch (error) {
    next(error);
  }
}

export async function getCropByIdController(request, response, next) {
  try {
    const crop = await findCropById(request.params.id);

    if (!crop) {
      throw new AppError(404, 'Crop not found.');
    }

    response.status(200).json({
      success: true,
      crop,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateCropController(request, response, next) {
  try {
    const existingCrop = await findCropById(request.params.id);
    if (!existingCrop) {
      throw new AppError(404, 'Crop not found.');
    }

    if (existingCrop.farmer_id !== request.user.id) {
      throw new AppError(403, 'You can only update your own crops.');
    }

    const payload = sanitizeCropPayload({
      ...existingCrop,
      ...request.body,
    });

    const validationError = validateCropUpdateInput(payload);
    if (validationError) {
      throw new AppError(400, validationError);
    }

    const updatePayload = {};
    const allowList = [
      'name',
      'category',
      'description',
      'price',
      'unit',
      'quantity',
      'location',
      'harvest_date',
      'expiry_date',
    ];

    for (const field of allowList) {
      if (request.body[field] !== undefined) {
        updatePayload[field] = payload[field];
      }
    }

    if (Object.keys(updatePayload).length === 0) {
      throw new AppError(400, 'At least one valid crop field is required for update.');
    }

    const updatedCrop = await updateCrop(request.params.id, {
      ...updatePayload,
      price: Number(updatePayload.price),
      quantity: Number(updatePayload.quantity),
      description: updatePayload.description === undefined || updatePayload.description === null
        ? null
        : String(updatePayload.description).trim(),
    });

    if (!updatedCrop) {
      throw new AppError(404, 'Crop not found.');
    }

    response.status(200).json({
      success: true,
      crop: updatedCrop,
      message: 'Crop updated successfully.',
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteCropController(request, response, next) {
  try {
    const existingCrop = await findCropById(request.params.id);
    if (!existingCrop) {
      throw new AppError(404, 'Crop not found.');
    }

    if (existingCrop.farmer_id !== request.user.id) {
      throw new AppError(403, 'You can only delete your own crops.');
    }

    const deletedCrop = await deleteCrop(request.params.id);
    if (!deletedCrop) {
      throw new AppError(404, 'Crop not found.');
    }

    response.status(200).json({
      success: true,
      message: 'Crop deleted successfully.',
      cropId: deletedCrop.id,
    });
  } catch (error) {
    next(error);
  }
}

export const createCropHandler = createCropController;
export const getFarmerCropsHandler = getFarmerCropsController;
export const getCropByIdHandler = getCropByIdController;
export const updateCropHandler = updateCropController;
export const deleteCropHandler = deleteCropController;
