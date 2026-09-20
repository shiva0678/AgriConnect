import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

export const databaseConfig = {
  connectionString: process.env.DATABASE_URL || "",
};

export function createDatabasePool() {
  return new Pool(databaseConfig);
}