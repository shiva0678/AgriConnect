import { AppError } from '../utils/AppError.js';
import {
  getConversations,
  getConversationByOrder,
  getMessageHistory,
  sendConversationMessage,
  updateConversationReadState,
  getUnreadCount,
} from '../models/chatModel.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parsePositiveInteger(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const text = String(value).trim();
  if (!/^\d+$/.test(text)) {
    return null;
  }
  const parsed = Number(text);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function validateUuid(value, label) {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new AppError(400, `Invalid ${label}.`);
  }
}

function parseCursorDate(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (typeof value !== 'string') {
    throw new AppError(400, 'Invalid message cursor.');
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new AppError(400, 'Invalid message cursor.');
  }
  return value;
}

export async function getConversationsHandler(request, response, next) {
  try {
    if (!request.user) {
      throw new AppError(401, 'Authentication token is required.');
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

    const result = await getConversations({
      userId: request.user.id,
      page,
      limit,
    });
    response.status(200).json({
      success: true,
      conversations: result.conversations,
      pagination: {
        page,
        limit,
        total: result.total,
        totalPages: result.total === 0 ? 0 : Math.ceil(result.total / limit),
      },
    });
  } catch (error) {
    next(error instanceof AppError ? error : new AppError(500, 'Unable to retrieve conversations.'));
  }
}

export async function getConversationByOrderHandler(request, response, next) {
  try {
    if (!request.user) {
      throw new AppError(401, 'Authentication token is required.');
    }
    validateUuid(request.params.orderId, 'order ID');

    const result = await getConversationByOrder({
      orderId: request.params.orderId,
      userId: request.user.id,
    });
    response.status(200).json({
      success: true,
      conversation: result.conversation,
      order: result.order,
      other_participant: result.other_participant,
    });
  } catch (error) {
    next(error instanceof AppError ? error : new AppError(500, 'Unable to retrieve conversation.'));
  }
}

export async function getMessageHistoryHandler(request, response, next) {
  try {
    if (!request.user) {
      throw new AppError(401, 'Authentication token is required.');
    }
    validateUuid(request.params.conversationId, 'conversation ID');

    const limit = parsePositiveInteger(request.query.limit, 30);
    if (limit === null) {
      throw new AppError(400, 'Limit must be a positive integer.');
    }
    if (limit > 50) {
      throw new AppError(400, 'Limit must be no greater than 50.');
    }

    const rawBefore = request.query.before;
    const rawBeforeId = request.query.before_id;
    const hasBefore = rawBefore !== undefined && rawBefore !== null && rawBefore !== '';
    const hasBeforeId = rawBeforeId !== undefined && rawBeforeId !== null && rawBeforeId !== '';
    if (hasBefore !== hasBeforeId) {
      throw new AppError(400, 'Both before and before_id must be supplied together.');
    }

    const before = hasBefore ? parseCursorDate(rawBefore) : null;
    const beforeId = hasBeforeId ? rawBeforeId : null;
    if (beforeId) {
      validateUuid(beforeId, 'message cursor ID');
    }

    const result = await getMessageHistory({
      conversationId: request.params.conversationId,
      userId: request.user.id,
      limit,
      before,
      beforeId: beforeId || null,
    });
    response.status(200).json({
      success: true,
      messages: result.messages,
      pagination: {
        limit,
        has_more: result.has_more,
        next_cursor: result.next_cursor,
      },
    });
  } catch (error) {
    next(error instanceof AppError ? error : new AppError(500, 'Unable to retrieve messages.'));
  }
}

export async function sendMessageHandler(request, response, next) {
  try {
    if (!request.user) {
      throw new AppError(401, 'Authentication token is required.');
    }
    validateUuid(request.params.conversationId, 'conversation ID');

    const content = request.body?.content;
    if (typeof content !== 'string') {
      throw new AppError(400, 'Message content must be a string.');
    }
    if (!/\S/.test(content)) {
      throw new AppError(400, 'Message content must not be empty or whitespace-only.');
    }
    if (Array.from(content).length > 2000) {
      throw new AppError(400, 'Message content must be 2,000 characters or fewer.');
    }

    const clientMessageId = request.body?.client_message_id;
    validateUuid(clientMessageId, 'client message ID');

    const message = await sendConversationMessage({
      conversationId: request.params.conversationId,
      senderId: request.user.id,
      content,
      clientMessageId,
    });
    response.status(201).json({
      success: true,
      message,
    });
  } catch (error) {
    next(error instanceof AppError ? error : new AppError(500, 'Unable to send message.'));
  }
}

export async function updateReadStateHandler(request, response, next) {
  try {
    if (!request.user) {
      throw new AppError(401, 'Authentication token is required.');
    }
    validateUuid(request.params.conversationId, 'conversation ID');

    const readState = await updateConversationReadState({
      conversationId: request.params.conversationId,
      userId: request.user.id,
    });
    response.status(200).json({
      success: true,
      read_state: readState,
    });
  } catch (error) {
    next(error instanceof AppError ? error : new AppError(500, 'Unable to update read state.'));
  }
}

export async function getUnreadCountHandler(request, response, next) {
  try {
    if (!request.user) {
      throw new AppError(401, 'Authentication token is required.');
    }
    const unreadCount = await getUnreadCount({ userId: request.user.id });
    response.status(200).json({
      success: true,
      unread_count: unreadCount,
    });
  } catch (error) {
    next(error instanceof AppError ? error : new AppError(500, 'Unable to retrieve unread count.'));
  }
}
