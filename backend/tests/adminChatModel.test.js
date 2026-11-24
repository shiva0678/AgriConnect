import test from 'node:test';
import assert from 'node:assert/strict';
import { AppError } from '../utils/AppError.js';
import { createAdminChatModel } from '../models/adminChatModel.js';

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const SESSION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MESSAGE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ASSISTANT_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const IDEMPOTENCY_KEY = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const REQUEST_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const TIMESTAMP = new Date('2026-11-24T12:00:00.000Z');

function makeIntent() {
  return {
    intent: 'analytics',
    operation: 'count_users',
    filters: {
      entity: 'users',
      role: 'farmer',
      status: null,
      category: null,
      orderStatus: null,
      dateRange: { type: 'relative', value: 'last_7_days' },
      location: null,
      comparison: null,
    },
    clarificationQuestion: null,
  };
}

function createDatabase({
  existingMessage = null,
  existingAssistant = null,
  missingSession = false,
  failAt = null,
  connectError = null,
} = {}) {
  const calls = [];
  let releases = 0;
  let commitCount = 0;
  const database = {
    async connect() {
      if (connectError) throw connectError;
      return {
        async query(text, values = []) {
          calls.push({ text, values });
          if (text === 'COMMIT') commitCount += 1;
          if (
            (failAt === 'second COMMIT' && text === 'COMMIT' && commitCount === 2)
            || failAt === text
            || (
              typeof failAt === 'string'
              && failAt !== 'second COMMIT'
              && text.includes(failAt)
            )
          ) {
            throw Object.assign(new Error('private database connection and SQL details'), {
              code: '08006',
            });
          }
          if (text.startsWith('SELECT id, context')) {
            return {
              rows: missingSession
                ? []
                : [{ id: SESSION_ID, context: {} }],
            };
          }
          if (text.startsWith('SELECT id') && text.includes('FROM admin_chat_sessions')) {
            return { rows: [{ id: SESSION_ID }] };
          }
          if (text.includes('pg_try_advisory_lock')) {
            return { rows: [{ locked: true }] };
          }
          if (text.includes('pg_advisory_unlock')) {
            return { rows: [{ unlocked: true }] };
          }
          if (text.includes('m.idempotency_key')) {
            return { rows: existingMessage ? [existingMessage] : [] };
          }
          if (text.includes("m.metadata->>'replyToMessageId'")) {
            return { rows: existingAssistant ? [existingAssistant] : [] };
          }
          if (text.startsWith('INSERT INTO admin_chat_messages')) {
            const senderType = text.includes("'admin'") ? 'admin' : 'assistant';
            return {
              rows: [{
                id: senderType === 'admin' ? MESSAGE_ID : ASSISTANT_ID,
                sender_type: senderType,
                content: values[2],
                created_at: TIMESTAMP,
              }],
            };
          }
          return { rows: [] };
        },
        release() { releases += 1; },
      };
    },
  };
  return {
    database,
    calls,
    get releases() { return releases; },
  };
}

function createModel(fixture, { logs = [], clock = (() => {
  let now = 100;
  return () => now++;
})() } = {}) {
  return createAdminChatModel({
    database: fixture.database,
    logger: { error: (...args) => logs.push(args) },
    clock,
  });
}

function createReadModel({ adminId = ADMIN_ID } = {}) {
  const calls = [];
  let sessionLookup = true;
  const database = {
    async query(text, values = []) {
      calls.push({ text, values });
      if (text.startsWith('INSERT INTO admin_chat_sessions')) {
        return {
          rows: [{
            id: SESSION_ID,
            title: values[1],
            created_at: TIMESTAMP,
            updated_at: TIMESTAMP,
            last_message_at: null,
          }],
        };
      }
      if (text.includes('FROM admin_chat_sessions') && text.includes('LIMIT 1')) {
        sessionLookup = values[1] === adminId;
        return {
          rows: sessionLookup
            ? [{
              id: SESSION_ID,
              title: 'Session title',
              created_at: TIMESTAMP,
              updated_at: TIMESTAMP,
              last_message_at: TIMESTAMP,
            }]
            : [],
        };
      }
      if (text.includes('FROM admin_chat_sessions') && text.includes('ORDER BY updated_at')) {
        return { rows: [] };
      }
      if (text.includes('FROM admin_chat_messages')) {
        return {
          rows: sessionLookup
            ? [{
              id: MESSAGE_ID,
              sender_type: 'admin',
              content: 'Hello',
              created_at: TIMESTAMP,
              created_at_cursor: '2026-11-24T12:00:00.000000Z',
            }]
            : [],
        };
      }
      return { rows: [] };
    },
  };
  return { model: createAdminChatModel({ database, logger: { error() {} } }), calls };
}

