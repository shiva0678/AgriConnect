import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import app from '../server.js';

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

  const listResponse = await request(app)
    .get('/api/farmer/crops')
    .set('Authorization', `Bearer ${farmerAAuth.token}`);

  assert.equal(listResponse.status, 200);
  assert.ok(listResponse.body.crops.length >= 1);
  assert.ok(listResponse.body.crops.some((crop) => crop.id === cropResponse.body.crop.id));
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
});
