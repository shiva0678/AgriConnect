import bcrypt from 'bcrypt';
import { validateAuthorizedAdminEmail } from './adminProvisioningService.js';

const RECOVERY_CONFIRMATION_PREFIX = 'RECOVER ';
const BCRYPT_MAX_PASSWORD_BYTES = 72;

export class AdminPasswordRecoveryError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AdminPasswordRecoveryError';
    this.code = code;
  }
}

function createRecoveryError(code, message) {
  return new AdminPasswordRecoveryError(code, message);
}

export function readAdminPasswordRecoveryConfig(environment = process.env) {
  const email = environment.ADMIN_RECOVERY_EMAIL;
  const temporaryPassword = environment.ADMIN_RECOVERY_TEMP_PASSWORD;
  const confirmation = environment.ADMIN_RECOVERY_CONFIRM;

  if (typeof email !== 'string' || email !== email.trim().toLowerCase()) {
    throw createRecoveryError(
      'RECOVERY_EMAIL_REQUIRED',
      'Set ADMIN_RECOVERY_EMAIL to an exact, lowercase administrator email.',
    );
  }

  let authorizedEmail;
  try {
    authorizedEmail = validateAuthorizedAdminEmail(email);
  } catch {
    throw createRecoveryError(
      'RECOVERY_EMAIL_NOT_AUTHORIZED',
      'ADMIN_RECOVERY_EMAIL is not on the administrator allowlist.',
    );
  }
  if (
    typeof temporaryPassword !== 'string'
    || temporaryPassword.length === 0
    || Buffer.byteLength(temporaryPassword, 'utf8') > BCRYPT_MAX_PASSWORD_BYTES
  ) {
    throw createRecoveryError(
      'RECOVERY_TEMP_PASSWORD_INVALID',
      'Set ADMIN_RECOVERY_TEMP_PASSWORD to a non-empty value of at most 72 UTF-8 bytes.',
    );
  }
  if (confirmation !== `${RECOVERY_CONFIRMATION_PREFIX}${authorizedEmail}`) {
    throw createRecoveryError(
      'RECOVERY_CONFIRMATION_INVALID',
      'Set ADMIN_RECOVERY_CONFIRM to RECOVER followed by the exact administrator email.',
    );
  }

  return {
    email: authorizedEmail,
    temporaryPassword,
    confirmation,
  };
}

