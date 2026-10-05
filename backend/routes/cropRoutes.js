import { Router } from 'express';
import { authenticateToken } from '../middleware/authMiddleware.js';
import {
  createCropHandler,
  deleteCropHandler,
  getCropByIdHandler,
  getFarmerCropsHandler,
  getMarketplaceCropsController,
  updateCropHandler,
} from '../controllers/cropController.js';

const router = Router();

/**
 * @openapi
 * /api/crops:
 *   get:
 *     summary: Search and browse available marketplace crops
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Case-insensitive substring search in crop name
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Case-insensitive crop category filter
 *       - in: query
 *         name: location
 *         schema:
 *           type: string
 *         description: Case-insensitive substring filter in crop location
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
 *           default: 12
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [newest, oldest, price_asc, price_desc]
 *           default: newest
 *     responses:
 *       200:
 *         description: Available crops and pagination metadata
 *       400:
 *         description: Invalid sort value
 *       500:
 *         description: Marketplace crops could not be retrieved
 */
router.get('/crops', getMarketplaceCropsController);

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
 *     summary: Get an available marketplace crop by id
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Available crop and safe farmer display information returned successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 crop:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     name:
 *                       type: string
 *                     category:
 *                       type: string
 *                     description:
 *                       type: string
 *                       nullable: true
 *                     price:
 *                       type: number
 *                     unit:
 *                       type: string
 *                     quantity:
 *                       type: number
 *                     location:
 *                       type: string
 *                     harvest_date:
 *                       type: string
 *                       format: date
 *                     expiry_date:
 *                       type: string
 *                       format: date
 *                       nullable: true
 *                     status:
 *                       type: string
 *                       enum: [available]
 *                     farmer_id:
 *                       type: string
 *                       format: uuid
 *                     farmer_name:
 *                       type: string
 *                       nullable: true
 *                     farm_name:
 *                       type: string
 *                       nullable: true
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *                     updated_at:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Crop ID is not a valid UUID
 *       404:
 *         description: Crop not found or not marketplace-available
 *       500:
 *         description: Crop details could not be retrieved
 */
router.get('/crops/:id', getCropByIdHandler);

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
