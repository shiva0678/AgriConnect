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
      await pool.query(
        'DELETE FROM conversations WHERE order_id = ANY($1::uuid[])',
        [context.orderIds],
      );
      await pool.query(
        'DELETE FROM orders WHERE id = ANY($1::uuid[])',
        [context.orderIds],
      );
    }
    if (context.cropIds.length) {
      await pool.query(
        'DELETE FROM crops WHERE id = ANY($1::uuid[])',
        [context.cropIds],
      );
    }
    if (context.userIds.length) {
      await pool.query(
        'DELETE FROM users WHERE id = ANY($1::uuid[])',
        [context.userIds],
      );
    }
  }
}

async function createAccount(context, role) {
  const payload = {
    name: `Chat ${role} ${randomUUID().slice(0, 6)}`,
    email: `chat-${role}-${randomUUID()}@example.com`,
    phone: '9876543210',
    password: 'password123',
    role,
  };
  const registered = await request(app).post('/api/auth/register').send(payload);
  assert.equal(registered.status, 201);
  const login = await request(app).post('/api/auth/login').send({
    email: payload.email,
    password: payload.password,
  });
  assert.equal(login.status, 200);
  const account = { ...payload, id: registered.body.user.id, token: login.body.token };
  context.userIds.push(account.id);
  return account;
}

async function createCrop(context, farmerId) {
  const result = await pool.query(
    `INSERT INTO crops (
      farmer_id, name, category, description, price, unit, quantity,
      location, harvest_date, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'available')
    RETURNING id`,
    [
      farmerId,
      `Chat Crop ${randomUUID().slice(0, 6)}`,
      'Vegetables',
      'Chat route test crop',
      30,
      'kg',
      100,
      'Nashik',
      '2026-10-05',
    ],
  );
  context.cropIds.push(result.rows[0].id);
  return result.rows[0].id;
}

async function createOrder(context, { buyerId, farmerId, cropId, status = 'confirmed' }) {
  const result = await pool.query(
    `INSERT INTO orders (
      buyer_id, farmer_id, crop_id, quantity, unit,
      unit_price, total_amount, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING id`,
    [buyerId, farmerId, cropId, 2, 'kg', 30, 60, status],
  );
  context.orderIds.push(result.rows[0].id);
  return result.rows[0].id;
}

async function getConversation(context, buyer, farmer, status = 'confirmed') {
  const cropId = await createCrop(context, farmer.id);
  const orderId = await createOrder(context, {
    buyerId: buyer.id,
    farmerId: farmer.id,
    cropId,
    status,
  });
  if (status !== 'pending') {
    const lookup = await request(app)
      .get(`/api/orders/${orderId}/conversation`)
      .set('Authorization', `Bearer ${buyer.token}`);
    assert.equal(lookup.status, 200);
    return { orderId, conversationId: lookup.body.conversation.id };
  }
  return { orderId, conversationId: null };
}