export async function recoverAuthorizedAdminPassword({
  database,
  email,
  temporaryPassword,
  confirmation,
  bcryptImplementation = bcrypt,
} = {}) {
  if (!database || typeof database.connect !== 'function') {
    throw createRecoveryError(
      'RECOVERY_DATABASE_UNAVAILABLE',
      'The configured database connection is unavailable.',
    );
  }

  const config = readAdminPasswordRecoveryConfig({
    ADMIN_RECOVERY_EMAIL: email,
    ADMIN_RECOVERY_TEMP_PASSWORD: temporaryPassword,
    ADMIN_RECOVERY_CONFIRM: confirmation,
  });
  let passwordHash;
  try {
    passwordHash = await bcryptImplementation.hash(config.temporaryPassword, 12);
  } catch {
    throw createRecoveryError(
      'RECOVERY_PASSWORD_HASH_FAILED',
      'The temporary password could not be processed; no database changes were made.',
    );
  }

  let client;
  try {
    client = await database.connect();
  } catch {
    throw createRecoveryError(
      'RECOVERY_DATABASE_CONNECT_FAILED',
      'Could not connect to the configured database; verify the database target and availability.',
    );
  }
  let transactionOpen = false;
  let commitAttempted = false;
  let recoveryResult;

  try {
    await client.query('BEGIN');
    transactionOpen = true;

    const userResult = await client.query(
      `SELECT id, email, role, status
       FROM users
       WHERE LOWER(email) = LOWER($1)
       FOR UPDATE`,
      [config.email],
    );
    if (userResult.rows.length !== 1) {
      throw createRecoveryError(
        userResult.rows.length === 0
          ? 'RECOVERY_ACCOUNT_NOT_FOUND'
          : 'RECOVERY_ACCOUNT_AMBIGUOUS',
        userResult.rows.length === 0
          ? 'No account matches ADMIN_RECOVERY_EMAIL; no changes were made.'
          : 'ADMIN_RECOVERY_EMAIL matches multiple user records; no changes were made.',
      );
    }

    const user = userResult.rows[0];
    if (user.role !== 'admin' || user.email.toLowerCase() !== config.email) {
      throw createRecoveryError(
        'RECOVERY_TARGET_NOT_ADMIN',
        'The target account is not the requested administrator; no changes were made.',
      );
    }
    if (user.status !== 'active') {
      throw createRecoveryError(
        'RECOVERY_TARGET_INACTIVE',
        'The target administrator account is not active; no changes were made.',
      );
    }

    const authorizationResult = await client.query(
      `SELECT id, email, user_id, status
       FROM authorized_admins
       WHERE LOWER(email) = LOWER($1)
       FOR UPDATE`,
      [config.email],
    );
    if (authorizationResult.rows.length !== 1) {
      throw createRecoveryError(
        authorizationResult.rows.length === 0
          ? 'RECOVERY_AUTHORIZATION_MISSING'
          : 'RECOVERY_AUTHORIZATION_AMBIGUOUS',
        authorizationResult.rows.length === 0
          ? 'No active authorization mapping was found for this administrator; no changes were made.'
          : 'Multiple authorization mappings were found; no changes were made.',
      );
    }

    const authorization = authorizationResult.rows[0];
    if (
      authorization.status !== 'active'
      || authorization.user_id !== user.id
      || authorization.email.toLowerCase() !== config.email
    ) {
      throw createRecoveryError(
        'RECOVERY_AUTHORIZATION_MISMATCH',
        'The authorization mapping does not match the target account; no changes were made.',
      );
    }

    const updateResult = await client.query(
      `UPDATE users
       SET password = $2,
           password_change_required = TRUE,
           password_version = password_version + 1
       WHERE id = $1
         AND role = 'admin'
       RETURNING id, password_version, password_change_required`,
      [user.id, passwordHash],
    );
    if (updateResult.rows.length !== 1) {
      throw createRecoveryError(
        'RECOVERY_UPDATE_FAILED',
        'The administrator password update did not affect exactly one account.',
      );
    }

    commitAttempted = true;
    await client.query('COMMIT');
    transactionOpen = false;
    recoveryResult = {
      userId: updateResult.rows[0].id,
      passwordVersion: updateResult.rows[0].password_version,
      passwordChangeRequired: updateResult.rows[0].password_change_required,
    };
  } catch (error) {
    if (commitAttempted) {
      client.release(error);
      throw createRecoveryError(
        'RECOVERY_COMMIT_UNCERTAIN',
        'The commit outcome is uncertain. Verify the account state before attempting recovery again.',
      );
    }

    if (transactionOpen) {
      try {
        await client.query('ROLLBACK');
        transactionOpen = false;
      } catch (rollbackError) {
        client.release(rollbackError);
        throw createRecoveryError(
          'RECOVERY_ROLLBACK_UNCERTAIN',
          'The rollback outcome is uncertain. Verify the account state before attempting recovery again.',
        );
      }
    }

    client.release();
    if (!(error instanceof AdminPasswordRecoveryError)) {
      throw createRecoveryError(
        'RECOVERY_DATABASE_OPERATION_FAILED',
        'The recovery operation failed; verify database connectivity and schema. No credentials or raw database details are available.',
      );
    }
    throw error;
  }

  client.release();
  return recoveryResult;
}

export function getSafeAdminPasswordRecoveryErrorMessage(error) {
  if (error instanceof AdminPasswordRecoveryError) {
    return error.message;
  }
  return 'Recovery failed because of an unexpected database or runtime error. Verify account state before retrying.';
}
