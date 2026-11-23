import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import app from '../server.js';
import { pool } from '../config/db.js';
import { createChatSocketServer } from '../sockets/chatSocket.js';

const httpServer = createServer(app);
const io = createChatSocketServer(httpServer);
let baseUrl;
let nextAckId = 0;

before(async () => {
  await new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(0, '127.0.0.1', () => {
      httpServer.removeListener('error', reject);
      baseUrl = `http://127.0.0.1:${httpServer.address().port}`;
      resolve();
    });
  });
});

after(async () => {
  await new Promise((resolve, reject) => {
    io.close((error) => (error ? reject(error) : resolve()));
  });
});

function connectSocket(token) {
  return new Promise((resolve, reject) => {
    const websocket = new WebSocket(`${baseUrl.replace(/^http/, 'ws')}/socket.io/?EIO=4&transport=websocket`);
    const acknowledgements = new Map();
    const events = new Map();
    const eventCounts = new Map();
    const waiters = new Map();
    let authSent = false;
    let settled = false;
    let resolveClosed;
    const closed = new Promise((resolve) => {
      resolveClosed = resolve;
    });

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        websocket.close();
        reject(new Error('Socket connection timed out.'));
      }
    }, 5000);

    function dispatchEvent(name, payload) {
      eventCounts.set(name, (eventCounts.get(name) || 0) + 1);
      const eventWaiters = waiters.get(name) || [];
      if (eventWaiters.length) {
        eventWaiters.shift()(payload);
        return;
      }
      const queue = events.get(name) || [];
      queue.push(payload);
      events.set(name, queue);
    }

    websocket.addEventListener('message', (messageEvent) => {
      const packets = String(messageEvent.data).split('\x1e');
      for (const packet of packets) {
        if (packet === '2') {
          websocket.send('3');
          continue;
        }
        if (packet.startsWith('0') && !authSent) {
          authSent = true;
          websocket.send(`40${JSON.stringify(token ? { token } : {})}`);
          continue;
        }
        if (packet.startsWith('40') && !settled) {
          settled = true;
          clearTimeout(timeout);
          resolve({
            emit(eventName, payload) {
              const id = ++nextAckId;
              return new Promise((ackResolve, ackReject) => {
                acknowledgements.set(id, { resolve: ackResolve, reject: ackReject });
                websocket.send(`42${id}${JSON.stringify([eventName, payload])}`);
              });
            },
            waitForEvent(eventName, waitMs = 3000) {
              const queue = events.get(eventName) || [];
              if (queue.length) {
                return Promise.resolve(queue.shift());
              }
              return new Promise((eventResolve, eventReject) => {
                const eventWaiters = waiters.get(eventName) || [];
                const timer = setTimeout(() => {
                  const index = eventWaiters.indexOf(onEvent);
                  if (index >= 0) eventWaiters.splice(index, 1);
                  eventReject(new Error(`Timed out waiting for ${eventName}.`));
                }, waitMs);
                function onEvent(payloadValue) {
                  clearTimeout(timer);
                  eventResolve(payloadValue);
                }
                eventWaiters.push(onEvent);
                waiters.set(eventName, eventWaiters);
              });
            },
            countEvents(eventName) {
              return eventCounts.get(eventName) || 0;
            },
            close() {
              websocket.close();
            },
            waitForDisconnect() {
              return closed;
            },
          });
          continue;
        }
        if (packet.startsWith('44')) {
          const error = new Error('Socket authentication rejected.');
          if (!settled) {
            settled = true;
            clearTimeout(timeout);
            websocket.close();
            reject(error);
          }
          continue;
        }
        if (packet.startsWith('43')) {
          const body = packet.slice(2);
          const match = /^(\d+)(.*)$/.exec(body);
          if (match) {
            const pending = acknowledgements.get(Number(match[1]));
            if (pending) {
              acknowledgements.delete(Number(match[1]));
              const result = JSON.parse(match[2])[0];
              pending.resolve(result);
            }
          }
          continue;
        }
        if (packet.startsWith('42')) {
          const body = packet.slice(2);
          const bracketIndex = body.indexOf('[');
          if (bracketIndex < 0) continue;
          const packetId = body.slice(0, bracketIndex);
          const [eventName, payload] = JSON.parse(body.slice(bracketIndex));
          if (packetId) {
            const pending = acknowledgements.get(Number(packetId));
            if (pending) {
              acknowledgements.delete(Number(packetId));
              pending.resolve(payload);
            }
          } else {
            dispatchEvent(eventName, payload);
          }
        }
      }
    });

    websocket.addEventListener('error', () => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(new Error('Socket transport failed.'));
      }
    });
    websocket.addEventListener('close', () => {
      resolveClosed();
      acknowledgements.forEach(({ reject: rejectAcknowledgement }) => {
        rejectAcknowledgement(new Error('Socket disconnected before acknowledgement.'));
      });
      acknowledgements.clear();
    });
  });
}

