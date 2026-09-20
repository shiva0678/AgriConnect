import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import swaggerUi from "swagger-ui-express";
import { initializeDatabase } from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import healthRoutes from "./routes/healthRoutes.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { swaggerSpec } from "./swagger.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get("/api/docs.json", (request, response) => {
  response.setHeader("Content-Type", "application/json");
  response.send(swaggerSpec);
});

app.use("/api/auth", authRoutes);
app.use("/api/health", healthRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

async function startServer() {
  try {
    await initializeDatabase();
    app.listen(port, () => {
      console.log(`AgriConnect API listening on port ${port}`);
    });
  } catch (error) {
    console.error("Database initialization failed:", error.message);
    process.exitCode = 1;
  }
}

startServer();

export default app;