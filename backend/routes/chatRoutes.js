import { Router } from 'express';
import { authenticateToken } from '../middleware/authMiddleware.js';
import {
  getConversationsHandler,
  getConversationByOrderHandler,
  getMessageHistoryHandler,
  sendMessageHandler,
  updateReadStateHandler,
  getUnreadCountHandler,
} from '../controllers/chatController.js';

const router = Router();

/**
 * @openapi
 * /api/conversations/unread-count:
 *   get:
 *     summary: Get the authenticated user's aggregate unread message count
 *     security:
 *       - bearerAuth: []
 */
router.get('/conversations/unread-count', authenticateToken, getUnreadCountHandler);
/**
 * @openapi
 * /api/conversations:
 *   get:
 *     summary: List conversations belonging to the authenticated buyer or farmer
 *     security:
 *       - bearerAuth: []
 */
router.get('/conversations', authenticateToken, getConversationsHandler);
/**
 * @openapi
 * /api/orders/{orderId}/conversation:
 *   get:
 *     summary: Retrieve or lazily create an eligible order conversation
 *     security:
 *       - bearerAuth: []
 */
router.get('/orders/:orderId/conversation', authenticateToken, getConversationByOrderHandler);
/**
 * @openapi
 * /api/conversations/{conversationId}/messages:
 *   get:
 *     summary: Retrieve cursor-paginated message history
 *     security:
 *       - bearerAuth: []
 *   post:
 *     summary: Send an idempotent message
 *     security:
 *       - bearerAuth: []
 */
router.get('/conversations/:conversationId/messages', authenticateToken, getMessageHistoryHandler);
router.post('/conversations/:conversationId/messages', authenticateToken, sendMessageHandler);
/**
 * @openapi
 * /api/conversations/{conversationId}/read:
 *   patch:
 *     summary: Update the authenticated participant's conversation read state
 *     security:
 *       - bearerAuth: []
 */
router.patch('/conversations/:conversationId/read', authenticateToken, updateReadStateHandler);

export default router;