async function withTestContext(run) {
  const context = { userIds: [], cropIds: [], orderIds: [], sockets: [] };
  try {
    await run(context);
  } finally {
    context.sockets.forEach((socket) => socket.close());
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
      await pool.query('DELETE FROM crops WHERE id = ANY($1::uuid[])', [context.cropIds]);
    }
    if (context.userIds.length) {
      await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [context.userIds]);
    }
  }
}

async function createAccount(context, role) {
  const account = {
    name: `Socket ${role} ${randomUUID().slice(0, 5)}`,
    email: `socket-${role}-${randomUUID()}@example.com`,
    phone: '9876543210',
    password: 'password123',
    role,
  };
  const registered = await request(app).post('/api/auth/register').send(account);
  assert.equal(registered.status, 201);
  const login = await request(app).post('/api/auth/login').send({
    email: account.email,
    password: account.password,
  });
  assert.equal(login.status, 200);
  Object.assign(account, {
    id: registered.body.user.id,
    token: login.body.token,
  });
  context.userIds.push(account.id);
  return account;
}

async function createConversation(context, buyer, farmer, status = 'confirmed') {
  const cropResult = await pool.query(
    `INSERT INTO crops (
      farmer_id, name, category, price, unit, quantity, location,
      harvest_date, status
    ) VALUES ($1, $2, 'Vegetables', 20, 'kg', 10, 'Nashik', '2026-10-05', 'available')
    RETURNING id`,
    [farmer.id, `Socket crop ${randomUUID().slice(0, 6)}`],
  );
  const cropId = cropResult.rows[0].id;
  context.cropIds.push(cropId);
  const orderResult = await pool.query(
    `INSERT INTO orders (
      buyer_id, farmer_id, crop_id, quantity, unit, unit_price, total_amount, status
    ) VALUES ($1, $2, $3, 1, 'kg', 20, 20, $4)
    RETURNING id`,
    [buyer.id, farmer.id, cropId, status],
  );
  const orderId = orderResult.rows[0].id;
  context.orderIds.push(orderId);
  const conversationResult = await pool.query(
    'INSERT INTO conversations (order_id) VALUES ($1) RETURNING id',
    [orderId],
  );
  return { orderId, conversationId: conversationResult.rows[0].id };
}

function trackSocket(context, socket) {
  context.sockets.push(socket);
  return socket;
}

function waitForDisconnect(socket, timeoutMs = 5000) {
  let timeout;
  return Promise.race([
    socket.waitForDisconnect(),
    new Promise((_, reject) => {
      timeout = setTimeout(
        () => reject(new Error('Timed out waiting for socket disconnection.')),
        timeoutMs,
      );
    }),
  ]).finally(() => clearTimeout(timeout));
}

test('socket authentication rejects missing, invalid, and expired JWTs and accepts valid users', async () => {
  await withTestContext(async (context) => {
    const buyer = await createAccount(context, 'buyer');
    const expiredToken = jwt.sign(
      { id: buyer.id, role: buyer.role },
      process.env.JWT_SECRET,
      { expiresIn: -1 },
    );

    await assert.rejects(connectSocket(undefined), /authentication rejected/i);
    await assert.rejects(connectSocket('not-a-valid-jwt'), /authentication rejected/i);
    await assert.rejects(connectSocket(expiredToken), /authentication rejected/i);

    const socket = trackSocket(context, await connectSocket(buyer.token));
    assert.ok(socket);

    const shortLivedToken = jwt.sign(
      { id: buyer.id, role: buyer.role },
      process.env.JWT_SECRET,
      { expiresIn: 2 },
    );
    const expiringSocket = trackSocket(context, await connectSocket(shortLivedToken));
    await waitForDisconnect(expiringSocket);
  });
});

