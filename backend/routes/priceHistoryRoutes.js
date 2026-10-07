import { Router } from 'express';
import { getPriceHistoryController } from '../controllers/priceHistoryController.js';

const router = Router();

/**
 * @openapi
 * /api/prices:
 *   get:
 *     summary: Search and browse mandi price history
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Case-insensitive substring search in commodity, variety, market, district, and state
 *       - in: query
 *         name: commodity
 *         schema:
 *           type: string
 *       - in: query
 *         name: state
 *         schema:
 *           type: string
 *       - in: query
 *         name: district
 *         schema:
 *           type: string
 *       - in: query
 *         name: market
 *         schema:
 *           type: string
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
 *           default: 20
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [newest, oldest, price_asc, price_desc]
 *           default: newest
 *     responses:
 *       200:
 *         description: Matching price observations and pagination metadata
 *       400:
 *         description: Invalid filters, date range, pagination, or sort value
 *       500:
 *         description: Price history could not be retrieved
 */
router.get('/prices', getPriceHistoryController);

export default router;