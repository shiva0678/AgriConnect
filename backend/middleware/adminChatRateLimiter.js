import { AppError } from '../utils/AppError.js';

const MAX_TRACKED_ADMIN_BUCKETS = 1000;

/**
 * Counters are process-local; multiple instances do not share buckets. Horizontally
 * scaled deployments need a shared limiter or gateway policy for a global limit.
 */
export function createAdminChatRateLimiter({
  limit = 20,
  windowMs = 60_000,
  clock = () => Date.now(),
} = {}) {
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new TypeError('Admin chat rate limit must be a positive integer.');
  }
  if (!Number.isSafeInteger(windowMs) || windowMs < 1000) {
    throw new TypeError('Admin chat rate-limit window must be at least one second.');
  }

  const buckets = new Map();
  return function adminChatRateLimiter(request, response, next) {
    const adminId = request.user?.id;
    if (typeof adminId !== 'string' || !adminId) {
      return next(new AppError(401, 'Administrator authentication is required.'));
    }

    const now = clock();
    for (const [id, bucket] of buckets) {
      if (bucket.resetAt <= now) {
        buckets.delete(id);
      }
    }

    let bucket = buckets.get(adminId);
    if (!bucket || bucket.resetAt <= now) {
      if (buckets.size >= MAX_TRACKED_ADMIN_BUCKETS) {
        const oldestId = buckets.keys().next().value;
        if (oldestId !== undefined) buckets.delete(oldestId);
      }
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(adminId, bucket);
    }

    if (bucket.count >= limit) {
      return next(new AppError(429, 'Administrator chat message rate limit exceeded.'));
    }

    bucket.count += 1;
    next();
  };
}

export const adminChatRateLimiter = createAdminChatRateLimiter();
