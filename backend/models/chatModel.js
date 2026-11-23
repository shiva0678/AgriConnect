import { pool } from '../config/db.js';
import { AppError } from '../utils/AppError.js';

const ELIGIBLE_CHAT_STATUSES = new Set([
  'confirmed',
  'shipped',
  'delivered',
  'cancelled',
]);

async function getConversationParticipant(client, conversationId, userId, { lock = false } = {}) {
  const result = await client.query(
    `SELECT
       c.id,
       c.order_id,
       o.buyer_id,
       o.farmer_id,
       o.status AS order_status
     FROM conversations c
     JOIN orders o ON o.id = c.order_id
     WHERE c.id = $1
       AND (o.buyer_id = $2 OR o.farmer_id = $2)
       AND o.status IN ('confirmed', 'shipped', 'delivered', 'cancelled')
     ${lock ? 'FOR UPDATE OF c' : ''}`,
    [conversationId, userId]
  );
  return result.rows[0] || null;
}

export async function getConversationAccess({ conversationId, userId }) {
  const conversation = await getConversationParticipant(pool, conversationId, userId);
  if (!conversation) {
    throw new AppError(404, 'Conversation not found.');
  }
  return conversation;
}

export async function getConversations({ userId, page, limit }) {
  const offset = (page - 1) * limit;

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM conversations c
     JOIN orders o ON o.id = c.order_id
     WHERE (o.buyer_id = $1 OR o.farmer_id = $1)
       AND o.status IN ('confirmed', 'shipped', 'delivered', 'cancelled')`,
    [userId]
  );

  const result = await pool.query(
    `SELECT
       c.id,
       c.order_id,
       c.created_at,
       c.updated_at,
       o.status AS order_status,
       o.crop_id,
       crop.name AS crop_name,
       CASE
         WHEN o.buyer_id = $1 THEN farmer_user.id
         ELSE buyer_user.id
       END AS other_participant_id,
       CASE
         WHEN o.buyer_id = $1 THEN farmer_user.name
         ELSE buyer_user.name
       END AS other_participant_name,
       lm.id AS latest_message_id,
       lm.sender_id AS latest_message_sender_id,
       lm.content AS latest_message_content,
       lm.created_at AS latest_message_created_at,
       COALESCE(
         (
           SELECT COUNT(*)::int
           FROM messages unread
           WHERE unread.conversation_id = c.id
             AND unread.sender_id <> $1
             AND unread.created_at > COALESCE(read_state.last_read_at, '-infinity')
         ),
         0
       ) AS unread_count
     FROM conversations c
     JOIN orders o ON o.id = c.order_id
     JOIN crops crop ON crop.id = o.crop_id
     JOIN users buyer_user ON buyer_user.id = o.buyer_id
     JOIN users farmer_user ON farmer_user.id = o.farmer_id
     LEFT JOIN conversation_read_states read_state
       ON read_state.conversation_id = c.id
      AND read_state.user_id = $1
     LEFT JOIN LATERAL (
       SELECT m.id, m.sender_id, m.content, m.created_at
       FROM messages m
       WHERE m.conversation_id = c.id
       ORDER BY m.created_at DESC, m.id DESC
       LIMIT 1
     ) lm ON TRUE
     WHERE (o.buyer_id = $1 OR o.farmer_id = $1)
       AND o.status IN ('confirmed', 'shipped', 'delivered', 'cancelled')
     ORDER BY COALESCE(lm.created_at, c.updated_at, c.created_at) DESC,
              c.id DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );

  return {
    conversations: result.rows,
    total: Number(countResult.rows[0]?.total ?? 0),
  };
}

