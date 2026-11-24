import { Router } from 'express';
import { requireAdmin } from '../middleware/authMiddleware.js';
import { adminUserController } from '../controllers/adminUserController.js';

export function createAdminUserRouter({
  adminMiddleware = requireAdmin,
  controller = adminUserController,
} = {}) {
  const router = Router();

  router.use(adminMiddleware);

  /**
   * @openapi
   * /api/admin/users:
   *   get:
   *     summary: List registered farmers and buyers
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: q
   *         schema:
   *           type: string
   *           maxLength: 100
   *       - in: query
   *         name: role
   *         schema:
   *           type: string
   *           enum: [farmer, buyer]
   *       - in: query
   *         name: status
   *         schema:
   *           type: string
   *           enum: [active, suspended]
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
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           minimum: 1
   *           maximum: 100
   *     responses:
   *       200:
   *         description: Paginated farmer and buyer accounts
   *       400:
   *         description: Invalid query parameters
   *       401:
   *         description: Authentication required
   *       403:
   *         description: Authorized administrator access required
   */
  router.get('/', controller.listUsers);

  /**
   * @openapi
   * /api/admin/users/{userId}/activity:
   *   get:
   *     summary: Retrieve safe activity for a farmer or buyer
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: userId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           minimum: 1
   *           maximum: 50
   *     responses:
   *       200:
   *         description: Safe role-specific aggregate and recent activity
   *       400:
   *         description: Invalid UUID or limit
   *       404:
   *         description: Farmer or buyer account not found
   *       401:
   *         description: Authentication required
   *       403:
   *         description: Authorized administrator access required
   */
  router.get('/:userId/activity', controller.getUserActivity);

  /**
   * @openapi
   * /api/admin/users/{userId}/suspend:
   *   post:
   *     summary: Suspend a farmer or buyer account
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: userId
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
   *             required: [reason]
   *             properties:
   *               reason:
   *                 type: string
   *                 minLength: 3
   *                 maxLength: 500
   *     responses:
   *       200:
   *         description: Account suspended
   *       400:
   *         description: Invalid user ID or reason
   *       404:
   *         description: Farmer or buyer account not found
   *       409:
   *         description: Account is already suspended
   *       401:
   *         description: Authentication required
   *       403:
   *         description: Authorized administrator access required
   */
  router.post('/:userId/suspend', controller.suspendUser);

  /**
   * @openapi
   * /api/admin/users/{userId}/reactivate:
   *   post:
   *     summary: Reactivate a suspended farmer or buyer account
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: userId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       200:
   *         description: Account reactivated
   *       400:
   *         description: Invalid user ID
   *       404:
   *         description: Farmer or buyer account not found
   *       409:
   *         description: Account is already active
   *       401:
   *         description: Authentication required
   *       403:
   *         description: Authorized administrator access required
   */
  router.post('/:userId/reactivate', controller.reactivateUser);

  /**
   * @openapi
   * /api/admin/users/{userId}:
   *   get:
   *     summary: Retrieve a farmer or buyer account
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: userId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       200:
   *         description: Safe farmer or buyer account details
   *       400:
   *         description: Invalid UUID
   *       404:
   *         description: Farmer or buyer account not found
   *       401:
   *         description: Authentication required
   *       403:
   *         description: Authorized administrator access required
   */
  router.get('/:userId', controller.getUser);

  return router;
}

export default createAdminUserRouter();
