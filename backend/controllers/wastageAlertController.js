import { AppError } from '../utils/AppError.js';
import { getWastageAlerts } from '../services/wastageAlertService.js';

export function createWastageAlertController({ getAlerts = getWastageAlerts } = {}) {
  return async function getWastageAlertController(request, response, next) {
    try {
      if (request.user?.role !== 'farmer') {
        throw new AppError(403, 'Only farmers can view crop wastage alerts.');
      }

      const result = await getAlerts(request.user.id);
      response.status(200).json(result);
    } catch (error) {
      if (error instanceof AppError) {
        return next(error);
      }
      next(new AppError(500, 'Unable to retrieve crop wastage alerts.'));
    }
  };
}

export const getWastageAlertController = createWastageAlertController();
