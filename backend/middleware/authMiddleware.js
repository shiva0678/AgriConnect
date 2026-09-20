import jwt from 'jsonwebtoken';
import { AppError } from '../utils/AppError.js';

export function authenticateToken(request, response, next) {
  try {
    const authHeader = request.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : null;

    if (!token) {
      throw new AppError(401, 'Authentication token is required.');
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new AppError(500, 'JWT secret is not configured.');
    }

    const decoded = jwt.verify(token, secret);
    request.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
      name: decoded.name,
    };
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return next(new AppError(401, 'Invalid or expired token.'));
    }
    next(error);
  }
}
