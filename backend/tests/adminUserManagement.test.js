import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createAdminUserModel } from '../models/adminUserModel.js';
import { createAdminUserController } from '../controllers/adminUserController.js';
import { createAdminUserRouter } from '../routes/adminUserRoutes.js';
import {
  createAuthenticateToken,
  createRequireAdminMiddleware,
  requireAdmin,
} from '../middleware/authMiddleware.js';
import { errorHandler } from '../middleware/errorHandler.js';
import {
  parseAdminUserId,
  parseAdminUserListFilters,
  parseAdminUserActivityLimit,
  parseAdminUserActionReason,
} from '../utils/adminUserFilters.js';

function createMockResponse() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

async function callController(controller, requestObject) {
  const response = createMockResponse();
  let nextError = null;
  await controller(requestObject, response, (error) => {
    nextError = error || null;
  });
  return { response, nextError };
}

function createMutationDatabase({
  target = {
    id: 'd0d0d0d0-d0d0-4d0d-8d0d-d0d0d0d0d0d0',
    role: 'farmer',
    status: 'active',
    suspended_reason: null,
    suspended_at: null,
    suspended_by: null,
    password_version: 4,
  },
  failUpdate = false,
  failSuccessAudit = false,
  failFailureAudit = false,
  failOriginalRollback = false,
  failFailureAuditRollback = false,
  failCommitAfterApplying = false,
} = {}) {
  let state = target ? { ...target } : null;
  const audits = [];
  const queries = [];
  let lockTail = Promise.resolve();
  let failFailureAuditPending = failFailureAudit;
  let rollbackCalls = 0;
  let releaseCalls = 0;
  const releaseErrors = [];

  const database = {
    async connect() {
      let snapshot = null;
      let pendingAudits = [];
      let releaseLock = null;
      let locked = false;
      let commitApplied = false;
      let failSuccessAuditPending = failSuccessAudit;

      const releaseRowLock = () => {
        if (locked) {
          locked = false;
          releaseLock();
        }
      };

      return {
        async query(sql, values = []) {
          const normalized = sql.replace(/\s+/g, ' ').trim();
          queries.push({ sql: normalized, values });
          if (normalized === 'BEGIN') {
            pendingAudits = [];
            return { rows: [] };
          }
          if (normalized.includes('FROM users') && normalized.endsWith('FOR UPDATE')) {
            const previousLock = lockTail;
            lockTail = new Promise((resolve) => {
              releaseLock = resolve;
            });
            await previousLock;
            locked = true;
            snapshot = state ? { ...state } : null;
            return { rows: state && state.id === values[0] ? [{ ...state }] : [] };
          }
          if (normalized.startsWith('UPDATE users')) {
            if (failUpdate) {
              const error = new Error('simulated update failure');
              error.code = 'XX001';
              throw error;
            }
            if (!state || state.id !== values[0]) {
              return { rows: [] };
            }
            if (normalized.includes("SET status = 'suspended'")) {
              state = {
                ...state,
                status: 'suspended',
                suspended_at: new Date('2026-11-24T12:00:00.000Z'),
                suspended_reason: values[1],
                suspended_by: values[2],
                password_version: state.password_version + 1,
              };
            } else {
              state = {
                ...state,
                status: 'active',
                suspended_at: null,
                suspended_reason: null,
                suspended_by: null,
                password_version: state.password_version + 1,
              };
            }
            return { rows: [{ id: state.id, status: state.status, suspended_at: state.suspended_at }] };
          }
          if (normalized.startsWith('INSERT INTO admin_user_action_audit_logs')) {
            if (values[5] === 'success' && failSuccessAuditPending) {
              failSuccessAuditPending = false;
              const error = new Error('simulated audit failure');
              error.code = 'XX002';
              throw error;
            }
            if (values[5] === 'failure' && failFailureAuditPending) {
              failFailureAuditPending = false;
              const error = new Error('simulated failure audit failure');
              error.code = 'XX003';
              throw error;
            }
            pendingAudits.push({
              adminId: values[0],
              targetUserId: values[1],
              targetReference: values[2],
              action: values[3],
              reason: values[4],
              outcome: values[5],
              requestId: values[6],
            });
            return { rows: [] };
          }
          if (normalized === 'COMMIT') {
            audits.push(...pendingAudits);
            pendingAudits = [];
            releaseRowLock();
            if (failCommitAfterApplying) {
              commitApplied = true;
              const error = new Error('simulated ambiguous commit failure');
              error.code = 'XX005';
              throw error;
            }
            return { rows: [] };
          }
          if (normalized === 'ROLLBACK') {
            rollbackCalls += 1;
            if (
              (rollbackCalls === 1 && failOriginalRollback)
              || (rollbackCalls === 2 && failFailureAuditRollback)
            ) {
              const error = new Error('simulated rollback failure');
              error.code = 'XX004';
              throw error;
            }
            if (!commitApplied) {
              state = snapshot;
            }
            pendingAudits = [];
            releaseRowLock();
            return { rows: [] };
          }
          throw new Error(`Unexpected SQL in test mock: ${normalized}`);
        },
        release(error) {
          releaseCalls += 1;
          releaseErrors.push(error || null);
          releaseRowLock();
        },
      };
    },
  };

  return {
    database,
    queries,
    audits,
    getState: () => (state ? { ...state } : null),
    getReleaseCalls: () => releaseCalls,
    releaseErrors,
  };
}