test('buyer and farmer can list only their conversations with participant, order and unread data', async () => {
  await withTestContext(async (context) => {
    const buyer = await createAccount(context, 'buyer');
    const farmer = await createAccount(context, 'farmer');
    const unrelated = await createAccount(context, 'buyer');
    const otherCrop = await createCrop(context, farmer.id);
    const orderId = await createOrder(context, {
      buyerId: buyer.id,
      farmerId: farmer.id,
      cropId: otherCrop,
    });

    const lookup = await request(app)
      .get(`/api/orders/${orderId}/conversation`)
      .set('Authorization', `Bearer ${buyer.token}`);
    assert.equal(lookup.status, 200);
    const conversationId = lookup.body.conversation.id;

    await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${farmer.token}`)
      .send({ content: 'Payment details?', client_message_id: randomUUID() });

    const buyerList = await request(app)
      .get('/api/conversations')
      .set('Authorization', `Bearer ${buyer.token}`);
    assert.equal(buyerList.status, 200);
    assert.equal(buyerList.body.conversations.length, 1);
    assert.equal(buyerList.body.conversations[0].order_id, orderId);
    assert.equal(buyerList.body.conversations[0].other_participant_id, farmer.id);
    assert.equal(buyerList.body.conversations[0].other_participant_name, farmer.name);
    assert.equal(buyerList.body.conversations[0].order_status, 'confirmed');
    assert.equal(buyerList.body.conversations[0].unread_count, 1);
    assert.equal(buyerList.body.conversations[0].latest_message_content, 'Payment details?');
    assert.equal('buyer_id' in buyerList.body.conversations[0], false);
    assert.equal('farmer_id' in buyerList.body.conversations[0], false);

    const farmerList = await request(app)
      .get('/api/conversations')
      .set('Authorization', `Bearer ${farmer.token}`);
    assert.equal(farmerList.status, 200);
    assert.equal(farmerList.body.conversations.length, 1);
    assert.equal(farmerList.body.conversations[0].other_participant_id, buyer.id);

    const unrelatedList = await request(app)
      .get('/api/conversations')
      .set('Authorization', `Bearer ${unrelated.token}`);
    assert.equal(unrelatedList.status, 200);
    assert.deepEqual(unrelatedList.body.conversations, []);
  });
});

test('pending is unavailable, participants can access eligible statuses, and unrelated users are denied', async () => {
  await withTestContext(async (context) => {
    const buyer = await createAccount(context, 'buyer');
    const farmer = await createAccount(context, 'farmer');
    const unrelated = await createAccount(context, 'buyer');
    const cropId = await createCrop(context, farmer.id);
    const pendingOrderId = await createOrder(context, {
      buyerId: buyer.id,
      farmerId: farmer.id,
      cropId,
      status: 'pending',
    });

    const pending = await request(app)
      .get(`/api/orders/${pendingOrderId}/conversation`)
      .set('Authorization', `Bearer ${buyer.token}`);
    assert.equal(pending.status, 404);

    const pendingConversation = await pool.query(
      `INSERT INTO conversations (order_id)
       VALUES ($1)
       RETURNING id`,
      [pendingOrderId],
    );
    await pool.query(
      `INSERT INTO messages (
        conversation_id, sender_id, content, client_message_id
      ) VALUES ($1, $2, $3, $4)`,
      [pendingConversation.rows[0].id, farmer.id, 'Legacy pending message', randomUUID()],
    );
    const pendingHistory = await request(app)
      .get(`/api/conversations/${pendingConversation.rows[0].id}/messages`)
      .set('Authorization', `Bearer ${buyer.token}`);
    assert.equal(pendingHistory.status, 404);
    const pendingRead = await request(app)
      .patch(`/api/conversations/${pendingConversation.rows[0].id}/read`)
      .set('Authorization', `Bearer ${buyer.token}`);
    assert.equal(pendingRead.status, 404);
    const pendingList = await request(app)
      .get('/api/conversations')
      .set('Authorization', `Bearer ${buyer.token}`);
    assert.equal(pendingList.body.conversations.length, 0);
    const pendingUnread = await request(app)
      .get('/api/conversations/unread-count')
      .set('Authorization', `Bearer ${buyer.token}`);
    assert.equal(pendingUnread.body.unread_count, 0);

    const unrelatedLookup = await request(app)
      .get(`/api/orders/${pendingOrderId}/conversation`)
      .set('Authorization', `Bearer ${unrelated.token}`);
    assert.equal(unrelatedLookup.status, 404);

    for (const status of ['confirmed', 'shipped', 'delivered', 'cancelled']) {
      const orderId = await createOrder(context, {
        buyerId: buyer.id,
        farmerId: farmer.id,
        cropId,
        status,
      });
      const buyerLookup = await request(app)
        .get(`/api/orders/${orderId}/conversation`)
        .set('Authorization', `Bearer ${buyer.token}`);
      assert.equal(buyerLookup.status, 200);
      const farmerLookup = await request(app)
        .get(`/api/orders/${orderId}/conversation`)
        .set('Authorization', `Bearer ${farmer.token}`);
      assert.equal(farmerLookup.status, 200);
    }
  });
});

test('historical confirmed lookup lazily creates exactly one conversation under concurrent requests', async () => {
  await withTestContext(async (context) => {
    const buyer = await createAccount(context, 'buyer');
    const farmer = await createAccount(context, 'farmer');
    const cropId = await createCrop(context, farmer.id);
    const orderId = await createOrder(context, {
      buyerId: buyer.id,
      farmerId: farmer.id,
      cropId,
      status: 'confirmed',
    });

    const lookups = await Promise.all(
      Array.from({ length: 6 }, () => request(app)
        .get(`/api/orders/${orderId}/conversation`)
        .set('Authorization', `Bearer ${buyer.token}`)),
    );
    assert.ok(lookups.every((lookup) => lookup.status === 200));
    const ids = lookups.map((lookup) => lookup.body.conversation.id);
    assert.equal(new Set(ids).size, 1);

    const stored = await pool.query(
      'SELECT COUNT(*)::int AS total FROM conversations WHERE order_id = $1',
      [orderId],
    );
    assert.equal(stored.rows[0].total, 1);
  });
});

test('participants retrieve chronological history, unrelated users are denied, and cursor pagination has no gaps', async () => {
  await withTestContext(async (context) => {
    const buyer = await createAccount(context, 'buyer');
    const farmer = await createAccount(context, 'farmer');
    const unrelated = await createAccount(context, 'buyer');
    const { conversationId } = await getConversation(context, buyer, farmer);

    const expectedMessages = [];
    for (let index = 1; index <= 8; index += 1) {
      const sent = await request(app)
        .post(`/api/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${index % 2 ? buyer.token : farmer.token}`)
        .send({ content: `Message ${index}`, client_message_id: randomUUID() });
      assert.equal(sent.status, 201);
      expectedMessages.push(sent.body.message);
    }

    const first = await request(app)
      .get(`/api/conversations/${conversationId}/messages?limit=3`)
      .set('Authorization', `Bearer ${buyer.token}`);
    assert.equal(first.status, 200);
    assert.equal(first.body.messages.length, 3);
    assert.equal(first.body.pagination.has_more, true);

    const oversizedPage = await request(app)
      .get(`/api/conversations/${conversationId}/messages?limit=51`)
      .set('Authorization', `Bearer ${buyer.token}`);
    assert.equal(oversizedPage.status, 400);

    const traversedMessages = [...first.body.messages];
    const validCursor = first.body.pagination.next_cursor;
    let cursor = first.body.pagination.next_cursor;
    let hasMore = first.body.pagination.has_more;
    while (hasMore) {
      const page = await request(app)
        .get(`/api/conversations/${conversationId}/messages?limit=3&before=${encodeURIComponent(cursor.created_at)}&before_id=${cursor.id}`)
        .set('Authorization', `Bearer ${farmer.token}`);
      assert.equal(page.status, 200);
      traversedMessages.unshift(...page.body.messages);
      cursor = page.body.pagination.next_cursor;
      hasMore = page.body.pagination.has_more;
    }

    const expectedIds = expectedMessages.map((message) => message.id);
    const actualIds = traversedMessages.map((message) => message.id);
    assert.deepEqual(actualIds, expectedIds);
    assert.equal(new Set(actualIds).size, expectedIds.length);
    const timestamps = traversedMessages.map((message) => new Date(message.created_at).getTime());
    assert.deepEqual(timestamps, [...timestamps].sort((left, right) => left - right));

    const otherConversation = await getConversation(context, buyer, farmer);
    const otherMessage = await request(app)
      .post(`/api/conversations/${otherConversation.conversationId}/messages`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ content: 'Other conversation', client_message_id: randomUUID() });
    assert.equal(otherMessage.status, 201);

    const otherMessageCursor = await pool.query(
      `SELECT to_char(
         created_at AT TIME ZONE 'UTC',
         'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
       ) AS created_at
       FROM messages
       WHERE id = $1`,
      [otherMessage.body.message.id],
    );
    const invalidCursors = [
      `before=${encodeURIComponent(validCursor.created_at)}`,
      `before_id=${expectedMessages[0].id}`,
      `before=${encodeURIComponent(validCursor.created_at)}&before_id=${randomUUID()}`,
      `before=${encodeURIComponent(validCursor.created_at)}&before_id=${first.body.messages[2].id}`,
      `before=${encodeURIComponent(otherMessageCursor.rows[0].created_at)}&before_id=${otherMessage.body.message.id}`,
    ];
    for (const invalidCursor of invalidCursors) {
      const invalid = await request(app)
        .get(`/api/conversations/${conversationId}/messages?${invalidCursor}`)
        .set('Authorization', `Bearer ${buyer.token}`);
      assert.equal(invalid.status, 400);
    }

    const denied = await request(app)
      .get(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${unrelated.token}`);
    assert.equal(denied.status, 404);
  });
});

