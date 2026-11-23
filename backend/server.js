import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import swaggerUi from "swagger-ui-express";
import { initializeDatabase, pool } from "./config/db.js";
import { closeMongoDB, initializeMongoDB } from "./config/mongo.js";
import authRoutes from "./routes/authRoutes.js";
import healthRoutes from "./routes/healthRoutes.js";
import cropRoutes from "./routes/cropRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import chatRoutes from "./routes/chatRoutes.js";
import priceHistoryRoutes from "./routes/priceHistoryRoutes.js";
import priceAnalyticsRoutes from "./routes/priceAnalyticsRoutes.js";
import demandOutlookRoutes from "./routes/demandOutlookRoutes.js";
import priceAssistantRoutes from "./routes/priceAssistantRoutes.js";
import fairPriceRoutes from "./routes/fairPriceRoutes.js";
import wastageAlertRoutes from "./routes/wastageAlertRoutes.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { swaggerSpec } from "./swagger.js";
import { startServerLifecycle } from "./utils/serverStartup.js";
import { createChatSocketServer } from "./sockets/chatSocket.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;
const httpServer = createServer(app);
const io = createChatSocketServer(httpServer);

app.use(cors());
app.use(express.json());

app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get("/api/docs.json", (request, response) => {
  response.setHeader("Content-Type", "application/json");
  response.send(swaggerSpec);
});

app.use("/api/auth", authRoutes);
app.use("/api/health", healthRoutes);
app.use("/api", cropRoutes);
app.use("/api", orderRoutes);
app.use("/api", chatRoutes);
app.use("/api", priceHistoryRoutes);
app.use("/api", priceAnalyticsRoutes);
app.use("/api", demandOutlookRoutes);
app.use("/api", priceAssistantRoutes);
app.use("/api", fairPriceRoutes);
app.use("/api", wastageAlertRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export async function startServer({
  initializePostgres = initializeDatabase,
  initializeMongo = initializeMongoDB,
  listen = () => httpServer.listen(port, () => {
    console.log(`AgriConnect API listening on port ${port}`);
  }),
  logger = console,
} = {}) {
  try {
    return await startServerLifecycle({
      initializeDatabase: initializePostgres,
      initializeMongoDB: initializeMongo,
      listen,
      logger,
    });
  } catch (error) {
    logger.error("Database initialization failed:", error.message);
    process.exitCode = 1;
    return null;
  }
}

async function shutdown(signal) {
  console.log(`${signal} received; shutting down AgriConnect API`);
  try {
    await new Promise((resolve, reject) => {
      io.close((error) => (error ? reject(error) : resolve()));
    });
  } catch (error) {
    console.error("Socket and HTTP server shutdown failed:", error.message);
    process.exitCode = 1;
  }

  try {
    await closeMongoDB();
  } catch {
    console.warn("MongoDB shutdown failed.");
    process.exitCode = 1;
  }

  try {
    await pool.end();
  } catch (error) {
    console.error("PostgreSQL pool shutdown failed:", error.message);
    process.exitCode = 1;
  }
}

const isMainModule = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  const server = await startServer();
  if (server) {
    process.once("SIGINT", () => shutdown("SIGINT"));
    process.once("SIGTERM", () => shutdown("SIGTERM"));
  }
} else {
  await initializeDatabase();
}

export default app;