import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

const isTestEnvironment = process.env.NODE_ENV === "test"
  || Boolean(process.env.NODE_TEST_CONTEXT);
const databaseUrl = isTestEnvironment
  ? process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
  : process.env.DATABASE_URL;

export const databaseConfig = {
  connectionString: databaseUrl,
  ssl: databaseUrl ? { rejectUnauthorized: false } : undefined,
};

export const pool = new Pool(databaseConfig);

pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL pool error:", error.message);
});

export const ADMIN_USER_MANAGEMENT_USERS_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS users_role_status_created_idx
  ON users (role, status, created_at DESC, id DESC)
`;

export const ADMIN_USER_MANAGEMENT_AUDIT_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS admin_user_action_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    target_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
    target_reference VARCHAR(128) NOT NULL,
    action VARCHAR(16) NOT NULL
      CONSTRAINT admin_user_action_audit_logs_action_check
      CHECK (action IN ('suspend', 'reactivate')),
    reason TEXT,
    outcome VARCHAR(10) NOT NULL
      CONSTRAINT admin_user_action_audit_logs_outcome_check
      CHECK (outcome IN ('success', 'failure')),
    request_id VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT admin_user_action_audit_logs_target_reference_length
      CHECK (
        CHAR_LENGTH(BTRIM(target_reference)) BETWEEN 1 AND 128
      ),
    CONSTRAINT admin_user_action_audit_logs_request_id_length
      CHECK (
        CHAR_LENGTH(BTRIM(request_id)) BETWEEN 1 AND 128
      ),
    CONSTRAINT admin_user_action_audit_logs_reason_length
      CHECK (
        reason IS NULL
        OR (
          CHAR_LENGTH(BTRIM(reason)) BETWEEN 1 AND 500
        )
      )
  )
`;

export const ADMIN_USER_MANAGEMENT_AUDIT_INDEXES_SQL = Object.freeze([
  `
    CREATE INDEX IF NOT EXISTS admin_user_action_audit_logs_admin_created_idx
    ON admin_user_action_audit_logs (
      admin_id,
      created_at DESC,
      id DESC
    )
  `,
  `
    CREATE INDEX IF NOT EXISTS admin_user_action_audit_logs_target_created_idx
    ON admin_user_action_audit_logs (
      target_user_id,
      created_at DESC,
      id DESC
    )
  `,
  `
    CREATE INDEX IF NOT EXISTS admin_user_action_audit_logs_created_idx
    ON admin_user_action_audit_logs (created_at DESC, id DESC)
  `,
]);