test('admin user filters validate search, role, status, limit, and cursor', () => {
  const parsed = parseAdminUserListFilters({
    q: ' Nashik ',
    role: 'farmer',
    status: 'active',
    before: '2026-11-24T12:30:00.000Z',
    beforeId: 'c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0',
    limit: '50',
  });
  assert.equal(parsed.search, 'Nashik');
  assert.equal(parsed.role, 'farmer');
  assert.equal(parsed.status, 'active');
  assert.equal(parsed.limit, 50);
  assert.equal(parsed.cursor.beforeId, 'c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0');

  assert.throws(
    () => parseAdminUserListFilters({ role: 'admin' }),
    (error) => error.status === 400,
  );
  assert.throws(
    () => parseAdminUserListFilters({ status: 'pending' }),
    (error) => error.status === 400,
  );
  assert.throws(
    () => parseAdminUserListFilters({ limit: '101' }),
    (error) => error.status === 400,
  );
  assert.throws(
    () => parseAdminUserListFilters({
      before: '2026-11-24T12:30:00.000Z',
    }),
    (error) => error.status === 400,
  );
  assert.throws(
    () => parseAdminUserId('not-a-uuid'),
    (error) => error.status === 400,
  );
});

test('admin user list model uses parameterized search and deterministic cursor SQL', async () => {
  let capturedSql = '';
  let capturedValues = null;
  const model = createAdminUserModel({
    database: {
      async query(sql, values) {
        capturedSql = sql;
        capturedValues = values;
        return {
          rows: [{
            id: 'c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0',
            name: 'Green Farmer',
            email: 'farmer@example.com',
            role: 'farmer',
            status: 'active',
            location: 'Nashik',
            farm_name: 'Green Farm',
            company_name: null,
            created_at: new Date('2026-11-24T12:30:00.000Z'),
            cursor_before: '2026-11-24T12:30:00.123456Z',
          }],
        };
      },
    },
  });

  const result = await model.listUsers({
    search: '100%',
    role: 'farmer',
    status: 'active',
    cursor: {
      before: '2026-11-24T12:30:00.000Z',
      beforeId: 'c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0',
    },
    limit: 20,
  });

  assert.equal(result.users[0].email, 'farmer@example.com');
  assert.match(capturedSql, /u\.role IN \('farmer', 'buyer'\)/);
  assert.match(capturedSql, /u\.role = \$1/);
  assert.match(capturedSql, /u\.status = \$2/);
  assert.match(capturedSql, /u\.name.*ILIKE \$3.*ESCAPE '!'/s);
  assert.match(capturedSql, /u\.created_at < \$4::timestamptz/s);
  assert.match(capturedSql, /u\.id < \$5::uuid/s);
  assert.match(capturedSql, /to_char\(u\.created_at AT TIME ZONE 'UTC'/);
  assert.match(capturedSql, /ORDER BY u\.created_at DESC, u\.id DESC/);
  assert.match(capturedSql, /LIMIT \$6/);
  assert.deepEqual(capturedValues.slice(0, 3), ['farmer', 'active', '%100!%%']);
  assert.equal(capturedValues[5], 21);
});

test('admin user list model excludes administrators and maps only safe list fields', async () => {
  const model = createAdminUserModel({
    database: {
      async query(sql) {
        assert.match(sql, /role IN \('farmer', 'buyer'\)/);
        assert.doesNotMatch(sql, /\bSELECT\s+\*/i);
        assert.doesNotMatch(sql, /\bpassword\b/i);
        return { rows: [] };
      },
    },
  });
  const result = await model.listUsers({
    search: null,
    role: null,
    status: null,
    cursor: null,
    limit: 20,
  });
  assert.deepEqual(result.users, []);
  assert.equal(result.pagination.hasMore, false);
  assert.equal(result.pagination.nextCursor, null);
});

test('admin user detail model returns a safe projection and rejects administrators as not found', async () => {
  let detailSql = '';
  const model = createAdminUserModel({
    database: {
      async query(sql) {
        detailSql = sql;
        return { rows: [] };
      },
    },
  });
  await assert.rejects(
    () => model.getUser('c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0'),
    (error) => error.status === 404,
  );
  assert.match(detailSql, /role IN \('farmer', 'buyer'\)/);
  assert.doesNotMatch(detailSql, /\bpassword\b/i);
  assert.doesNotMatch(detailSql, /password_version/i);
  assert.doesNotMatch(detailSql, /password_change_required/i);
  assert.doesNotMatch(detailSql, /\bsuspended_by\b/i);
});

test('admin user controller returns list and detail response contracts', async () => {
  const model = {
    async listUsers(filters) {
      assert.equal(filters.role, 'buyer');
      return {
        users: [{
          id: 'c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0',
          name: 'Buyer',
          role: 'buyer',
          status: 'active',
        }],
        pagination: {
          limit: 20,
          hasMore: false,
          nextCursor: null,
        },
      };
    },
    async getUser() {
      return {
        id: 'c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0',
        name: 'Buyer',
        role: 'buyer',
        status: 'active',
      };
    },
  };
  const controller = createAdminUserController({ model });

  const list = await callController(controller.listUsers, {
    query: { role: 'buyer' },
  });
  assert.equal(list.nextError, null);
  assert.equal(list.response.statusCode, 200);
  assert.equal(list.response.body.success, true);
  assert.equal(list.response.body.users[0].role, 'buyer');

  const detail = await callController(controller.getUser, {
    params: { userId: 'c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0' },
  });
  assert.equal(detail.nextError, null);
  assert.equal(detail.response.statusCode, 200);
  assert.equal(detail.response.body.user.status, 'active');

  const invalid = await callController(controller.getUser, {
    params: { userId: 'invalid' },
  });
  assert.equal(invalid.nextError.status, 400);
});

function createRouteApp(adminMiddleware, controller) {
  const app = express();
  app.use(express.json());
  app.use('/api/admin/users', createAdminUserRouter({
    adminMiddleware,
    controller,
  }));
  app.use(errorHandler);
  return app;
}

test('admin user routes use production authentication and requireAdmin for JWT authorization', async () => {
  const jwtSecret = 'phase-11g-c-admin-user-test-secret';
  const adminId = 'c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0';
  const farmerId = 'd0d0d0d0-d0d0-4d0d-8d0d-d0d0d0d0d0d0';
  const buyerId = 'e0e0e0e0-e0e0-4e0e-8e0e-e0e0e0e0e0e0';
  const usersById = new Map([
    [farmerId, {
      id: farmerId,
      name: 'Test Farmer',
      email: 'farmer@example.com',
      role: 'farmer',
      status: 'active',
      password_change_required: false,
      password_version: 0,
    }],
    [buyerId, {
      id: buyerId,
      name: 'Test Buyer',
      email: 'buyer@example.com',
      role: 'buyer',
      status: 'active',
      password_change_required: false,
      password_version: 0,
    }],
    [adminId, {
      id: adminId,
      name: 'Test Administrator',
      email: 'admin@example.com',
      role: 'admin',
      status: 'active',
      password_change_required: false,
      password_version: 0,
    }],
  ]);

  const authenticate = createAuthenticateToken({
    findUser: async (id) => usersById.get(id) || null,
    authorizeAdmin: async (id) => id === adminId,
    environment: { JWT_SECRET: jwtSecret },
  });
  const productionRequireAdmin = createRequireAdminMiddleware(authenticate);

  let listCalls = 0;
  let getCalls = 0;
  let activityCalls = 0;
  let suspendCalls = 0;
  let reactivateCalls = 0;
  const safeController = {
    listUsers(request, response) {
      listCalls += 1;
      response.status(200).json({ success: true, users: [], pagination: {} });
    },
    getUser(request, response) {
      getCalls += 1;
      response.status(200).json({ success: true, user: {} });
    },
    getUserActivity(request, response) {
      activityCalls += 1;
      response.status(200).json({
        success: true,
        userId: request.params.userId,
        summary: {},
        recentActivity: [],
        pagination: { limit: 20, hasMore: false },
      });
    },
    suspendUser(request, response) {
      suspendCalls += 1;
      response.status(200).json({ success: true, userId: request.params.userId });
    },
    reactivateUser(request, response) {
      reactivateCalls += 1;
      response.status(200).json({ success: true, userId: request.params.userId });
    },
  };

  const unauthenticatedApp = createRouteApp(requireAdmin, safeController);
  const missing = await request(unauthenticatedApp).get(`/api/admin/users/${farmerId}/activity`);
  assert.equal(missing.status, 401);
  const missingSuspend = await request(unauthenticatedApp)
    .post(`/api/admin/users/${farmerId}/suspend`)
    .send({ reason: 'policy violation' });
  assert.equal(missingSuspend.status, 401);
  const missingReactivate = await request(unauthenticatedApp)
    .post(`/api/admin/users/${farmerId}/reactivate`);
  assert.equal(missingReactivate.status, 401);
  assert.equal(listCalls, 0);

  for (const role of ['farmer', 'buyer']) {
    const id = role === 'farmer' ? farmerId : buyerId;
    const token = jwt.sign({
      id,
      email: usersById.get(id).email,
      role,
      name: usersById.get(id).name,
      passwordVersion: 0,
    }, jwtSecret, { expiresIn: '1h' });
    const app = createRouteApp(productionRequireAdmin, safeController);
    const deniedSuspend = await request(app)
      .post(`/api/admin/users/${farmerId}/suspend`)
      .send({ reason: 'policy violation' })
      .set('Authorization', `Bearer ${token}`);
    assert.equal(deniedSuspend.status, 403);
    const deniedReactivate = await request(app)
      .post(`/api/admin/users/${farmerId}/reactivate`)
      .set('Authorization', `Bearer ${token}`);
    assert.equal(deniedReactivate.status, 403);
    assert.equal(listCalls, 0);
  }

  const adminToken = jwt.sign({
    id: adminId,
    email: usersById.get(adminId).email,
    role: 'admin',
    name: usersById.get(adminId).name,
    passwordVersion: 0,
  }, jwtSecret, { expiresIn: '1h' });
  const app = createRouteApp(productionRequireAdmin, safeController);

  const list = await request(app)
    .get('/api/admin/users?role=farmer&status=active&limit=20')
    .set('Authorization', `Bearer ${adminToken}`);
  assert.equal(list.status, 200);
  assert.equal(listCalls, 1);

  const detail = await request(app)
    .get(`/api/admin/users/${farmerId}`)
    .set('Authorization', `Bearer ${adminToken}`);
  assert.equal(detail.status, 200);
  assert.equal(getCalls, 1);

  const activity = await request(app)
    .get(`/api/admin/users/${farmerId}/activity?limit=20`)
    .set('Authorization', `Bearer ${adminToken}`);
  assert.equal(activity.status, 200);
  assert.equal(activity.body.userId, farmerId);
  assert.equal(activityCalls, 1);

  const suspend = await request(app)
    .post(`/api/admin/users/${farmerId}/suspend`)
    .send({ reason: 'policy violation' })
    .set('Authorization', `Bearer ${adminToken}`);
  assert.equal(suspend.status, 200);
  assert.equal(suspendCalls, 1);

  const reactivate = await request(app)
    .post(`/api/admin/users/${farmerId}/reactivate`)
    .set('Authorization', `Bearer ${adminToken}`);
  assert.equal(reactivate.status, 200);
  assert.equal(reactivateCalls, 1);

  const farmer = usersById.get(farmerId);
  farmer.status = 'suspended';
  farmer.password_version = 1;
  const oldFarmerToken = jwt.sign({
    id: farmerId,
    email: farmer.email,
    role: 'farmer',
    name: farmer.name,
    passwordVersion: 0,
  }, jwtSecret, { expiresIn: '1h' });
  const suspendedRequest = await request(app)
    .get('/api/admin/users')
    .set('Authorization', `Bearer ${oldFarmerToken}`);
  assert.equal(suspendedRequest.status, 403);

  farmer.status = 'active';
  const reactivatedRequest = await request(app)
    .get('/api/admin/users')
    .set('Authorization', `Bearer ${oldFarmerToken}`);
  assert.equal(reactivatedRequest.status, 401);
});

test('admin user routes reject missing auth and non-admin roles', async () => {
  const safeController = {
    listUsers(request, response) {
      response.status(200).json({ success: true, users: [], pagination: {} });
    },
    getUser(request, response) {
      response.status(200).json({ success: true, user: {} });
    },
    getUserActivity(request, response) {
      response.status(200).json({ success: true, userId: request.params.userId });
    },
    suspendUser(request, response) {
      response.status(200).json({ success: true });
    },
    reactivateUser(request, response) {
      response.status(200).json({ success: true });
    },
  };

  const unauthenticatedApp = createRouteApp(requireAdmin, safeController);
  const missing = await request(unauthenticatedApp).get('/api/admin/users');
  assert.equal(missing.status, 401);

  for (const role of ['farmer', 'buyer']) {
    const guard = createRequireAdminMiddleware((request, response, next) => {
      request.user = { id: 'test-admin', role, password_change_required: false };
      next();
    });
    const app = createRouteApp(guard, safeController);
    const denied = await request(app).get('/api/admin/users');
    assert.equal(denied.status, 403);
  }
});

test('admin user routes permit an authenticated production requireAdmin guard', async () => {
  const guard = createRequireAdminMiddleware((request, response, next) => {
    request.user = {
      id: 'c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0',
      role: 'admin',
      password_change_required: false,
    };
    next();
  });
  const app = createRouteApp(guard, {
    listUsers(request, response) {
      response.status(200).json({
        success: true,
        users: [],
        pagination: { limit: 20, hasMore: false, nextCursor: null },
      });
    },
    getUser(request, response) {
      response.status(200).json({ success: true, user: { id: request.params.userId } });
    },
    getUserActivity(request, response) {
      response.status(200).json({ success: true, userId: request.params.userId });
    },
    suspendUser(request, response) {
      response.status(200).json({ success: true });
    },
    reactivateUser(request, response) {
      response.status(200).json({ success: true });
    },
  });

  const list = await request(app).get('/api/admin/users?role=farmer&status=active&limit=20');
  assert.equal(list.status, 200);

  const detail = await request(app).get('/api/admin/users/c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0');
  assert.equal(detail.status, 200);
});

test('admin user activity limit validation is bounded', () => {
  assert.equal(parseAdminUserActivityLimit(), 20);
  assert.equal(parseAdminUserActivityLimit({ limit: '50' }), 50);
  assert.throws(
    () => parseAdminUserActivityLimit({ limit: '51' }),
    (error) => error.status === 400,
  );
  assert.throws(
    () => parseAdminUserActivityLimit({ limit: '0' }),
    (error) => error.status === 400,
  );
  assert.throws(
    () => parseAdminUserActivityLimit({ unexpected: '1' }),
    (error) => error.status === 400,
  );
});

test('admin user activity rejects invalid UUID and missing or admin targets', async () => {
  const controller = createAdminUserController({
    model: {
      async getUserActivity() {
        throw new Error('should not run');
      },
    },
  });
  const invalid = await callController(controller.getUserActivity, {
    params: { userId: 'invalid' },
    query: {},
  });
  assert.equal(invalid.nextError.status, 400);

  const missingModel = createAdminUserModel({
    database: {
      async query() {
        return { rows: [] };
      },
    },
  });
  await assert.rejects(
    () => missingModel.getUserActivity('c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0', 20),
    (error) => error.status === 404,
  );

  const adminTargetModel = createAdminUserModel({
    database: {
      async query() {
        return { rows: [] };
      },
    },
  });
  await assert.rejects(
    () => adminTargetModel.getUserActivity('c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0', 20),
    (error) => error.status === 404,
  );
});

test('farmer activity returns role-specific aggregates and ordered safe events', async () => {
  let calls = 0;
  const capturedSql = [];
  const capturedValues = [];
  const model = createAdminUserModel({
    database: {
      async query(sql, values) {
        calls += 1;
        capturedSql.push(sql);
        capturedValues.push(values);
        if (calls === 1) {
          return { rows: [{ id: 'd0d0d0d0-d0d0-4d0d-8d0d-d0d0d0d0d0d0', role: 'farmer', status: 'active' }] };
        }
        if (calls === 2) {
          return {
            rows: [{
              total_crops: 4,
              active_crops: 3,
              total_orders: 5,
              pending_orders: 1,
              confirmed_orders: 1,
              shipped_orders: 1,
              delivered_orders: 1,
              cancelled_orders: 1,
              total_conversations: 2,
              total_messages: 6,
            }],
          };
        }
        return {
          rows: [
            { type: 'crop_created', event_id: 'a0a0a0a0-a0a0-4a0a-8a0a-a0a0a0a0a0a0', occurred_at: new Date('2026-11-24T12:30:00.000Z') },
            { type: 'order_placed', event_id: 'b0b0b0b0-b0b0-4b0b-8b0b-b0b0b0b0b0b0', occurred_at: new Date('2026-11-24T11:30:00.000Z') },
          ],
        };
      },
    },
  });

  const result = await model.getUserActivity(
    'd0d0d0d0-d0d0-4d0d-8d0d-d0d0d0d0d0d0',
    20,
  );

  assert.equal(result.summary.totalCrops, 4);
  assert.equal(result.summary.activeCrops, 3);
  assert.equal(result.summary.totalOrders, 5);
  assert.deepEqual(result.summary.ordersByStatus, {
    pending: 1,
    confirmed: 1,
    shipped: 1,
    delivered: 1,
    cancelled: 1,
  });
  assert.equal(result.summary.totalConversations, 2);
  assert.equal(result.summary.totalMessages, 6);
  assert.deepEqual(result.recentActivity.map((event) => event.type), [
    'crop_created',
    'order_placed',
  ]);
  assert.equal(result.pagination.limit, 20);
  assert.equal(result.pagination.hasMore, false);
  assert.match(capturedSql[1], /WHERE farmer_id = \$1/);
  assert.match(capturedSql[2], /FROM crops c/);
  assert.match(capturedSql[2], /ORDER BY occurred_at DESC, event_id DESC/);
  assert.match(capturedSql[2], /LIMIT \$2/);
  assert.deepEqual(capturedValues[2], [
    'd0d0d0d0-d0d0-4d0d-8d0d-d0d0d0d0d0d0',
    21,
  ]);
});

test('buyer activity uses buyer order relationships and empty feed safely', async () => {
  let calls = 0;
  const model = createAdminUserModel({
    database: {
      async query(sql) {
        calls += 1;
        if (calls === 1) {
          return { rows: [{ id: 'e0e0e0e0-e0e0-4e0e-8e0e-e0e0e0e0e0e0', role: 'buyer', status: 'active' }] };
        }
        if (calls === 2) {
          assert.match(sql, /WHERE buyer_id = \$1/);
          return {
            rows: [{
              total_orders: 0,
              pending_orders: 0,
              confirmed_orders: 0,
              shipped_orders: 0,
              delivered_orders: 0,
              cancelled_orders: 0,
              total_conversations: 0,
              total_messages: 0,
            }],
          };
        }
        assert.doesNotMatch(sql, /FROM crops c/);
        assert.match(sql, /WHERE o\.buyer_id = \$1/);
        return { rows: [] };
      },
    },
  });

  const result = await model.getUserActivity(
    'e0e0e0e0-e0e0-4e0e-8e0e-e0e0e0e0e0e0',
    20,
  );
  assert.equal(result.summary.totalOrders, 0);
  assert.equal(result.summary.totalConversations, 0);
  assert.equal(result.summary.totalMessages, 0);
  assert.equal('totalCrops' in result.summary, false);
  assert.deepEqual(result.recentActivity, []);
  assert.equal(result.pagination.hasMore, false);
});

test('activity recent feed detects hasMore with a bounded fetch', async () => {
  let calls = 0;
  const model = createAdminUserModel({
    database: {
      async query(sql, values) {
        calls += 1;
        if (calls === 1) {
          return { rows: [{ id: 'e0e0e0e0-e0e0-4e0e-8e0e-e0e0e0e0e0e0', role: 'buyer', status: 'active' }] };
        }
        if (calls === 2) {
          return {
            rows: [{
              total_orders: 51,
              pending_orders: 51,
              confirmed_orders: 0,
              shipped_orders: 0,
              delivered_orders: 0,
              cancelled_orders: 0,
              total_conversations: 0,
              total_messages: 0,
            }],
          };
        }
        assert.equal(values[1], 51);
        return {
          rows: Array.from({ length: 51 }, (_, index) => ({
            type: 'order_placed',
            event_id: index.toString().padStart(36, '0'),
            occurred_at: new Date('2026-11-24T12:30:00.000Z'),
          })),
        };
      },
    },
  });

  const result = await model.getUserActivity(
    'e0e0e0e0-e0e0-4e0e-8e0e-e0e0e0e0e0e0',
    50,
  );
  assert.equal(result.recentActivity.length, 50);
  assert.equal(result.pagination.limit, 50);
  assert.equal(result.pagination.hasMore, true);
});

test('activity database failures are converted to generic service errors', async () => {
  const model = createAdminUserModel({
    database: {
      async query() {
        throw new Error('SELECT password_hash FROM users');
      },
    },
    logger: { error() {} },
  });
  await assert.rejects(
    () => model.getUserActivity('c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0', 20),
    (error) => (
      error.status === 503
      && !/password_hash|SELECT/i.test(error.message)
    ),
  );
});

test('admin action reason is trimmed and constrained to 3 through 500 characters', () => {
  assert.equal(parseAdminUserActionReason({ reason: '  Policy violation  ' }), 'Policy violation');
  assert.equal(parseAdminUserActionReason({ reason: '🙂'.repeat(500) }), '🙂'.repeat(500));
  for (const body of [undefined, null, [], {}, { reason: '  ' }, { reason: 'ab' }, { reason: 'x'.repeat(501) }, { reason: 123 }]) {
    assert.throws(() => parseAdminUserActionReason(body), (error) => error.status === 400);
  }
  assert.throws(
    () => parseAdminUserActionReason({ reason: '🙂'.repeat(501) }),
    (error) => error.status === 400,
  );
});

test('suspension locks, updates, invalidates JWTs, and audits atomically', async () => {
  const fake = createMutationDatabase();
  const model = createAdminUserModel({ database: fake.database });
  const result = await model.suspendUser({
    userId: 'd0d0d0d0-d0d0-4d0d-8d0d-d0d0d0d0d0d0',
    adminId: 'c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0',
    reason: 'Policy violation',
    requestId: 'r-1',
  });

  assert.deepEqual(fake.getState(), {
    id: 'd0d0d0d0-d0d0-4d0d-8d0d-d0d0d0d0d0d0',
    role: 'farmer',
    status: 'suspended',
    suspended_reason: 'Policy violation',
    suspended_at: new Date('2026-11-24T12:00:00.000Z'),
    suspended_by: 'c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0',
    password_version: 5,
  });
  assert.equal(result.status, 'suspended');
  assert.equal(result.requestId, 'r-1');
  assert.match(fake.queries.find(({ sql }) => sql.includes('FOR UPDATE')).sql, /FOR UPDATE$/);
  assert.equal(fake.audits.length, 1);
  assert.deepEqual(fake.audits[0], {
    adminId: 'c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0',
    targetUserId: 'd0d0d0d0-d0d0-4d0d-8d0d-d0d0d0d0d0d0',
    targetReference: 'd0d0d0d0-d0d0-4d0d-8d0d-d0d0d0d0d0d0',
    action: 'suspend',
    reason: 'Policy violation',
    outcome: 'success',
    requestId: 'r-1',
  });
  assert.deepEqual(
    fake.queries.find(({ sql }) => sql.startsWith('INSERT INTO admin_user_action_audit_logs')).values,
    [
      'c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0',
      'd0d0d0d0-d0d0-4d0d-8d0d-d0d0d0d0d0d0',
      'd0d0d0d0-d0d0-4d0d-8d0d-d0d0d0d0d0d0',
      'suspend',
      'Policy violation',
      'success',
      'r-1',
    ],
  );
});

test('reactivation clears suspension metadata, increments password version, and retains prior reason in audit', async () => {
  const fake = createMutationDatabase({
    target: {
      id: 'e0e0e0e0-e0e0-4e0e-8e0e-e0e0e0e0e0e0',
      role: 'buyer',
      status: 'suspended',
      suspended_reason: 'Prior policy violation',
      suspended_at: new Date('2026-11-20T12:00:00.000Z'),
      suspended_by: 'c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0',
      password_version: 7,
    },
  });
  const model = createAdminUserModel({ database: fake.database });
  const result = await model.reactivateUser({
    userId: 'e0e0e0e0-e0e0-4e0e-8e0e-e0e0e0e0e0e0',
    adminId: 'c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0',
    requestId: 'r-2',
  });

  assert.deepEqual(fake.getState(), {
    id: 'e0e0e0e0-e0e0-4e0e-8e0e-e0e0e0e0e0e0',
    role: 'buyer',
    status: 'active',
    suspended_reason: null,
    suspended_at: null,
    suspended_by: null,
    password_version: 8,
  });
  assert.equal(result.status, 'active');
  assert.equal(result.suspendedAt, null);
  assert.equal(fake.audits[0].action, 'reactivate');
  assert.equal(fake.audits[0].reason, 'Prior policy violation');
  assert.equal(fake.audits[0].requestId, 'r-2');
});

test('missing, admin, and conflicting targets return safe errors and record failure audits', async () => {
  const cases = [
    { target: null, action: 'suspend', status: 404, targetUserId: null },
    {
      target: {
        id: 'd0d0d0d0-d0d0-4d0d-8d0d-d0d0d0d0d0d0',
        role: 'admin',
        status: 'active',
        suspended_reason: null,
        password_version: 0,
      },
      action: 'suspend',
      status: 404,
      targetUserId: 'd0d0d0d0-d0d0-4d0d-8d0d-d0d0d0d0d0d0',
    },
    {
      target: {
        id: 'd0d0d0d0-d0d0-4d0d-8d0d-d0d0d0d0d0d0',
        role: 'farmer',
        status: 'suspended',
        suspended_reason: 'existing',
        password_version: 1,
      },
      action: 'suspend',
      status: 409,
      targetUserId: 'd0d0d0d0-d0d0-4d0d-8d0d-d0d0d0d0d0d0',
    },
    {
      target: {
        id: 'd0d0d0d0-d0d0-4d0d-8d0d-d0d0d0d0d0d0',
        role: 'buyer',
        status: 'active',
        suspended_reason: null,
        password_version: 1,
      },
      action: 'reactivate',
      status: 409,
      targetUserId: 'd0d0d0d0-d0d0-4d0d-8d0d-d0d0d0d0d0d0',
    },
  ];

  for (const item of cases) {
    const fake = createMutationDatabase({ target: item.target });
    const model = createAdminUserModel({ database: fake.database });
    const args = {
      userId: 'd0d0d0d0-d0d0-4d0d-8d0d-d0d0d0d0d0d0',
      adminId: 'c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0',
      requestId: 'r-fail',
      reason: 'Policy violation',
    };
    await assert.rejects(
      () => (item.action === 'suspend' ? model.suspendUser(args) : model.reactivateUser(args)),
      (error) => error.status === item.status,
    );
    assert.equal(fake.audits.length, 1);
    assert.equal(fake.audits[0].outcome, 'failure');
    assert.equal(fake.audits[0].targetUserId, item.targetUserId);
    assert.equal(fake.audits[0].requestId, 'r-fail');
  }
});

test('concurrent suspension attempts serialize on the user row', async () => {
  const fake = createMutationDatabase();
  const model = createAdminUserModel({ database: fake.database });
  const args = {
    userId: 'd0d0d0d0-d0d0-4d0d-8d0d-d0d0d0d0d0d0',
    adminId: 'c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0',
    reason: 'Policy violation',
  };
  const results = await Promise.allSettled([
    model.suspendUser({ ...args, requestId: 'r-concurrent-1' }),
    model.suspendUser({ ...args, requestId: 'r-concurrent-2' }),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected' && result.reason.status === 409).length, 1);
  assert.equal(fake.audits.filter((entry) => entry.outcome === 'success').length, 1);
  assert.equal(fake.audits.filter((entry) => entry.outcome === 'failure').length, 1);
  assert.equal(fake.getState().password_version, 5);

  const suspendedFake = createMutationDatabase({
    target: {
      id: args.userId,
      role: 'farmer',
      status: 'suspended',
      suspended_reason: 'Prior reason',
      suspended_at: new Date('2026-11-20T12:00:00.000Z'),
      suspended_by: args.adminId,
      password_version: 6,
    },
  });
  const suspendedModel = createAdminUserModel({ database: suspendedFake.database });
  const reactivationResults = await Promise.allSettled([
    suspendedModel.reactivateUser({ userId: args.userId, adminId: args.adminId, requestId: 'r-reactivate-1' }),
    suspendedModel.reactivateUser({ userId: args.userId, adminId: args.adminId, requestId: 'r-reactivate-2' }),
  ]);
  assert.equal(reactivationResults.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(reactivationResults.filter((result) => result.status === 'rejected' && result.reason.status === 409).length, 1);
  assert.equal(suspendedFake.audits.filter((entry) => entry.outcome === 'success').length, 1);
  assert.equal(suspendedFake.audits.filter((entry) => entry.outcome === 'failure').length, 1);
  assert.equal(suspendedFake.getState().password_version, 7);
});

test('update and successful-audit failures roll back account changes and do not hide audit failures', async () => {
  const loggedErrors = [];
  const logger = { error(...args) { loggedErrors.push(args); } };
  for (const options of [{ failUpdate: true }, { failSuccessAudit: true }]) {
    const fake = createMutationDatabase(options);
    const model = createAdminUserModel({ database: fake.database, logger });
    await assert.rejects(
      () => model.suspendUser({
        userId: 'd0d0d0d0-d0d0-4d0d-8d0d-d0d0d0d0d0d0',
        adminId: 'c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0',
        reason: 'Policy violation',
        requestId: 'r-failed-write',
      }),
      (error) => error.status === 503 && !/simulated|database/i.test(error.message),
    );
    assert.equal(fake.getState().status, 'active');
    assert.equal(fake.getState().password_version, 4);
    assert.equal(fake.audits.length, 1);
    assert.equal(fake.audits[0].outcome, 'failure');
    const rollbackIndex = fake.queries.findIndex(({ sql }) => sql === 'ROLLBACK');
    const failureAuditIndex = fake.queries.findIndex(({ sql, values }) => (
      sql.startsWith('INSERT INTO admin_user_action_audit_logs')
      && values[5] === 'failure'
    ));
    assert.ok(rollbackIndex >= 0);
    assert.ok(failureAuditIndex > rollbackIndex);
    assert.equal(fake.getReleaseCalls(), 1);
    assert.equal(fake.releaseErrors[0], null);
  }

  const auditFailureFake = createMutationDatabase({
    target: {
      id: 'd0d0d0d0-d0d0-4d0d-8d0d-d0d0d0d0d0d0',
      role: 'farmer',
      status: 'suspended',
      suspended_reason: 'existing',
      password_version: 4,
    },
    failFailureAudit: true,
  });
  const auditFailureModel = createAdminUserModel({
    database: auditFailureFake.database,
    logger,
  });
  await assert.rejects(
    () => auditFailureModel.suspendUser({
      userId: 'd0d0d0d0-d0d0-4d0d-8d0d-d0d0d0d0d0d0',
      adminId: 'c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0',
      reason: 'Policy violation',
      requestId: 'r-audit-failure',
    }),
    (error) => error.status === 503,
  );
  assert.ok(loggedErrors.some((entry) => entry[1]?.operation === 'write_failed_action_audit'));
});

test('failed account rollback skips further SQL and releases the client as broken exactly once', async () => {
  const loggedErrors = [];
  const fake = createMutationDatabase({
    failUpdate: true,
    failOriginalRollback: true,
  });
  const model = createAdminUserModel({
    database: fake.database,
    logger: { error(...args) { loggedErrors.push(args); } },
  });

  await assert.rejects(
    () => model.suspendUser({
      userId: 'd0d0d0d0-d0d0-4d0d-8d0d-d0d0d0d0d0d0',
      adminId: 'c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0',
      reason: 'Policy violation',
      requestId: 'r-rollback-failure',
    }),
    (error) => error.status === 503 && !/simulated|rollback/i.test(error.message),
  );

  const rollbackIndex = fake.queries.findIndex(({ sql }) => sql === 'ROLLBACK');
  assert.ok(rollbackIndex >= 0);
  assert.deepEqual(fake.queries.slice(rollbackIndex + 1), []);
  assert.equal(fake.audits.length, 0);
  assert.equal(fake.getReleaseCalls(), 1);
  assert.equal(fake.releaseErrors.length, 1);
  assert.equal(fake.releaseErrors[0]?.code, 'XX004');
  assert.ok(loggedErrors.some((entry) => entry[1]?.operation === 'rollback_user_status_change'));
});

test('ambiguous commit errors do not create a failure audit', async () => {
  const fake = createMutationDatabase({ failCommitAfterApplying: true });
  const model = createAdminUserModel({ database: fake.database, logger: { error() {} } });

  await assert.rejects(
    () => model.suspendUser({
      userId: 'd0d0d0d0-d0d0-4d0d-8d0d-d0d0d0d0d0d0',
      adminId: 'c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0',
      reason: 'Policy violation',
      requestId: 'r-ambiguous-commit',
    }),
    (error) => error.status === 503,
  );

  assert.equal(fake.audits.length, 1);
  assert.equal(fake.audits[0].outcome, 'success');
  assert.equal(fake.getState().status, 'suspended');
  assert.equal(fake.getReleaseCalls(), 1);
  assert.equal(fake.releaseErrors[0], null);
});

test('failed failure-audit rollback also destroys the client without issuing more SQL', async () => {
  const fake = createMutationDatabase({
    target: {
      id: 'd0d0d0d0-d0d0-4d0d-8d0d-d0d0d0d0d0d0',
      role: 'farmer',
      status: 'suspended',
      suspended_reason: 'existing',
      password_version: 4,
    },
    failFailureAudit: true,
    failFailureAuditRollback: true,
  });
  const model = createAdminUserModel({ database: fake.database, logger: { error() {} } });

  await assert.rejects(
    () => model.suspendUser({
      userId: 'd0d0d0d0-d0d0-4d0d-8d0d-d0d0d0d0d0d0',
      adminId: 'c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0',
      reason: 'Policy violation',
      requestId: 'r-failure-audit-rollback',
    }),
    (error) => error.status === 503,
  );

  const rollbackIndex = fake.queries.findIndex(({ sql }) => sql === 'ROLLBACK');
  assert.equal(fake.queries.slice(rollbackIndex + 1).some(({ sql }) => sql === 'COMMIT'), false);
  assert.equal(fake.getReleaseCalls(), 1);
  assert.equal(fake.releaseErrors[0]?.code, 'XX004');
});

test('suspension controller validates UUID/reason and uses authenticated admin identity', async () => {
  let actionArgs;
  const controller = createAdminUserController({
    model: {
      async suspendUser(args) {
        actionArgs = args;
        return { userId: args.userId, status: 'suspended' };
      },
    },
  });
  const invalidUuid = await callController(controller.suspendUser, {
    params: { userId: 'bad-id' },
    body: { reason: 'valid reason' },
    user: { id: 'authorized-admin-id' },
  });
  assert.equal(invalidUuid.nextError.status, 400);

  const invalidReason = await callController(controller.suspendUser, {
    params: { userId: 'd0d0d0d0-d0d0-4d0d-8d0d-d0d0d0d0d0d0' },
    body: { reason: 'x' },
    user: { id: 'authorized-admin-id' },
  });
  assert.equal(invalidReason.nextError.status, 400);

  const result = await callController(controller.suspendUser, {
    params: { userId: 'd0d0d0d0-d0d0-4d0d-8d0d-d0d0d0d0d0d0' },
    body: { reason: '  valid reason  ', adminId: 'attacker-controlled' },
    user: { id: 'authorized-admin-id' },
  });
  assert.equal(result.nextError, null);
  assert.equal(actionArgs.adminId, 'authorized-admin-id');
  assert.equal(actionArgs.reason, 'valid reason');
  assert.match(actionArgs.requestId, /^[0-9a-f-]{36}$/i);
  assert.equal(result.response.body.status, 'suspended');
});
