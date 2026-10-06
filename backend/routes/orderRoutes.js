import { Router } from 'express';
import { authenticateToken } from '../middleware/authMiddleware.js';
import {
	createOrderHandler,
	getBuyerOrdersHandler,
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