function createConcurrentDatabase() {
  const activeLocks = new Set();
  const calls = [];
  const persisted = {
    userMessages: [],
    assistantMessages: [],
    auditEntries: [],
  };
  let releaseCount = 0;
  const database = {
    async connect() {
      const staged = {
        lockKey: null,
        userMessage: null,
        assistantMessage: null,
        auditEntries: [],
      };
      return {
        async query(text, values = []) {
          calls.push({ text, values });
          if (text === 'BEGIN') return { rows: [] };
          if (text.includes('pg_try_advisory_lock')) {
            const lockKey = values[0];
            if (activeLocks.has(lockKey)) return { rows: [{ locked: false }] };
            activeLocks.add(lockKey);
            staged.lockKey = lockKey;
            return { rows: [{ locked: true }] };
          }
          if (text.includes('pg_advisory_unlock')) {
            const unlocked = activeLocks.delete(values[0]);
            return { rows: [{ unlocked }] };
          }
          if (text.startsWith('SELECT id, context')) {
            return { rows: [{ id: SESSION_ID, context: {} }] };
          }
          if (text.startsWith('SELECT id') && text.includes('FROM admin_chat_sessions')) {
            return { rows: [{ id: SESSION_ID }] };
          }
          if (text.includes('m.idempotency_key')) {
            const message = persisted.userMessages.find(
              (item) => item.idempotencyKey === values[1],
            );
            return { rows: message ? [message.row] : [] };
          }
          if (text.includes("m.metadata->>'replyToMessageId'")) {
            const assistant = persisted.assistantMessages.find(
              (item) => item.metadata.replyToMessageId === values[1],
            );
            return { rows: assistant ? [assistant.row] : [] };
          }
          if (text.startsWith('INSERT INTO admin_chat_messages')) {
            if (text.includes("'admin'")) {
              const row = {
                id: MESSAGE_ID,
                sender_type: 'admin',
                content: values[2],
                created_at: TIMESTAMP,
              };
              staged.userMessage = {
                row,
                idempotencyKey: values[3],
              };
              return { rows: [row] };
            }
            const metadata = JSON.parse(values[3]);
            const row = {
              id: ASSISTANT_ID,
              sender_type: 'assistant',
              content: values[2],
              created_at: TIMESTAMP,
              metadata,
            };
            staged.assistantMessage = { row, metadata };
            return { rows: [row] };
          }
          if (text.includes('INSERT INTO admin_chat_audit_logs')) {
            staged.auditEntries.push({
              outcome: text.includes("'success'") ? 'success' : 'failure',
              operation: values[2],
            });
            return { rows: [] };
          }
          if (text === 'COMMIT') {
            if (staged.userMessage) persisted.userMessages.push(staged.userMessage);
            if (staged.assistantMessage) persisted.assistantMessages.push(staged.assistantMessage);
            persisted.auditEntries.push(...staged.auditEntries);
            return { rows: [] };
          }
          if (text === 'ROLLBACK') {
            return { rows: [] };
          }
          return { rows: [] };
        },
        release() {
          releaseCount += 1;
          if (staged.lockKey) activeLocks.delete(staged.lockKey);
        },
      };
    },
  };
  return {
    database,
    calls,
    persisted,
    get releaseCount() { return releaseCount; },
  };
}

function processor({ result = { operation: 'count_users', entity: 'users', count: 4 } } = {}) {
  return async ({ onIntent }) => {
    const intent = makeIntent();
    onIntent(intent);
    return {
      intent,
      assistantContent: 'The aggregate count for users is 4.',
      result,
      nextContext: {
        version: 1,
        lastOperation: 'count_users',
        filters: intent.filters,
      },
    };
  };
}

