import { pool } from '../config/db.js';
import { AppError } from '../utils/AppError.js';

function toISOString(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid timestamp returned by PostgreSQL.');
  }
  return date.toISOString();
}

function mapUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    status: row.status,
    farmName: row.farm_name,
    companyName: row.company_name,
    location: row.location,
    suspendedAt: row.suspended_at ? toISOString(row.suspended_at) : null,
    suspendedReason: row.suspended_reason,
    createdAt: toISOString(row.created_at),
  };
}

function mapListUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    status: row.status,
    location: row.location,
    farmName: row.farm_name,
    companyName: row.company_name,
    createdAt: toISOString(row.created_at),
  };
}

function escapeLike(value) {
  return value
    .replaceAll('!', '!!')
    .replaceAll('%', '!%')
    .replaceAll('_', '!_');
}

export function createAdminUserModel({ database = pool, logger = console } = {}) {
  function logDatabaseFailure(operation, error) {
    logger.error('Admin user database operation failed', {
      operation,
      code: typeof error?.code === 'string'
        ? error.code.replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 80)
        : null,
    });
  }

  async function runDatabaseOperation(operation, callback) {
    try {
      return await callback();
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logDatabaseFailure(operation, error);
      throw new AppError(503, 'Unable to retrieve administrator user data right now.');
    }
  }

  async function insertActionAudit(client, {
    adminId,
    targetUserId,
    targetReference,
    action,
    reason,
    outcome,
    requestId,
  }) {
    await client.query(
      `INSERT INTO admin_user_action_audit_logs
         (admin_id, target_user_id, target_reference, action, reason, outcome, request_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [adminId, targetUserId, targetReference, action, reason, outcome, requestId],
    );
  }

  async function writeFailureAudit(client, audit, onRollbackFailure) {
    // Failed attempts are recorded only after the account-change transaction rolls back.
    let transactionStarted = false;
    try {
      await client.query('BEGIN');
      transactionStarted = true;
      await insertActionAudit(client, { ...audit, outcome: 'failure' });
      await client.query('COMMIT');
      transactionStarted = false;
    } catch (error) {
      if (transactionStarted) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          logDatabaseFailure('rollback_failed_action_audit', rollbackError);
          onRollbackFailure(rollbackError);
        }
      }
      logDatabaseFailure('write_failed_action_audit', error);
      throw new AppError(503, 'Unable to complete the administrator user action.');
    }
  }

  async function changeUserStatus({
    userId,
    adminId,
    requestId,
    action,
    reason = null,
  }) {
    const client = await database.connect();
    let transactionStarted = false;
    let targetExists = false;
    let commitAttempted = false;
    let auditReason = reason;
    let rollbackSucceeded = true;
    let clientReleaseError = null;
    let operationFailed = false;

    try {
      await client.query('BEGIN');
      transactionStarted = true;

      const targetResult = await client.query(
        `SELECT id, role, status, suspended_reason
         FROM users
         WHERE id = $1
         FOR UPDATE`,
        [userId],
      );
      const target = targetResult.rows[0];
      targetExists = Boolean(target);
      if (!target || !['farmer', 'buyer'].includes(target.role)) {
        throw new AppError(404, 'User not found.');
      }
      if (action === 'suspend' && target.status === 'suspended') {
        throw new AppError(409, 'User is already suspended.');
      }
      if (action === 'reactivate' && target.status !== 'suspended') {
        throw new AppError(409, 'User is already active.');
      }

      let updatedResult;
      if (action === 'suspend') {
        updatedResult = await client.query(
          `UPDATE users
           SET status = 'suspended',
               suspended_at = NOW(),
               suspended_reason = $2,
               suspended_by = $3,
               password_version = password_version + 1
           WHERE id = $1
             AND role IN ('farmer', 'buyer')
           RETURNING id, status, suspended_at`,
          [userId, reason, adminId],
        );
      } else {
        const previousReason = typeof target.suspended_reason === 'string'
          ? target.suspended_reason.trim()
          : '';
        auditReason = previousReason.length >= 1 && previousReason.length <= 500
          ? previousReason
          : null;
        updatedResult = await client.query(
          `UPDATE users
           SET status = 'active',
               suspended_at = NULL,
               suspended_reason = NULL,
               suspended_by = NULL,
               password_version = password_version + 1
           WHERE id = $1
             AND role IN ('farmer', 'buyer')
           RETURNING id, status, suspended_at`,
          [userId],
        );
      }

      const updatedUser = updatedResult.rows[0];
      if (!updatedUser) {
        throw new AppError(404, 'User not found.');
      }

      await insertActionAudit(client, {
        adminId,
        targetUserId: updatedUser.id,
        targetReference: userId,
        action,
        reason: auditReason,
        outcome: 'success',
        requestId,
      });

      commitAttempted = true;
      await client.query('COMMIT');
      transactionStarted = false;
      return {
        userId: updatedUser.id,
        status: updatedUser.status,
        suspendedAt: updatedUser.suspended_at
          ? toISOString(updatedUser.suspended_at)
          : null,
        requestId,
      };
    } catch (error) {
      operationFailed = true;
      if (transactionStarted) {
        try {
          await client.query('ROLLBACK');
          transactionStarted = false;
          rollbackSucceeded = true;
        } catch (rollbackError) {
          logDatabaseFailure('rollback_user_status_change', rollbackError);
          rollbackSucceeded = false;
          clientReleaseError = rollbackError;
        }
      }

      if (!rollbackSucceeded) {
        if (!(error instanceof AppError)) {
          logDatabaseFailure(`${action}_user`, error);
        }
        throw new AppError(503, 'Unable to complete the administrator user action.');
      }

      if (!(commitAttempted && !(error instanceof AppError))) {
        try {
          await writeFailureAudit(client, {
            adminId,
            targetUserId: targetExists ? userId : null,
            targetReference: userId,
            action,
            reason: auditReason,
            requestId,
          }, (rollbackError) => {
            rollbackSucceeded = false;
            clientReleaseError = rollbackError;
          });
        } catch (auditError) {
          throw auditError;
        }
      } else {
        logDatabaseFailure('commit_user_status_change', error);
      }

      if (error instanceof AppError) {
        throw error;
      }
      logDatabaseFailure(`${action}_user`, error);
      throw new AppError(503, 'Unable to complete the administrator user action.');
    } finally {
      try {
        if (clientReleaseError) {
          client.release(clientReleaseError);
        } else {
          client.release();
        }
      } catch (releaseError) {
        logDatabaseFailure('release_user_status_change_client', releaseError);
        if (!operationFailed) {
          throw new AppError(503, 'Unable to complete the administrator user action.');
        }
      }
    }
  }

  async function listUsers(filters) {
    return runDatabaseOperation('list_users', async () => {
      const values = [];
      const conditions = [`u.role IN ('farmer', 'buyer')`];

      if (filters.role) {
        values.push(filters.role);
        conditions.push(`u.role = $${values.length}`);
      }
      if (filters.status) {
        values.push(filters.status);
        conditions.push(`u.status = $${values.length}`);
      }
      if (filters.search) {
        const pattern = `%${escapeLike(filters.search)}%`;
        values.push(pattern);
        const searchParameter = `$${values.length}`;
        conditions.push(`(
          COALESCE(u.name, '') ILIKE ${searchParameter} ESCAPE '!'
          OR COALESCE(u.email, '') ILIKE ${searchParameter} ESCAPE '!'
          OR COALESCE(u.phone, '') ILIKE ${searchParameter} ESCAPE '!'
          OR COALESCE(u.location, '') ILIKE ${searchParameter} ESCAPE '!'
        )`);
      }
      if (filters.cursor) {
        values.push(filters.cursor.before);
        const beforeParameter = `$${values.length}::timestamptz`;
        values.push(filters.cursor.beforeId);
        const beforeIdParameter = `$${values.length}::uuid`;
        conditions.push(`(
          u.created_at < ${beforeParameter}
          OR (u.created_at = ${beforeParameter} AND u.id < ${beforeIdParameter})
        )`);
      }

      values.push(filters.limit + 1);
      const limitParameter = `$${values.length}`;
      const result = await database.query(
        `SELECT u.id, u.name, u.email, u.role, u.status, u.location,
                u.farm_name, u.company_name, u.created_at,
                to_char(u.created_at AT TIME ZONE 'UTC',
                        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_before
         FROM users u
         WHERE ${conditions.join('\n           AND ')}
         ORDER BY u.created_at DESC, u.id DESC
         LIMIT ${limitParameter}`,
        values,
      );

      const hasMore = result.rows.length > filters.limit;
      const pageRows = result.rows.slice(0, filters.limit);
      const last = pageRows.at(-1);
      return {
        users: pageRows.map(mapListUser),
        pagination: {
          limit: filters.limit,
          hasMore,
          nextCursor: hasMore && last
            ? {
              before: last.cursor_before || toISOString(last.created_at),
              beforeId: last.id,
            }
            : null,
        },
      };
    });
  }

  async function getUser(userId) {
    return runDatabaseOperation('get_user', async () => {
      const result = await database.query(
        `SELECT id, name, email, phone, role, status,
                farm_name, company_name, location,
                suspended_at, suspended_reason, created_at
         FROM users
         WHERE id = $1
           AND role IN ('farmer', 'buyer')
         LIMIT 1`,
        [userId],
      );
      if (!result.rows[0]) {
        throw new AppError(404, 'User not found.');
      }
      return mapUser(result.rows[0]);
    });
  }

  async function getUserActivity(userId, limit) {
    return runDatabaseOperation('get_user_activity', async () => {
      const userResult = await database.query(
        `SELECT id, role, status
         FROM users
         WHERE id = $1
           AND role IN ('farmer', 'buyer')
         LIMIT 1`,
        [userId],
      );
      const user = userResult.rows[0];
      if (!user) {
        throw new AppError(404, 'User not found.');
      }

      let summaryResult;
      if (user.role === 'farmer') {
        summaryResult = await database.query(
          `WITH crop_summary AS (
             SELECT
               COUNT(*)::int AS total_crops,
               COUNT(*) FILTER (WHERE status = 'available')::int AS active_crops
             FROM crops
             WHERE farmer_id = $1
           ),
           order_summary AS (
             SELECT
               COUNT(*)::int AS total_orders,
               COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_orders,
               COUNT(*) FILTER (WHERE status = 'confirmed')::int AS confirmed_orders,
               COUNT(*) FILTER (WHERE status = 'shipped')::int AS shipped_orders,
               COUNT(*) FILTER (WHERE status = 'delivered')::int AS delivered_orders,
               COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled_orders
             FROM orders
             WHERE farmer_id = $1
           ),
           conversation_summary AS (
             SELECT COUNT(*)::int AS total_conversations
             FROM conversations c
             JOIN orders o ON o.id = c.order_id
             WHERE o.farmer_id = $1
           ),
           message_summary AS (
             SELECT COUNT(*)::int AS total_messages
             FROM messages m
             JOIN conversations c ON c.id = m.conversation_id
             JOIN orders o ON o.id = c.order_id
             WHERE m.sender_id = $1
               AND o.farmer_id = $1
           )
           SELECT
             crop_summary.*,
             order_summary.*,
             conversation_summary.*,
             message_summary.*
           FROM crop_summary
           CROSS JOIN order_summary
           CROSS JOIN conversation_summary
           CROSS JOIN message_summary`,
          [userId],
        );
      } else {
        summaryResult = await database.query(
          `WITH order_summary AS (
             SELECT
               COUNT(*)::int AS total_orders,
               COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_orders,
               COUNT(*) FILTER (WHERE status = 'confirmed')::int AS confirmed_orders,
               COUNT(*) FILTER (WHERE status = 'shipped')::int AS shipped_orders,
               COUNT(*) FILTER (WHERE status = 'delivered')::int AS delivered_orders,
               COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled_orders
             FROM orders
             WHERE buyer_id = $1
           ),
           conversation_summary AS (
             SELECT COUNT(*)::int AS total_conversations
             FROM conversations c
             JOIN orders o ON o.id = c.order_id
             WHERE o.buyer_id = $1
           ),
           message_summary AS (
             SELECT COUNT(*)::int AS total_messages
             FROM messages m
             JOIN conversations c ON c.id = m.conversation_id
             JOIN orders o ON o.id = c.order_id
             WHERE m.sender_id = $1
               AND o.buyer_id = $1
           )
           SELECT
             order_summary.*,
             conversation_summary.*,
             message_summary.*
           FROM order_summary
           CROSS JOIN conversation_summary
           CROSS JOIN message_summary`,
          [userId],
        );
      }

      const summaryRow = summaryResult.rows[0] || {};
      let summary = {
        totalOrders: Number(summaryRow.total_orders || 0),
        ordersByStatus: {
          pending: Number(summaryRow.pending_orders || 0),
          confirmed: Number(summaryRow.confirmed_orders || 0),
          shipped: Number(summaryRow.shipped_orders || 0),
          delivered: Number(summaryRow.delivered_orders || 0),
          cancelled: Number(summaryRow.cancelled_orders || 0),
        },
        totalConversations: Number(summaryRow.total_conversations || 0),
        totalMessages: Number(summaryRow.total_messages || 0),
      };
      if (user.role === 'farmer') {
        summary.totalCrops = Number(summaryRow.total_crops || 0);
        summary.activeCrops = Number(summaryRow.active_crops || 0);
        summary = {
          totalCrops: summary.totalCrops,
          activeCrops: summary.activeCrops,
          totalOrders: summary.totalOrders,
          ordersByStatus: summary.ordersByStatus,
          totalConversations: summary.totalConversations,
          totalMessages: summary.totalMessages,
        };
      }

      let recentResult;
      if (user.role === 'farmer') {
        recentResult = await database.query(
          `WITH events AS (
             SELECT
               'crop_created'::text AS type,
               c.id AS event_id,
               c.created_at AS occurred_at
             FROM crops c
             WHERE c.farmer_id = $1

             UNION ALL

             SELECT
               'order_placed'::text AS type,
               o.id AS event_id,
               o.created_at AS occurred_at
             FROM orders o
             WHERE o.farmer_id = $1

             UNION ALL

             SELECT
               'conversation_created'::text AS type,
               conv.id AS event_id,
               conv.created_at AS occurred_at
             FROM conversations conv
             JOIN orders o ON o.id = conv.order_id
             WHERE o.farmer_id = $1

             UNION ALL

             SELECT
               'message_sent'::text AS type,
               m.id AS event_id,
               m.created_at AS occurred_at
             FROM messages m
             JOIN conversations conv ON conv.id = m.conversation_id
             JOIN orders o ON o.id = conv.order_id
             WHERE m.sender_id = $1
               AND o.farmer_id = $1
           )
           SELECT type, event_id, occurred_at
           FROM events
           ORDER BY occurred_at DESC, event_id DESC
           LIMIT $2`,
          [userId, limit + 1],
        );
      } else {
        recentResult = await database.query(
          `WITH events AS (
             SELECT
               'order_placed'::text AS type,
               o.id AS event_id,
               o.created_at AS occurred_at
             FROM orders o
             WHERE o.buyer_id = $1

             UNION ALL

             SELECT
               'conversation_created'::text AS type,
               conv.id AS event_id,
               conv.created_at AS occurred_at
             FROM conversations conv
             JOIN orders o ON o.id = conv.order_id
             WHERE o.buyer_id = $1

             UNION ALL

             SELECT
               'message_sent'::text AS type,
               m.id AS event_id,
               m.created_at AS occurred_at
             FROM messages m
             JOIN conversations conv ON conv.id = m.conversation_id
             JOIN orders o ON o.id = conv.order_id
             WHERE m.sender_id = $1
               AND o.buyer_id = $1
           )
           SELECT type, event_id, occurred_at
           FROM events
           ORDER BY occurred_at DESC, event_id DESC
           LIMIT $2`,
          [userId, limit + 1],
        );
      }

      const hasMore = recentResult.rows.length > limit;
      const recentRows = recentResult.rows.slice(0, limit);
      const recentActivity = recentRows.map((row) => ({
        type: row.type,
        id: row.event_id,
        occurredAt: toISOString(row.occurred_at),
      }));

      return {
        userId,
        summary,
        recentActivity,
        pagination: {
          limit,
          hasMore,
        },
      };
    });
  }

  function suspendUser({ userId, adminId, reason, requestId }) {
    return changeUserStatus({
      userId,
      adminId,
      reason,
      requestId,
      action: 'suspend',
    });
  }

  function reactivateUser({ userId, adminId, requestId }) {
    return changeUserStatus({
      userId,
      adminId,
      requestId,
      action: 'reactivate',
    });
  }

  return {
    listUsers,
    getUser,
    getUserActivity,
    suspendUser,
    reactivateUser,
  };
}

export const adminUserModel = createAdminUserModel();
