import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;

export const databaseConfig = {
  connectionString: databaseUrl,
  ssl: databaseUrl ? { rejectUnauthorized: false } : undefined,
};

export const pool = new Pool(databaseConfig);

pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL pool error:", error.message);
});

export async function testDatabaseConnection() {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured");
  }

  const client = await pool.connect();
  try {
    await client.query("SELECT 1");
  } finally {
    client.release();
  }
}

export async function initializeDatabase() {
  await testDatabaseConnection();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(120) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      phone VARCHAR(20) NOT NULL,
      password TEXT NOT NULL,
      role VARCHAR(20) NOT NULL CHECK (role IN ('farmer', 'buyer')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS farm_name VARCHAR(160),
      ADD COLUMN IF NOT EXISTS company_name VARCHAR(160),
      ADD COLUMN IF NOT EXISTS location VARCHAR(160)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS crops (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      farmer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(120) NOT NULL,
      category VARCHAR(40) NOT NULL,
      description TEXT,
      price NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
      unit VARCHAR(20) NOT NULL DEFAULT 'kg',
      quantity NUMERIC(14, 2) NOT NULL CHECK (quantity >= 0),
      location VARCHAR(160) NOT NULL,
      harvest_date DATE NOT NULL,
      expiry_date DATE,
      status VARCHAR(20) NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'sold_out', 'inactive')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS crops_farmer_id_idx ON crops (farmer_id);
    CREATE INDEX IF NOT EXISTS crops_status_idx ON crops (status);
    CREATE INDEX IF NOT EXISTS crops_category_idx ON crops (category);
    CREATE INDEX IF NOT EXISTS crops_location_idx ON crops (location);
  `);
}