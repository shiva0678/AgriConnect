import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import app from '../server.js';
import { pool } from '../config/db.js';

async function withTestContext(run) {
  const context = { userIds: [], cropIds: [], orderIds: [] };

  try {
    await run(context);
  } finally {
    if (context.orderIds.length) {
      await pool.query('DELETE FROM orders WHERE id = ANY($1::uuid[])', [context.orderIds]);
    }
    if (context.cropIds.length) {
      await pool.query('DELETE FROM crops WHERE id = ANY($1::uuid[])', [context.cropIds]);
    }
    if (context.userIds.length) {
      await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [context.userIds]);
    }
  }
}

async function createAccount(context, role) {
  const email = `${role}-${randomUUID()}@example.com`;
  const payload = {
    name: `${role === 'farmer' ? 'Farmer' : 'Buyer'} ${randomUUID().slice(0, 6)}`,
    email,
    phone: '9876543210',
    password: 'password123',
    role,
  };
  const registered = await request(app).post('/api/auth/register').send(payload);
  assert.equal(registered.status, 201);
  const account = { ...payload, id: registered.body.user.id };
  context.userIds.push(account.id);

  const loggedIn = await request(app).post('/api/auth/login').send({ email, password: payload.password });
  assert.equal(loggedIn.status, 200);
  account.token = loggedIn.body.token;
  return account;
}

async function createCrop(context, farmerId, overrides = {}) {
  const result = await pool.query(
    `INSERT INTO crops (
      farmer_id, name, category, description, price, unit, quantity,
      location, harvest_date, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'available')
    RETURNING id`,
    [
      farmerId,
      overrides.name || `Farmer Order Crop ${randomUUID().slice(0, 6)}`,
      overrides.category || 'Vegetables',
      'Order management test fixture',
      overrides.price ?? 45,
      overrides.unit || 'kg',
      overrides.quantity ?? 500,
      'Nashik',
      '2026-10-05',
    ]
  );
  const cropId = result.rows[0].id;
  context.cropIds.push(cropId);
  return cropId;
}

async function createOrder(context, { buyerId, farmerId, cropId, status = 'pending', createdAt } = {}) {
  const timestamp = createdAt || new Date(Date.now() - 60_000).toISOString();
  const result = await pool.query(
    `INSERT INTO orders (
      buyer_id, farmer_id, crop_id, quantity, unit, unit_price,
      total_amount, status, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
    RETURNING id, created_at, updated_at`,
    [buyerId, farmerId, cropId, 2, 'kg', 37.5, 75, status, timestamp]
  );
  const order = result.rows[0];
  context.orderIds.push(order.id);
  return order;
}

test('farmer order routes require authentication and farmer role', async () => {
  await withTestContext(async (context) => {
    const buyer = await createAccount(context, 'buyer');

    const unauthenticatedList = await request(app).get('/api/farmer/orders');
    assert.equal(unauthenticatedList.status, 401);

    const buyerList = await request(app)
      .get('/api/farmer/orders')
      .set('Authorization', `Bearer ${buyer.token}`);
    assert.equal(buyerList.status, 403);

    const unauthenticatedUpdate = await request(app)
      .patch(`/api/orders/${randomUUID()}/status`)
      .send({ status: 'confirmed' });
    assert.equal(unauthenticatedUpdate.status, 401);

    const buyerUpdate = await request(app)
      .patch(`/api/orders/${randomUUID()}/status`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ status: 'confirmed' });
    assert.equal(buyerUpdate.status, 403);
  });
});

test('GET /api/farmer/orders returns only owned orders with crop and buyer display data', async () => {
  await withTestContext(async (context) => {
    const farmer = await createAccount(context, 'farmer');
    const otherFarmer = await createAccount(context, 'farmer');
    const buyer = await createAccount(context, 'buyer');
    const ownCrop = await createCrop(context, farmer.id, { name: 'Farmer Owned Crop', category: 'Grains', unit: 'kg' });
    const otherCrop = await createCrop(context, otherFarmer.id, { name: 'Other Farmer Crop' });
    const ownOrder = await createOrder(context, {
      buyerId: buyer.id,
      farmerId: farmer.id,
      cropId: ownCrop,
      status: 'pending',
    });
    await createOrder(context, {
      buyerId: buyer.id,
      farmerId: otherFarmer.id,
      cropId: otherCrop,
      status: 'pending',
    });

    const response = await request(app)
      .get(`/api/farmer/orders?farmer_id=${otherFarmer.id}`)
      .set('Authorization', `Bearer ${farmer.token}`);

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.deepEqual(response.body.orders.map((order) => order.id), [ownOrder.id]);
    assert.equal(response.body.orders[0].farmer_id, farmer.id);
    assert.equal(response.body.orders[0].buyer_id, buyer.id);
    assert.equal(response.body.orders[0].buyer_name, buyer.name);
    assert.equal(response.body.orders[0].crop_id, ownCrop);
    assert.equal(response.body.orders[0].crop_name, 'Farmer Owned Crop');
    assert.equal(response.body.orders[0].crop_category, 'Grains');
    assert.equal(response.body.orders[0].crop_unit, 'kg');
    assert.equal(response.body.orders[0].quantity, 2);
    assert.equal(response.body.orders[0].unit, 'kg');
    assert.equal(response.body.orders[0].unit_price, 37.5);
    assert.equal(response.body.orders[0].total_amount, 75);
    assert.equal(response.body.orders[0].password, undefined);
    assert.equal(response.body.orders[0].email, undefined);
    assert.equal(response.body.pagination.page, 1);
    assert.equal(response.body.pagination.limit, 10);
    assert.equal(response.body.pagination.total, 1);
  });
});

