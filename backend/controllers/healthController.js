import { testDatabaseConnection } from "../config/db.js";

export function getHealth(request, response) {
  response.json({
    success: true,
    message: "AgriConnect API is running",
  });
}

export async function getDatabaseHealth(request, response) {
  try {
    await testDatabaseConnection();
    response.json({
      success: true,
      message: "Database connection successful",
    });
  } catch (error) {
    console.error("Database health check failed:", error.message);
    response.status(503).json({
      success: false,
      message: "Database connection failed",
    });
  }
}