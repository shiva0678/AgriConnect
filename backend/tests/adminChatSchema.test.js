import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeDatabase, pool } from '../config/db.js';

const CHAT_TABLES = [
  'admin_chat_audit_logs',
  'admin_chat_messages',
  'admin_chat_sessions',
];

const CHAT_INDEXES = [
  'admin_chat_sessions_admin_updated_idx',
  'admin_chat_messages_session_created_idx',
  'admin_chat_messages_idempotency_uidx',
  'admin_chat_audit_logs_admin_created_idx',
  'admin_chat_audit_logs_session_created_idx',
];

async function getCoreRecordCounts() {
  const result = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM users) AS users,
      (SELECT COUNT(*)::int FROM crops) AS crops,
      (SELECT COUNT(*)::int FROM orders) AS orders
  `);
  return result.rows[0];
}

async function cleanupFixture(ids) {
  if (ids.auditLogIds.length) {
    await pool.query(
      'DELETE FROM admin_chat_audit_logs WHERE id = ANY($1::uuid[])',
      [ids.auditLogIds],
    );
  }
  if (ids.messageIds.length) {
    await pool.query(
      'DELETE FROM admin_chat_messages WHERE id = ANY($1::uuid[])',
      [ids.messageIds],
    );
  }
  if (ids.sessionIds.length) {
    await pool.query(
      'DELETE FROM admin_chat_sessions WHERE id = ANY($1::uuid[])',
      [ids.sessionIds],
    );
  }
  if (ids.userIds.length) {
    await pool.query(
      'DELETE FROM users WHERE id = ANY($1::uuid[])',
      [ids.userIds],
    );
  }
}

async function insertAdminRoleFixture(ids) {
  const id = randomUUID();
  ids.userIds.push(id);
  await pool.query(
    `INSERT INTO users (id, name, email, phone, password, role, status)
     VALUES ($1, 'Admin chat schema fixture', $2, '0000000000',
             'unusable-test-fixture-value', 'admin', 'active')`,
    [id, `admin-chat-schema-${randomUUID()}@example.invalid`],
  );
  return id;
}

test('admin chatbot tables initialize repeatedly and retain existing tables', async () => {
  await initializeDatabase();
  await initializeDatabase();

  const tables = await pool.query(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = current_schema()
       AND table_name = ANY($1::text[])
     ORDER BY table_name`,
    [CHAT_TABLES],
  );
  assert.deepEqual(tables.rows.map((row) => row.table_name), CHAT_TABLES);

  const indexes = await pool.query(
    `SELECT indexname
     FROM pg_indexes
     WHERE schemaname = current_schema()
       AND indexname = ANY($1::text[])
     ORDER BY indexname`,
    [CHAT_INDEXES],
  );
  assert.deepEqual(indexes.rows.map((row) => row.indexname), [...CHAT_INDEXES].sort());

  const existingTables = await pool.query(`
    SELECT
      to_regclass('users') AS users_table,
      to_regclass('crops') AS crops_table,
      to_regclass('orders') AS orders_table,
      to_regclass('conversations') AS conversations_table,
      to_regclass('messages') AS messages_table,
      to_regclass('price_history') AS price_history_table
  `);
  for (const table of Object.values(existingTables.rows[0])) {
    assert.ok(table);
  }
});

