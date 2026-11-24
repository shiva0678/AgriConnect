import { createHash } from 'node:crypto';
import { pool } from '../config/db.js';
import { AppError } from '../utils/AppError.js';
import {
  validateAdminChatContext,
  validateAdminChatIntent,
} from '../utils/adminChatIntentValidator.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_STORED_CONTEXT_BYTES = 8192;
const MAX_ASSISTANT_METADATA_BYTES = 16_384;
const CHAT_TRANSACTION_IDLE_TIMEOUT_MS = 30_000;
const CHAT_TRANSACTION_QUERY_TIMEOUT_MS = 5_000;
const CHAT_TRANSACTION_LOCK_TIMEOUT_MS = 5_000;

function safeErrorCode(error) {
  const code = error?.code;
  return typeof code === 'string' || typeof code === 'number'
    ? String(code).replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 80) || null
    : null;
}

function safeModelName(value) {
  return typeof value === 'string' && /^gemini-[a-zA-Z0-9.-]{1,120}$/.test(value)
    ? value
    : null;
}

function getSessionAdvisoryLockKey({ adminId, sessionId }) {
  // Hash collisions can only cause a safe false 409, never concurrent processing.
  const digest = createHash('sha256')
    .update(`agriconnect-admin-chat-session-v1:${adminId}:${sessionId}`)
    .digest();
  return digest.readBigInt64BE(0).toString();
}

function toISOString(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid timestamp returned by PostgreSQL.');
  }
  return date.toISOString();
}

function toNullableISOString(value) {
  return value === null || value === undefined ? null : toISOString(value);
}

function mapSession(row) {
  return {
    id: row.id,
    title: row.title,
    createdAt: toISOString(row.created_at),
    updatedAt: toISOString(row.updated_at),
    lastMessageAt: toNullableISOString(row.last_message_at),
  };
}

function mapMessage(row) {
  return {
    id: row.id,
    senderType: row.sender_type,
    content: row.content,
    createdAt: toISOString(row.created_at),
  };
}

function paginationResult(rows, limit, timestampField) {
  const hasMore = rows.length > limit;
  const pageRows = rows.slice(0, limit);
  const last = pageRows.at(-1);
  return {
    rows: pageRows,
    hasMore,
    nextCursor: hasMore && last
      ? {
        before: last[timestampField],
        beforeId: last.id,
      }
      : null,
  };
}

function emptyContext(context) {
  return context === null
    || context === undefined
    || (
      typeof context === 'object'
      && !Array.isArray(context)
      && Object.keys(context).length === 0
    );
}

function serializeContext(context) {
  if (emptyContext(context)) {
    return '{}';
  }
  const validated = validateAdminChatContext(context);
  const serialized = JSON.stringify(validated);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_STORED_CONTEXT_BYTES) {
    throw new AppError(500, 'Unable to persist administrator chat context.');
  }
  return serialized;
}

function serializeAssistantMetadata(value) {
  const serialized = JSON.stringify(value);
  if (
    typeof serialized !== 'string'
    || Buffer.byteLength(serialized, 'utf8') > MAX_ASSISTANT_METADATA_BYTES
  ) {
    throw new AppError(500, 'Unable to persist administrator chat response.');
  }
  return serialized;
}

