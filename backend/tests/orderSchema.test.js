import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { pool } from '../config/db.js';

async function createUser(role = 'buyer') {
  const email = `${role}-${randomUUID()}@example.com`;
  const result = await pool.query(
    `INSERT INTO users (name, email, phone, password, role) VALUES ($1, $2, $3, $4, $5) RETURNING id, email, role`,
    [`Order ${role} ${randomUUID().slice(0, 4)}`, email, '9876543210', 'hashed-password', role]
  );

  return result.rows[0];
}

async function createCrop(farmerId) {
  const result = await pool.query(
    `INSERT INTO crops (
      farmer_id,
      name,
      category,
      description,
      price,
      unit,
      quantity,
      location,
      harvest_date,
      expiry_date,
      status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id` ,
    [
      farmerId,
      `Crop ${randomUUID().slice(0, 6)}`,
      'Vegetable',
      'Fresh produce for testing',
      25.5,
      'kg',
      100,
      'Nashik',
      '2025-01-10',
      '2025-02-10',
      'available',
    ]
  );

  return result.rows[0].id;
}

test('orders table exists with the expected schema', async () => {
  const columnsQuery = await pool.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_name = 'orders'
     ORDER BY ordinal_position`
  );

  const columnNames = columnsQuery.rows.map((row) => row.column_name);

  assert.ok(columnNames.includes('id'));
  assert.ok(columnNames.includes('buyer_id'));
  assert.ok(columnNames.includes('farmer_id'));
  assert.ok(columnNames.includes('crop_id'));
  assert.ok(columnNames.includes('quantity'));
  assert.ok(columnNames.includes('unit_price'));
  assert.ok(columnNames.includes('total_amount'));
  assert.ok(columnNames.includes('status'));
  assert.ok(columnNames.includes('created_at'));
  assert.ok(columnNames.includes('updated_at'));
});

test('orders accepts a valid order snapshot', async () => {
  const buyer = await createUser('buyer');
  const farmer = await createUser('farmer');
  const cropId = await createCrop(farmer.id);

  const orderInsert = await pool.query(
    `INSERT INTO orders (buyer_id, farmer_id, crop_id, quantity, unit, unit_price, total_amount, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, buyer_id, farmer_id, crop_id, quantity, unit_price, total_amount, status`,
    [buyer.id, farmer.id, cropId, 10, 'kg', 25.5, 255, 'pending']
  );

  assert.equal(orderInsert.rows.length, 1);
  assert.equal(orderInsert.rows[0].buyer_id, buyer.id);
  assert.equal(orderInsert.rows[0].farmer_id, farmer.id);
  assert.equal(orderInsert.rows[0].crop_id, cropId);
  assert.equal(Number(orderInsert.rows[0].quantity), 10);
  assert.equal(Number(orderInsert.rows[0].unit_price), 25.5);
  assert.equal(orderInsert.rows[0].status, 'pending');
  assert.equal(Number(orderInsert.rows[0].total_amount), 255);
});

test('orders rejects invalid status values', async () => {
  const buyer = await createUser('buyer');
  const farmer = await createUser('farmer');
  const cropId = await createCrop(farmer.id);

  await assert.rejects(
    () =>
      pool.query(
        `INSERT INTO orders (buyer_id, farmer_id, crop_id, quantity, unit, unit_price, total_amount, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [buyer.id, farmer.id, cropId, 5, 'kg', 20, 100, 'processing']
      ),
    {
      code: '23514',
    }
  );
});

test('orders rejects non-positive quantity values', async () => {
  const buyer = await createUser('buyer');
  const farmer = await createUser('farmer');
  const cropId = await createCrop(farmer.id);

  await assert.rejects(
    () =>
      pool.query(
        `INSERT INTO orders (buyer_id, farmer_id, crop_id, quantity, unit, unit_price, total_amount, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [buyer.id, farmer.id, cropId, 0, 'kg', 20, 0, 'pending']
      ),
    {
      code: '23514',
    }
  );
});
