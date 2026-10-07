import { Router } from 'express';
import { getPriceAnalyticsController } from '../controllers/priceAnalyticsController.js';

const router = Router();

/**
 * @openapi
 * /api/prices/analytics:
 *   get:
 *     summary: Calculate market-price analytics from stored observations
 *     parameters:
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
 *         name: search
 *         schema:
 *           type: string
 *         description: Case-insensitive search in commodity, variety, market, district, and state
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
 *         description: Filtered summary, daily trend, and market/state/commodity breakdowns
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [success, filters, summary, trend, marketBreakdown, stateBreakdown, commodityBreakdown]
 *               properties:
 *                 success:
 *                   type: boolean
 *                 filters:
 *                   type: object
 *                 summary:
 *                   type: object
 *                   required: [totalRecords, averageMinPrice, averageMaxPrice, averageModalPrice, minimumPrice, maximumPrice]
 *                   properties:
 *                     totalRecords:
 *                       type: integer
 *                     averageMinPrice:
 *                       type: number
 *                       nullable: true
 *                     averageMaxPrice:
 *                       type: number
 *                       nullable: true
 *                     averageModalPrice:
 *                       type: number
 *                       nullable: true
 *                     minimumPrice:
 *                       type: number
 *                       nullable: true
 *                     maximumPrice:
 *                       type: number
 *                       nullable: true
 *                 trend:
 *                   type: array
 *                   items:
 *                     type: object
 *                     required: [date, avgMinPrice, avgMaxPrice, avgModalPrice, minModalPrice, maxModalPrice, recordCount]
 *                     properties:
 *                       date:
 *                         type: string
 *                         format: date
 *                       avgMinPrice:
 *                         type: number
 *                         nullable: true
 *                       avgMaxPrice:
 *                         type: number
 *                         nullable: true
 *                       avgModalPrice:
 *                         type: number
 *                         nullable: true
 *                       minModalPrice:
 *                         type: number
 *                         nullable: true
 *                       maxModalPrice:
 *                         type: number
 *                         nullable: true
 *                       recordCount:
 *                         type: integer
 *                 marketBreakdown:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/PriceBreakdown'
 *                 stateBreakdown:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/PriceBreakdown'
 *                 commodityBreakdown:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/PriceBreakdown'
 *       400:
 *         description: Invalid filter date or reversed date range
 *       500:
 *         description: Price analytics could not be retrieved
 */
router.get('/prices/analytics', getPriceAnalyticsController);

export default router;