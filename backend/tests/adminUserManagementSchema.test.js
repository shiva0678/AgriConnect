import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ADMIN_USER_MANAGEMENT_AUDIT_INDEXES_SQL,
  ADMIN_USER_MANAGEMENT_AUDIT_MIGRATION_SQL,
  ADMIN_USER_MANAGEMENT_AUDIT_TABLE_SQL,
  ADMIN_USER_MANAGEMENT_USERS_INDEX_SQL,
} from '../config/db.js';

test('admin user audit table definition is additive and isolated', () => {
  assert.match(ADMIN_USER_MANAGEMENT_AUDIT_TABLE_SQL, /CREATE TABLE IF NOT EXISTS\s+admin_user_action_audit_logs/i);
  assert.match(
    ADMIN_USER_MANAGEMENT_AUDIT_TABLE_SQL,
    /admin_id UUID NOT NULL REFERENCES users\(id\) ON DELETE RESTRICT/,
  );
  assert.match(
    ADMIN_USER_MANAGEMENT_AUDIT_TABLE_SQL,
    /target_user_id UUID REFERENCES users\(id\) ON DELETE RESTRICT/,
  );
  assert.match(
    ADMIN_USER_MANAGEMENT_AUDIT_TABLE_SQL,
    /target_reference VARCHAR\(128\) NOT NULL/,
  );
  assert.match(
    ADMIN_USER_MANAGEMENT_AUDIT_TABLE_SQL,
    /CHECK \(action IN \('suspend', 'reactivate'\)\)/,
  );
  assert.match(
    ADMIN_USER_MANAGEMENT_AUDIT_TABLE_SQL,
    /CHECK \(outcome IN \('success', 'failure'\)\)/,
  );
  assert.match(
    ADMIN_USER_MANAGEMENT_AUDIT_TABLE_SQL,
    /request_id VARCHAR\(128\) NOT NULL/,
  );
  assert.match(
    ADMIN_USER_MANAGEMENT_AUDIT_TABLE_SQL,
    /CHAR_LENGTH\(BTRIM\(target_reference\)\) BETWEEN 1 AND 128/,
  );
  assert.match(
    ADMIN_USER_MANAGEMENT_AUDIT_TABLE_SQL,
    /CHAR_LENGTH\(BTRIM\(request_id\)\) BETWEEN 1 AND 128/,
  );
  assert.doesNotMatch(
    ADMIN_USER_MANAGEMENT_AUDIT_TABLE_SQL,
    /\b(DROP TABLE|TRUNCATE|DELETE FROM)\b/i,
  );
});

test('admin user management index definitions cover filtering and audit history', () => {
  assert.match(
    ADMIN_USER_MANAGEMENT_USERS_INDEX_SQL,
    /CREATE INDEX IF NOT EXISTS\s+users_role_status_created_idx/i,
  );
  assert.match(
    ADMIN_USER_MANAGEMENT_USERS_INDEX_SQL,
    /ON users \(role, status, created_at DESC, id DESC\)/i,
  );

  assert.equal(ADMIN_USER_MANAGEMENT_AUDIT_INDEXES_SQL.length, 3);
  const indexes = ADMIN_USER_MANAGEMENT_AUDIT_INDEXES_SQL.join('\n');
  assert.match(indexes, /admin_user_action_audit_logs_admin_created_idx/i);
  assert.match(indexes, /admin_user_action_audit_logs_target_created_idx/i);
  assert.match(indexes, /admin_user_action_audit_logs_created_idx/i);
  for (const indexSql of ADMIN_USER_MANAGEMENT_AUDIT_INDEXES_SQL) {
    assert.match(indexSql, /CREATE INDEX IF NOT EXISTS/i);
    assert.doesNotMatch(indexSql, /\b(DROP TABLE|TRUNCATE|DELETE FROM)\b/i);
  }
});

test('admin user audit reason and request constraints are bounded', () => {
  assert.match(
    ADMIN_USER_MANAGEMENT_AUDIT_TABLE_SQL,
    /CHAR_LENGTH\(BTRIM\(reason\)\) BETWEEN 1 AND 500/,
  );
  assert.match(
    ADMIN_USER_MANAGEMENT_AUDIT_TABLE_SQL,
    /reason IS NULL/,
  );
});

test('existing-table migration safely backfills, relaxes, and guards audit columns', () => {
  assert.equal(ADMIN_USER_MANAGEMENT_AUDIT_MIGRATION_SQL.length, 6);
  const migration = ADMIN_USER_MANAGEMENT_AUDIT_MIGRATION_SQL.join('\n');

  assert.match(migration, /ADD COLUMN IF NOT EXISTS target_reference VARCHAR\(128\)/i);
  assert.match(migration, /SET target_reference = target_user_id::text/i);
  assert.match(migration, /ALTER COLUMN target_reference SET NOT NULL/i);
  assert.match(migration, /ALTER COLUMN target_user_id DROP NOT NULL/i);
  assert.match(migration, /target_user_id IS NOT NULL/i);
  assert.match(migration, /END;\s*\$\$/i);
  assert.match(migration, /pg_constraint/i);
  assert.match(migration, /conrelid = 'admin_user_action_audit_logs'::regclass/i);
  assert.match(migration, /admin_user_action_audit_logs_request_id_length[\s\S]*NOT VALID/i);
  assert.match(migration, /admin_user_action_audit_logs_reason_length[\s\S]*NOT VALID/i);
  assert.match(migration, /admin_user_action_audit_logs_action_check[\s\S]*NOT VALID/i);
  assert.match(migration, /admin_user_action_audit_logs_outcome_check[\s\S]*NOT VALID/i);
  assert.doesNotMatch(
    migration,
    /\b(DROP TABLE|TRUNCATE|DELETE FROM|DROP CONSTRAINT|DROP FOREIGN KEY|DROP INDEX)\b/i,
  );
});
