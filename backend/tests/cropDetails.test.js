import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import app from '../server.js';
import { pool } from '../config/db.js';

async function registerAndLogin(role, name) {
  const userPayload = {
    name,
    email: `detail-${randomUUID()}@example.com`,
    phone: '9876543210',
    password: 'password123',
    role,
  };
  const registerResponse = await request(app)
    .post('/api/auth/register')
    .send(userPayload);

  assert.equal(registerResponse.status, 201);

  const loginResponse = await request(app)
    .post('/api/auth/login')
    .send({ email: userPayload.email, password: userPayload.password });

  assert.equal(loginResponse.status, 200);
  return {
    id: registerResponse.body.user.id,
    token: loginResponse.body.token,
  };
}

test('crop detail is public, safe, and limited to marketplace-available crops', async () => {
  const userIds = [];

  try {
    const farmer = await registerAndLogin('farmer', 'Detail Test Farmer');
    userIds.push(farmer.id);
    await pool.query(
      'UPDATE users SET farm_name = $1 WHERE id = $2',
      ['Detail Test Farm', farmer.id]
    );

    const cropIds = {};
    for (const status of ['available', 'sold_out', 'inactive']) {
      const createResponse = await request(app)
        .post('/api/crops')
        .set('Authorization', `Bearer ${farmer.token}`)
        .send({
          name: `Detail ${status} ${randomUUID().slice(0, 8)}`,
          category: 'Vegetables',
          description: 'Buyer-facing crop detail fixture',
          price: 35.5,
          unit: 'kg',
          quantity: 100,
          location: 'Nashik',
          harvest_date: '2026-10-08',
        });

      assert.equal(createResponse.status, 201);
      cropIds[status] = createResponse.body.crop.id;
      if (status !== 'available') {
        await pool.query(
          'UPDATE crops SET status = $1 WHERE id = $2',
          [status, cropIds[status]]
        );
      }
    }

    const publicResponse = await request(app)
      .get(`/api/crops/${cropIds.available}`);
    assert.equal(publicResponse.status, 200);
    assert.equal(publicResponse.body.success, true);
    assert.equal(publicResponse.body.crop.id, cropIds.available);
    assert.equal(publicResponse.body.crop.name.startsWith('Detail available '), true);
    assert.equal(publicResponse.body.crop.category, 'Vegetables');
    assert.equal(publicResponse.body.crop.description, 'Buyer-facing crop detail fixture');
    assert.equal(Number(publicResponse.body.crop.price), 35.5);
    assert.equal(Number(publicResponse.body.crop.quantity), 100);
    assert.equal(publicResponse.body.crop.location, 'Nashik');
    assert.equal(publicResponse.body.crop.status, 'available');
    assert.equal(publicResponse.body.crop.farmer_id, farmer.id);
    assert.equal(publicResponse.body.crop.farmer_name, 'Detail Test Farmer');
    assert.equal(publicResponse.body.crop.farm_name, 'Detail Test Farm');
    for (const sensitiveField of ['email', 'farmer_email', 'phone', 'password', 'password_hash']) {
      assert.equal(sensitiveField in publicResponse.body.crop, false);
    }

    const buyer = await registerAndLogin('buyer', 'Detail Test Buyer');
    userIds.push(buyer.id);
    const buyerResponse = await request(app)
      .get(`/api/crops/${cropIds.available}`)
      .set('Authorization', `Bearer ${buyer.token}`);
    assert.equal(buyerResponse.status, 200);
    assert.equal(buyerResponse.body.crop.id, cropIds.available);

    for (const status of ['sold_out', 'inactive']) {
      const unavailableResponse = await request(app)
        .get(`/api/crops/${cropIds[status]}`);
      assert.equal(unavailableResponse.status, 404);
      assert.equal(unavailableResponse.body.success, false);
      assert.equal(unavailableResponse.body.message, 'Crop not found.');
    }

    const missingResponse = await request(app)
      .get('/api/crops/11111111-1111-1111-1111-111111111111');
    assert.equal(missingResponse.status, 404);
    assert.equal(missingResponse.body.message, 'Crop not found.');

    const invalidIdResponse = await request(app)
      .get('/api/crops/not-a-valid-id');
    assert.equal(invalidIdResponse.status, 400);
    assert.equal(invalidIdResponse.body.success, false);
    assert.equal(invalidIdResponse.body.message, 'Invalid crop ID.');

    const healthResponse = await request(app).get('/api/health');
    assert.equal(healthResponse.status, 200);
  } finally {
    if (userIds.length > 0) {
      await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [userIds]);
    }
  }
});