export async function getConversationByOrder({ orderId, userId }) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const orderResult = await client.query(
      `SELECT
         o.id,
         o.buyer_id,
         o.farmer_id,
         o.status,
         crop.name AS crop_name,
         buyer.name AS buyer_name,
         farmer.name AS farmer_name
       FROM orders o
       JOIN crops crop ON crop.id = o.crop_id
       JOIN users buyer ON buyer.id = o.buyer_id
       JOIN users farmer ON farmer.id = o.farmer_id
       WHERE o.id = $1
         AND (o.buyer_id = $2 OR o.farmer_id = $2)
       FOR UPDATE OF o`,
      [orderId, userId]
    );
    const order = orderResult.rows[0];

    if (!order) {
      throw new AppError(404, 'Order or conversation not found.');
    }

    if (!ELIGIBLE_CHAT_STATUSES.has(order.status)) {
      throw new AppError(404, 'Conversation is not available for this order.');
    }

    await client.query(
      `INSERT INTO conversations (order_id)
       VALUES ($1)
       ON CONFLICT (order_id) DO NOTHING`,
      [orderId]
    );

    const conversationResult = await client.query(
      `SELECT c.id, c.order_id, c.created_at, c.updated_at
       FROM conversations c
       WHERE c.order_id = $1`,
      [orderId]
    );

    await client.query('COMMIT');
    const conversation = conversationResult.rows[0];
    const otherParticipantId = userId === order.buyer_id
      ? order.farmer_id
      : order.buyer_id;
    const otherParticipantName = userId === order.buyer_id
      ? order.farmer_name
      : order.buyer_name;

    return {
      conversation,
      order: {
        id: order.id,
        status: order.status,
        crop_name: order.crop_name,
      },
      other_participant: {
        id: otherParticipantId,
        name: otherParticipantName,
      },
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function getMessageHistory({ conversationId, userId, limit, before, beforeId }) {
  const conversation = await getConversationParticipant(pool, conversationId, userId);
  if (!conversation) {
    throw new AppError(404, 'Conversation not found.');
  }
  if (!ELIGIBLE_CHAT_STATUSES.has(conversation.order_status)) {
    throw new AppError(404, 'Conversation is not available for this order.');
  }

  let cursorDate = null;
  let cursorId = null;

  if (before && beforeId) {
    const cursorResult = await pool.query(
      `SELECT
         id,
         to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
           AS cursor_created_at
       FROM messages
       WHERE id = $1
         AND conversation_id = $2
         AND created_at = $3::timestamptz`,
      [beforeId, conversationId, before]
    );
    if (!cursorResult.rows[0]) {
      throw new AppError(400, 'Invalid message cursor.');
    }

    cursorDate = before;
    cursorId = beforeId;
  }

  const result = await pool.query(
    `SELECT
       id,
       conversation_id,
       sender_id,
       content,
       client_message_id,
       created_at,
       to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
         AS cursor_created_at
     FROM messages
     WHERE conversation_id = $1
       AND (
         $2::timestamptz IS NULL
         OR (created_at, id) < ($2::timestamptz, $3::uuid)
       )
     ORDER BY created_at DESC, id DESC
     LIMIT $4`,
    [conversationId, cursorDate || null, cursorId || '00000000-0000-0000-0000-000000000000', limit + 1]
  );

  const hasMore = result.rows.length > limit;
  const pageRows = hasMore ? result.rows.slice(0, limit) : result.rows;
  pageRows.reverse();

  const oldest = pageRows[0] || null;
  return {
    messages: pageRows,
    has_more: hasMore,
    next_cursor: hasMore && oldest
      ? { created_at: oldest.cursor_created_at, id: oldest.id }
      : null,
  };
}

async function persistConversationMessage({
  conversationId,
  senderId,
  content,
  clientMessageId,
}) {
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    await client.query('BEGIN');
    transactionStarted = true;

    const conversation = await getConversationParticipant(
      client,
      conversationId,
      senderId,
      { lock: true },
    );
    if (!conversation) {
      throw new AppError(404, 'Conversation not found.');
    }
    if (!ELIGIBLE_CHAT_STATUSES.has(conversation.order_status)) {
      throw new AppError(400, 'Messaging is not available for this order status.');
    }

    const insertResult = await client.query(
      `INSERT INTO messages (
         conversation_id,
         sender_id,
         content,
         client_message_id,
         created_at
       ) VALUES ($1, $2, $3, $4, clock_timestamp())
       ON CONFLICT (conversation_id, sender_id, client_message_id) DO NOTHING
       RETURNING id, conversation_id, sender_id, content, client_message_id, created_at`,
      [conversationId, senderId, content, clientMessageId]
    );

    const inserted = insertResult.rows[0];
    if (inserted) {
      await client.query(
        `UPDATE conversations
         SET updated_at = GREATEST(updated_at, clock_timestamp())
         WHERE id = $1`,
        [conversationId]
      );
    }

    await client.query('COMMIT');
    transactionStarted = false;

    if (inserted) {
      return { message: inserted, created: true };
    }

    const existingResult = await client.query(
      `SELECT id, conversation_id, sender_id, content, client_message_id, created_at
       FROM messages
       WHERE conversation_id = $1
         AND sender_id = $2
         AND client_message_id = $3`,
      [conversationId, senderId, clientMessageId]
    );
    return { message: existingResult.rows[0], created: false };
  } catch (error) {
    if (transactionStarted) {
      await client.query('ROLLBACK').catch(() => {});
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function sendConversationMessage(options) {
  const { message } = await persistConversationMessage(options);
  return message;
}

export async function sendConversationMessageWithStatus(options) {
  return persistConversationMessage(options);
}

export async function updateConversationReadState({ conversationId, userId }) {
  const client = await pool.connect();
  let transactionStarted = false;
  try {
    await client.query('BEGIN');
    transactionStarted = true;
    const conversation = await getConversationParticipant(
      client,
      conversationId,
      userId,
      { lock: true },
    );
    if (!conversation) {
      throw new AppError(404, 'Conversation not found.');
    }
    if (!ELIGIBLE_CHAT_STATUSES.has(conversation.order_status)) {
      throw new AppError(404, 'Conversation is not available for this order.');
    }

    const cutoffResult = await client.query('SELECT clock_timestamp()::text AS cutoff');
    const cutoff = cutoffResult.rows[0].cutoff;
    const result = await client.query(
      `INSERT INTO conversation_read_states (
         conversation_id,
         user_id,
         last_read_at,
         updated_at
       ) VALUES ($1, $2, $3, $3)
       ON CONFLICT (conversation_id, user_id)
       DO UPDATE SET
         last_read_at = EXCLUDED.last_read_at,
         updated_at = EXCLUDED.updated_at
       RETURNING conversation_id, user_id, last_read_at, updated_at`,
      [conversationId, userId, cutoff]
    );
    await client.query('COMMIT');
    transactionStarted = false;
    return result.rows[0];
  } catch (error) {
    if (transactionStarted) {
      await client.query('ROLLBACK').catch(() => {});
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function getUnreadCount({ userId }) {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS unread_count
     FROM conversations c
     JOIN orders o ON o.id = c.order_id
     JOIN messages m ON m.conversation_id = c.id
     LEFT JOIN conversation_read_states rs
       ON rs.conversation_id = c.id
      AND rs.user_id = $1
     WHERE (o.buyer_id = $1 OR o.farmer_id = $1)
       AND o.status IN ('confirmed', 'shipped', 'delivered', 'cancelled')
       AND m.sender_id <> $1
       AND m.created_at > COALESCE(rs.last_read_at, '-infinity')`,
    [userId]
  );
  return Number(result.rows[0]?.unread_count ?? 0);
}
