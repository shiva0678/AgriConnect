import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeDatabase, pool } from '../config/db.js';

async function createUser(role) {
  const result = await pool.query(
    `INSERT INTO users (name, email, phone, password, role)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [
      `Chat ${role} ${randomUUID().slice(0, 6)}`,
      `chat-${role}-${randomUUID()}@example.com`,
      '9876543210',
      'hashed-password',
      role,
    ],
  );
  return result.rows[0].id;
}

async function createOrderFixture() {
  const buyerId = await createUser('buyer');
  const farmerId = await createUser('farmer');
  const cropResult = await pool.query(
    `INSERT INTO crops (
      farmer_id, name, category, description, price, unit, quantity,
      location, harvest_date, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING id`,
    [
      farmerId,
      `Chat crop ${randomUUID().slice(0, 6)}`,
      'Vegetables',
      'Chat schema test crop',
      20,
      'kg',
      100,
      'Nashik',
      '2026-10-05',
      'available',
    ],
  );
  const cropId = cropResult.rows[0].id;
  const orderResult = await pool.query(
    `INSERT INTO orders (
      buyer_id, farmer_id, crop_id, quantity, unit,
      unit_price, total_amount, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING id`,
    [buyerId, farmerId, cropId, 1, 'kg', 20, 20, 'confirmed'],
  );

  return {
    buyerId,
    farmerId,
    cropId,
    orderId: orderResult.rows[0].id,
  };
}

async function cleanupFixture(fixture) {
  await pool.query(
    'DELETE FROM conversations WHERE order_id = $1',
    [fixture.orderId],
  );
  await pool.query('DELETE FROM orders WHERE id = $1', [fixture.orderId]);
  await pool.query('DELETE FROM crops WHERE id = $1', [fixture.cropId]);
  await pool.query(
    'DELETE FROM users WHERE id = ANY($1::uuid[])',
    [[fixture.buyerId, fixture.farmerId]],
  );
}

test('chat tables initialize repeatedly and have the required structure', async () => {
  await initializeDatabase();
  await initializeDatabase();

  const tables = await pool.query(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name IN (
         'conversations',
         'messages',
         'conversation_read_states'
       )
     ORDER BY table_name`,
  );

  assert.deepEqual(
    tables.rows.map((row) => row.table_name),
    ['conversation_read_states', 'conversations', 'messages'],
  );

  const messageColumns = await pool.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'messages'
     ORDER BY ordinal_position`,
  );
  const messageColumnNames = messageColumns.rows.map((row) => row.column_name);
  assert.ok(messageColumnNames.includes('conversation_id'));
  assert.ok(messageColumnNames.includes('sender_id'));
  assert.ok(messageColumnNames.includes('content'));
  assert.ok(messageColumnNames.includes('client_message_id'));
  assert.ok(messageColumnNames.includes('created_at'));
});

test('conversation and message constraints enforce one conversation and valid references', async () => {
  const fixture = await createOrderFixture();

  try {
    const conversation = await pool.query(
      `INSERT INTO conversations (order_id)
       VALUES ($1)
       RETURNING id`,
      [fixture.orderId],
    );
    const conversationId = conversation.rows[0].id;

    await assert.rejects(
      () => pool.query(
        'INSERT INTO conversations (order_id) VALUES ($1)',
        [fixture.orderId],
      ),
      { code: '23505' },
    );

    await assert.rejects(
      () => pool.query(
        `INSERT INTO messages (
          conversation_id, sender_id, content, client_message_id
        ) VALUES ($1, $2, $3, $4)`,
        [randomUUID(), fixture.buyerId, 'Hello', randomUUID()],
      ),
      { code: '23503' },
    );

    await assert.rejects(
      () => pool.query(
        `INSERT INTO messages (
          conversation_id, sender_id, content, client_message_id
        ) VALUES ($1, $2, $3, $4)`,
        [conversationId, randomUUID(), 'Hello', randomUUID()],
      ),
      { code: '23503' },
    );

    for (const whitespaceOnlyContent of ['   ', '\t', '\n', '\r', ' \t\n\r']) {
      await assert.rejects(
        () => pool.query(
          `INSERT INTO messages (
            conversation_id, sender_id, content, client_message_id
          ) VALUES ($1, $2, $3, $4)`,
          [conversationId, fixture.buyerId, whitespaceOnlyContent, randomUUID()],
        ),
        { code: '23514' },
      );
    }

    await assert.rejects(
      () => pool.query(
        `INSERT INTO messages (
          conversation_id, sender_id, content, client_message_id
        ) VALUES ($1, $2, $3, $4)`,
        [conversationId, fixture.buyerId, 'x'.repeat(2001), randomUUID()],
      ),
      { code: '23514' },
    );
  } finally {
    await cleanupFixture(fixture);
  }
});

test('message idempotency and read states enforce their unique combinations', async () => {
  const fixture = await createOrderFixture();

  try {
    const conversation = await pool.query(
      `INSERT INTO conversations (order_id)
       VALUES ($1)
       RETURNING id`,
      [fixture.orderId],
    );
    const conversationId = conversation.rows[0].id;

    await assert.rejects(
      () => pool.query(
        `INSERT INTO conversation_read_states (
          conversation_id, user_id
        ) VALUES ($1, $2)`,
        [randomUUID(), fixture.buyerId],
      ),
      { code: '23503' },
    );

    await assert.rejects(
      () => pool.query(
        `INSERT INTO conversation_read_states (
          conversation_id, user_id
        ) VALUES ($1, $2)`,
        [conversationId, randomUUID()],
      ),
      { code: '23503' },
    );

    const clientMessageId = randomUUID();

    await pool.query(
      `INSERT INTO messages (
        conversation_id, sender_id, content, client_message_id
      ) VALUES ($1, $2, $3, $4)`,
      [conversationId, fixture.buyerId, 'First message', clientMessageId],
    );

    await assert.rejects(
      () => pool.query(
        `INSERT INTO messages (
          conversation_id, sender_id, content, client_message_id
        ) VALUES ($1, $2, $3, $4)`,
        [conversationId, fixture.buyerId, 'Duplicate message', clientMessageId],
      ),
      { code: '23505' },
    );

    await pool.query(
      `INSERT INTO messages (
        conversation_id, sender_id, content, client_message_id
      ) VALUES ($1, $2, $3, $4)`,
      [conversationId, fixture.farmerId, 'Farmer message', clientMessageId],
    );

    await pool.query(
      `INSERT INTO conversation_read_states (
        conversation_id, user_id
      ) VALUES ($1, $2)`,
      [conversationId, fixture.buyerId],
    );

    await assert.rejects(
      () => pool.query(
        `INSERT INTO conversation_read_states (
          conversation_id, user_id
        ) VALUES ($1, $2)`,
        [conversationId, fixture.buyerId],
      ),
      { code: '23505' },
    );

    await pool.query(
      `INSERT INTO conversation_read_states (
        conversation_id, user_id
      ) VALUES ($1, $2)`,
      [conversationId, fixture.farmerId],
    );
  } finally {
    await cleanupFixture(fixture);
  }
});
