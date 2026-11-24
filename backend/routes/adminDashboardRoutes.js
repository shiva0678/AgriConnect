import { Router } from 'express';
import { adminAnalyticsHandlers } from '../controllers/adminAnalyticsController.js';
import { requireAdmin } from '../middleware/authMiddleware.js';

export function createAdminDashboardRouter({
  adminMiddleware = requireAdmin,
  handlers = adminAnalyticsHandlers,
} = {}) {
  const router = Router();

  /**
   * @openapi
   * /api/admin/dashboard/overview:
   *   get:
   *     summary: Retrieve platform-wide dashboard totals
   *     description: User totals include all roles. Delivered order gross value sums delivered orders.total_amount and is not actual platform revenue because payment settlements and transaction records are not implemented.
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Platform user, crop, order and delivered-order gross totals
   *       401:
   *         description: Authentication required
   *       403:
   *         description: Authorized administrator access required
   */
  router.get('/dashboard/overview', adminMiddleware, handlers.getOverview);

  /**
   * @openapi
   * /api/admin/dashboard/users:
   *   get:
   *     summary: Retrieve user totals, monthly registrations and recent registrations
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: months
   *         schema:
   *           type: integer
   *           minimum: 1
   *           maximum: 36
   *       - in: query
   *         name: fromDate
   *         schema:
   *           type: string
   *           format: date
   *       - in: query
   *         name: toDate
   *         schema:
   *           type: string
   *           format: date
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           minimum: 1
   *           maximum: 50
   *     description: fromDate and toDate apply to monthly registration counts only.
   *     responses:
   *       200:
   *         description: User analytics and limited recent registrations
   *       400:
   *         description: Invalid date or limit filters
   *       401:
   *         description: Authentication required
   *       403:
   *         description: Authorized administrator access required
   */
  router.get('/dashboard/users', adminMiddleware, handlers.getUsers);

  /**
   * @openapi
   * /api/admin/dashboard/crops:
   *   get:
   *     summary: Retrieve crop totals, category distribution and monthly additions
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: months
   *         schema:
   *           type: integer
   *           minimum: 1
   *           maximum: 36
   *       - in: query
   *         name: fromDate
   *         schema:
   *           type: string
   *           format: date
   *       - in: query
   *         name: toDate
   *         schema:
   *           type: string
   *           format: date
   *     responses:
   *       200:
   *         description: Crop analytics
   *       401:
   *         description: Authentication required
   *       403:
   *         description: Authorized administrator access required
   */
  router.get('/dashboard/crops', adminMiddleware, handlers.getCrops);

  /**
   * @openapi
   * /api/admin/dashboard/orders:
   *   get:
   *     summary: Retrieve order totals and gross value of delivered orders
   *     description: Delivered order gross value sums orders.total_amount for delivered orders. It is not actual platform revenue; no payment settlement or transaction records exist.
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: months
   *         schema:
   *           type: integer
   *           minimum: 1
   *           maximum: 36
   *       - in: query
   *         name: fromDate
   *         schema:
   *           type: string
   *           format: date
   *       - in: query
   *         name: toDate
   *         schema:
   *           type: string
   *           format: date
   *     responses:
   *       200:
   *         description: Order-status and delivered-order-value analytics
   *       401:
   *         description: Authentication required
   *       403:
   *         description: Authorized administrator access required
   */
  router.get('/dashboard/orders', adminMiddleware, handlers.getOrders);

  /**
   * @openapi
   * /api/admin/dashboard/trends:
   *   get:
   *     summary: Retrieve monthly registrations, crop additions, orders and delivered order gross
   *     description: Gross delivered order value is not actual platform revenue; no payment settlement or transaction records exist.
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: months
   *         schema:
   *           type: integer
   *           minimum: 1
   *           maximum: 36
   *       - in: query
   *         name: fromDate
   *         schema:
   *           type: string
   *           format: date
   *       - in: query
   *         name: toDate
   *         schema:
   *           type: string
   *           format: date
   *     responses:
   *       200:
   *         description: UTC monthly platform trends
   *       400:
   *         description: Invalid date filters
   *       401:
   *         description: Authentication required
   *       403:
   *         description: Authorized administrator access required
   */
  router.get('/dashboard/trends', adminMiddleware, handlers.getTrends);

  /**
   * @openapi
   * /api/admin/dashboard/recent-activity:
   *   get:
   *     summary: Retrieve limited recent registrations, crop additions and orders
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           minimum: 1
   *           maximum: 50
   *     responses:
   *       200:
   *         description: Limited recent platform activity without private user details
   *       400:
   *         description: Invalid limit
   *       401:
   *         description: Authentication required
   *       403:
   *         description: Authorized administrator access required
   */
  router.get('/dashboard/recent-activity', adminMiddleware, handlers.getRecentActivity);

  return router;
}

export default createAdminDashboardRouter();
