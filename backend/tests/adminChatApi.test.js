import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { AppError } from '../utils/AppError.js';
import { createAdminChatController } from '../controllers/adminChatController.js';
import { createAdminChatRateLimiter } from '../middleware/adminChatRateLimiter.js';
import {
  createAuthenticateToken,
  createRequireAdminMiddleware,
} from '../middleware/authMiddleware.js';
import { createAdminChatRouter } from '../routes/adminChatRoutes.js';

const ADMIN_A = '11111111-1111-4111-8111-111111111111';
const ADMIN_B = '22222222-2222-4222-8222-222222222222';
const SESSION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const IDEMPOTENCY_KEY = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function createFixture({ limit = 20 } = {}) {
  const calls = [];
  let processedCount = 0;
  const model = {
    async createSession(args) {
      calls.push({ method: 'createSession', args });
      return { id: SESSION_ID, title: args.title, createdAt: '2026-01-01T00:00:00.000Z' };
    },
    async listSessions(args) {
      calls.push({ method: 'listSessions', args });
      return { sessions: [], pagination: { limit: args.limit, hasMore: false, nextCursor: null } };
    },
    async getSession(args) {
      calls.push({ method: 'getSession', args });
      if (args.adminId !== ADMIN_A) throw new AppError(404, 'Administrator chat session not found.');
      return { session: { id: args.sessionId }, messages: [], pagination: { limit: args.limit } };
    },
    async processMessage(args) {
      calls.push({ method: 'processMessage', args });
      processedCount += 1;
      const intent = {
        intent: 'general',
        operation: null,
        filters: null,
        clarificationQuestion: null,
      };
      const processed = await args.processQuestion({
        previousContext: {},
        onIntent(value) { assert.deepEqual(value, intent); },
      });
      return {
        userMessage: { id: 'user-message-id', content: args.question },
        assistantMessage: { id: 'assistant-message-id', content: processed.assistantContent },
        result: null,
        requestId: args.requestId,
        idempotentReplay: false,
      };
    },
    get processedCount() { return processedCount; },
  };
  const controller = createAdminChatController({
    model,
    processQuestion: async () => ({
      intent: {
        intent: 'general',
        operation: null,
        filters: null,
        clarificationQuestion: null,
      },
      assistantContent: 'AgriConnect connects farmers and buyers.',
      result: null,
      nextContext: {},
    }),
    logger: { error() {} },
    env: {},
  });
  const auth = (req, res, next) => {
    const token = req.get('Authorization');
    if (token !== 'Bearer admin-a' && token !== 'Bearer admin-b') {
      return next(new AppError(401, 'Authentication token is required.'));
    }
    req.user = {
      id: token === 'Bearer admin-a' ? ADMIN_A : ADMIN_B,
      role: 'admin',
      password_change_required: false,
    };
    next();
  };
  const app = express();
  app.use(express.json());
  app.use('/api/admin/chat', createAdminChatRouter({
    authenticateAdmin: auth,
    rateLimiter: createAdminChatRateLimiter({ limit, windowMs: 60_000 }),
    controller,
  }));
  app.use((error, req, res, next) => {
    res.status(error.status || 500).json({ message: error.message });
  });
  return { app, calls, model };
}

test('requires administrator authentication on chat routes', async () => {
  const { app } = createFixture();
  const response = await request(app).get('/api/admin/chat/sessions');
  assert.equal(response.status, 401);
});

test('default chat router applies production requireAdmin before handlers', async () => {
  let handlerCalls = 0;
  const handler = (req, res) => {
    handlerCalls += 1;
    res.status(200).json({ ok: true });
  };
  const app = express();
  app.use('/api/admin/chat', createAdminChatRouter({
    rateLimiter: (req, res, next) => next(),
    controller: {
      createSession: handler,
      listSessions: handler,
      getSession: handler,
      sendMessage: handler,
    },
  }));
  app.use((error, req, res, next) => {
    res.status(error.status || 500).json({ message: error.message });
  });

  const response = await request(app).get('/api/admin/chat/sessions');
  assert.equal(response.status, 401);
  assert.equal(handlerCalls, 0);
});

