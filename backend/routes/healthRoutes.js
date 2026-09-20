import { Router } from "express";
import {
  getDatabaseHealth,
  getHealth,
} from "../controllers/healthController.js";

const router = Router();

/**
 * @openapi
 * /api/health:
 *   get:
 *     summary: Check API health
 *     responses:
 *       200:
 *         description: API is running
 */
router.get("/", getHealth);

/**
 * @openapi
 * /api/health/db:
 *   get:
 *     summary: Check database connectivity
 *     responses:
 *       200:
 *         description: Database connection successful
 *       503:
 *         description: Database connection failed
 */
router.get("/db", getDatabaseHealth);

export default router;