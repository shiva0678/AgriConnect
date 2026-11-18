import { Router } from 'express';
import { getWastageAlertController } from '../controllers/wastageAlertController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = Router();

/**
 * @openapi
 * /api/farmer/wastage-alerts:
 *   get:
 *     summary: Retrieve crop wastage alerts for the authenticated farmer
 *     description: >
 *       Alerts are calculated from the farmer's active crop stock and their
 *       own non-cancelled recent orders. Rules are deterministic and the API
 *       does not create persistent alerts or invoke an AI provider.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Farmer-specific alerts, summary counts, and thresholds
 *       401:
 *         description: Authentication token is required or invalid
 *       403:
 *         description: Farmer role required
 *       500:
 *         description: Crop wastage alerts could not be retrieved
 */
router.get('/farmer/wastage-alerts', authenticateToken, getWastageAlertController);

export default router;
