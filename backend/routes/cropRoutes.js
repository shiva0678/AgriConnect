import { Router } from 'express';
import { authenticateToken } from '../middleware/authMiddleware.js';
import {
  createCropHandler,
  deleteCropHandler,
  getCropByIdHandler,
  getFarmerCropsHandler,
  updateCropHandler,
} from '../controllers/cropController.js';

const router = Router();

/**
 * @openapi
 * /api/crops:
 *   post:
 *     summary: Create a crop listing for the authenticated farmer
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - category
 *               - price
 *               - unit
 *               - quantity
 *               - location
 *               - harvest_date
 *             properties:
 *               name:
 *                 type: string
 *               category:
 *                 type: string
 *               description:
 *                 type: string
 *               price:
 *                 type: number
 *               unit:
 *                 type: string
 *               quantity:
 *                 type: number
 *               location:
 *                 type: string
 *               harvest_date:
 *                 type: string
 *                 format: date
 *               expiry_date:
 *                 type: string
 *                 format: date
 *     responses:
 *       201:
 *         description: Crop created successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Farmer role required
 *       500:
 *         description: Database error
 */
router.post('/crops', authenticateToken, createCropHandler);

/**
 * @openapi
 * /api/farmer/crops:
 *   get:
 *     summary: Get all crop listings for the authenticated farmer
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Crop list returned successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Farmer role required
 *       500:
 *         description: Database error
 */
router.get('/farmer/crops', authenticateToken, getFarmerCropsHandler);

/**
 * @openapi
 * /api/crops/{id}:
 *   get:
 *     summary: Get a crop by id
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Crop returned successfully
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Crop not found
 *       500:
 *         description: Database error
 */
router.get('/crops/:id', authenticateToken, getCropByIdHandler);

/**
 * @openapi
 * /api/crops/{id}:
 *   patch:
 *     summary: Update a crop owned by the authenticated farmer
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Crop updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Not allowed to modify this crop
 *       404:
 *         description: Crop not found
 *       500:
 *         description: Database error
 */
router.patch('/crops/:id', authenticateToken, updateCropHandler);

/**
 * @openapi
 * /api/crops/{id}:
 *   delete:
 *     summary: Delete a crop owned by the authenticated farmer
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Crop deleted successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Not allowed to delete this crop
 *       404:
 *         description: Crop not found
 *       500:
 *         description: Database error
 */
router.delete('/crops/:id', authenticateToken, deleteCropHandler);

export default router;
