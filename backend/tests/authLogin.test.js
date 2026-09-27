import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import app from '../server.js';

function uniqueUser(overrides = {}) {
  const email = `login-${randomUUID()}@example.com`;
  return {
    name: 'Login User',
    email,
    phone: '9876543210',
    password: 'password123',
    role: 'farmer',
    ...overrides,
  };
}

test('POST /api/auth/login logs in with correct credentials', async () => {
  const payload = uniqueUser();

  await request(app)
    .post('/api/auth/register')
    .send(payload);

  const response = await request(app)
    .post('/api/auth/login')
    .send({
      email: payload.email,
      password: payload.password,
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.message, 'Login successful');
  assert.equal(response.body.user.email, payload.email);
  assert.equal(response.body.user.password, undefined);
  assert.match(response.body.token, /\S+/);
});

test('POST /api/auth/login rejects wrong password', async () => {
  const payload = uniqueUser();

  await request(app)
    .post('/api/auth/register')
    .send(payload);

  const response = await request(app)
    .post('/api/auth/login')
    .send({
      email: payload.email,
      password: 'wrongpassword',
    });

  assert.equal(response.status, 401);
  assert.equal(response.body.success, false);
  assert.match(response.body.message, /invalid|credentials/i);
});

test('POST /api/auth/login rejects nonexistent email', async () => {
  const response = await request(app)
    .post('/api/auth/login')
    .send({
      email: 'missing-user@example.com',
      password: 'password123',
    });

  assert.equal(response.status, 401);
  assert.equal(response.body.success, false);
  assert.match(response.body.message, /invalid|credentials/i);
});

test('GET /api/auth/me rejects missing token', async () => {
  const response = await request(app)
    .get('/api/auth/me');

  assert.equal(response.status, 401);
  assert.equal(response.body.success, false);
  assert.match(response.body.message, /token|unauthorized/i);
});

test('GET /api/auth/me rejects invalid token', async () => {
  const response = await request(app)
    .get('/api/auth/me')
    .set('Authorization', 'Bearer invalid.token.value');

  assert.equal(response.status, 401);
  assert.equal(response.body.success, false);
  assert.match(response.body.message, /token|unauthorized/i);
});

test('GET /api/auth/me returns the authenticated user from the database', async () => {
  const payload = uniqueUser({ role: 'buyer' });

  await request(app)
    .post('/api/auth/register')
    .send(payload);

  const loginResponse = await request(app)
    .post('/api/auth/login')
    .send({
      email: payload.email,
      password: payload.password,
    });

  const response = await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${loginResponse.body.token}`);

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.user.email, payload.email);
  assert.equal(response.body.user.name, payload.name);
  assert.equal(response.body.user.phone, payload.phone);
  assert.equal(response.body.user.role, payload.role);
  assert.ok(response.body.user.created_at);
  assert.equal(response.body.user.password, undefined);
  assert.equal(response.body.user.password_hash, undefined);
});

test('PATCH /api/auth/me persists editable profile fields', async () => {
  const payload = uniqueUser({ role: 'farmer' });
  await request(app).post('/api/auth/register').send(payload);

  const loginResponse = await request(app)
    .post('/api/auth/login')
    .send({ email: payload.email, password: payload.password });
  const authorization = `Bearer ${loginResponse.body.token}`;
  const updatedProfile = {
    name: 'Updated Farmer',
    email: payload.email,
    phone: '9123456789',
    farm: 'Green Valley Farm',
    location: 'Nashik',
  };

  const updateResponse = await request(app)
    .patch('/api/auth/me')
    .set('Authorization', authorization)
    .send(updatedProfile);
  const currentUserResponse = await request(app)
    .get('/api/auth/me')
    .set('Authorization', authorization);

  assert.equal(updateResponse.status, 200);
  assert.equal(updateResponse.body.user.name, updatedProfile.name);
  assert.equal(updateResponse.body.user.phone, updatedProfile.phone);
  assert.equal(updateResponse.body.user.farm, updatedProfile.farm);
  assert.equal(updateResponse.body.user.location, updatedProfile.location);
  assert.equal(currentUserResponse.status, 200);
  assert.equal(currentUserResponse.body.user.name, updatedProfile.name);
  assert.equal(currentUserResponse.body.user.phone, updatedProfile.phone);
  assert.equal(currentUserResponse.body.user.farm, updatedProfile.farm);
  assert.equal(currentUserResponse.body.user.location, updatedProfile.location);
  assert.equal(currentUserResponse.body.user.password, undefined);
});
