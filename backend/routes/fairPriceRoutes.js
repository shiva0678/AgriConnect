import { Router } from 'express';
import { postFairPriceController } from '../controllers/fairPriceController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = Router();

/**
 * @openapi
 * /api/prices/fair-price:
 *   post:
 *     summary: Compare a farmer listing price with historical mandi observations
 *     description: >
 *       Imported AGMARKNET historical prices are treated as INR per quintal
 *       (100 kg), although the CSV does not include a unit column. Listing
 *       prices in INR/kg are converted to INR/quintal; INR/quintal listings
 *       are compared directly. Other units return an unavailable result.
 *       The reference is the mean historical modal price, and the range is the
 *       observed minimum-to-maximum modal price for the selected records.
 *       Classifications are made only outside or within that observed range.
 *       This endpoint does not provide live prices or forecasts.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [commodity, askingPrice, unit, location]
 *             properties:
 *               commodity:
 *                 type: string
 *                 maxLength: 120
 *               askingPrice:
 *                 type: number
 *                 minimum: 0
 *               unit:
 *                 type: string
 *                 maxLength: 20
 *               location:
 *                 type: string
 *                 maxLength: 160
 *     responses:
 *       200:
 *         description: Historical comparison or explicit unavailable result
 *       400:
 *         description: Invalid comparison input
 *       401:
 *         description: Authentication token is required or invalid
 *       403:
 *         description: Farmer role required
 */
router.post('/prices/fair-price', authenticateToken, postFairPriceController);

export default router;
