import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import { pool } from '../config/db.js';
import {
  getConversationAccess,
  sendConversationMessageWithStatus,
  updateConversationReadState,
} from '../models/chatModel.js';
import { AppError } from '../utils/AppError.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function roomName(conversationId) {
  return `conversation:${conversationId}`;
}

function safeErrorMessage(error, fallback) {
  if (error instanceof AppError) {
    return error.message;
  }
  return fallback;
}

function sendError(socket, event, error, fallback, acknowledge) {
  const message = safeErrorMessage(error, fallback);
  const response = { success: false, message };
  if (typeof acknowledge === 'function') {
    acknowledge(response);
  }
  if (socket.connected) {
    socket.emit('conversation:error', { event, message });
  }
}

function getToken(socket) {
  const token = socket.handshake.auth?.token;
  if (typeof token !== 'string' || !token.trim()) {
    return null;
  }
  const normalized = token.trim();
  return normalized.startsWith('Bearer ')
    ? normalized.slice(7)
    : normalized;
}

function isSocketAuthenticated(socket) {
  if (!socket.connected) {
    return false;
  }

  const expiresAt = socket.data.authExpiresAt;
  if (expiresAt && Date.now() >= expiresAt) {
    socket.disconnect(true);
    return false;
  }

  return true;
}

function disconnectAtTokenExpiry(socket) {
  const expiresAt = socket.data.authExpiresAt;
  if (!expiresAt) return;

  let timer;
  const checkExpiry = () => {
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) {
      socket.disconnect(true);
      return;
    }

    timer = setTimeout(checkExpiry, Math.min(remaining, 2_147_483_647));
  };

  checkExpiry();
  socket.once('disconnect', () => clearTimeout(timer));
}

export function createChatSocketServer(httpServer, {
  jwtSecret = process.env.JWT_SECRET,
  database = pool,
} = {}) {
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  io.use(async (socket, next) => {
    try {
      const token = getToken(socket);
      if (!token || !jwtSecret) {
        return next(new Error('Authentication required.'));
      }

      const decoded = jwt.verify(token, jwtSecret);
      if (
        !isUuid(decoded.id)
        || !['buyer', 'farmer'].includes(decoded.role)
      ) {
        return next(new Error('Authentication required.'));
      }

      const userResult = await database.query(
        'SELECT id, role FROM users WHERE id = $1',
        [decoded.id],
      );
      const user = userResult.rows[0];
      if (!user || user.role !== decoded.role) {
        return next(new Error('Authentication required.'));
      }

      socket.data.user = {
        id: user.id,
        role: user.role,
      };
      socket.data.authExpiresAt = Number.isFinite(decoded.exp)
        ? decoded.exp * 1000
        : null;
      next();
    } catch {
      next(new Error('Authentication required.'));
    }
  });

  io.on('connection', (socket) => {
    disconnectAtTokenExpiry(socket);

    socket.on('conversation:join', async (payload, acknowledge) => {
      if (!isSocketAuthenticated(socket)) return;
      const conversationId = typeof payload === 'string'
        ? payload
        : payload?.conversationId;
      if (!isUuid(conversationId)) {
        sendError(
          socket,
          'conversation:join',
          new AppError(400, 'Invalid conversation ID.'),
          'Unable to join conversation.',
          acknowledge,
        );
        return;
      }

      try {
        await getConversationAccess({
          conversationId,
          userId: socket.data.user.id,
        });
        if (!isSocketAuthenticated(socket)) return;
        await socket.join(roomName(conversationId));
        if (typeof acknowledge === 'function') {
          acknowledge({ success: true, conversationId });
        }
      } catch (error) {
        sendError(
          socket,
          'conversation:join',
          error,
          'Unable to join conversation.',
          acknowledge,
        );
      }
    });

    socket.on('conversation:leave', async (payload, acknowledge) => {
      if (!isSocketAuthenticated(socket)) return;
      const conversationId = typeof payload === 'string'
        ? payload
        : payload?.conversationId;
      if (!isUuid(conversationId)) {
        sendError(
          socket,
          'conversation:leave',
          new AppError(400, 'Invalid conversation ID.'),
          'Unable to leave conversation.',
          acknowledge,
        );
        return;
      }

      await socket.leave(roomName(conversationId));
      if (isSocketAuthenticated(socket) && typeof acknowledge === 'function') {
        acknowledge({ success: true, conversationId });
      }
    });

    socket.on('message:send', async (payload, acknowledge) => {
      if (!isSocketAuthenticated(socket)) return;
      const { conversationId, content, clientMessageId } = payload || {};
      if (!isUuid(conversationId)) {
        sendError(socket, 'message:send', new AppError(400, 'Invalid conversation ID.'), 'Unable to send message.', acknowledge);
        return;
      }
      if (typeof content !== 'string' || !/\S/.test(content)) {
        sendError(socket, 'message:send', new AppError(400, 'Message content must be a non-empty string.'), 'Unable to send message.', acknowledge);
        return;
      }
      if (Array.from(content).length > 2000) {
        sendError(socket, 'message:send', new AppError(400, 'Message content must be 2,000 characters or fewer.'), 'Unable to send message.', acknowledge);
        return;
      }
      if (!isUuid(clientMessageId)) {
        sendError(socket, 'message:send', new AppError(400, 'Invalid client message ID.'), 'Unable to send message.', acknowledge);
        return;
      }

      try {
        const result = await sendConversationMessageWithStatus({
          conversationId,
          senderId: socket.data.user.id,
          content,
          clientMessageId,
        });
        if (!isSocketAuthenticated(socket)) return;

        if (result.created) {
          socket.to(roomName(conversationId)).emit('message:new', result.message);
        }
        socket.emit('message:ack', {
          success: true,
          message: result.message,
        });
        if (typeof acknowledge === 'function') {
          acknowledge({ success: true, message: result.message });
        }
      } catch (error) {
        sendError(socket, 'message:send', error, 'Unable to send message.', acknowledge);
      }
    });

    socket.on('conversation:read', async (payload, acknowledge) => {
      if (!isSocketAuthenticated(socket)) return;
      const conversationId = typeof payload === 'string'
        ? payload
        : payload?.conversationId;
      if (!isUuid(conversationId)) {
        sendError(
          socket,
          'conversation:read',
          new AppError(400, 'Invalid conversation ID.'),
          'Unable to update read state.',
          acknowledge,
        );
        return;
      }

      try {
        const readState = await updateConversationReadState({
          conversationId,
          userId: socket.data.user.id,
        });
        if (!isSocketAuthenticated(socket)) return;
        socket.to(roomName(conversationId)).emit('conversation:read', {
          conversationId,
          userId: socket.data.user.id,
          last_read_at: readState.last_read_at,
        });
        if (typeof acknowledge === 'function') {
          acknowledge({ success: true, read_state: readState });
        }
      } catch (error) {
        sendError(socket, 'conversation:read', error, 'Unable to update read state.', acknowledge);
      }
    });
  });

  return io;
}