test('both participants send messages, terminal statuses remain writable, and pending messages are rejected', async () => {
  await withTestContext(async (context) => {
    const buyer = await createAccount(context, 'buyer');
    const farmer = await createAccount(context, 'farmer');

    for (const status of ['confirmed', 'shipped', 'delivered', 'cancelled']) {
      const cropId = await createCrop(context, farmer.id);
      const orderId = await createOrder(context, {
        buyerId: buyer.id,
        farmerId: farmer.id,
        cropId,
        status,
      });
      const lookup = await request(app)
        .get(`/api/orders/${orderId}/conversation`)
        .set('Authorization', `Bearer ${buyer.token}`);
      const conversationId = lookup.body.conversation.id;

      for (const token of [buyer.token, farmer.token]) {
        const sent = await request(app)
          .post(`/api/conversations/${conversationId}/messages`)
          .set('Authorization', `Bearer ${token}`)
          .send({ content: `Message for ${status}`, client_message_id: randomUUID() });
        assert.equal(sent.status, 201);
        assert.ok(sent.body.message.id);
      }
    }

    const pendingCropId = await createCrop(context, farmer.id);
    const pendingOrderId = await createOrder(context, {
      buyerId: buyer.id,
      farmerId: farmer.id,
      cropId: pendingCropId,
      status: 'pending',
    });
    const pendingLookup = await request(app)
      .get(`/api/orders/${pendingOrderId}/conversation`)
      .set('Authorization', `Bearer ${buyer.token}`);
    assert.equal(pendingLookup.status, 404);

    const pendingConversation = await pool.query(
      `INSERT INTO conversations (order_id)
       VALUES ($1)
       RETURNING id`,
      [pendingOrderId],
    );
    const pendingMessage = await request(app)
      .post(`/api/conversations/${pendingConversation.rows[0].id}/messages`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ content: 'Pending message', client_message_id: randomUUID() });
    assert.equal(pendingMessage.status, 404);
  });
});