test('eligible participants join rooms while unrelated users, invalid IDs, and pending orders are rejected', async () => {
  await withTestContext(async (context) => {
    const buyer = await createAccount(context, 'buyer');
    const farmer = await createAccount(context, 'farmer');
    const unrelated = await createAccount(context, 'buyer');
    const conversation = await createConversation(context, buyer, farmer);
    const buyerSocket = trackSocket(context, await connectSocket(buyer.token));
    const farmerSocket = trackSocket(context, await connectSocket(farmer.token));
    const unrelatedSocket = trackSocket(context, await connectSocket(unrelated.token));

    assert.equal((await buyerSocket.emit('conversation:join', {
      conversationId: conversation.conversationId,
    })).success, true);
    assert.equal((await farmerSocket.emit('conversation:join', {
      conversationId: conversation.conversationId,
    })).success, true);
    assert.equal((await unrelatedSocket.emit('conversation:join', {
      conversationId: conversation.conversationId,
    })).success, false);
    assert.equal((await buyerSocket.emit('conversation:join', {
      conversationId: 'invalid',
    })).success, false);

    const pending = await createConversation(context, buyer, farmer, 'pending');
    assert.equal((await buyerSocket.emit('conversation:join', {
      conversationId: pending.conversationId,
    })).success, false);

    for (const status of ['shipped', 'delivered', 'cancelled']) {
      const eligible = await createConversation(context, buyer, farmer, status);
      assert.equal((await buyerSocket.emit('conversation:join', {
        conversationId: eligible.conversationId,
      })).success, true);
    }
  });
});

