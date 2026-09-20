import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import app from '../server.js';

function makePayload(overrides = {}) {
  const email = `user-${randomUUID()}@example.com`;
  return {
    name: 'Test Farmer',
    email,
    phone: '9876543210',
    password: 'password123',
    role: 'farmer',
    ...overrides,
  };
}

test('POST /api/auth/register creates a user with valid data', async () => {
  const payload = makePayload();
  const response = await request(app)
    .post('/api/auth/register')
    .send(payload);

  assert.equal(response.status, 201);
  assert.equal(response.body.success, true);
  assert.equal(response.body.message, 'User registered successfully');
  assert.equal(response.body.user.name, payload.name);
  assert.equal(response.body.user.email, payload.email);
  assert.equal(response.body.user.role, payload.role);
  assert.equal(response.body.user.password, undefined);
});

test('POST /api/auth/register rejects duplicate email', async () => {
  const payload = makePayload();
  await request(app)
    .post('/api/auth/register')
    .send(payload);

  const response = await request(app)
    .post('/api/auth/register')
    .send(payload);

  assert.equal(response.status, 409);
  assert.equal(response.body.success, false);
  assert.match(response.body.message, /already exists|registered/i);
});

test('POST /api/auth/register rejects invalid email', async () => {
  const payload = makePayload({ email: 'bad-email' });
  const response = await request(app)
    .post('/api/auth/register')
    .send(payload);

  assert.equal(response.status, 400);
  assert.equal(response.body.success, false);
  assert.match(response.body.message, /email/i);
});

test('POST /api/auth/register rejects invalid role', async () => {
  const payload = makePayload({ role: 'admin' });
  const response = await request(app)
    .post('/api/auth/register')
    .send(payload);

  assert.equal(response.status, 400);
  assert.equal(response.body.success, false);
  assert.match(response.body.message, /farmer|buyer/i);
});

test('POST /api/auth/register rejects short password', async () => {
  const payload = makePayload({ password: 'short' });
  const response = await request(app)
    .post('/api/auth/register')
    .send(payload);

  assert.equal(response.status, 400);
  assert.equal(response.body.success, false);
  assert.match(response.body.message, /password/i);
});

test('POST /api/auth/register rejects missing required fields', async () => {
  const response = await request(app)
    .post('/api/auth/register')
    .send({
      name: 'Missing Data',
      email: 'test@example.com',
    });

  assert.equal(response.status, 400);
  assert.equal(response.body.success, false);
  assert.match(response.body.message, /required|missing/i);
});