test('creates and lists sessions with authenticated administrator scope and bounded cursors', async () => {
  const { model, calls } = createReadModel();
  await model.createSession({ adminId: ADMIN_ID, title: 'New session' });
  await model.listSessions({
    adminId: ADMIN_ID,
    limit: 20,
    cursor: { before: '2026-11-24T12:00:00.000000Z', beforeId: SESSION_ID },
  });

  assert.deepEqual(calls[0].values, [ADMIN_ID, 'New session']);
  assert.match(calls[1].text, /WHERE admin_id = \$1/);
  assert.deepEqual(calls[1].values, [
    ADMIN_ID,
    '2026-11-24T12:00:00.000000Z',
    SESSION_ID,
    21,
  ]);
});

test('retrieves messages only through an owned session and rejects another administrator', async () => {
  const fixture = createReadModel();
  const result = await fixture.model.getSession({
    adminId: ADMIN_ID,
    sessionId: SESSION_ID,
    limit: 10,
  });
  assert.equal(result.messages.length, 1);
  assert.deepEqual(fixture.calls[0].values, [SESSION_ID, ADMIN_ID]);
  assert.match(fixture.calls[1].text, /s\.admin_id = \$2/);
  assert.deepEqual(fixture.calls[1].values, [SESSION_ID, ADMIN_ID, 11]);

  const otherAdminFixture = createReadModel({ adminId: ADMIN_ID });
  await assert.rejects(
    otherAdminFixture.model.getSession({
      adminId: '22222222-2222-4222-8222-222222222222',
      sessionId: SESSION_ID,
      limit: 10,
    }),
    (error) => error instanceof AppError && error.status === 404,
  );
  assert.equal(otherAdminFixture.calls.length, 1);
});

test('persists user and assistant messages, validated context, and aggregate-only audit data', async () => {
  const fixture = createDatabase();
  const model = createModel(fixture);
  const response = await model.processMessage({
    adminId: ADMIN_ID,
    sessionId: SESSION_ID,
    question: 'How many farmers?',
    idempotencyKey: IDEMPOTENCY_KEY,
    requestId: REQUEST_ID,
    modelName: 'gemini-3.5-flash-lite',
    processQuestion: processor(),
  });

  assert.equal(response.userMessage.senderType, 'admin');
  assert.equal(response.assistantMessage.senderType, 'assistant');
  assert.deepEqual(response.result, { operation: 'count_users', entity: 'users', count: 4 });
  assert.equal(response.idempotentReplay, false);

  const userInsert = fixture.calls.find(({ text }) => text.startsWith('INSERT INTO admin_chat_messages'));
  const update = fixture.calls.find(({ text }) => text.startsWith('UPDATE admin_chat_sessions'));
  const audit = fixture.calls.find(({ text }) => text.includes('INSERT INTO admin_chat_audit_logs'));
  const timeoutSetup = fixture.calls.find(({ text }) => text.includes("set_config('idle_in_transaction_session_timeout'"));
  assert.equal(userInsert.values[0], SESSION_ID);
  assert.equal(userInsert.values[1], ADMIN_ID);
  assert.deepEqual(JSON.parse(update.values[2]).filters, makeIntent().filters);
  assert.equal(audit.values[0], ADMIN_ID);
  assert.equal(audit.values[2], 'count_users');
  assert.equal(audit.values[5], 1);
  assert.equal(audit.values[6], 'gemini-3.5-flash-lite');
  assert.deepEqual(timeoutSetup.values, ['5000ms', '5000ms', '30000ms']);
  assert.equal(fixture.calls.filter(({ text }) => text === 'COMMIT').length, 2);
  assert.ok(fixture.calls.at(-1).text.includes('pg_advisory_unlock'));
  assert.equal(fixture.releases, 1);
});