test('message validation, spoof protection and duplicate client IDs work', async () => {
  await withTestContext(async (context) => {
    const buyer = await createAccount(context, 'buyer');
    const farmer = await createAccount(context, 'farmer');
    const { conversationId } = await getConversation(context, buyer, farmer);

    for (const content of ['', '   ', '\t', '\n', '\r', ' \t\n\r']) {
      const invalid = await request(app)
        .post(`/api/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${buyer.token}`)
        .send({ content, client_message_id: randomUUID() });
      assert.equal(invalid.status, 400);
    }

    const tooLong = await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ content: `${'😀'.repeat(1001)}${'界'.repeat(1000)}`, client_message_id: randomUUID() });
    assert.equal(tooLong.status, 400);

    const validUnicode = await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({
        content: `${'😀'.repeat(1000)}${'界'.repeat(1000)}`,
        client_message_id: randomUUID(),
      });
    assert.equal(validUnicode.status, 201);
    assert.equal(Array.from(validUnicode.body.message.content).length, 2000);

    const clientMessageId = randomUUID();
    const first = await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({
        content: 'Persisted message',
        client_message_id: clientMessageId,
        sender_id: farmer.id,
        buyer_id: farmer.id,
        farmer_id: buyer.id,
        order_id: randomUUID(),
      });
    assert.equal(first.status, 201);
    assert.equal(first.body.message.sender_id, buyer.id);

    const duplicate = await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ content: 'Should not replace', client_message_id: clientMessageId });
    assert.equal(duplicate.status, 201);
    assert.equal(duplicate.body.message.id, first.body.message.id);

    const stored = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM messages
       WHERE conversation_id = $1 AND sender_id = $2 AND client_message_id = $3`,
      [conversationId, buyer.id, clientMessageId],
    );
    assert.equal(stored.rows[0].total, 1);
  });
});

test('read states and unread counts are participant-specific', async () => {
  await withTestContext(async (context) => {
    const buyer = await createAccount(context, 'buyer');
    const farmer = await createAccount(context, 'farmer');
    const { conversationId } = await getConversation(context, buyer, farmer);

    await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${farmer.token}`)
      .send({ content: 'Farmer unread message', client_message_id: randomUUID() });
    await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ content: 'Buyer sent message', client_message_id: randomUUID() });

    const buyerUnreadBefore = await request(app)
      .get('/api/conversations/unread-count')
      .set('Authorization', `Bearer ${buyer.token}`);
    assert.equal(buyerUnreadBefore.body.unread_count, 1);

    const read = await request(app)
      .patch(`/api/conversations/${conversationId}/read`)
      .set('Authorization', `Bearer ${buyer.token}`);
    assert.equal(read.status, 200);

    const buyerUnreadAfter = await request(app)
      .get('/api/conversations/unread-count')
      .set('Authorization', `Bearer ${buyer.token}`);
    assert.equal(buyerUnreadAfter.body.unread_count, 0);

    await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${farmer.token}`)
      .send({ content: 'Arrived after read cutoff', client_message_id: randomUUID() });
    const buyerUnreadAfterIncoming = await request(app)
      .get('/api/conversations/unread-count')
      .set('Authorization', `Bearer ${buyer.token}`);
    assert.equal(buyerUnreadAfterIncoming.body.unread_count, 1);

    const farmerUnread = await request(app)
      .get('/api/conversations/unread-count')
      .set('Authorization', `Bearer ${farmer.token}`);
    assert.equal(farmerUnread.body.unread_count, 1);

    const states = await pool.query(
      `SELECT user_id
       FROM conversation_read_states
       WHERE conversation_id = $1
       ORDER BY user_id`,
      [conversationId],
    );
    assert.equal(states.rowCount, 1);
    assert.equal(states.rows[0].user_id, buyer.id);

    const unrelated = await createAccount(context, 'buyer');
    const denied = await request(app)
      .patch(`/api/conversations/${conversationId}/read`)
      .set('Authorization', `Bearer ${unrelated.token}`);
    assert.equal(denied.status, 404);
  });
});
