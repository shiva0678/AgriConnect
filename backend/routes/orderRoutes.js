import { Router } from 'express';
import { authenticateToken } from '../middleware/authMiddleware.js';
import {
	createOrderHandler,
	getBuyerOrdersHandler,
	getFarmerOrdersHandler,
	updateFarmerOrderStatusHandler,
} from '../controllers/orderController.js';

const router = Router();

/**
 * @openapi
 * /api/orders:
 *   get:
 *     summary: Retrieve a buyer's order history
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 10
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, confirmed, shipped, delivered, cancelled]
 *     responses:
 *       200:
 *         description: Buyer orders retrieved successfully
 *       400:
 *         description: Invalid page, limit, or status value
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Buyer role required
 *       500:
 *         description: Order history retrieval failed
 */
router.get('/orders', authenticateToken, getBuyerOrdersHandler);

/**
 * @openapi
 * /api/farmer/orders:
 *   get:
 *     summary: Retrieve a farmer's orders
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 10
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, confirmed, shipped, delivered, cancelled]
 *     responses:
 *       200:
 *         description: Farmer orders retrieved successfully
 *       400:
 *         description: Invalid page, limit, or status value
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Farmer role required
 *       500:
 *         description: Order history retrieval failed
 */
router.get('/farmer/orders', authenticateToken, getFarmerOrdersHandler);

/**
 * @openapi
 * /api/orders/{id}/status:
 *   patch:
 *     summary: Update an order status as its farmer
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
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
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [pending, confirmed, shipped, delivered, cancelled]
 *     responses:
 *       200:
 *         description: Order status updated successfully
 *       400:
 *         description: Invalid order ID, status, or status transition
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Farmer role required
 *       404:
 *         description: Order not found for this farmer
 *       500:
 *         description: Order status update failed
 */
router.patch('/orders/:id/status', authenticateToken, updateFarmerOrderStatusHandler);

/**
 * @openapi
 * /api/orders:
 *   post:
 *     summary: Place a new order for an available crop
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - cropId
 *               - quantity
 *             properties:
 *               cropId:
 *                 type: string
 *                 format: uuid
 *               quantity:
 *                 type: number
 *                 minimum: 0.000001
 *     responses:
 *       201:
 *         description: Order created successfully
 *       400:
 *         description: Invalid crop ID or quantity
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Buyer role required
 *       404:
 *         description: Crop not found
 *       409:
 *         description: Crop unavailable or quantity exceeds stock
 *       500:
 *         description: Order creation failed
 */
router.post('/orders', authenticateToken, createOrderHandler);

export default router;