test('persists a general answer with no analytics context', async () => {
  const fixture = createDatabase();
  const model = createModel(fixture);
  const generalIntent = {
    intent: 'general',
    operation: null,
    filters: null,
    clarificationQuestion: null,
  };
  const response = await model.processMessage({
    adminId: ADMIN_ID,
    sessionId: SESSION_ID,
    question: 'Tell me about AgriConnect',
    idempotencyKey: IDEMPOTENCY_KEY,
    requestId: REQUEST_ID,
    processQuestion: async ({ onIntent }) => {
      onIntent(generalIntent);
      return {
        intent: generalIntent,
        assistantContent: 'AgriConnect connects farmers and buyers.',
        result: null,
        nextContext: null,
      };
    },
  });

  assert.equal(response.assistantMessage.content, 'AgriConnect connects farmers and buyers.');
  assert.equal(response.result, null);
});

test('replays an idempotent request without invoking the processor twice', async () => {
  const fixture = createDatabase({
    existingMessage: {
      id: MESSAGE_ID,
      sender_type: 'admin',
      content: 'Already asked',
      created_at: TIMESTAMP,
    },
    existingAssistant: {
      id: ASSISTANT_ID,
      sender_type: 'assistant',
      content: 'Previously answered.',
      created_at: TIMESTAMP,
      metadata: {
        aggregate: { operation: 'count_users', entity: 'users', count: 4 },
        requestId: REQUEST_ID,
      },
    },
  });
  let processCalls = 0;
  const model = createModel(fixture);
  const response = await model.processMessage({
    adminId: ADMIN_ID,
    sessionId: SESSION_ID,
    question: 'Already asked',
    idempotencyKey: IDEMPOTENCY_KEY,
    requestId: REQUEST_ID,
    processQuestion: async () => {
      processCalls += 1;
    },
  });

  assert.equal(processCalls, 0);
  assert.equal(response.idempotentReplay, true);
  assert.equal(response.userMessage.senderType, 'admin');
  assert.equal(response.requestId, REQUEST_ID);
  assert.ok(fixture.calls.some(({ text }) => text === 'COMMIT'));
  assert.ok(fixture.calls.at(-1).text.includes('pg_advisory_unlock'));
});

test('rejects reusing an idempotency key for different message content', async () => {
  const fixture = createDatabase({
    existingMessage: {
      id: MESSAGE_ID,
      sender_type: 'admin',
      content: 'Different question',
      created_at: TIMESTAMP,
    },
  });
  const model = createModel(fixture);
  await assert.rejects(
    model.processMessage({
      adminId: ADMIN_ID,
      sessionId: SESSION_ID,
      question: 'New question',
      idempotencyKey: IDEMPOTENCY_KEY,
      requestId: REQUEST_ID,
      processQuestion: processor(),
    }),
    (error) => error instanceof AppError && error.status === 409,
  );
  assert.ok(fixture.calls.some(({ text }) => text === 'ROLLBACK'));
});

test('does not duplicate assistant responses for an in-flight idempotent request', async () => {
  const fixture = createDatabase({
    existingMessage: {
      id: MESSAGE_ID,
      sender_type: 'admin',
      content: 'Same question',
      created_at: TIMESTAMP,
    },
  });
  const model = createModel(fixture);
  await assert.rejects(
    model.processMessage({
      adminId: ADMIN_ID,
      sessionId: SESSION_ID,
      question: 'Same question',
      idempotencyKey: IDEMPOTENCY_KEY,
      requestId: REQUEST_ID,
      processQuestion: processor(),
    }),
    (error) => error instanceof AppError && error.status === 409,
  );
  assert.ok(fixture.calls.some(({ text }) => text.includes("m.metadata->>'replyToMessageId'")));
  assert.ok(fixture.calls.some(({ text }) => text === 'ROLLBACK'));
});

