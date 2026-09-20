import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import healthRoutes from "./routes/healthRoutes.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.use("/api/health", healthRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(port, () => {
  console.log(`AgriConnect API listening on port ${port}`);
});

export default app;