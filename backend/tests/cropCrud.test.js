import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import app from '../server.js';
import { pool } from '../config/db.js';

function makeUser(overrides = {}) {
  const email = `crop-${randomUUID()}@example.com`;
  return {
    name: 'Crop Test User',
    email,
    phone: '9876543210',
    password: 'password123',
    role: 'farmer',
    ...overrides,
  };
}

async function registerAndLogin(userPayload) {
  const registerResponse = await request(app)
    .post('/api/auth/register')
    .send(userPayload);

  assert.equal(registerResponse.status, 201);

  const loginResponse = await request(app)
    .post('/api/auth/login')
    .send({
      email: userPayload.email,
      password: userPayload.password,
    });

  assert.equal(loginResponse.status, 200);
  return { user: registerResponse.body.user, token: loginResponse.body.token };
}

test('farmer can create and retrieve their crops', async () => {
  const farmerA = makeUser({ name: 'Farmer A', role: 'farmer' });
  const farmerAAuth = await registerAndLogin(farmerA);

  const cropResponse = await request(app)
    .post('/api/crops')
    .set('Authorization', `Bearer ${farmerAAuth.token}`)
    .send({
      name: 'Tomatoes',
      category: 'Vegetables',
      description: 'Fresh tomatoes',
      price: 35.5,
      unit: 'kg',
      quantity: 100,
      location: 'Nashik',
      harvest_date: '2026-10-05',
      expiry_date: '2026-10-12',
    });

  assert.equal(cropResponse.status, 201);
  assert.equal(cropResponse.body.success, true);
  assert.equal(cropResponse.body.crop.name, 'Tomatoes');
  assert.equal(cropResponse.body.crop.farmer_id, farmerAAuth.user.id);
  assert.equal(cropResponse.body.crop.status, 'available');
  assert.equal(cropResponse.body.crop.harvest_date, '2026-10-05');

  const editResponse = await request(app)
    .patch(`/api/crops/${cropResponse.body.crop.id}`)
    .set('Authorization', 'Bearer ' + farmerAAuth.token)
    .send({
      name: 'Tomatoes Updated',
      category: 'Fruits',
      price: 40,
      unit: 'kg',
      quantity: 90,
      location: 'Pune',
      description: 'Updated description',
      harvest_date: '2026-10-06',
      expiry_date: '2026-10-16',
      expected_quantity: 100,
    });

  assert.equal(editResponse.status, 200);
  assert.equal(editResponse.body.crop.harvest_date, '2026-10-06');
  assert.equal(Number(editResponse.body.crop.price), 40);
  assert.equal(Number(editResponse.body.crop.quantity), 90);
  assert.equal(editResponse.body.crop.location, 'Pune');
  assert.equal(editResponse.body.crop.description, 'Updated description');
  assert.equal(editResponse.body.crop.expiry_date, '2026-10-16');

  const invalidDateResponse = await request(app)
    .patch(`/api/crops/${cropResponse.body.crop.id}`)
    .set('Authorization', 'Bearer ' + farmerAAuth.token)
    .send({
      price: 35.5,
      quantity: 100,
      harvest_date: '2026-10-07T00:00:00.000Z',
      expected_quantity: 90,
    });

  assert.equal(invalidDateResponse.status, 400);

  const listResponse = await request(app)
    .get('/api/farmer/crops')
    .set('Authorization', `Bearer ${farmerAAuth.token}`);

  assert.equal(listResponse.status, 200);
  assert.ok(listResponse.body.crops.length >= 1);
  assert.ok(listResponse.body.crops.some((crop) => crop.id === cropResponse.body.crop.id));
  assert.equal(
    listResponse.body.crops.find((crop) => crop.id === cropResponse.body.crop.id)?.harvest_date,
    '2026-10-06',
  );

  const marketplaceResponse = await request(app)
    .get('/api/crops')
    .query({ search: 'Tomatoes Updated' });

  assert.equal(marketplaceResponse.status, 200);
  assert.equal(
    marketplaceResponse.body.crops.find((crop) => crop.id === cropResponse.body.crop.id)?.harvest_date,
    '2026-10-06',
  );

  const detailResponse = await request(app)
    .get(`/api/crops/${cropResponse.body.crop.id}`);

  assert.equal(detailResponse.status, 200);
  assert.equal(detailResponse.body.crop.harvest_date, '2026-10-06');
  assert.equal(detailResponse.body.crop.unit, 'kg');
});