test('wires the production requireAdmin guard to the chat router', async () => {
  const secret = 'isolated-admin-chat-test-secret';
  const users = new Map([
    [ADMIN_A, {
      id: ADMIN_A,
      email: 'admin@example.test',
      name: 'Test Admin',
      role: 'admin',
      status: 'active',
      password_version: 0,
      password_change_required: false,
    }],
    [ADMIN_B, {
      id: ADMIN_B,
      email: 'buyer@example.test',
      name: 'Test Buyer',
      role: 'buyer',
      status: 'active',
      password_version: 0,
      password_change_required: false,
    }],
  ]);
  const authenticate = createAuthenticateToken({
    findUser: async (id) => users.get(id),
    authorizeAdmin: async (id) => id === ADMIN_A,
    environment: { JWT_SECRET: secret },
  });
  const requireAdmin = createRequireAdminMiddleware(authenticate);
  const tokens = {
    admin: jwt.sign({ id: ADMIN_A, role: 'admin', passwordVersion: 0 }, secret),
    buyer: jwt.sign({ id: ADMIN_B, role: 'buyer', passwordVersion: 0 }, secret),
  };
  let handlerCalls = 0;
  const handler = (req, res) => {
    handlerCalls += 1;
    res.status(200).json({ adminId: req.user.id });
  };
  const controller = {
    createSession: handler,
    listSessions: handler,
    getSession: handler,
    sendMessage: handler,
  };
  const app = express();
  app.use('/api/admin/chat', createAdminChatRouter({
    authenticateAdmin: requireAdmin,
    rateLimiter: (req, res, next) => next(),
    controller,
  }));
  app.use((error, req, res, next) => {
    res.status(error.status || 500).json({ message: error.message });
  });

  const missingAuthentication = await request(app).get('/api/admin/chat/sessions');
  const nonAdmin = await request(app)
    .get('/api/admin/chat/sessions')
    .set('Authorization', `Bearer ${tokens.buyer}`);
  const authorizedAdmin = await request(app)
    .get('/api/admin/chat/sessions')
    .set('Authorization', `Bearer ${tokens.admin}`);

  assert.equal(missingAuthentication.status, 401);
  assert.equal(nonAdmin.status, 403);
  assert.equal(authorizedAdmin.status, 200);
  assert.equal(authorizedAdmin.body.adminId, ADMIN_A);
  assert.equal(handlerCalls, 1);
});

test('creates and lists only the authenticated administrator sessions', async () => {
  const { app, calls } = createFixture();
  const created = await request(app)
    .post('/api/admin/chat/sessions')
    .set('Authorization', 'Bearer admin-a')
    .send({ title: 'Platform summary' });
  const listed = await request(app)
    .get('/api/admin/chat/sessions?limit=15')
    .set('Authorization', 'Bearer admin-b');

  assert.equal(created.status, 201);
  assert.deepEqual(created.body.session, {
    id: SESSION_ID,
    title: 'Platform summary',
    createdAt: '2026-01-01T00:00:00.000Z',
  });
  assert.equal(listed.status, 200);
  assert.equal(calls[0].args.adminId, ADMIN_A);
  assert.equal(calls[1].args.adminId, ADMIN_B);
  assert.equal(calls[1].args.limit, 15);
});

test('validates pagination limits and rejects malformed cursors', async () => {
  const { app } = createFixture();
  const tooLarge = await request(app)
    .get('/api/admin/chat/sessions?limit=101')
    .set('Authorization', 'Bearer admin-a');
  const invalidCursor = await request(app)
    .get('/api/admin/chat/sessions?before=tomorrow&beforeId=not-a-uuid')
    .set('Authorization', 'Bearer admin-a');

  assert.equal(tooLarge.status, 400);
  assert.equal(invalidCursor.status, 400);
});

