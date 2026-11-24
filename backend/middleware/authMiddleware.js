import jwt from 'jsonwebtoken';
import { AppError } from '../utils/AppError.js';
import {
  findUserForAuthentication,
  isAuthorizedAdminUser,
} from '../models/userModel.js';

export function createAuthenticateToken({
  findUser = findUserForAuthentication,
  authorizeAdmin = isAuthorizedAdminUser,
  environment = process.env,
} = {}) {
  return async function authenticateToken(request, response, next) {
    try {
      const authHeader = request.headers.authorization || '';
      const token = authHeader.startsWith('Bearer ')
        ? authHeader.slice(7)
        : null;

      if (!token) {
        throw new AppError(401, 'Authentication token is required.');
      }

      const secret = environment.JWT_SECRET;
      if (!secret) {
        throw new AppError(500, 'JWT secret is not configured.');
      }

      const decoded = jwt.verify(token, secret);
      const user = await findUser(decoded.id);
      if (!user) {
        throw new AppError(401, 'Invalid or expired token.');
      }
      if (user.status !== 'active') {
        throw new AppError(403, 'This account has been suspended.');
      }
      if (decoded.role !== user.role) {
        throw new AppError(401, 'Invalid or expired token.');
      }
      const tokenPasswordVersion = Number.isInteger(decoded.passwordVersion)
        ? decoded.passwordVersion
        : null;
      const currentPasswordVersion = Number.isInteger(user.password_version)
        ? user.password_version
        : 0;
      if (
        (tokenPasswordVersion !== null && tokenPasswordVersion !== currentPasswordVersion)
        || (tokenPasswordVersion === null && currentPasswordVersion > 0)
      ) {
        throw new AppError(401, 'Invalid or expired token.');
      }
      if (user.role === 'admin') {
        const authorized = await authorizeAdmin(user.id, user.email);
        if (!authorized) {
          throw new AppError(403, 'This administrator account is not authorized.');
        }
        if (user.password_change_required) {
          const requestPath = String(request.originalUrl || request.url || '').split('?')[0];
          const passwordSetupAllowed = (
            (request.method === 'GET' && requestPath === '/api/auth/me')
            || (request.method === 'POST' && requestPath === '/api/auth/change-password')
          );
          if (!passwordSetupAllowed) {
            throw new AppError(
              403,
              'Initial administrator password setup is required.',
            );
          }
        }
      }
      request.user = {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
        password_change_required: user.password_change_required,
      };
      next();
    } catch (error) {
      if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
        return next(new AppError(401, 'Invalid or expired token.'));
      }
      next(error);
    }
  };
}

export const authenticateToken = createAuthenticateToken();

export function optionalAuthenticateToken(request, response, next) {
  if (!request.headers.authorization) {
    return next();
  }
  authenticateToken(request, response, next);
}

export function createRequireAdminMiddleware(authenticate = authenticateToken) {
  return function requireAdmin(request, response, next) {
    return authenticate(request, response, (error) => {
      if (error) {
        return next(error);
      }
      if (!request.user || request.user.role !== 'admin') {
        return next(new AppError(403, 'Administrator access is required.'));
      }
      if (request.user.password_change_required) {
        return next(new AppError(403, 'Initial administrator password setup is required.'));
      }
      next();
    });
  };
}

export const requireAdmin = createRequireAdminMiddleware();