export const ADMIN_USER_MANAGEMENT_AUDIT_MIGRATION_SQL = Object.freeze([
  `
    ALTER TABLE admin_user_action_audit_logs
      ADD COLUMN IF NOT EXISTS target_reference VARCHAR(128)
  `,
  `
    UPDATE admin_user_action_audit_logs
    SET target_reference = target_user_id::text
    WHERE (target_reference IS NULL OR BTRIM(target_reference) = '')
      AND target_user_id IS NOT NULL
  `,
  `
    UPDATE admin_user_action_audit_logs
    SET target_reference = 'missing-target'
    WHERE target_reference IS NULL OR BTRIM(target_reference) = ''
  `,
  `
    ALTER TABLE admin_user_action_audit_logs
      ALTER COLUMN target_reference SET NOT NULL
  `,
  `
    ALTER TABLE admin_user_action_audit_logs
      ALTER COLUMN target_user_id DROP NOT NULL
  `,
  `
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'admin_user_action_audit_logs_target_reference_length'
          AND conrelid = 'admin_user_action_audit_logs'::regclass
      ) THEN
        ALTER TABLE admin_user_action_audit_logs
          ADD CONSTRAINT admin_user_action_audit_logs_target_reference_length
          CHECK (CHAR_LENGTH(BTRIM(target_reference)) BETWEEN 1 AND 128);
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'admin_user_action_audit_logs_request_id_length'
          AND conrelid = 'admin_user_action_audit_logs'::regclass
      ) THEN
        ALTER TABLE admin_user_action_audit_logs
          ADD CONSTRAINT admin_user_action_audit_logs_request_id_length
          CHECK (CHAR_LENGTH(BTRIM(request_id)) BETWEEN 1 AND 128)
          NOT VALID;
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'admin_user_action_audit_logs_reason_length'
          AND conrelid = 'admin_user_action_audit_logs'::regclass
      ) THEN
        ALTER TABLE admin_user_action_audit_logs
          ADD CONSTRAINT admin_user_action_audit_logs_reason_length
          CHECK (
            reason IS NULL
            OR CHAR_LENGTH(BTRIM(reason)) BETWEEN 1 AND 500
          )
          NOT VALID;
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'admin_user_action_audit_logs_action_check'
          AND conrelid = 'admin_user_action_audit_logs'::regclass
      ) THEN
        ALTER TABLE admin_user_action_audit_logs
          ADD CONSTRAINT admin_user_action_audit_logs_action_check
          CHECK (action IN ('suspend', 'reactivate'))
          NOT VALID;
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'admin_user_action_audit_logs_outcome_check'
          AND conrelid = 'admin_user_action_audit_logs'::regclass
      ) THEN
        ALTER TABLE admin_user_action_audit_logs
          ADD CONSTRAINT admin_user_action_audit_logs_outcome_check
          CHECK (outcome IN ('success', 'failure'))
          NOT VALID;
      END IF;
    END;
    $$
  `,
]);