test('GET /api/farmer/orders validates filters and paginates results', async () => {
  await withTestContext(async (context) => {
    const farmer = await createAccount(context, 'farmer');
    const buyer = await createAccount(context, 'buyer');
    const cropId = await createCrop(context, farmer.id);

    for (let index = 0; index < 12; index += 1) {
      await createOrder(context, {
        buyerId: buyer.id,
        farmerId: farmer.id,
        cropId,
        status: index % 2 === 0 ? 'pending' : 'confirmed',
        createdAt: new Date(Date.now() - (12 - index) * 1000).toISOString(),
      });
    }

    const defaultPage = await request(app)
      .get('/api/farmer/orders')
      .set('Authorization', `Bearer ${farmer.token}`);
    assert.equal(defaultPage.status, 200);
    assert.equal(defaultPage.body.orders.length, 10);
    assert.equal(defaultPage.body.pagination.page, 1);
    assert.equal(defaultPage.body.pagination.limit, 10);
    assert.equal(defaultPage.body.pagination.total, 12);
    assert.equal(defaultPage.body.pagination.totalPages, 2);

    const secondPage = await request(app)
      .get('/api/farmer/orders?page=2&limit=5')
      .set('Authorization', `Bearer ${farmer.token}`);
    assert.equal(secondPage.status, 200);
    assert.equal(secondPage.body.orders.length, 5);
    assert.equal(secondPage.body.pagination.page, 2);
    assert.equal(secondPage.body.pagination.limit, 5);

    const pending = await request(app)
      .get('/api/farmer/orders?status=pending')
      .set('Authorization', `Bearer ${farmer.token}`);
    assert.equal(pending.status, 200);
    assert.equal(pending.body.pagination.total, 6);
    assert.ok(pending.body.orders.every((order) => order.status === 'pending'));

    for (const query of ['?limit=51', '?page=0', '?page=invalid', '?page=', '?limit=0', '?limit=invalid', '?limit=', '?status=processing', '?status=']) {
      const invalid = await request(app)
        .get(`/api/farmer/orders${query}`)
        .set('Authorization', `Bearer ${farmer.token}`);
      assert.equal(invalid.status, 400, `expected ${query} to be rejected`);
    }
  });
});

test('GET /api/farmer/orders returns an empty paginated result', async () => {
  await withTestContext(async (context) => {
    const farmer = await createAccount(context, 'farmer');
    const response = await request(app)
      .get('/api/farmer/orders')
      .set('Authorization', `Bearer ${farmer.token}`);

    assert.equal(response.status, 200);
    assert.deepEqual(response.body.orders, []);
    assert.deepEqual(response.body.pagination, {
      page: 1,
      limit: 10,
      total: 0,
      totalPages: 0,
    });
  });
});

test('PATCH /api/orders/:id/status enforces farmer ownership and validates IDs/status', async () => {
  await withTestContext(async (context) => {
    const farmer = await createAccount(context, 'farmer');
    const otherFarmer = await createAccount(context, 'farmer');
    const buyer = await createAccount(context, 'buyer');
    const cropId = await createCrop(context, otherFarmer.id);
    const otherOrder = await createOrder(context, {
      buyerId: buyer.id,
      farmerId: otherFarmer.id,
      cropId,
    });

    const forbiddenOrder = await request(app)
      .patch(`/api/orders/${otherOrder.id}/status?farmer_id=${otherFarmer.id}`)
      .set('Authorization', `Bearer ${farmer.token}`)
      .send({ status: 'confirmed', farmer_id: otherFarmer.id });
    assert.equal(forbiddenOrder.status, 404);

    const unchanged = await pool.query('SELECT status FROM orders WHERE id = $1', [otherOrder.id]);
    assert.equal(unchanged.rows[0].status, 'pending');

    const invalidId = await request(app)
      .patch('/api/orders/not-a-uuid/status')
      .set('Authorization', `Bearer ${farmer.token}`)
      .send({ status: 'confirmed' });
    assert.equal(invalidId.status, 400);

    const missingOrder = await request(app)
      .patch(`/api/orders/${randomUUID()}/status`)
      .set('Authorization', `Bearer ${farmer.token}`)
      .send({ status: 'confirmed' });
    assert.equal(missingOrder.status, 404);

    const invalidStatus = await request(app)
      .patch(`/api/orders/${otherOrder.id}/status`)
      .set('Authorization', `Bearer ${otherFarmer.token}`)
      .send({ status: 'processing' });
    assert.equal(invalidStatus.status, 400);
  });
});