test('admin chat constraints, JSONB context, audit metadata, and exact fixture cleanup work', async () => {
  await initializeDatabase();
  const countsBefore = await getCoreRecordCounts();
  const ids = {
    userIds: [],
    sessionIds: [],
    messageIds: [],
    auditLogIds: [],
  };

  try {
    const adminId = await insertAdminRoleFixture(ids);
    const sessionId = randomUUID();
    ids.sessionIds.push(sessionId);
    const context = {
      version: 1,
      lastOperation: 'count_users',
      filters: {
        entity: 'users',
        role: 'farmer',
        status: 'active',
        location: { scope: 'users.location', value: 'Nashik' },
        dateRange: 'last_30_days',
      },
      resolvedDateRange: { from: '2026-10-24', to: '2026-11-23' },
      comparison: {
        previous: { from: '2026-09-24', to: '2026-10-23' },
        current: { from: '2026-10-24', to: '2026-11-23' },
      },
    };

    const cropSessionId = randomUUID();
    const orderSessionId = randomUUID();
    ids.sessionIds.push(cropSessionId, orderSessionId);
    const cropContext = {
      version: 1,
      lastOperation: 'count_crops',
      filters: {
        entity: 'crops',
        status: 'available',
        category: 'Vegetables',
        location: { scope: 'crops.location', value: 'Nashik' },
        dateRange: 'custom',
        customRange: { from: '2026-10-01', to: '2026-10-31' },
      },
    };
    const orderContext = {
      version: 1,
      lastOperation: 'count_orders',
      filters: {
        entity: 'orders',
        status: 'delivered',
        location: { scope: 'crops.location', value: 'Nashik' },
        dateRange: 'last_month',
      },
      comparison: {
        previous: { from: '2026-09-01', to: '2026-09-30' },
        current: { from: '2026-10-01', to: '2026-10-31' },
      },
    };

    for (const [id, title, sessionContext] of [
      [sessionId, 'User filters', context],
      [cropSessionId, 'Crop filters', cropContext],
      [orderSessionId, 'Order filters', orderContext],
    ]) {
      await pool.query(
        `INSERT INTO admin_chat_sessions (id, admin_id, title, context)
         VALUES ($1, $2, $3, $4::jsonb)`,
        [id, adminId, title, JSON.stringify(sessionContext)],
      );
    }

    const storedSession = await pool.query(
      'SELECT context FROM admin_chat_sessions WHERE id = $1',
      [sessionId],
    );
    assert.deepEqual(storedSession.rows[0].context, context);

    await assert.rejects(
      () => pool.query(
        `INSERT INTO admin_chat_sessions (admin_id)
         VALUES ($1)`,
        [randomUUID()],
      ),
      { code: '23503' },
    );
    await assert.rejects(
      () => pool.query(
        `INSERT INTO admin_chat_sessions (admin_id, context)
         VALUES ($1, '[]'::jsonb)`,
        [adminId],
      ),
      { code: '23514' },
    );

    const messageId = randomUUID();
    const idempotencyKey = randomUUID();
    ids.messageIds.push(messageId);
    await pool.query(
      `INSERT INTO admin_chat_messages (
         id, session_id, sender_type, content, metadata, idempotency_key
       ) VALUES ($1, $2, 'admin', $3, $4::jsonb, $5)`,
      [
        messageId,
        sessionId,
        'How many farmers registered recently?',
        JSON.stringify({
          operation: 'count_users',
          filters: { role: 'farmer', dateRange: 'last_30_days' },
          aggregate: { rowCount: 1 },
        }),
        idempotencyKey,
      ],
    );

    const assistantMessageId = randomUUID();
    ids.messageIds.push(assistantMessageId);
    await pool.query(
      `INSERT INTO admin_chat_messages (
         id, session_id, sender_type, content
       ) VALUES ($1, $2, 'assistant', 'The verified aggregate is available.')`,
      [assistantMessageId, sessionId],
    );

    await assert.rejects(
      () => pool.query(
        `INSERT INTO admin_chat_messages (session_id, sender_type, content)
         VALUES ($1, 'system', 'Invalid sender')`,
        [sessionId],
      ),
      { code: '23514' },
    );
    await assert.rejects(
      () => pool.query(
        `INSERT INTO admin_chat_messages (session_id, sender_type, content)
         VALUES ($1, 'assistant', 'Valid sender, invalid session')`,
        [randomUUID()],
      ),
      { code: '23503' },
    );
    await assert.rejects(
      () => pool.query(
        `INSERT INTO admin_chat_messages (
           session_id, sender_type, content, idempotency_key
         ) VALUES ($1, 'admin', 'Duplicate request', $2)`,
        [sessionId, idempotencyKey],
      ),
      { code: '23505' },
    );
    await assert.rejects(
      () => pool.query(
        `INSERT INTO admin_chat_messages (session_id, sender_type, content)
         VALUES ($1, 'assistant', '   ')`,
        [sessionId],
      ),
      { code: '23514' },
    );
    await assert.rejects(
      () => pool.query(
        `INSERT INTO admin_chat_messages (session_id, sender_type, content, metadata)
         VALUES ($1, 'assistant', 'Invalid metadata shape', '[]'::jsonb)`,
        [sessionId],
      ),
      { code: '23514' },
    );
    await assert.rejects(
      () => pool.query(
        `INSERT INTO admin_chat_messages (session_id, sender_type, content)
         VALUES ($1, 'assistant', $2)`,
        [sessionId, 'x'.repeat(4001)],
      ),
      { code: '23514' },
    );

    const auditLogId = randomUUID();
    const failedAuditLogId = randomUUID();
    ids.auditLogIds.push(auditLogId, failedAuditLogId);
    await pool.query(
      `INSERT INTO admin_chat_audit_logs (
         id, admin_id, session_id, operation, filters, outcome,
         duration_ms, row_count, model, request_id
       ) VALUES ($1, $2, $3, 'count_users', $4::jsonb, 'success',
                 42, 1, 'test-model', $5)`,
      [
        auditLogId,
        adminId,
        sessionId,
        JSON.stringify({ entity: 'users', role: 'farmer' }),
        randomUUID(),
      ],
    );
    await pool.query(
      `INSERT INTO admin_chat_audit_logs (
         id, admin_id, operation, outcome
       ) VALUES ($1, $2, 'count_crops', 'failure')`,
      [failedAuditLogId, adminId],
    );

    await assert.rejects(
      () => pool.query(
        `INSERT INTO admin_chat_audit_logs (admin_id, operation, outcome)
         VALUES ($1, 'SELECT * FROM users', 'success')`,
        [adminId],
      ),
      { code: '23514' },
    );
    await assert.rejects(
      () => pool.query(
        `INSERT INTO admin_chat_audit_logs (admin_id, operation, outcome)
         VALUES ($1, 'count_users', 'partial')`,
        [adminId],
      ),
      { code: '23514' },
    );
    await assert.rejects(
      () => pool.query(
        'DELETE FROM admin_chat_sessions WHERE id = $1',
        [sessionId],
      ),
      { code: '23503' },
    );
    await assert.rejects(
      () => pool.query(
        'DELETE FROM users WHERE id = $1',
        [adminId],
      ),
      { code: '23503' },
    );
  } finally {
    await cleanupFixture(ids);
    assert.deepEqual(await getCoreRecordCounts(), countsBefore);
  }
});
