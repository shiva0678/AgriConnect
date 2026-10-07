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

  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      buyer_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      farmer_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      crop_id UUID NOT NULL REFERENCES crops(id) ON DELETE RESTRICT,
      quantity NUMERIC(14, 2) NOT NULL CHECK (quantity > 0),
      unit VARCHAR(20) NOT NULL DEFAULT 'kg',
      unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
      total_amount NUMERIC(14, 2) NOT NULL CHECK (total_amount >= 0),
      status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'shipped', 'delivered', 'cancelled')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS orders_buyer_id_idx ON orders (buyer_id);
    CREATE INDEX IF NOT EXISTS orders_farmer_id_idx ON orders (farmer_id);
    CREATE INDEX IF NOT EXISTS orders_crop_id_idx ON orders (crop_id);
    CREATE INDEX IF NOT EXISTS orders_status_idx ON orders (status);
    CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders (created_at DESC);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS price_history (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      commodity TEXT NOT NULL CHECK (BTRIM(commodity) <> ''),
      variety TEXT,
      grade TEXT,
      market TEXT NOT NULL CHECK (BTRIM(market) <> ''),
      district TEXT,
      state TEXT NOT NULL CHECK (BTRIM(state) <> ''),
      arrival_date DATE NOT NULL,
      min_price NUMERIC(14, 2) CHECK (min_price IS NULL OR min_price >= 0),
      max_price NUMERIC(14, 2) CHECK (max_price IS NULL OR max_price >= 0),
      modal_price NUMERIC(14, 2) CHECK (modal_price IS NULL OR modal_price >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CHECK (min_price IS NULL OR max_price IS NULL OR min_price <= max_price),
      CHECK (
        modal_price IS NULL OR min_price IS NULL OR max_price IS NULL OR
        modal_price BETWEEN min_price AND max_price
      )
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS price_history_commodity_idx ON price_history (commodity);
    CREATE INDEX IF NOT EXISTS price_history_state_idx ON price_history (state);
    CREATE INDEX IF NOT EXISTS price_history_market_idx ON price_history (market);
    CREATE INDEX IF NOT EXISTS price_history_district_idx ON price_history (district);
    CREATE INDEX IF NOT EXISTS price_history_arrival_date_idx ON price_history (arrival_date);
    CREATE INDEX IF NOT EXISTS price_history_commodity_arrival_date_idx
      ON price_history (commodity, arrival_date DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS price_history_observation_uidx ON price_history (
      commodity,
      COALESCE(variety, ''),
      COALESCE(grade, ''),
      market,
      COALESCE(district, ''),
      state,
      arrival_date,
      COALESCE(min_price, -1),
      COALESCE(max_price, -1),
      COALESCE(modal_price, -1)
    );
  `);
}