test('PATCH /api/orders/:id/status permits normal transitions and cancellations without changing order snapshots or crop stock', async () => {
  await withTestContext(async (context) => {
    const farmer = await createAccount(context, 'farmer');
    const buyer = await createAccount(context, 'buyer');
    const cropId = await createCrop(context, farmer.id, { quantity: 500 });
    const oldTimestamp = new Date(Date.now() - 86_400_000).toISOString();
    const order = await createOrder(context, {
      buyerId: buyer.id,
      farmerId: farmer.id,
      cropId,
      createdAt: oldTimestamp,
    });
    const original = await pool.query(
      'SELECT created_at, updated_at, quantity, unit_price, total_amount FROM orders WHERE id = $1',
      [order.id]
    );
    const originalCreatedAt = original.rows[0].created_at;
    const originalUpdatedAt = original.rows[0].updated_at;
    const cropBefore = await pool.query('SELECT quantity FROM crops WHERE id = $1', [cropId]);

    for (const status of ['confirmed', 'shipped', 'delivered']) {
      const response = await request(app)
        .patch(`/api/orders/${order.id}/status`)
        .set('Authorization', `Bearer ${farmer.token}`)
        .send({ status });
      assert.equal(response.status, 200);
      assert.equal(response.body.success, true);
      assert.equal(response.body.order.status, status);
      assert.equal(response.body.order.crop_name.startsWith('Farmer Order Crop'), true);
      assert.equal(response.body.order.buyer_name, buyer.name);
    }

    const after = await pool.query(
      'SELECT created_at, updated_at, quantity, unit_price, total_amount, status FROM orders WHERE id = $1',
      [order.id]
    );
    assert.equal(after.rows[0].created_at.toISOString(), originalCreatedAt.toISOString());
    assert.ok(after.rows[0].updated_at > originalUpdatedAt);
    assert.equal(Number(after.rows[0].quantity), Number(original.rows[0].quantity));
    assert.equal(Number(after.rows[0].unit_price), Number(original.rows[0].unit_price));
    assert.equal(Number(after.rows[0].total_amount), Number(original.rows[0].total_amount));
    assert.equal(after.rows[0].status, 'delivered');

    for (const initialStatus of ['pending', 'confirmed']) {
      const cancelOrder = await createOrder(context, {
        buyerId: buyer.id,
        farmerId: farmer.id,
        cropId,
        status: initialStatus,
        createdAt: oldTimestamp,
      });
      const response = await request(app)
        .patch(`/api/orders/${cancelOrder.id}/status`)
        .set('Authorization', `Bearer ${farmer.token}`)
        .send({ status: 'cancelled' });
      assert.equal(response.status, 200);
      assert.equal(response.body.order.status, 'cancelled');
    }

    const cropAfter = await pool.query('SELECT quantity FROM crops WHERE id = $1', [cropId]);
    assert.equal(Number(cropAfter.rows[0].quantity), Number(cropBefore.rows[0].quantity));
  });
});

test('PATCH /api/orders/:id/status rejects invalid transitions and terminal order changes', async () => {
  await withTestContext(async (context) => {
    const farmer = await createAccount(context, 'farmer');
    const buyer = await createAccount(context, 'buyer');
    const cropId = await createCrop(context, farmer.id);
    const invalidTransitions = [
      ['pending', 'shipped'],
      ['pending', 'delivered'],
      ['confirmed', 'delivered'],
      ['confirmed', 'pending'],
      ['shipped', 'pending'],
      ['shipped', 'confirmed'],
      ['shipped', 'cancelled'],
      ['delivered', 'confirmed'],
      ['cancelled', 'confirmed'],
    ];

    for (const [initialStatus, nextStatus] of invalidTransitions) {
      const order = await createOrder(context, {
        buyerId: buyer.id,
        farmerId: farmer.id,
        cropId,
        status: initialStatus,
      });
      const response = await request(app)
        .patch(`/api/orders/${order.id}/status`)
        .set('Authorization', `Bearer ${farmer.token}`)
        .send({ status: nextStatus });
      assert.equal(response.status, 400, `${initialStatus} -> ${nextStatus} should be rejected`);

      const persisted = await pool.query('SELECT status FROM orders WHERE id = $1', [order.id]);
      assert.equal(persisted.rows[0].status, initialStatus);
    }
  });
});