test('concurrent identical requests return in-progress 409 without duplicate processing or records', async () => {
  const fixture = createConcurrentDatabase();
  const model = createAdminChatModel({
    database: fixture.database,
    logger: { error() {} },
  });
  let signalProcessorEntered;
  let releaseProcessor;
  const processorEntered = new Promise((resolve) => {
    signalProcessorEntered = resolve;
  });
  const processorGate = new Promise((resolve) => {
    releaseProcessor = resolve;
  });
  let processorCalls = 0;
  let geminiCalls = 0;
  let analyticsCalls = 0;
  const processQuestion = async ({ onIntent }) => {
    processorCalls += 1;
    geminiCalls += 1;
    onIntent(makeIntent());
    analyticsCalls += 1;
    signalProcessorEntered();
    await processorGate;
    return {
      intent: makeIntent(),
      assistantContent: 'The aggregate count for users is 4.',
      result: { operation: 'count_users', entity: 'users', count: 4 },
      nextContext: {
        version: 1,
        lastOperation: 'count_users',
        filters: makeIntent().filters,
      },
    };
  };
  const request = {
    adminId: ADMIN_ID,
    sessionId: SESSION_ID,
    question: 'How many farmers?',
    idempotencyKey: IDEMPOTENCY_KEY,
    requestId: REQUEST_ID,
    processQuestion,
  };

  const firstRequest = model.processMessage(request);
  await processorEntered;
  const secondRequest = model.processMessage(request);
  await assert.rejects(
    secondRequest,
    (error) => error instanceof AppError
      && error.status === 409
      && error.message === 'A message for this session is already being processed.',
  );
  releaseProcessor();
  const completedResponse = await firstRequest;

  assert.equal(completedResponse.idempotentReplay, false);
  assert.equal(processorCalls, 1);
  assert.equal(geminiCalls, 1);
  assert.equal(analyticsCalls, 1);
  assert.equal(fixture.persisted.userMessages.length, 1);
  assert.equal(fixture.persisted.assistantMessages.length, 1);
  assert.equal(fixture.persisted.auditEntries.length, 1);
  assert.equal(fixture.persisted.auditEntries[0].outcome, 'success');
  assert.equal(fixture.calls.filter(({ text }) => (
    text.startsWith('INSERT INTO admin_chat_messages') && text.includes("'admin'")
  )).length, 1);
  assert.equal(fixture.calls.filter(({ text }) => (
    text.startsWith('INSERT INTO admin_chat_messages') && text.includes("'assistant'")
  )).length, 1);
  assert.equal(fixture.calls.filter(({ text }) => (
    text.includes('INSERT INTO admin_chat_audit_logs')
  )).length, 1);
  const lockChecks = fixture.calls.filter(({ text }) => text.includes('pg_try_advisory_lock'));
  const unlockChecks = fixture.calls.filter(({ text }) => text.includes('pg_advisory_unlock'));
  const firstOwnedSessionLookup = fixture.calls.findIndex(({ text }) => text.startsWith('SELECT id, context'));
  assert.equal(lockChecks.length, 2);
  assert.equal(unlockChecks.length, 1);
  assert.equal(lockChecks[0].values[0], lockChecks[1].values[0]);
  assert.ok(fixture.calls.indexOf(lockChecks[0]) < firstOwnedSessionLookup);
  assert.equal(fixture.releaseCount, 2);
});

test('does not expose sessions to other admins and preserves not-found status', async () => {
  const fixture = createDatabase({ missingSession: true });
  const model = createModel(fixture);
  await assert.rejects(
    model.processMessage({
      adminId: ADMIN_ID,
      sessionId: SESSION_ID,
      question: 'Hello',
      idempotencyKey: IDEMPOTENCY_KEY,
      requestId: REQUEST_ID,
      processQuestion: processor(),
    }),
    (error) => error instanceof AppError && error.status === 404,
  );
  const ownershipQuery = fixture.calls.find(({ text }) => text.startsWith('SELECT id, context'));
  assert.deepEqual(ownershipQuery.values, [SESSION_ID, ADMIN_ID]);
  assert.equal(fixture.releases, 1);
  assert.equal(fixture.calls.some(({ text }) => text.includes('admin_chat_audit_logs')), false);
});

test('validates aggregate result shape before persisting and prevents record-level leakage', async () => {
  const fixture = createDatabase();
  const model = createModel(fixture);
  await assert.rejects(
    model.processMessage({
      adminId: ADMIN_ID,
      sessionId: SESSION_ID,
      question: 'How many farmers?',
      idempotencyKey: IDEMPOTENCY_KEY,
      requestId: REQUEST_ID,
      processQuestion: processor({
        result: {
          operation: 'count_users',
          entity: 'users',
          count: 4,
          users: [{ email: 'private@example.test' }],
        },
      }),
    }),
    (error) => error instanceof AppError && error.status === 503,
  );
  assert.equal(fixture.calls.some(({ text }) => text.startsWith('INSERT INTO admin_chat_messages')), false);
  assert.equal(fixture.calls.some(({ text }) => text === 'ROLLBACK'), false);
  assert.ok(fixture.calls.some(({ text }) => (
    text.includes('INSERT INTO admin_chat_audit_logs') && text.includes("'failure'")
  )));
});