test('buyer cannot create a crop and another farmer cannot modify owner crop', async () => {
  const farmerA = makeUser({ name: 'Farmer A', role: 'farmer' });
  const farmerB = makeUser({ name: 'Farmer B', role: 'farmer' });
  const buyer = makeUser({ name: 'Buyer C', role: 'buyer' });

  const authA = await registerAndLogin(farmerA);
  const authB = await registerAndLogin(farmerB);
  const authBuyer = await registerAndLogin(buyer);

  const cropResponse = await request(app)
    .post('/api/crops')
    .set('Authorization', `Bearer ${authA.token}`)
    .send({
      name: 'Onions',
      category: 'Vegetables',
      description: 'Fresh onions',
      price: 25,
      unit: 'kg',
      quantity: 200,
      location: 'Pune',
      harvest_date: '2026-10-10',
    });

  assert.equal(cropResponse.status, 201);
  const cropId = cropResponse.body.crop.id;

  const buyerCreate = await request(app)
    .post('/api/crops')
    .set('Authorization', `Bearer ${authBuyer.token}`)
    .send({
      name: 'Buyer Crop',
      category: 'Vegetables',
      description: 'Not allowed',
      price: 10,
      unit: 'kg',
      quantity: 50,
      location: 'Mumbai',
      harvest_date: '2026-10-11',
    });

  assert.equal(buyerCreate.status, 403);

  const buyerPatch = await request(app)
    .patch(`/api/crops/${cropId}`)
    .set('Authorization', `Bearer ${authBuyer.token}`)
    .send({ name: 'Buyer edit attempt' });
  assert.equal(buyerPatch.status, 403);

  const buyerDelete = await request(app)
    .delete(`/api/crops/${cropId}`)
    .set('Authorization', `Bearer ${authBuyer.token}`);
  assert.equal(buyerDelete.status, 403);

  const otherFarmerPatch = await request(app)
    .patch(`/api/crops/${cropId}`)
    .set('Authorization', `Bearer ${authB.token}`)
    .send({
      name: 'Hacked crop',
      price: 99,
    });

  assert.equal(otherFarmerPatch.status, 403);

  const otherFarmerDelete = await request(app)
    .delete(`/api/crops/${cropId}`)
    .set('Authorization', `Bearer ${authB.token}`);

  assert.equal(otherFarmerDelete.status, 403);
});

test('farmer can delete an un-ordered crop and ordered crops retain stock and order history', async () => {
  const farmer = await registerAndLogin(makeUser({ role: 'farmer' }));
  const buyer = await registerAndLogin(makeUser({ role: 'buyer' }));
  let cropId;

  try {
    const created = await request(app)
      .post('/api/crops')
      .set('Authorization', `Bearer ${farmer.token}`)
      .send({
        name: 'Delete Test Crop',
        category: 'Vegetables',
        price: 20,
        unit: 'kg',
        quantity: 10,
        location: 'Test Region',
        harvest_date: '2026-10-15',
      });
    assert.equal(created.status, 201);
    cropId = created.body.crop.id;

    const deleted = await request(app)
      .delete(`/api/crops/${cropId}`)
      .set('Authorization', `Bearer ${farmer.token}`);
    assert.equal(deleted.status, 200);

    const orderedCrop = await request(app)
      .post('/api/crops')
      .set('Authorization', `Bearer ${farmer.token}`)
      .send({
        name: 'Ordered Test Crop',
        category: 'Vegetables',
        price: 20,
        unit: 'kg',
        quantity: 10,
        location: 'Test Region',
        harvest_date: '2026-10-15',
      });
    assert.equal(orderedCrop.status, 201);
    cropId = orderedCrop.body.crop.id;

    const order = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ cropId, quantity: 3 });
    assert.equal(order.status, 201);

    const staleUpdate = await request(app)
      .patch(`/api/crops/${cropId}`)
      .set('Authorization', `Bearer ${farmer.token}`)
      .send({ quantity: 10, expected_quantity: 10 });
    assert.equal(staleUpdate.status, 409);

    const unitChange = await request(app)
      .patch(`/api/crops/${cropId}`)
      .set('Authorization', `Bearer ${farmer.token}`)
      .send({ unit: 'tonne', expected_quantity: 7 });
    assert.equal(unitChange.status, 409);

    const deleteOrderedCrop = await request(app)
      .delete(`/api/crops/${cropId}`)
      .set('Authorization', `Bearer ${farmer.token}`);
    assert.equal(deleteOrderedCrop.status, 409);
    assert.match(deleteOrderedCrop.body.message, /associated orders/i);

    const persisted = await pool.query(
      'SELECT quantity FROM crops WHERE id = $1',
      [cropId],
    );
    assert.equal(Number(persisted.rows[0].quantity), 7);

    const persistedOrder = await pool.query(
      'SELECT id FROM orders WHERE crop_id = $1',
      [cropId],
    );
    assert.equal(persistedOrder.rowCount, 1);
  } finally {
    if (cropId) {
      await pool.query('DELETE FROM orders WHERE crop_id = $1', [cropId]);
      await pool.query('DELETE FROM crops WHERE id = $1', [cropId]);
    }
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [
      [farmer.user.id, buyer.user.id],
    ]);
  }
});

