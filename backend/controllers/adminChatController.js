import { randomUUID } from 'node:crypto';
import { AppError } from '../utils/AppError.js';
import { adminChatModel } from '../models/adminChatModel.js';
import {
  getAdminChatAuditModelName,
  MAX_ADMIN_CHAT_QUESTION_LENGTH,
} from '../services/adminChatGeminiService.js';
import { processAdminChatQuestion } from '../services/adminChatOrchestrator.js';

const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 50;
const CURSOR_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/;

function assertExactObject(value, allowedKeys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AppError(400, `${label} must be an object.`);
  }
  const unexpected = Object.keys(value).filter((key) => !allowedKeys.includes(key));
  if (unexpected.length) {
    throw new AppError(400, `${label} contains unsupported fields.`);
  }
}

function getAdminId(request) {
  const id = request.user?.id;
  if (typeof id !== 'string' || !SESSION_ID_PATTERN.test(id)) {
    throw new AppError(401, 'Administrator authentication is required.');
  }
  return id;
}

function getSessionId(request) {
  const id = request.params.sessionId;
  if (typeof id !== 'string' || !SESSION_ID_PATTERN.test(id)) {
    throw new AppError(400, 'A valid session ID is required.');
  }
  return id;
}

function parsePageSize(value) {
  if (value === undefined) return DEFAULT_PAGE_SIZE;
  if (typeof value !== 'string' || !/^\d{1,3}$/.test(value)) {
    throw new AppError(400, 'limit must be an integer from 1 to 100.');
  }
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
    throw new AppError(400, 'limit must be an integer from 1 to 100.');
  }
  return limit;
}

function parseCursor(query) {
  const before = query.before;
  const beforeId = query.beforeId;
  if (before === undefined && beforeId === undefined) return null;
  if (
    typeof before !== 'string'
    || !CURSOR_TIMESTAMP_PATTERN.test(before)
    || Number.isNaN(Date.parse(before))
    || typeof beforeId !== 'string'
    || !SESSION_ID_PATTERN.test(beforeId)
  ) {
    throw new AppError(400, 'A valid pagination cursor is required.');
  }
  return { before, beforeId };
}

function parseTitle(body) {
  if (body.title === undefined || body.title === null) return null;
  if (typeof body.title !== 'string' || body.title.trim().length === 0 || body.title.trim().length > 160) {
    throw new AppError(400, 'title must contain between 1 and 160 characters.');
  }
  return body.title.trim();
}

function parseIdempotencyKey(request, body) {
  const headerKey = request.get('Idempotency-Key');
  const bodyKey = body.idempotencyKey;
  if (headerKey !== undefined && bodyKey !== undefined && headerKey !== bodyKey) {
    throw new AppError(400, 'Conflicting idempotency keys were provided.');
  }
  const key = headerKey ?? bodyKey;
  if (typeof key !== 'string' || !SESSION_ID_PATTERN.test(key)) {
    throw new AppError(400, 'A valid Idempotency-Key UUID is required.');
  }
  return key;
}

function parseRequestId(request) {
  const supplied = request.get('X-Request-ID');
  return typeof supplied === 'string' && SESSION_ID_PATTERN.test(supplied)
    ? supplied
    : randomUUID();
}

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
      logger.error('Admin chat request failed', { code: safeErrorCode(error) });
      next(new AppError(503, 'Unable to process administrator chat right now.'));
    }
  };
}

export function createAdminChatController({
  model = adminChatModel,
  processQuestion = processAdminChatQuestion,
  logger = console,
  env = process.env,
} = {}) {
  const wrap = (handler) => asyncHandler(handler, logger);

  return {
    createSession: wrap(async (request, response) => {
      assertExactObject(request.body, ['title'], 'Request body');
      const session = await model.createSession({
        adminId: getAdminId(request),
        title: parseTitle(request.body),
      });
      response.status(201).json({ session });
    }),

    listSessions: wrap(async (request, response) => {
      const result = await model.listSessions({
        adminId: getAdminId(request),
        limit: parsePageSize(request.query.limit),
        cursor: parseCursor(request.query),
      });
      response.status(200).json(result);
    }),

    getSession: wrap(async (request, response) => {
      const result = await model.getSession({
        adminId: getAdminId(request),
        sessionId: getSessionId(request),
        limit: parsePageSize(request.query.limit),
        cursor: parseCursor(request.query),
      });
      response.status(200).json(result);
    }),

    sendMessage: wrap(async (request, response) => {
      assertExactObject(request.body, ['message', 'idempotencyKey'], 'Request body');
      if (typeof request.body.message !== 'string' || !request.body.message.trim()) {
        throw new AppError(400, 'message must be a non-empty string.');
      }
      const question = request.body.message.trim();
      if (question.length > MAX_ADMIN_CHAT_QUESTION_LENGTH) {
        throw new AppError(
          400,
          `message cannot exceed ${MAX_ADMIN_CHAT_QUESTION_LENGTH} characters.`,
        );
      }

      const outcome = await model.processMessage({
        adminId: getAdminId(request),
        sessionId: getSessionId(request),
        question,
        idempotencyKey: parseIdempotencyKey(request, request.body),
        requestId: parseRequestId(request),
        modelName: getAdminChatAuditModelName(env),
        processQuestion: ({ previousContext, onIntent }) => processQuestion({
          question,
          previousContext,
          onIntent,
        }),
      });
      response.status(200).json(outcome);
    }),
  };
}

export const adminChatController = createAdminChatController();