function isAggregateCount(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function isAggregateDate(value) {
  if (
    typeof value !== 'string'
    || !/^\d{4}-\d{2}-\d{2}$/.test(value)
    || value.startsWith('0000-')
  ) {
    return false;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function assertExactKeys(value, keys) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function assertAggregateResult(intent, result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new AppError(503, 'Unable to retrieve administrator analytics right now.');
  }

  if (intent.operation === 'count_users' || intent.operation === 'count_crops'
    || intent.operation === 'count_orders') {
    const entity = intent.operation === 'count_users'
      ? 'users'
      : intent.operation === 'count_crops' ? 'crops' : 'orders';
    if (
      !assertExactKeys(result, ['operation', 'entity', 'count'])
      || result.operation !== intent.operation
      || result.entity !== entity
      || !isAggregateCount(result.count)
    ) {
      throw new AppError(503, 'Unable to retrieve administrator analytics right now.');
    }
    return;
  }

  if (intent.operation === 'delivered_order_value' && intent.filters.comparison === null) {
    if (
      !assertExactKeys(result, [
        'operation',
        'entity',
        'grossDeliveredOrderValue',
        'deliveredOrderCount',
        'interpretation',
      ])
      || result.operation !== 'delivered_order_value'
      || result.entity !== 'orders'
      || typeof result.grossDeliveredOrderValue !== 'string'
      || !/^\d+(?:\.\d{1,2})?$/.test(result.grossDeliveredOrderValue)
      || !isAggregateCount(result.deliveredOrderCount)
      || result.interpretation !== 'Gross delivered order value; not platform revenue.'
    ) {
      throw new AppError(503, 'Unable to retrieve administrator analytics right now.');
    }
    return;
  }

  if (intent.operation === 'compare_periods') {
    if (
      !assertExactKeys(result, ['operation', 'entity', 'metric', 'current', 'previous'])
      || result.operation !== 'compare_periods'
      || result.entity !== intent.filters.entity
      || result.metric !== 'count'
      || !isAggregatePeriod(result.current, 'count')
      || !isAggregatePeriod(result.previous, 'count')
    ) {
      throw new AppError(503, 'Unable to retrieve administrator analytics right now.');
    }
    return;
  }

  if (
    intent.operation === 'delivered_order_value'
    && intent.filters.comparison !== null
    && assertExactKeys(result, [
      'operation',
      'entity',
      'metric',
      'interpretation',
      'current',
      'previous',
    ])
    && result.operation === 'delivered_order_value'
    && result.entity === 'orders'
    && result.metric === 'gross_delivered_order_value'
    && result.interpretation === 'Gross delivered order value; not platform revenue.'
    && isAggregatePeriod(result.current, 'value')
    && isAggregatePeriod(result.previous, 'value')
  ) {
    return;
  }

  throw new AppError(503, 'Unable to retrieve administrator analytics right now.');
}

function isAggregatePeriod(value, metric) {
  const keys = metric === 'count'
    ? ['from', 'to', 'count']
    : ['from', 'to', 'value', 'deliveredOrderCount'];
  return assertExactKeys(value, keys)
    && isAggregateDate(value.from)
    && isAggregateDate(value.to)
    && value.from <= value.to
    && (metric === 'count'
      ? isAggregateCount(value.count)
      : typeof value.value === 'string'
        && /^\d+(?:\.\d{1,2})?$/.test(value.value)
        && isAggregateCount(value.deliveredOrderCount));
}

function assertMessageResult(processed) {
  if (
    !processed
    || typeof processed.assistantContent !== 'string'
    || !processed.assistantContent.trim()
    || processed.assistantContent.length > 4000
  ) {
    throw new AppError(500, 'Unable to prepare administrator chat response.');
  }

  const intent = validateAdminChatIntent(processed.intent);
  if (intent.intent === 'analytics' || intent.intent === 'follow_up') {
    assertAggregateResult(intent, processed.result);
  } else if (processed.result !== null && processed.result !== undefined) {
    throw new AppError(500, 'Unable to prepare administrator chat response.');
  }
  if (processed.nextContext !== null && processed.nextContext !== undefined) {
    validateAdminChatContext(processed.nextContext);
  }
  return intent;
}

function replayResponse(userMessage, assistantMessage) {
  const metadata = assistantMessage.metadata && typeof assistantMessage.metadata === 'object'
    ? assistantMessage.metadata
    : {};
  return {
    userMessage: mapMessage(userMessage),
    assistantMessage: mapMessage(assistantMessage),
    result: metadata.aggregate ?? null,
    requestId: metadata.requestId ?? null,
    idempotentReplay: true,
  };
}

export function createAdminChatModel({
  database = pool,
  logger = console,
  clock = () => Date.now(),
} = {}) {
  async function runDatabaseOperation(label, operation) {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error('Admin chatbot database operation failed', {
        operation: label,
        code: safeErrorCode(error),
      });
      throw new AppError(503, 'Unable to process administrator chat right now.');
    }
  }

  async function createSession({ adminId, title = null }) {
    return runDatabaseOperation('create_session', async () => {
      const result = await database.query(
        `INSERT INTO admin_chat_sessions (admin_id, title, context)
         VALUES ($1, $2, '{}'::jsonb)
         RETURNING id, title, created_at, updated_at, last_message_at`,
        [adminId, title],
      );
      if (!result.rows[0]) {
        throw new Error('Session insert returned no row.');
      }
      return mapSession(result.rows[0]);
    });
  }

  async function listSessions({ adminId, limit, cursor = null }) {
    return runDatabaseOperation('list_sessions', async () => {
      const result = cursor
        ? await database.query(
          `SELECT id, title, created_at, updated_at, last_message_at,
                  TO_CHAR(updated_at AT TIME ZONE 'UTC',
                    'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at_cursor
           FROM admin_chat_sessions
           WHERE admin_id = $1
             AND (
               updated_at < $2::timestamptz
               OR (updated_at = $2::timestamptz AND id < $3::uuid)
             )
           ORDER BY updated_at DESC, id DESC
           LIMIT $4`,
          [adminId, cursor.before, cursor.beforeId, limit + 1],
        )
        : await database.query(
          `SELECT id, title, created_at, updated_at, last_message_at,
                  TO_CHAR(updated_at AT TIME ZONE 'UTC',
                    'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at_cursor
           FROM admin_chat_sessions
           WHERE admin_id = $1
           ORDER BY updated_at DESC, id DESC
           LIMIT $2`,
          [adminId, limit + 1],
        );
      const page = paginationResult(result.rows, limit, 'updated_at_cursor');
      return {
        sessions: page.rows.map(mapSession),
        pagination: {
          limit,
          hasMore: page.hasMore,
          nextCursor: page.nextCursor,
        },
      };
    });
  }

  async function getSession({ adminId, sessionId, limit, cursor = null }) {
    return runDatabaseOperation('get_session', async () => {
      const sessionResult = await database.query(
        `SELECT id, title, created_at, updated_at, last_message_at
         FROM admin_chat_sessions
         WHERE id = $1 AND admin_id = $2
         LIMIT 1`,
        [sessionId, adminId],
      );
      const row = sessionResult.rows[0];
      if (!row) {
        throw new AppError(404, 'Administrator chat session not found.');
      }

      const messagesResult = cursor
        ? await database.query(
          `SELECT m.id, m.sender_type, m.content, m.created_at,
                  TO_CHAR(m.created_at AT TIME ZONE 'UTC',
                    'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at_cursor
           FROM admin_chat_messages m
           WHERE m.session_id = $1
             AND EXISTS (
               SELECT 1
               FROM admin_chat_sessions s
               WHERE s.id = m.session_id AND s.admin_id = $2
             )
             AND (
               m.created_at < $3::timestamptz
               OR (m.created_at = $3::timestamptz AND m.id < $4::uuid)
             )
           ORDER BY m.created_at DESC, m.id DESC
           LIMIT $5`,
          [sessionId, adminId, cursor.before, cursor.beforeId, limit + 1],
        )
        : await database.query(
          `SELECT m.id, m.sender_type, m.content, m.created_at,
                  TO_CHAR(m.created_at AT TIME ZONE 'UTC',
                    'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at_cursor
           FROM admin_chat_messages m
           WHERE m.session_id = $1
             AND EXISTS (
               SELECT 1
               FROM admin_chat_sessions s
               WHERE s.id = m.session_id AND s.admin_id = $2
             )
           ORDER BY m.created_at DESC, m.id DESC
           LIMIT $3`,
          [sessionId, adminId, limit + 1],
        );
      const page = paginationResult(messagesResult.rows, limit, 'created_at_cursor');
      return {
        session: mapSession(row),
        messages: page.rows.map(mapMessage),
        pagination: {
          limit,
          hasMore: page.hasMore,
          nextCursor: page.nextCursor,
        },
      };
    });
  }

  async function processMessage({
    adminId,
    sessionId,
    question,
    idempotencyKey,
    requestId,
    modelName = null,
    processQuestion,
  }) {
    if (typeof processQuestion !== 'function') {
      throw new TypeError('processQuestion callback is required.');
    }
    if (!UUID_PATTERN.test(requestId || '') || !UUID_PATTERN.test(idempotencyKey || '')) {
      throw new AppError(400, 'A valid request ID and idempotency key are required.');
    }

    const startedAt = clock();
    let client;
    let transactionOpen = false;
    let ownsSession = false;
    let sessionLockAcquired = false;
    let sessionLockKey = null;
    let intentForAudit = null;
    let auditFilters = {};

    try {
      client = await database.connect();
      sessionLockKey = getSessionAdvisoryLockKey({ adminId, sessionId });
      const lockResult = await client.query(
        'SELECT pg_try_advisory_lock($1::bigint) AS locked',
        [sessionLockKey],
      );
      const lockAcquired = lockResult.rows?.[0]?.locked;
      if (typeof lockAcquired !== 'boolean') {
        throw new Error('Unexpected session lock result.');
      }
      if (!lockAcquired) {
        throw new AppError(409, 'A message for this session is already being processed.');
      }
      sessionLockAcquired = true;

      await client.query('BEGIN');
      transactionOpen = true;
      await client.query(
        `SELECT set_config('statement_timeout', $1, true),
                set_config('lock_timeout', $2, true),
                set_config('idle_in_transaction_session_timeout', $3, true)`,
        [
          `${CHAT_TRANSACTION_QUERY_TIMEOUT_MS}ms`,
          `${CHAT_TRANSACTION_LOCK_TIMEOUT_MS}ms`,
          `${CHAT_TRANSACTION_IDLE_TIMEOUT_MS}ms`,
        ],
      );
      const sessionResult = await client.query(
        `SELECT id, context
         FROM admin_chat_sessions
         WHERE id = $1 AND admin_id = $2
         FOR UPDATE`,
        [sessionId, adminId],
      );
      const session = sessionResult.rows[0];
      if (!session) {
        throw new AppError(404, 'Administrator chat session not found.');
      }
      ownsSession = true;

      const existingMessageResult = await client.query(
        `SELECT m.id, m.sender_type, m.content, m.created_at
         FROM admin_chat_messages m
         WHERE m.session_id = $1
           AND m.sender_type = 'admin'
           AND m.idempotency_key = $2
           AND EXISTS (
             SELECT 1
             FROM admin_chat_sessions s
             WHERE s.id = m.session_id AND s.admin_id = $3
           )
         LIMIT 1`,
        [sessionId, idempotencyKey, adminId],
      );
      const existingMessage = existingMessageResult.rows[0];
      if (existingMessage) {
        if (existingMessage.content !== question) {
          throw new AppError(409, 'Idempotency key was already used for a different message.');
        }
        const existingAssistantResult = await client.query(
          `SELECT m.id, m.sender_type, m.content, m.created_at, m.metadata
           FROM admin_chat_messages m
           WHERE m.session_id = $1
             AND m.sender_type = 'assistant'
             AND m.metadata->>'replyToMessageId' = $2
             AND EXISTS (
               SELECT 1
               FROM admin_chat_sessions s
               WHERE s.id = m.session_id AND s.admin_id = $3
             )
           LIMIT 1`,
          [sessionId, existingMessage.id, adminId],
        );
        const existingAssistant = existingAssistantResult.rows[0];
        if (!existingAssistant) {
          throw new AppError(409, 'This message request is already being processed.');
        }
        await client.query('COMMIT');
        transactionOpen = false;
        return replayResponse(existingMessage, existingAssistant);
      }

      await client.query('COMMIT');
      transactionOpen = false;

      const processed = await processQuestion({
        previousContext: session.context,
        onIntent(intent) {
          intentForAudit = validateAdminChatIntent(intent);
          auditFilters = intentForAudit.filters || {};
        },
      });
      const intent = assertMessageResult(processed);
      intentForAudit = intent;
      auditFilters = intent.filters || {};

      const contextJson = serializeContext(processed.nextContext ?? session.context);
      const aggregate = processed.result ?? null;

      await client.query('BEGIN');
      transactionOpen = true;
      await client.query(
        `SELECT set_config('statement_timeout', $1, true),
                set_config('lock_timeout', $2, true),
                set_config('idle_in_transaction_session_timeout', $3, true)`,
        [
          `${CHAT_TRANSACTION_QUERY_TIMEOUT_MS}ms`,
          `${CHAT_TRANSACTION_LOCK_TIMEOUT_MS}ms`,
          `${CHAT_TRANSACTION_IDLE_TIMEOUT_MS}ms`,
        ],
      );
      const finalSessionResult = await client.query(
        `SELECT id
         FROM admin_chat_sessions
         WHERE id = $1 AND admin_id = $2
         FOR UPDATE`,
        [sessionId, adminId],
      );
      if (!finalSessionResult.rows[0]) {
        throw new AppError(404, 'Administrator chat session not found.');
      }

      const userMessageResult = await client.query(
        `INSERT INTO admin_chat_messages (
           session_id, sender_type, content, idempotency_key
         )
         SELECT $1, 'admin', $3, $4
         WHERE EXISTS (
           SELECT 1 FROM admin_chat_sessions
           WHERE id = $1 AND admin_id = $2
         )
         RETURNING id, sender_type, content, created_at`,
        [sessionId, adminId, question, idempotencyKey],
      );
      const userMessage = userMessageResult.rows[0];
      if (!userMessage) {
        throw new AppError(404, 'Administrator chat session not found.');
      }

      const assistantMetadata = serializeAssistantMetadata({
        replyToMessageId: userMessage.id,
        requestId,
        intent: intent.intent,
        operation: intent.operation,
        filters: intent.filters,
        aggregate,
      });
      const assistantMessageResult = await client.query(
        `INSERT INTO admin_chat_messages (
           session_id, sender_type, content, metadata
         )
         SELECT $1, 'assistant', $3, $4::jsonb
         WHERE EXISTS (
           SELECT 1 FROM admin_chat_sessions
           WHERE id = $1 AND admin_id = $2
         )
         RETURNING id, sender_type, content, created_at`,
        [sessionId, adminId, processed.assistantContent, assistantMetadata],
      );
      const assistantMessage = assistantMessageResult.rows[0];
      if (!assistantMessage) {
        throw new AppError(404, 'Administrator chat session not found.');
      }

      await client.query(
        `UPDATE admin_chat_sessions
         SET context = $3::jsonb,
             updated_at = NOW(),
             last_message_at = NOW()
         WHERE id = $1 AND admin_id = $2`,
        [sessionId, adminId, contextJson],
      );

      const durationMs = Math.max(0, Math.min(clock() - startedAt, 2_147_483_647));
      const auditOperation = intent.operation || intent.intent;
      await client.query(
        `INSERT INTO admin_chat_audit_logs (
           admin_id, session_id, operation, filters, outcome,
           duration_ms, row_count, model, request_id
         )
         SELECT $1, $2, $3, $4::jsonb, 'success', $5, $6, $7, $8
         WHERE EXISTS (
           SELECT 1 FROM admin_chat_sessions
           WHERE id = $2 AND admin_id = $1
         )`,
        [
          adminId,
          sessionId,
          auditOperation,
          JSON.stringify(auditFilters),
          durationMs,
          aggregate === null ? 0 : 1,
          safeModelName(modelName),
          requestId,
        ],
      );

      await client.query('COMMIT');
      transactionOpen = false;
      return {
        userMessage: mapMessage(userMessage),
        assistantMessage: mapMessage(assistantMessage),
        result: aggregate,
        requestId,
        idempotentReplay: false,
      };
    } catch (error) {
      if (client && transactionOpen) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          logger.error('Admin chat rollback failed', { code: safeErrorCode(rollbackError) });
        }
      }

      if (
        client
        && ownsSession
        && !(error instanceof AppError && error.status === 409)
      ) {
        try {
          const durationMs = Math.max(0, Math.min(clock() - startedAt, 2_147_483_647));
          await client.query(
            `INSERT INTO admin_chat_audit_logs (
               admin_id, session_id, operation, filters, outcome,
               duration_ms, row_count, model, request_id
             )
             SELECT $1, $2, $3, $4::jsonb, 'failure', $5, 0, $6, $7
             WHERE EXISTS (
               SELECT 1 FROM admin_chat_sessions
               WHERE id = $2 AND admin_id = $1
             )`,
            [
              adminId,
              sessionId,
              intentForAudit?.operation || intentForAudit?.intent || 'classification',
              JSON.stringify(auditFilters),
              durationMs,
              safeModelName(modelName),
              requestId,
            ],
          );
        } catch (auditError) {
          logger.error('Admin chat failure audit could not be recorded', {
            code: safeErrorCode(auditError),
          });
        }
      }

      if (error instanceof AppError) {
        throw error;
      }
      logger.error('Admin chat message processing failed', {
        operation: intentForAudit?.operation || intentForAudit?.intent || 'classification',
        code: safeErrorCode(error),
      });
      throw new AppError(503, 'Unable to process administrator chat right now.');
    } finally {
      if (client) {
        let releaseError;
        if (sessionLockAcquired) {
          try {
            const unlockResult = await client.query(
              'SELECT pg_advisory_unlock($1::bigint) AS unlocked',
              [sessionLockKey],
            );
            if (unlockResult.rows?.[0]?.unlocked !== true) {
              releaseError = new Error('Unable to confirm administrator chat lock release.');
              logger.error('Admin chat session lock release could not be confirmed', {
                code: null,
              });
            }
          } catch (error) {
            releaseError = error;
            logger.error('Admin chat session lock release failed', {
              code: safeErrorCode(error),
            });
          }
        }
        client.release(releaseError);
      }
    }
  }

  return {
    createSession,
    listSessions,
    getSession,
    processMessage,
  };
}

export const adminChatModel = createAdminChatModel();
