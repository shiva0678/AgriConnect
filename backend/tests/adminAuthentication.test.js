import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import {
  createChangeAuthenticatedPasswordController,
  createLoginUserController,
} from '../controllers/authController.js';
import {
  createAuthenticateToken,
  createRequireAdminMiddleware,
} from '../middleware/authMiddleware.js';

const JWT_SECRET = 'phase-11c-test-secret';
const ADMIN_ID = 'e7bb5928-7190-491b-8b2f-92a5caf08fa5';

function createResponse() {
  return {
    statusCode: null,
    body: null,
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

async function callController(controller, request) {
  const response = createResponse();
  let nextError = null;
  await controller(request, response, (error) => {
    nextError = error || null;
  });
  return { response, nextError };
}

async function callMiddleware(middleware, request) {
  let nextError = null;
  await middleware(request, {}, (error) => {
    nextError = error || null;
  });
  return nextError;
}

function makeUser(overrides = {}) {
  return {
    id: ADMIN_ID,
    name: 'Test Admin',
    email: 'admin@example.com',
    role: 'admin',
    status: 'active',
    password_change_required: false,
    password_version: 0,
    password: 'stored-hash',
    ...overrides,
  };
}

function signToken(user, overrides = {}) {
  return jwt.sign({
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
    passwordVersion: user.password_version,
    ...overrides,
  }, JWT_SECRET, { expiresIn: '1h' });
}

function createAuthMiddleware({ user, authorized = true } = {}) {
  return createAuthenticateToken({
    findUser: async () => user || null,
    authorizeAdmin: async () => authorized,
    environment: { JWT_SECRET },
  });
}

test('authorized active administrator login returns a role-bearing JWT without secrets', async () => {
  const user = makeUser({ password_change_required: true });
  const controller = createLoginUserController({
    findUser: async () => user,
    authorizeAdmin: async () => true,
    comparePassword: async () => true,
    environment: { JWT_SECRET },
  });
  const { response, nextError } = await callController(controller, {
    body: { email: user.email, password: 'temporary-password' },
  });

  assert.equal(nextError, null);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.user.role, 'admin');
  assert.equal(response.body.user.requiresPasswordChange, true);
  assert.equal(response.body.user.password, undefined);
  assert.equal(response.body.password, undefined);
  assert.equal(jwt.verify(response.body.token, JWT_SECRET).role, 'admin');
});

test('administrator login rejects invalid credentials, unauthorized email, and suspended accounts', async () => {
  const user = makeUser();
  const invalidCredentials = createLoginUserController({
    findUser: async () => user,
    authorizeAdmin: async () => true,
    comparePassword: async () => false,
    environment: { JWT_SECRET },
  });
  const invalidResult = await callController(invalidCredentials, {
    body: { email: user.email, password: 'wrong-password' },
  });
  assert.equal(invalidResult.nextError.status, 401);

  const unauthorized = createLoginUserController({
    findUser: async () => user,
    authorizeAdmin: async () => false,
    comparePassword: async () => true,
    environment: { JWT_SECRET },
  });
  const unauthorizedResult = await callController(unauthorized, {
    body: { email: user.email, password: 'temporary-password' },
  });
  assert.equal(unauthorizedResult.nextError.status, 403);

  const suspended = createLoginUserController({
    findUser: async () => ({ ...user, status: 'suspended' }),
    authorizeAdmin: async () => true,
    comparePassword: async () => true,
    environment: { JWT_SECRET },
  });
  const suspendedResult = await callController(suspended, {
    body: { email: user.email, password: 'temporary-password' },
  });
  assert.equal(suspendedResult.nextError.status, 403);
});

test('database-backed JWT authentication rejects invalid, expired, changed-role, suspended, and unauthorized sessions', async () => {
  const user = makeUser();
  const middleware = createAuthMiddleware({ user });
  const token = signToken(user);

  const invalid = await callMiddleware(middleware, {
    headers: { authorization: 'Bearer invalid' },
  });
  assert.equal(invalid.status, 401);

  const expiredToken = jwt.sign({
    id: user.id,
    role: user.role,
    passwordVersion: 0,
  }, JWT_SECRET, { expiresIn: '-1s' });
  const expired = await callMiddleware(middleware, {
    headers: { authorization: `Bearer ${expiredToken}` },
  });
  assert.equal(expired.status, 401);

  const roleMismatch = await callMiddleware(middleware, {
    headers: { authorization: `Bearer ${signToken(user, { role: 'buyer' })}` },
  });
  assert.equal(roleMismatch.status, 401);

  const suspended = await callMiddleware(createAuthMiddleware({
    user: { ...user, status: 'suspended' },
  }), {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(suspended.status, 403);

  const unauthorized = await callMiddleware(createAuthMiddleware({
    user,
    authorized: false,
  }), {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(unauthorized.status, 403);
});

test('temporary administrator JWT is limited to GET /me and POST password change', async () => {
  const user = makeUser({ password_change_required: true });
  const middleware = createAuthMiddleware({ user });
  const token = signToken(user);
  const authorization = { authorization: `Bearer ${token}` };

  const allowedMe = { method: 'GET', originalUrl: '/api/auth/me', headers: authorization };
  assert.equal(await callMiddleware(middleware, allowedMe), null);
  assert.equal(allowedMe.user.password_change_required, true);

  const allowedChange = {
    method: 'POST',
    originalUrl: '/api/auth/change-password',
    headers: authorization,
  };
  assert.equal(await callMiddleware(middleware, allowedChange), null);

  const blockedPatch = {
    method: 'PATCH',
    originalUrl: '/api/auth/me',
    headers: authorization,
  };
  assert.equal((await callMiddleware(middleware, blockedPatch)).status, 403);

  const blockedAdminApi = {
    method: 'GET',
    originalUrl: '/api/admin',
    headers: authorization,
  };
  assert.equal((await callMiddleware(middleware, blockedAdminApi)).status, 403);
});

test('requireAdmin rejects farmer and buyer accounts and permits an authenticated admin', async () => {
  for (const role of ['farmer', 'buyer']) {
    const middleware = createRequireAdminMiddleware((request, response, next) => {
      request.user = { id: ADMIN_ID, role, password_change_required: false };
      next();
    });
    const error = await callMiddleware(middleware, {});
    assert.equal(error.status, 403);
  }

  const adminMiddleware = createRequireAdminMiddleware((request, response, next) => {
    request.user = {
      id: ADMIN_ID,
      role: 'admin',
      password_change_required: false,
    };
    next();
  });
  assert.equal(await callMiddleware(adminMiddleware, {}), null);
});

test('password change is validated, advances password version, and invalidates the old JWT', async () => {
  const oldPassword = 'temporary-password-1!';
  const newPassword = 'new-secure-password-2026!';
  const oldHash = await bcrypt.hash(oldPassword, 4);
  let storedUser = makeUser({
    password: oldHash,
    password_change_required: true,
  });
  const handler = createChangeAuthenticatedPasswordController({
    findUserById: async () => ({ id: storedUser.id, email: storedUser.email }),
    findUserByEmail: async () => storedUser,
    changePassword: async (id, passwordHash) => {
      if (!storedUser.password_change_required || id !== storedUser.id) return null;
      storedUser = {
        ...storedUser,
        password: passwordHash,
        password_change_required: false,
        password_version: storedUser.password_version + 1,
      };
      return storedUser;
    },
    environment: { JWT_SECRET },
  });

  const shortPassword = await callController(handler, {
    user: { id: ADMIN_ID, role: 'admin' },
    body: { currentPassword: oldPassword, newPassword: 'short' },
  });
  assert.equal(shortPassword.nextError.status, 400);
  const reusedPassword = await callController(handler, {
    user: { id: ADMIN_ID, role: 'admin' },
    body: { currentPassword: oldPassword, newPassword: oldPassword },
  });
  assert.equal(reusedPassword.nextError.status, 400);
  const oversizedPassword = await callController(handler, {
    user: { id: ADMIN_ID, role: 'admin' },
    body: { currentPassword: oldPassword, newPassword: '🍎'.repeat(19) },
  });
  assert.equal(oversizedPassword.nextError.status, 400);

  const request = {
    user: { id: ADMIN_ID, role: 'admin' },
    body: { currentPassword: oldPassword, newPassword },
  };
  const oldToken = signToken(storedUser);
  const { response, nextError } = await callController(handler, request);
  assert.equal(nextError, null);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.user.requiresPasswordChange, false);
  assert.equal(response.body.user.password, undefined);
  assert.equal(jwt.verify(response.body.token, JWT_SECRET).passwordVersion, 1);
  assert.equal(storedUser.password_change_required, false);
  assert.equal(storedUser.password_version, 1);

  const auth = createAuthMiddleware({ user: storedUser });
  const oldSessionError = await callMiddleware(auth, {
    headers: { authorization: `Bearer ${oldToken}` },
  });
  assert.equal(oldSessionError.status, 401);

  const freshSession = { headers: { authorization: `Bearer ${response.body.token}` } };
  assert.equal(await callMiddleware(auth, freshSession), null);
});
