import { Router } from 'express';
import { getDemandOutlookController } from '../controllers/demandOutlookController.js';

const router = Router();

/**
 * @openapi
 * /api/prices/demand-outlook:
 *   get:
 *     summary: Retrieve the price-based Market Demand Outlook
 *     description: >
 *       Ranks commodities by relative market coverage from historical price
 *       observations. This is a Market Opportunity Score, not measured buyer
 *       demand or a forecast of physical quantities. Price direction is
 *       unavailable when the data does not cover both comparison periods.
 *     parameters:
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
 *         name: commodity
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
 *         name: search
 *         schema:
 *           type: string
 *         description: Case-insensitive substring search in commodity, variety, market, district, and state
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 10
 *     responses:
 *       200:
 *         description: >
 *           Price-based opportunity rankings; no physical-demand quantity is
 *           predicted. A null direction means insufficient comparable history.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [success, dataAsOf, forecastPeriod, comparisonPeriod, methodology, outlook]
 *               properties:
 *                 success:
 *                   type: boolean
 *                 dataAsOf:
 *                   type: string
 *                   format: date
 *                   nullable: true
 *                 forecastPeriod:
 *                   type: object
 *                   nullable: true
 *                   properties:
 *                     from:
 *                       type: string
 *                       format: date
 *                     to:
 *                       type: string
 *                       format: date
 *                 comparisonPeriod:
 *                   type: object
 *                   nullable: true
 *                   properties:
 *                     recent:
 *                       type: object
 *                     previous:
 *                       type: object
 *                 methodology:
 *                   type: string
 *                 outlook:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/DemandOutlookItem'
 *             example:
 *               success: true
 *               dataAsOf: '2024-12-24'
 *               forecastPeriod:
 *                 from: '2024-12-25'
 *                 to: '2025-01-23'
 *               comparisonPeriod:
 *                 recent:
 *                   from: '2024-11-25'
 *                   to: '2024-12-24'
 *                 previous:
 *                   from: '2024-10-26'
 *                   to: '2024-11-24'
 *               methodology: Relative market coverage score; not a physical-demand forecast.
 *               outlook:
 *                 - rank: 1
 *                   commodity: Tomato
 *                   score: 94.35
 *                   outlook: HIGH
 *                   direction: null
 *                   trendStatus: INSUFFICIENT_HISTORY
 *                   currentAverageModalPrice: 2400.5
 *                   previousAverageModalPrice: null
 *                   priceChangePercent: null
 *                   marketCount: 352
 *                   observationCount: 356
 *       400:
 *         description: Invalid filters, date range, or limit
 *       500:
 *         description: Market demand outlook could not be retrieved
 */
router.get('/prices/demand-outlook', getDemandOutlookController);

export default router;
