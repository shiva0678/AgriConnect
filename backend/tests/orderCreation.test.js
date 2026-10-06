import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import app from '../server.js';
import { pool } from '../config/db.js';

async function createUser(overrides = {}) {
  const email = `order-${randomUUID()}@example.com`;
  const payload = {
    name: 'Order User',
    email,
    phone: '9876543210',
    password: 'password123',
    role: 'buyer',
    ...overrides,
  };

  const registerResponse = await request(app)
    .post('/api/auth/register')
    .send(payload);

  assert.equal(registerResponse.status, 201);
  return { ...payload, id: registerResponse.body.user.id };
}

async function loginUser(email, password) {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email, password });

  assert.equal(response.status, 200);
  return response.body.token;
}

async function createCrop(token, overrides = {}) {
  const payload = {
    name: `Order Crop ${randomUUID().slice(0, 6)}`,
    category: 'Vegetables',
    description: 'Fresh produce for order tests',
    price: 40,
    unit: 'kg',
    quantity: 10,
    location: 'Nashik',
    harvest_date: '2026-10-05',
    ...overrides,
  };

  const response = await request(app)
    .post('/api/crops')
    .set('Authorization', `Bearer ${token}`)
    .send(payload);

  assert.equal(response.status, 201);
  return response.body.crop;
}

test('POST /api/orders rejects unauthenticated requests', async () => {
  const response = await request(app)
    .post('/api/orders')
    .send({ cropId: randomUUID(), quantity: 2 });

  assert.equal(response.status, 401);
  assert.equal(response.body.success, false);
  assert.match(response.body.message, /token|unauthorized/i);
});

test('POST /api/orders rejects farmers', async () => {
  const farmer = await createUser({ role: 'farmer', email: `farmer-${randomUUID()}@example.com` });
  const token = await loginUser(farmer.email, farmer.password);
  const crop = await createCrop(token);

  const response = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${token}`)
    .send({ cropId: crop.id, quantity: 1 });

  assert.equal(response.status, 403);
  assert.equal(response.body.success, false);
  assert.match(response.body.message, /buyer/i);
});

test('POST /api/orders creates a pending order for a buyer with a price snapshot', async () => {
  const farmer = await createUser({ role: 'farmer', email: `farmer-${randomUUID()}@example.com` });
  const farmerToken = await loginUser(farmer.email, farmer.password);
  const crop = await createCrop(farmerToken, { price: 40, quantity: 10, unit: 'kg' });

  const buyer = await createUser({ role: 'buyer', email: `buyer-${randomUUID()}@example.com` });
  const buyerToken = await loginUser(buyer.email, buyer.password);

  const response = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${buyerToken}`)
    .send({
      cropId: crop.id,
      quantity: 4,
      buyer_id: '11111111-1111-1111-1111-111111111111',
      farmer_id: '22222222-2222-2222-2222-222222222222',
      price: 999,
      totalAmount: 9999,
      status: 'confirmed',
    });

  assert.equal(response.status, 201);
  assert.equal(response.body.success, true);
  assert.equal(response.body.message, 'Order created successfully');
  assert.equal(response.body.order.buyer_id, buyer.id);
  assert.equal(response.body.order.farmer_id, farmer.id);
  assert.equal(response.body.order.crop_id, crop.id);
  assert.equal(response.body.order.quantity, 4);
  assert.equal(response.body.order.unit, 'kg');
  assert.equal(Number(response.body.order.unit_price), 40);
  assert.equal(Number(response.body.order.total_amount), 160);
  assert.equal(response.body.order.status, 'pending');

  const cropAfterOrder = await pool.query('SELECT quantity, status FROM crops WHERE id = $1', [crop.id]);
  assert.equal(Number(cropAfterOrder.rows[0].quantity), 6);
  assert.equal(cropAfterOrder.rows[0].status, 'available');
});

test('POST /api/orders rejects invalid crop id, invalid quantity, unavailable crop, and overstocked requests', async () => {
  const farmer = await createUser({ role: 'farmer', email: `farmer-${randomUUID()}@example.com` });
  const farmerToken = await loginUser(farmer.email, farmer.password);
  const crop = await createCrop(farmerToken, { price: 20, quantity: 5, unit: 'kg' });

  const buyer = await createUser({ role: 'buyer', email: `buyer-${randomUUID()}@example.com` });
  const buyerToken = await loginUser(buyer.email, buyer.password);

  const invalidUuidResponse = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${buyerToken}`)
    .send({ cropId: 'not-a-uuid', quantity: 2 });
  assert.equal(invalidUuidResponse.status, 400);

  const zeroQResponse = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${buyerToken}`)
    .send({ cropId: crop.id, quantity: 0 });
  assert.equal(zeroQResponse.status, 400);

  const tooBigResponse = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${buyerToken}`)
    .send({ cropId: crop.id, quantity: 99 });
  assert.equal(tooBigResponse.status, 409);

  await pool.query('UPDATE crops SET status = $1 WHERE id = $2', ['sold_out', crop.id]);

  const unavailableResponse = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${buyerToken}`)
    .send({ cropId: crop.id, quantity: 1 });
  assert.equal(unavailableResponse.status, 409);

  const missingResponse = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${buyerToken}`)
    .send({ cropId: randomUUID(), quantity: 1 });
  assert.equal(missingResponse.status, 404);
});

test('POST /api/orders rolls back failed transactions and keeps crop quantity unchanged', async () => {
  const farmer = await createUser({ role: 'farmer', email: `farmer-${randomUUID()}@example.com` });
  const farmerToken = await loginUser(farmer.email, farmer.password);
  const crop = await createCrop(farmerToken, { price: 30, quantity: 5, unit: 'kg' });

  const buyer = await createUser({ role: 'buyer', email: `buyer-${randomUUID()}@example.com` });
  const buyerToken = await loginUser(buyer.email, buyer.password);

  const response = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${buyerToken}`)
    .send({ cropId: crop.id, quantity: 8 });

  assert.equal(response.status, 409);

  const cropAfterFailure = await pool.query('SELECT quantity, status FROM crops WHERE id = $1', [crop.id]);
  assert.equal(Number(cropAfterFailure.rows[0].quantity), 5);
  assert.equal(cropAfterFailure.rows[0].status, 'available');

  const orders = await pool.query('SELECT COUNT(*)::int AS total FROM orders WHERE buyer_id = $1', [buyer.id]);
  assert.equal(Number(orders.rows[0].total), 0);
});
