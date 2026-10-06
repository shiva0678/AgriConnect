import { Router } from 'express';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { createOrderHandler } from '../controllers/orderController.js';

const router = Router();

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
