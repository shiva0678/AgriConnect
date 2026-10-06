import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import app from '../server.js';
import { pool } from '../config/db.js';

test('marketplace lists only available crops and supports filters, sorting, and pagination', async () => {
  const marker = `Marketplace${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  let farmerId;
  const createdCrops = [];

  await pool.query('DELETE FROM orders');
  await pool.query('DELETE FROM crops');
  await pool.query('DELETE FROM users');

  try {
    const userPayload = {
      name: 'Marketplace Test Farmer',
      email: `${marker.toLowerCase()}@example.com`,
      phone: '9876543210',
      password: 'password123',
      role: 'farmer',
    };
    const registerResponse = await request(app)
      .post('/api/auth/register')
      .send(userPayload);

    assert.equal(registerResponse.status, 201);
    farmerId = registerResponse.body.user.id;

    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({ email: userPayload.email, password: userPayload.password });

    assert.equal(loginResponse.status, 200);
    const token = loginResponse.body.token;

    const cropFixtures = [
      { name: `Tomato ${marker} Heirloom`, category: 'Vegetables', location: `Bangalore ${marker}`, price: 30, status: 'available' },
      { name: `Tomato ${marker} Roma`, category: 'Vegetables', location: `Bangalore ${marker}`, price: 20, status: 'available' },
      { name: `Potato ${marker}`, category: 'Vegetables', location: `Bangalore ${marker}`, price: 40, status: 'available' },
      { name: `Mango ${marker}`, category: 'Fruits', location: `Pune ${marker}`, price: 50, status: 'available' },
      { name: `Tomato ${marker} Sold Out`, category: 'Vegetables', location: `Bangalore ${marker}`, price: 10, status: 'sold_out' },
      { name: `Tomato ${marker} Inactive`, category: 'Vegetables', location: `Bangalore ${marker}`, price: 5, status: 'inactive' },
    ];

    for (const [index, fixture] of cropFixtures.entries()) {
      const createResponse = await request(app)
        .post('/api/crops')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: fixture.name,
          category: fixture.category,
          description: 'Marketplace test fixture',
          price: fixture.price,
          unit: 'kg',
          quantity: 100,
          location: fixture.location,
          harvest_date: '2026-10-05',
        });

      assert.equal(createResponse.status, 201);
      const crop = createResponse.body.crop;
      createdCrops.push({ ...crop, expectedStatus: fixture.status });

      await pool.query(
        'UPDATE crops SET status = $1, created_at = $2 WHERE id = $3',
        [fixture.status, new Date(Date.UTC(2026, 0, index + 1)), crop.id]
      );
    }

    const baseResponse = await request(app).get('/api/crops');
    assert.equal(baseResponse.status, 200);
    assert.equal(baseResponse.body.success, true);
    assert.ok(Array.isArray(baseResponse.body.crops));
    assert.deepEqual(baseResponse.body.pagination, {
      page: 1,
      limit: 12,
      total: baseResponse.body.pagination.total,
      totalPages: Math.ceil(baseResponse.body.pagination.total / 12),
    });
    assert.ok(baseResponse.body.crops.every((crop) => crop.status === 'available'));
    assert.ok(baseResponse.body.crops.every((crop) => !('password' in crop) && !('password_hash' in crop)));
    assert.ok(createdCrops.filter((crop) => crop.expectedStatus !== 'available')
      .every((crop) => !baseResponse.body.crops.some((listedCrop) => listedCrop.id === crop.id)));

    const tomatoResponse = await request(app).get('/api/crops?search=tomato');
    assert.equal(tomatoResponse.status, 200);
    assert.ok(tomatoResponse.body.crops.some((crop) => crop.id === createdCrops[0].id));
    assert.ok(tomatoResponse.body.crops.every((crop) => crop.name.toLowerCase().includes('tomato')));

    const categoryResponse = await request(app).get('/api/crops?category=vegetables');
    assert.equal(categoryResponse.status, 200);
    assert.ok(categoryResponse.body.crops.every((crop) => crop.category.toLowerCase() === 'vegetables'));

    const isolatedCategoryResponse = await request(app)
      .get(`/api/crops?search=${marker}&category=vegetables`);
    assert.deepEqual(
      new Set(isolatedCategoryResponse.body.crops.map((crop) => crop.id)),
      new Set([createdCrops[0].id, createdCrops[1].id, createdCrops[2].id])
    );

    const locationResponse = await request(app).get('/api/crops?location=bangalore');
    assert.equal(locationResponse.status, 200);
    assert.ok(locationResponse.body.crops.every((crop) => crop.location.toLowerCase().includes('bangalore')));

    const isolatedLocationResponse = await request(app)
      .get(`/api/crops?search=${marker}&location=bangalore`);
    assert.deepEqual(
      new Set(isolatedLocationResponse.body.crops.map((crop) => crop.id)),
      new Set([createdCrops[0].id, createdCrops[1].id, createdCrops[2].id])
    );

    const combinedResponse = await request(app)
      .get(`/api/crops?search=tomato%20${marker}&category=vegetables&location=bangalore`);
    assert.equal(combinedResponse.status, 200);
    assert.deepEqual(
      new Set(combinedResponse.body.crops.map((crop) => crop.id)),
      new Set([createdCrops[0].id, createdCrops[1].id])
    );

    const isolatedSearch = `/api/crops?search=${marker}`;
    const priceAscResponse = await request(app).get(`${isolatedSearch}&sort=price_asc`);
    assert.deepEqual(priceAscResponse.body.crops.map((crop) => Number(crop.price)), [20, 30, 40, 50]);

    const marketplacePriceAscResponse = await request(app).get('/api/crops?sort=price_asc');
    assert.equal(marketplacePriceAscResponse.status, 200);
    assert.deepEqual(
      marketplacePriceAscResponse.body.crops.map((crop) => Number(crop.price)),
      [...marketplacePriceAscResponse.body.crops.map((crop) => Number(crop.price))].sort((left, right) => left - right)
    );

    const priceDescResponse = await request(app).get(`${isolatedSearch}&sort=price_desc`);
    assert.deepEqual(priceDescResponse.body.crops.map((crop) => Number(crop.price)), [50, 40, 30, 20]);

    const newestResponse = await request(app).get(`${isolatedSearch}&sort=newest`);
    assert.deepEqual(
      newestResponse.body.crops.map((crop) => crop.id),
      [createdCrops[3].id, createdCrops[2].id, createdCrops[1].id, createdCrops[0].id]
    );

    const oldestResponse = await request(app).get(`${isolatedSearch}&sort=oldest`);
    assert.deepEqual(
      oldestResponse.body.crops.map((crop) => crop.id),
      [createdCrops[0].id, createdCrops[1].id, createdCrops[2].id, createdCrops[3].id]
    );

    const pagedResponse = await request(app).get(`${isolatedSearch}&page=2&limit=2`);
    assert.equal(pagedResponse.status, 200);
    assert.deepEqual(pagedResponse.body.crops.map((crop) => crop.id), [createdCrops[1].id, createdCrops[0].id]);
    assert.deepEqual(pagedResponse.body.pagination, { page: 2, limit: 2, total: 4, totalPages: 2 });

    const requestedPageFive = await request(app).get(`${isolatedSearch}&page=2&limit=5`);
    assert.equal(requestedPageFive.status, 200);
    assert.equal(requestedPageFive.body.pagination.page, 2);
    assert.equal(requestedPageFive.body.pagination.limit, 5);

    const marketplacePageTwo = await request(app).get('/api/crops?page=2&limit=5');
    assert.equal(marketplacePageTwo.status, 200);
    assert.equal(marketplacePageTwo.body.pagination.page, 2);
    assert.equal(marketplacePageTwo.body.pagination.limit, 5);

    const invalidPageResponse = await request(app).get(`${isolatedSearch}&page=not-a-number`);
    assert.equal(invalidPageResponse.body.pagination.page, 1);

    const invalidLimitResponse = await request(app).get(`${isolatedSearch}&limit=invalid`);
    assert.equal(invalidLimitResponse.body.pagination.limit, 12);

    const oversizedLimitResponse = await request(app).get(`${isolatedSearch}&limit=500`);
    assert.equal(oversizedLimitResponse.body.pagination.limit, 50);

    const invalidSortResponse = await request(app).get('/api/crops?sort=price;DROP%20TABLE%20crops');
    assert.equal(invalidSortResponse.status, 400);

    const emptyResponse = await request(app).get(`/api/crops?search=${marker}&category=not-a-category`);
    assert.equal(emptyResponse.status, 200);
    assert.deepEqual(emptyResponse.body.crops, []);
    assert.deepEqual(emptyResponse.body.pagination, { page: 1, limit: 12, total: 0, totalPages: 0 });

    const detailResponse = await request(app)
      .get(`/api/crops/${createdCrops[0].id}`)
      .set('Authorization', `Bearer ${token}`);
    assert.equal(detailResponse.status, 200);
    assert.equal(detailResponse.body.crop.id, createdCrops[0].id);

    const missingDetailResponse = await request(app)
      .get('/api/crops/11111111-1111-1111-1111-111111111111')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(missingDetailResponse.status, 404);
    assert.equal(missingDetailResponse.body.success, false);
  } finally {
    if (farmerId) {
      await pool.query('DELETE FROM orders WHERE buyer_id = $1 OR farmer_id = $1', [farmerId]);
      await pool.query('DELETE FROM crops WHERE farmer_id = $1', [farmerId]);
      await pool.query('DELETE FROM users WHERE id = $1', [farmerId]);
    }
  }
});