test('invalid crop payloads are rejected and a missing crop returns 404', async () => {
  const farmer = makeUser({ name: 'Farmer D', role: 'farmer' });
  const auth = await registerAndLogin(farmer);

  const badPrice = await request(app)
    .post('/api/crops')
    .set('Authorization', `Bearer ${auth.token}`)
    .send({
      name: 'Invalid Price',
      category: 'Vegetables',
      price: -10,
      unit: 'kg',
      quantity: 50,
      location: 'Nagpur',
      harvest_date: '2026-10-10',
    });

  assert.equal(badPrice.status, 400);

  const badQuantity = await request(app)
    .post('/api/crops')
    .set('Authorization', `Bearer ${auth.token}`)
    .send({
      name: 'Invalid Quantity',
      category: 'Vegetables',
      price: 10,
      unit: 'kg',
      quantity: -1,
      location: 'Nagpur',
      harvest_date: '2026-10-10',
    });

  assert.equal(badQuantity.status, 400);

  const badDates = await request(app)
    .post('/api/crops')
    .set('Authorization', `Bearer ${auth.token}`)
    .send({
      name: 'Bad Dates',
      category: 'Vegetables',
      price: 10,
      unit: 'kg',
      quantity: 50,
      location: 'Nagpur',
      harvest_date: '2026-10-20',
      expiry_date: '2026-10-10',
    });

  assert.equal(badDates.status, 400);

  const notFound = await request(app)
    .get('/api/crops/11111111-1111-1111-1111-111111111111')
    .set('Authorization', `Bearer ${auth.token}`);

  assert.equal(notFound.status, 404);

  const invalidEditId = await request(app)
    .patch('/api/crops/not-a-uuid')
    .set('Authorization', `Bearer ${auth.token}`)
    .send({ name: 'Invalid ID' });
  assert.equal(invalidEditId.status, 400);

  const invalidDeleteId = await request(app)
    .delete('/api/crops/not-a-uuid')
    .set('Authorization', `Bearer ${auth.token}`);
  assert.equal(invalidDeleteId.status, 400);
});

test('a deleted farmer account receives an actionable error when creating a crop', async () => {
  const farmer = makeUser({ name: 'Deleted Farmer', role: 'farmer' });
  const auth = await registerAndLogin(farmer);

  await pool.query('DELETE FROM users WHERE id = $1', [auth.user.id]);

  const response = await request(app)
    .post('/api/crops')
    .set('Authorization', `Bearer ${auth.token}`)
    .send({
      name: 'Tomatoes',
      category: 'Vegetables',
      price: 25,
      unit: 'kg',
      quantity: 10,
      location: 'Test Region',
      harvest_date: '2026-10-15',
    });

  assert.equal(response.status, 401);
  assert.match(response.body.message, /account is no longer available/i);
  assert.doesNotMatch(response.body.message, /foreign key|crops_farmer_id_fkey/i);
});