export async function testDatabaseConnection() {
  if (!databaseUrl) {
    throw new Error(
      isTestEnvironment
        ? "DATABASE_URL or TEST_DATABASE_URL is not configured"
        : "DATABASE_URL is not configured",
    );
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
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active',
      ADD COLUMN IF NOT EXISTS password_change_required BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS password_version INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS suspended_reason TEXT,
      ADD COLUMN IF NOT EXISTS suspended_by UUID
  `);
  await pool.query(`
    ALTER TABLE users
      DROP CONSTRAINT IF EXISTS users_role_check;
    ALTER TABLE users
      ADD CONSTRAINT users_role_check
      CHECK (role IN ('farmer', 'buyer', 'admin'));
  `);
  await pool.query(`
    ALTER TABLE users
      DROP CONSTRAINT IF EXISTS users_status_check;
    ALTER TABLE users
      ADD CONSTRAINT users_status_check
      CHECK (status IN ('active', 'suspended'));
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS authorized_admins (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) UNIQUE NOT NULL,
      user_id UUID UNIQUE REFERENCES users(id) ON DELETE SET NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'suspended')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      provisioned_by UUID REFERENCES users(id) ON DELETE SET NULL
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS authorized_admins_status_idx
      ON authorized_admins (status);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS users_created_at_idx
      ON users (created_at DESC);
  `);
  await pool.query(ADMIN_USER_MANAGEMENT_USERS_INDEX_SQL);

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
    CREATE INDEX IF NOT EXISTS crops_created_at_idx ON crops (created_at DESC);
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
    CREATE TABLE IF NOT EXISTS conversations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE RESTRICT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS conversations_updated_at_idx
      ON conversations (updated_at DESC);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      sender_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      content TEXT NOT NULL,
      client_message_id UUID NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT messages_content_not_blank CHECK (content ~ '[^[:space:]]'),
      CONSTRAINT messages_content_max_length CHECK (CHAR_LENGTH(content) <= 2000),
      UNIQUE (conversation_id, sender_id, client_message_id)
    )
  `);

  await pool.query(`
    ALTER TABLE messages
      DROP CONSTRAINT IF EXISTS messages_content_not_blank;
    ALTER TABLE messages
      ADD CONSTRAINT messages_content_not_blank
      CHECK (content ~ '[^[:space:]]');
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS messages_conversation_created_at_idx
      ON messages (conversation_id, created_at DESC, id DESC);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS conversation_read_states (
      conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (conversation_id, user_id)
    )
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

  await pool.query(`
    CREATE TABLE IF NOT EXISTS crop_images (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      crop_id UUID NOT NULL REFERENCES crops(id) ON DELETE CASCADE,
      gridfs_file_id CHAR(24) NOT NULL UNIQUE
        CHECK (gridfs_file_id ~ '^[0-9a-fA-F]{24}$'),
      content_type VARCHAR(32) NOT NULL
        CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
      file_size INTEGER NOT NULL
        CHECK (file_size > 0 AND file_size <= 5242880),
      checksum CHAR(64) NOT NULL
        CHECK (checksum ~ '^[0-9a-f]{64}$'),
      display_order SMALLINT NOT NULL
        CHECK (display_order BETWEEN 0 AND 4),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (crop_id, display_order)
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS crop_images_crop_id_idx ON crop_images (crop_id);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_chat_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      admin_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      title VARCHAR(160),
      context JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_message_at TIMESTAMPTZ,
      CONSTRAINT admin_chat_sessions_context_object
        CHECK (
          jsonb_typeof(context) = 'object'
          AND octet_length(context::text) <= 8192
        )
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS admin_chat_sessions_admin_updated_idx
      ON admin_chat_sessions (admin_id, updated_at DESC, id DESC);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_chat_messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id UUID NOT NULL
        REFERENCES admin_chat_sessions(id) ON DELETE RESTRICT,
      sender_type VARCHAR(16) NOT NULL
        CHECK (sender_type IN ('admin', 'assistant')),
      content TEXT NOT NULL,
      metadata JSONB,
      idempotency_key UUID,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT admin_chat_messages_content_not_blank
        CHECK (content ~ '[^[:space:]]'),
      CONSTRAINT admin_chat_messages_content_max_length
        CHECK (CHAR_LENGTH(content) <= 4000),
      CONSTRAINT admin_chat_messages_metadata_object
        CHECK (
          metadata IS NULL
          OR (
            jsonb_typeof(metadata) = 'object'
            AND octet_length(metadata::text) <= 16384
          )
        )
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS admin_chat_messages_session_created_idx
      ON admin_chat_messages (session_id, created_at DESC, id DESC);
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS admin_chat_messages_idempotency_uidx
      ON admin_chat_messages (session_id, idempotency_key)
      WHERE idempotency_key IS NOT NULL;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_chat_audit_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      admin_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      session_id UUID REFERENCES admin_chat_sessions(id) ON DELETE RESTRICT,
      operation VARCHAR(80) NOT NULL
        CHECK (operation ~ '^[a-z][a-z0-9_]{0,79}$'),
      filters JSONB NOT NULL DEFAULT '{}'::jsonb,
      outcome VARCHAR(10) NOT NULL
        CHECK (outcome IN ('success', 'failure')),
      duration_ms INTEGER
        CHECK (duration_ms IS NULL OR duration_ms >= 0),
      row_count INTEGER
        CHECK (row_count IS NULL OR row_count >= 0),
      model VARCHAR(128),
      request_id VARCHAR(128),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT admin_chat_audit_logs_filters_object
        CHECK (
          jsonb_typeof(filters) = 'object'
          AND octet_length(filters::text) <= 8192
        )
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS admin_chat_audit_logs_admin_created_idx
      ON admin_chat_audit_logs (admin_id, created_at DESC, id DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS admin_chat_audit_logs_session_created_idx
      ON admin_chat_audit_logs (session_id, created_at DESC, id DESC)
      WHERE session_id IS NOT NULL;
  `);

  await pool.query(ADMIN_USER_MANAGEMENT_AUDIT_TABLE_SQL);
  for (const migrationSql of ADMIN_USER_MANAGEMENT_AUDIT_MIGRATION_SQL) {
    await pool.query(migrationSql);
  }
  for (const indexSql of ADMIN_USER_MANAGEMENT_AUDIT_INDEXES_SQL) {
    await pool.query(indexSql);
  }
}