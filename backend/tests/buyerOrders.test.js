import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import app from '../server.js';
import { pool } from '../config/db.js';

async function createUser(overrides = {}) {
  const email = `buyer-orders-${randomUUID()}@example.com`;
  const payload = {
    name: 'Order Buyer',
    email,
    phone: '9876543210',
    password: 'password123',
    role: 'buyer',
    ...overrides,
  };

  const response = await request(app)
    .post('/api/auth/register')
    .send(payload);

  assert.equal(response.status, 201);
  return { ...payload, id: response.body.user.id };
}

async function createFarmer(overrides = {}) {
  const email = `order-farmer-${randomUUID()}@example.com`;
  const payload = {
    name: 'Order Farmer',
    email,
    phone: '9876543210',
    password: 'password123',
    role: 'farmer',
    ...overrides,
  };

  const response = await request(app)
    .post('/api/auth/register')
    .send(payload);

  assert.equal(response.status, 201);
  return { ...payload, id: response.body.user.id };
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
    name: `History Crop ${randomUUID().slice(0, 6)}`,
    category: 'Vegetables',
    description: 'Fresh crop for order history tests',
    price: 40,
    unit: 'kg',
    quantity: 25,
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

async function placeOrder(token, cropId, quantity) {
  const response = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${token}`)
    .send({ cropId, quantity });

  assert.equal(response.status, 201);
  return response.body.order;
}

test('GET /api/orders rejects unauthenticated requests', async () => {
  const response = await request(app).get('/api/orders');

  assert.equal(response.status, 401);
  assert.equal(response.body.success, false);
});

test('GET /api/orders rejects farmers', async () => {
  const farmer = await createFarmer({ email: `farmer-${randomUUID()}@example.com` });
  const token = await loginUser(farmer.email, farmer.password);

  const response = await request(app)
    .get('/api/orders')
    .set('Authorization', `Bearer ${token}`);

  assert.equal(response.status, 403);
  assert.equal(response.body.success, false);
});

test('GET /api/orders returns buyer orders newest first and default pagination', async () => {
  const buyer = await createUser({ email: `buyer-${randomUUID()}@example.com` });
  const buyerToken = await loginUser(buyer.email, buyer.password);
  const farmer = await createFarmer({ email: `farmer-${randomUUID()}@example.com` });
  const farmerToken = await loginUser(farmer.email, farmer.password);

  const cropOne = await createCrop(farmerToken, { name: `Alpha ${randomUUID().slice(0, 4)}`, price: 40, quantity: 30 });
  const cropTwo = await createCrop(farmerToken, { name: `Beta ${randomUUID().slice(0, 4)}`, price: 50, quantity: 20 });

  const orderOne = await placeOrder(buyerToken, cropOne.id, 2);
  const orderTwo = await placeOrder(buyerToken, cropTwo.id, 3);

  const response = await request(app)
    .get('/api/orders')
    .set('Authorization', `Bearer ${buyerToken}`);

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.orders.length, 2);
  assert.equal(response.body.pagination.page, 1);
  assert.equal(response.body.pagination.limit, 10);
  assert.equal(response.body.pagination.total, 2);
  assert.equal(response.body.pagination.totalPages, 1);
  assert.equal(response.body.orders[0].id, orderTwo.id);
  assert.equal(response.body.orders[1].id, orderOne.id);
  assert.equal(response.body.orders[0].crop_id, cropTwo.id);
  assert.equal(response.body.orders[0].unit_price, 50);
  assert.equal(response.body.orders[0].total_amount, 150);
  assert.equal(response.body.orders[0].status, 'pending');
  assert.ok(response.body.orders[0].crop_name);
  assert.ok(response.body.orders[0].crop_category);
  assert.ok(response.body.orders[0].crop_location);
  assert.equal(response.body.orders[0].farmer_name, 'Order Farmer');
  assert.equal(response.body.orders[0].password, undefined);
});

test('GET /api/orders excludes another buyer orders and respects buyer-only ownership', async () => {
  const buyerA = await createUser({ email: `buyer-a-${randomUUID()}@example.com` });
  const buyerB = await createUser({ email: `buyer-b-${randomUUID()}@example.com` });
  const buyerAToken = await loginUser(buyerA.email, buyerA.password);
  const buyerBToken = await loginUser(buyerB.email, buyerB.password);
  const farmer = await createFarmer({ email: `farmer-${randomUUID()}@example.com` });
  const farmerToken = await loginUser(farmer.email, farmer.password);

  const crop = await createCrop(farmerToken, { name: `Owner Crop ${randomUUID().slice(0, 4)}`, price: 30, quantity: 20 });

  await placeOrder(buyerAToken, crop.id, 1);
  await placeOrder(buyerBToken, crop.id, 2);

  const response = await request(app)
    .get(`/api/orders?buyer_id=${buyerB.id}`)
    .set('Authorization', `Bearer ${buyerAToken}`);

  assert.equal(response.status, 200);
  assert.equal(response.body.orders.length, 1);
  assert.equal(response.body.orders[0].buyer_id, buyerA.id);
  assert.notEqual(response.body.orders[0].buyer_id, buyerB.id);
  assert.equal(response.body.pagination.total, 1);
});

test('GET /api/orders returns empty array and valid pagination for buyers with no orders', async () => {
  const buyer = await createUser({ email: `buyer-empty-${randomUUID()}@example.com` });
  const token = await loginUser(buyer.email, buyer.password);

  const response = await request(app)
    .get('/api/orders')
    .set('Authorization', `Bearer ${token}`);

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.orders, []);
  assert.equal(response.body.pagination.total, 0);
  assert.equal(response.body.pagination.totalPages, 0);
  assert.equal(response.body.pagination.page, 1);
});

test('GET /api/orders supports pagination and limit cap', async () => {
  const buyer = await createUser({ email: `buyer-page-${randomUUID()}@example.com` });
  const token = await loginUser(buyer.email, buyer.password);
  const farmer = await createFarmer({ email: `farmer-page-${randomUUID()}@example.com` });
  const farmerToken = await loginUser(farmer.email, farmer.password);

  const crops = [];
  for (let index = 0; index < 12; index += 1) {
    crops.push(await createCrop(farmerToken, { name: `Page Crop ${index}-${randomUUID().slice(0,4)}`, price: 10 + index, quantity: 50 }));
  }

  for (const crop of crops) {
    await placeOrder(token, crop.id, 1);
  }

  const firstPage = await request(app)
    .get('/api/orders?page=1&limit=5')
    .set('Authorization', `Bearer ${token}`);

  assert.equal(firstPage.status, 200);
  assert.equal(firstPage.body.orders.length, 5);
  assert.equal(firstPage.body.pagination.page, 1);
  assert.equal(firstPage.body.pagination.limit, 5);
  assert.equal(firstPage.body.pagination.total, 12);
  assert.equal(firstPage.body.pagination.totalPages, 3);

  const secondPage = await request(app)
    .get('/api/orders?page=2&limit=5')
    .set('Authorization', `Bearer ${token}`);

  assert.equal(secondPage.status, 200);
  assert.equal(secondPage.body.orders.length, 5);
  assert.equal(secondPage.body.pagination.page, 2);

  const capped = await request(app)
    .get('/api/orders?page=1&limit=999')
    .set('Authorization', `Bearer ${token}`);

  assert.equal(capped.status, 200);
  assert.equal(capped.body.pagination.limit, 50);
});

test('GET /api/orders rejects invalid page and limit values', async () => {
  const buyer = await createUser({ email: `buyer-invalid-${randomUUID()}@example.com` });
  const token = await loginUser(buyer.email, buyer.password);

  const invalidPage = await request(app)
    .get('/api/orders?page=0')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(invalidPage.status, 400);

  const invalidLimit = await request(app)
    .get('/api/orders?limit=0')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(invalidLimit.status, 400);
});

test('GET /api/orders supports status filtering and rejects invalid statuses', async () => {
  const buyer = await createUser({ email: `buyer-status-${randomUUID()}@example.com` });
  const token = await loginUser(buyer.email, buyer.password);
  const farmer = await createFarmer({ email: `farmer-status-${randomUUID()}@example.com` });
  const farmerToken = await loginUser(farmer.email, farmer.password);

  const crop = await createCrop(farmerToken, { name: `Status Crop ${randomUUID().slice(0, 4)}`, price: 25, quantity: 40 });
  const order = await placeOrder(token, crop.id, 3);

  const filtered = await request(app)
    .get('/api/orders?status=pending')
    .set('Authorization', `Bearer ${token}`);

  assert.equal(filtered.status, 200);
  assert.equal(filtered.body.orders.length, 1);
  assert.equal(filtered.body.orders[0].id, order.id);

  const invalidStatus = await request(app)
    .get('/api/orders?status=processing')
    .set('Authorization', `Bearer ${token}`);

  assert.equal(invalidStatus.status, 400);
});

test('GET /api/orders preserves historical order price snapshot', async () => {
  const buyer = await createUser({ email: `buyer-history-${randomUUID()}@example.com` });
  const token = await loginUser(buyer.email, buyer.password);
  const farmer = await createFarmer({ email: `farmer-history-${randomUUID()}@example.com` });
  const farmerToken = await loginUser(farmer.email, farmer.password);

  const crop = await createCrop(farmerToken, { name: `History Snapshot ${randomUUID().slice(0,4)}`, price: 40, quantity: 30 });
  const order = await placeOrder(token, crop.id, 10);

  await pool.query('UPDATE crops SET price = 50 WHERE id = $1', [crop.id]);

  const response = await request(app)
    .get('/api/orders')
    .set('Authorization', `Bearer ${token}`);

  assert.equal(response.status, 200);
  assert.equal(Number(response.body.orders[0].unit_price), 40);
  assert.equal(Number(response.body.orders[0].total_amount), 400);
  assert.equal(Number(response.body.orders[0].quantity), 10);
  assert.equal(response.body.orders[0].crop_id, crop.id);
});

test('GET /api/orders does not expose sensitive user info', async () => {
  const buyer = await createUser({ email: `buyer-sensitive-${randomUUID()}@example.com` });
  const token = await loginUser(buyer.email, buyer.password);
  const farmer = await createFarmer({ email: `farmer-sensitive-${randomUUID()}@example.com` });
  const farmerToken = await loginUser(farmer.email, farmer.password);

  const crop = await createCrop(farmerToken, { name: `Sensitive Crop ${randomUUID().slice(0,4)}`, price: 20, quantity: 12 });
  await placeOrder(token, crop.id, 2);

  const response = await request(app)
    .get('/api/orders')
    .set('Authorization', `Bearer ${token}`);

  assert.equal(response.status, 200);
  assert.equal(response.body.orders[0].password, undefined);
  assert.equal(response.body.orders[0].email, undefined);
  assert.equal(response.body.orders[0].farm_name, undefined);
  assert.equal(response.body.orders[0].company_name, undefined);
});

test('POST /api/orders still works alongside GET /api/orders', async () => {
  const buyer = await createUser({ email: `buyer-post-${randomUUID()}@example.com` });
  const token = await loginUser(buyer.email, buyer.password);
  const farmer = await createFarmer({ email: `farmer-post-${randomUUID()}@example.com` });
  const farmerToken = await loginUser(farmer.email, farmer.password);
  const crop = await createCrop(farmerToken, { name: `Post Crop ${randomUUID().slice(0,4)}`, price: 20, quantity: 15 });

  const order = await placeOrder(token, crop.id, 1);

  const response = await request(app)
    .get('/api/orders')
    .set('Authorization', `Bearer ${token}`);

  assert.equal(response.status, 200);
  assert.ok(response.body.orders.some((item) => item.id === order.id));
});
