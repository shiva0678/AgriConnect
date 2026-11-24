import { Router } from 'express';
import { requireAdmin } from '../middleware/authMiddleware.js';
import { adminChatRateLimiter } from '../middleware/adminChatRateLimiter.js';
import { adminChatController } from '../controllers/adminChatController.js';

export function createAdminChatRouter({
  authenticateAdmin = requireAdmin,
  rateLimiter = adminChatRateLimiter,
  controller = adminChatController,
} = {}) {
  const router = Router();
  router.use(authenticateAdmin);

  /**
   * @openapi
   * /api/admin/chat/sessions:
   *   post:
   *     summary: Create an administrator chat session
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: false
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             additionalProperties: false
   *             properties:
   *               title:
   *                 type: string
   *                 maxLength: 160
   *     responses:
   *       201:
   *         description: Session created for the authenticated administrator
   *       401:
   *         description: Authentication required
   *       403:
   *         description: Authorized administrator access required
   */
  router.post('/sessions', controller.createSession);

  /**
   * @openapi
   * /api/admin/chat/sessions:
   *   get:
   *     summary: List the authenticated administrator's chat sessions
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           minimum: 1
   *           maximum: 100
   *       - in: query
   *         name: before
   *         schema:
   *           type: string
   *           format: date-time
   *       - in: query
   *         name: beforeId
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       200:
   *         description: Owned sessions and pagination cursor
   *       401:
   *         description: Authentication required
   *       403:
   *         description: Authorized administrator access required
   */
  router.get('/sessions', controller.listSessions);

  /**
   * @openapi
   * /api/admin/chat/sessions/{sessionId}:
   *   get:
   *     summary: Retrieve an owned session and a page of messages
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: sessionId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           minimum: 1
   *           maximum: 100
   *       - in: query
   *         name: before
   *         schema:
   *           type: string
   *           format: date-time
   *       - in: query
   *         name: beforeId
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       200:
   *         description: Owned session and paginated messages
   *       404:
   *         description: Session not found for this administrator
   */
  router.get('/sessions/:sessionId', controller.getSession);

  /**
   * @openapi
   * /api/admin/chat/sessions/{sessionId}/messages:
   *   post:
   *     summary: Send a message and return the assistant response
   *     description: Analytics use predefined read-only aggregate queries; no arbitrary SQL is accepted. Idempotency keys are UUIDs.
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: sessionId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *       - in: header
   *         name: Idempotency-Key
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - message
   *             additionalProperties: false
   *             properties:
   *               message:
   *                 type: string
   *                 minLength: 1
   *                 maxLength: 1200
   *               idempotencyKey:
   *                 type: string
   *                 format: uuid
   *     responses:
   *       200:
   *         description: Persisted user and assistant messages with aggregate result
   *       400:
   *         description: Invalid message or idempotency key
   *       404:
   *         description: Session not found for this administrator
   *       409:
   *         description: A message is already being processed for this session; retry after it completes. Reusing an idempotency key with different content also conflicts.
   *       429:
   *         description: Message rate limit exceeded
   */
  router.post('/sessions/:sessionId/messages', rateLimiter, controller.sendMessage);
  return router;
}

export default createAdminChatRouter();
