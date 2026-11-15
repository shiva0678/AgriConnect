import { Router } from 'express';
import { postPriceAssistantController } from '../controllers/priceAssistantController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = Router();

/**
 * @openapi
 * /api/prices/assistant:
 *   post:
 *     summary: Ask a question about historical mandi prices
 *     description: >
 *       Uses matching price_history records to provide a grounded explanation.
 *       Data is historical and does not establish current prices or forecasts.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [question]
 *             properties:
 *               question:
 *                 type: string
 *                 maxLength: 1000
 *     responses:
 *       200:
 *         description: Answer grounded in the matched price-history data
 *       400:
 *         description: Missing, invalid, or excessively long question
 *       401:
 *         description: Authentication token is required or invalid
 *       503:
 *         description: Gemini API key is missing or the provider is unavailable
 */
router.post('/prices/assistant', authenticateToken, postPriceAssistantController);

export default router;