test('session retrieval is owner-scoped and another administrator receives not found', async () => {
  const { app, calls } = createFixture();
  const ownSession = await request(app)
    .get(`/api/admin/chat/sessions/${SESSION_ID}`)
    .set('Authorization', 'Bearer admin-a');
  const otherSession = await request(app)
    .get(`/api/admin/chat/sessions/${SESSION_ID}`)
    .set('Authorization', 'Bearer admin-b');

  assert.equal(ownSession.status, 200);
  assert.equal(otherSession.status, 404);
  assert.equal(calls[0].args.adminId, ADMIN_A);
  assert.equal(calls[1].args.adminId, ADMIN_B);
});

test('rejects client-supplied context and unknown message fields', async () => {
  const { app, model } = createFixture();
  const response = await request(app)
    .post(`/api/admin/chat/sessions/${SESSION_ID}/messages`)
    .set('Authorization', 'Bearer admin-a')
    .set('Idempotency-Key', IDEMPOTENCY_KEY)
    .send({ message: 'How many farmers?', context: { lastOperation: 'count_users' } });

  assert.equal(response.status, 400);
  assert.equal(model.processedCount, 0);
});

test('persists and returns a predictable response while enforcing message limits', async () => {
  const { app, calls } = createFixture();
  const response = await request(app)
    .post(`/api/admin/chat/sessions/${SESSION_ID}/messages`)
    .set('Authorization', 'Bearer admin-a')
    .set('Idempotency-Key', IDEMPOTENCY_KEY)
    .send({ message: ' What is AgriConnect? ' });
  const longMessage = await request(app)
    .post(`/api/admin/chat/sessions/${SESSION_ID}/messages`)
    .set('Authorization', 'Bearer admin-a')
    .set('Idempotency-Key', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc')
    .send({ message: 'x'.repeat(1201) });

  assert.equal(response.status, 200);
  assert.equal(response.body.assistantMessage.content, 'AgriConnect connects farmers and buyers.');
  assert.equal(calls[0].args.question, 'What is AgriConnect?');
  assert.equal(calls[0].args.adminId, ADMIN_A);
  assert.equal(calls[0].args.idempotencyKey, IDEMPOTENCY_KEY);
  assert.equal(longMessage.status, 400);
});

test('rejects missing and conflicting idempotency keys', async () => {
  const { app, model } = createFixture();
  const missing = await request(app)
    .post(`/api/admin/chat/sessions/${SESSION_ID}/messages`)
    .set('Authorization', 'Bearer admin-a')
    .send({ message: 'Hello' });
  const conflicting = await request(app)
    .post(`/api/admin/chat/sessions/${SESSION_ID}/messages`)
    .set('Authorization', 'Bearer admin-a')
    .set('Idempotency-Key', IDEMPOTENCY_KEY)
    .send({ message: 'Hello', idempotencyKey: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' });

  assert.equal(missing.status, 400);
  assert.equal(conflicting.status, 400);
  assert.equal(model.processedCount, 0);
});

test('returns the documented conflict response for an in-progress idempotency key', async () => {
  const { app, model } = createFixture();
  model.processMessage = async () => {
    throw new AppError(409, 'A message for this session is already being processed.');
  };
  const response = await request(app)
    .post(`/api/admin/chat/sessions/${SESSION_ID}/messages`)
    .set('Authorization', 'Bearer admin-a')
    .set('Idempotency-Key', IDEMPOTENCY_KEY)
    .send({ message: 'Hello' });

  assert.equal(response.status, 409);
  assert.equal(response.body.message, 'A message for this session is already being processed.');
});

test('applies the per-administrator in-memory message rate limit', async () => {
  const { app, model } = createFixture({ limit: 1 });
  const send = (key) => request(app)
    .post(`/api/admin/chat/sessions/${SESSION_ID}/messages`)
    .set('Authorization', 'Bearer admin-a')
    .set('Idempotency-Key', key)
    .send({ message: 'Hello' });

  const first = await send(IDEMPOTENCY_KEY);
  const second = await send('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
  assert.equal(first.status, 200);
  assert.equal(second.status, 429);
  assert.equal(model.processedCount, 1);
});