test('records a generic failure audit after processor/provider failure', async () => {
  const fixture = createDatabase();
  const logs = [];
  const model = createModel(fixture, { logs });
  await assert.rejects(
    model.processMessage({
      adminId: ADMIN_ID,
      sessionId: SESSION_ID,
      question: 'How many users?',
      idempotencyKey: IDEMPOTENCY_KEY,
      requestId: REQUEST_ID,
      processQuestion: async ({ onIntent }) => {
        onIntent(makeIntent());
        throw new Error('provider response includes sensitive request details');
      },
    }),
    (error) => error instanceof AppError
      && error.status === 503
      && !/sensitive request details/.test(error.message),
  );
  const failureAudit = fixture.calls.find(({ text }) => (
    text.includes('INSERT INTO admin_chat_audit_logs') && text.includes("'failure'")
  ));
  assert.ok(failureAudit);
  assert.equal(failureAudit.values[3], JSON.stringify(makeIntent().filters));
  assert.equal(fixture.calls.some(({ text }) => text === 'ROLLBACK'), false);
  assert.ok(fixture.calls.at(-1).text.includes('pg_advisory_unlock'));
  assert.doesNotMatch(JSON.stringify(logs), /sensitive request details/);
  assert.equal(fixture.releases, 1);
});

test('rolls back partial persistence, logs only error codes, and returns generic database errors', async () => {
  const fixture = createDatabase({ failAt: 'INSERT INTO admin_chat_messages' });
  const logs = [];
  const model = createModel(fixture, { logs });
  await assert.rejects(
    model.processMessage({
      adminId: ADMIN_ID,
      sessionId: SESSION_ID,
      question: 'How many users?',
      idempotencyKey: IDEMPOTENCY_KEY,
      requestId: REQUEST_ID,
      processQuestion: processor(),
    }),
    (error) => error instanceof AppError
      && error.status === 503
      && !/private database|SQL details/.test(error.message),
  );
  assert.ok(fixture.calls.some(({ text }) => text === 'ROLLBACK'));
  assert.ok(fixture.calls.some(({ text }) => (
    text.includes('INSERT INTO admin_chat_audit_logs') && text.includes("'failure'")
  )));
  assert.equal(fixture.releases, 1);
  assert.doesNotMatch(JSON.stringify(logs), /private database|SQL details/);
});

test('rolls back and audits a failed commit without exposing the database error', async () => {
  const fixture = createDatabase({ failAt: 'second COMMIT' });
  const model = createModel(fixture);
  await assert.rejects(
    model.processMessage({
      adminId: ADMIN_ID,
      sessionId: SESSION_ID,
      question: 'How many farmers?',
      idempotencyKey: IDEMPOTENCY_KEY,
      requestId: REQUEST_ID,
      processQuestion: processor(),
    }),
    (error) => error instanceof AppError
      && error.status === 503
      && !/private database|SQL details/.test(error.message),
  );
  assert.ok(fixture.calls.some(({ text }) => text === 'ROLLBACK'));
  assert.ok(fixture.calls.some(({ text }) => text.includes("'failure'")));
  assert.equal(fixture.releases, 1);
});

test('maps connection failures without exposing database errors', async () => {
  const fixture = createDatabase({
    connectError: Object.assign(new Error('postgres://secret-host/private'), { code: 'ECONNREFUSED' }),
  });
  const logs = [];
  const model = createModel(fixture, { logs });
  await assert.rejects(
    model.processMessage({
      adminId: ADMIN_ID,
      sessionId: SESSION_ID,
      question: 'Hello',
      idempotencyKey: IDEMPOTENCY_KEY,
      requestId: REQUEST_ID,
      processQuestion: processor(),
    }),
    (error) => error instanceof AppError && error.status === 503,
  );
  assert.doesNotMatch(JSON.stringify(logs), /secret-host|private/);
});
