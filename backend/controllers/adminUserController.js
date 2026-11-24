import { randomUUID } from 'node:crypto';
import { AppError } from '../utils/AppError.js';
import { adminUserModel } from '../models/adminUserModel.js';
import {
  parseAdminUserId,
  parseAdminUserListFilters,
  parseAdminUserActivityLimit,
  parseAdminUserActionReason,
} from '../utils/adminUserFilters.js';

function safeErrorCode(error) {
  const code = error?.code;
  return typeof code === 'string' || typeof code === 'number'
    ? String(code).replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 80) || null
    : null;
}

function asyncHandler(handler, logger) {
  return async (request, response, next) => {
    try {
      await handler(request, response);
    } catch (error) {
      if (error instanceof AppError) {
        return next(error);
      }
      logger.error('Admin user request failed', { code: safeErrorCode(error) });
      next(new AppError(503, 'Unable to retrieve administrator user data right now.'));
    }
  };
}

export function createAdminUserController({
  model = adminUserModel,
  logger = console,
} = {}) {
  const wrap = (handler) => asyncHandler(handler, logger);

  return {
    listUsers: wrap(async (request, response) => {
      const filters = parseAdminUserListFilters(request.query);
      const result = await model.listUsers(filters);
      response.status(200).json({
        success: true,
        users: result.users,
        pagination: result.pagination,
        filters: {
          q: filters.search,
          role: filters.role,
          status: filters.status,
        },
      });
    }),

    getUser: wrap(async (request, response) => {
      const userId = parseAdminUserId(request.params.userId);
      const user = await model.getUser(userId);
      response.status(200).json({
        success: true,
        user,
      });
    }),

    getUserActivity: wrap(async (request, response) => {
      const userId = parseAdminUserId(request.params.userId);
      const limit = parseAdminUserActivityLimit(request.query);
      const activity = await model.getUserActivity(userId, limit);
      response.status(200).json({
        success: true,
        ...activity,
      });
    }),

    suspendUser: wrap(async (request, response) => {
      const userId = parseAdminUserId(request.params.userId);
      const reason = parseAdminUserActionReason(request.body);
      const requestId = randomUUID();
      const result = await model.suspendUser({
        userId,
        adminId: request.user.id,
        reason,
        requestId,
      });
      response.status(200).json({
        success: true,
        ...result,
      });
    }),

    reactivateUser: wrap(async (request, response) => {
      const userId = parseAdminUserId(request.params.userId);
      const requestId = randomUUID();
      const result = await model.reactivateUser({
        userId,
        adminId: request.user.id,
        requestId,
      });
      response.status(200).json({
        success: true,
        ...result,
      });
    }),
  };
}

export const adminUserController = createAdminUserController();