test('Socket.IO persists messages before delivery, authenticates sender, and deduplicates retries', async () => {
  await withTestContext(async (context) => {
    const buyer = await createAccount(context, 'buyer');
    const farmer = await createAccount(context, 'farmer');
    const conversation = await createConversation(context, buyer, farmer);
    const buyerSocket = trackSocket(context, await connectSocket(buyer.token));
    const farmerSocket = trackSocket(context, await connectSocket(farmer.token));
    await buyerSocket.emit('conversation:join', { conversationId: conversation.conversationId });
    await farmerSocket.emit('conversation:join', { conversationId: conversation.conversationId });

    const newMessage = farmerSocket.waitForEvent('message:new');
    const clientMessageId = randomUUID();
    const ack = await buyerSocket.emit('message:send', {
      conversationId: conversation.conversationId,
      content: 'Socket message',
      clientMessageId,
      senderId: farmer.id,
    });
    assert.equal(ack.success, true);
    assert.equal(ack.message.sender_id, buyer.id);
    const broadcast = await newMessage;
    assert.equal(broadcast.id, ack.message.id);
    assert.equal(broadcast.sender_id, buyer.id);

    const duplicate = await buyerSocket.emit('message:send', {
      conversationId: conversation.conversationId,
      content: 'Retry',
      clientMessageId,
    });
    assert.equal(duplicate.message.id, ack.message.id);
    const stored = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM messages
       WHERE conversation_id = $1 AND sender_id = $2 AND client_message_id = $3`,
      [conversation.conversationId, buyer.id, clientMessageId],
    );
    assert.equal(stored.rows[0].total, 1);

    for (const content of ['', ' \t\n', 'x'.repeat(2001)]) {
      const invalid = await buyerSocket.emit('message:send', {
        conversationId: conversation.conversationId,
        content,
        clientMessageId: randomUUID(),
      });
      assert.equal(invalid.success, false);
    }

    const unicodeMessage = await buyerSocket.emit('message:send', {
      conversationId: conversation.conversationId,
      content: `${'😀'.repeat(1000)}${'界'.repeat(1000)}`,
      clientMessageId: randomUUID(),
    });
    assert.equal(unicodeMessage.success, true);
    assert.equal(Array.from(unicodeMessage.message.content).length, 2000);

    const oversizedUnicode = await buyerSocket.emit('message:send', {
      conversationId: conversation.conversationId,
      content: `${'😀'.repeat(1001)}${'界'.repeat(1000)}`,
      clientMessageId: randomUUID(),
    });
    assert.equal(oversizedUnicode.success, false);

    const invalidId = await buyerSocket.emit('message:send', {
      conversationId: conversation.conversationId,
      content: 'Valid text',
      clientMessageId: 'invalid',
    });
    assert.equal(invalidId.success, false);

    const pending = await createConversation(context, buyer, farmer, 'pending');
    const pendingMessage = await buyerSocket.emit('message:send', {
      conversationId: pending.conversationId,
      content: 'Pending message',
      clientMessageId: randomUUID(),
    });
    assert.equal(pendingMessage.success, false);
  });
});

test('duplicate message retries acknowledge the original without broadcasting again', async () => {
  await withTestContext(async (context) => {
    const buyer = await createAccount(context, 'buyer');
    const farmer = await createAccount(context, 'farmer');
    const conversation = await createConversation(context, buyer, farmer);
    const buyerSocket = trackSocket(context, await connectSocket(buyer.token));
    const farmerSocket = trackSocket(context, await connectSocket(farmer.token));
    await buyerSocket.emit('conversation:join', { conversationId: conversation.conversationId });
    await farmerSocket.emit('conversation:join', { conversationId: conversation.conversationId });

    const clientMessageId = randomUUID();
    const content = 'Idempotent socket message';
    const firstBroadcastPromise = farmerSocket.waitForEvent('message:new');
    const firstAck = await buyerSocket.emit('message:send', {
      conversationId: conversation.conversationId,
      content,
      clientMessageId,
    });
    const firstBroadcast = await firstBroadcastPromise;
    assert.equal(firstAck.success, true);
    assert.equal(firstBroadcast.id, firstAck.message.id);
    assert.equal(firstBroadcast.content, content);
    assert.equal(farmerSocket.countEvents('message:new'), 1);

    const retryAck = await buyerSocket.emit('message:send', {
      conversationId: conversation.conversationId,
      content,
      clientMessageId,
    });
    assert.equal(retryAck.success, true);
    assert.equal(retryAck.message.id, firstAck.message.id);
    assert.equal(retryAck.message.content, firstAck.message.content);

    const readAck = await buyerSocket.emit('conversation:read', {
      conversationId: conversation.conversationId,
    });
    assert.equal(readAck.success, true);
    await farmerSocket.waitForEvent('conversation:read');
    assert.equal(farmerSocket.countEvents('message:new'), 1);

    const stored = await pool.query(
      `SELECT id, content
       FROM messages
       WHERE conversation_id = $1 AND sender_id = $2 AND client_message_id = $3`,
      [conversation.conversationId, buyer.id, clientMessageId],
    );
    assert.equal(stored.rowCount, 1);
    assert.equal(stored.rows[0].id, firstAck.message.id);
    assert.equal(stored.rows[0].content, content);
  });
});

test('message authorization works without room membership', async () => {
  await withTestContext(async (context) => {
    const buyer = await createAccount(context, 'buyer');
    const farmer = await createAccount(context, 'farmer');
    const unrelated = await createAccount(context, 'buyer');
    const conversation = await createConversation(context, buyer, farmer);
    const buyerSocket = trackSocket(context, await connectSocket(buyer.token));
    const farmerSocket = trackSocket(context, await connectSocket(farmer.token));
    const unrelatedSocket = trackSocket(context, await connectSocket(unrelated.token));
    await farmerSocket.emit('conversation:join', { conversationId: conversation.conversationId });

    const buyerMessageId = randomUUID();
    const buyerBroadcastPromise = farmerSocket.waitForEvent('message:new');
    const buyerAck = await buyerSocket.emit('message:send', {
      conversationId: conversation.conversationId,
      content: 'Authorized without joining',
      clientMessageId: buyerMessageId,
    });
    const buyerBroadcast = await buyerBroadcastPromise;
    assert.equal(buyerAck.success, true);
    assert.equal(buyerAck.message.sender_id, buyer.id);
    assert.equal(buyerBroadcast.id, buyerAck.message.id);
    assert.equal(farmerSocket.countEvents('message:new'), 1);

    const unrelatedMessageId = randomUUID();
    const unrelatedAck = await unrelatedSocket.emit('message:send', {
      conversationId: conversation.conversationId,
      content: 'Unauthorized without joining',
      clientMessageId: unrelatedMessageId,
    });
    assert.equal(unrelatedAck.success, false);

    const readAck = await buyerSocket.emit('conversation:read', {
      conversationId: conversation.conversationId,
    });
    assert.equal(readAck.success, true);
    await farmerSocket.waitForEvent('conversation:read');
    assert.equal(farmerSocket.countEvents('message:new'), 1);

    const stored = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM messages
       WHERE conversation_id = $1
         AND sender_id = $3
         AND client_message_id = ANY($2::uuid[])`,
      [conversation.conversationId, [buyerMessageId, unrelatedMessageId], unrelated.id],
    );
    assert.equal(stored.rows[0].total, 0);

    const buyerMessage = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM messages
       WHERE conversation_id = $1
         AND sender_id = $2
         AND client_message_id = $3`,
      [conversation.conversationId, buyer.id, buyerMessageId],
    );
    assert.equal(buyerMessage.rows[0].total, 1);
  });
});

test('failed message persistence emits no successful broadcast', async () => {
  await withTestContext(async (context) => {
    const buyer = await createAccount(context, 'buyer');
    const farmer = await createAccount(context, 'farmer');
    const conversation = await createConversation(context, buyer, farmer);
    const buyerSocket = trackSocket(context, await connectSocket(buyer.token));
    const farmerSocket = trackSocket(context, await connectSocket(farmer.token));
    await buyerSocket.emit('conversation:join', { conversationId: conversation.conversationId });
    await farmerSocket.emit('conversation:join', { conversationId: conversation.conversationId });

    await pool.query(`
      CREATE OR REPLACE FUNCTION chat_test_fail_socket_message()
      RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'forced socket message failure';
      END;
      $$ LANGUAGE plpgsql
    `);
    await pool.query(`
      CREATE TRIGGER chat_test_fail_socket_message_trigger
      BEFORE INSERT ON messages
      FOR EACH ROW
      EXECUTE FUNCTION chat_test_fail_socket_message()
    `);

    const noBroadcast = farmerSocket.waitForEvent('message:new', 350)
      .then(() => true, () => false);
    try {
      const failed = await buyerSocket.emit('message:send', {
        conversationId: conversation.conversationId,
        content: 'Must not broadcast',
        clientMessageId: randomUUID(),
      });
      assert.equal(failed.success, false);
      assert.equal(await noBroadcast, false);
    } finally {
      await pool.query(
        'DROP TRIGGER IF EXISTS chat_test_fail_socket_message_trigger ON messages',
      );
      await pool.query('DROP FUNCTION IF EXISTS chat_test_fail_socket_message()');
    }
  });
});

test('read events update only the caller and reach the other participant', async () => {
  await withTestContext(async (context) => {
    const buyer = await createAccount(context, 'buyer');
    const farmer = await createAccount(context, 'farmer');
    const unrelated = await createAccount(context, 'buyer');
    const conversation = await createConversation(context, buyer, farmer);
    const buyerSocket = trackSocket(context, await connectSocket(buyer.token));
    const farmerSocket = trackSocket(context, await connectSocket(farmer.token));
    const unrelatedSocket = trackSocket(context, await connectSocket(unrelated.token));
    await buyerSocket.emit('conversation:join', { conversationId: conversation.conversationId });
    await farmerSocket.emit('conversation:join', { conversationId: conversation.conversationId });

    const readEvent = farmerSocket.waitForEvent('conversation:read');
    const readAck = await buyerSocket.emit('conversation:read', {
      conversationId: conversation.conversationId,
      userId: farmer.id,
    });
    assert.equal(readAck.success, true);
    assert.equal(readAck.read_state.user_id, buyer.id);
    const broadcast = await readEvent;
    assert.equal(broadcast.userId, buyer.id);

    const row = await pool.query(
      'SELECT user_id FROM conversation_read_states WHERE conversation_id = $1',
      [conversation.conversationId],
    );
    assert.equal(row.rowCount, 1);
    assert.equal(row.rows[0].user_id, buyer.id);

    const denied = await unrelatedSocket.emit('conversation:read', {
      conversationId: conversation.conversationId,
    });
    assert.equal(denied.success, false);

    const pending = await createConversation(context, buyer, farmer, 'pending');
    const pendingRead = await buyerSocket.emit('conversation:read', {
      conversationId: pending.conversationId,
    });
    assert.equal(pendingRead.success, false);
  });
});
