import { AppError } from '../utils/AppError.js';
import { evaluateFairPrice } from '../services/fairPriceService.js';

export function createFairPriceController({ evaluatePrice = evaluateFairPrice } = {}) {
  return async function postFairPriceController(request, response, next) {
    try {
      if (request.user?.role !== 'farmer') {
        throw new AppError(403, 'Only farmers can request a fair price comparison.');
      }

      const result = await evaluatePrice(request.body);
      response.status(200).json(result);
    } catch (error) {
      if (error instanceof AppError) {
        return next(error);
      }
      next(new AppError(500, 'Unable to compare your price with historical data.'));
    }
  };
}

export const postFairPriceController = createFairPriceController();
