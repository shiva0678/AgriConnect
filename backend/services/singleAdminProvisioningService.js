import bcrypt from 'bcrypt';
import { validateAuthorizedAdminEmail } from './adminProvisioningService.js';

const CONFIRMATION_PREFIX = 'PROVISION ';
const MAX_PASSWORD_BYTES = 72;
const MAX_ACTIVE_ADMINS = 3;

export class SingleAdminProvisioningError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SingleAdminProvisioningError';
    this.code = code;
  }
}

function provisioningError(code, message) {
  return new SingleAdminProvisioningError(code, message);
}

export function readSingleAdminProvisioningConfig(environment = process.env) {
  const email = environment.ADMIN_PROVISION_EMAIL;
  const temporaryPassword = environment.ADMIN_PROVISION_TEMP_PASSWORD;
  const confirmation = environment.ADMIN_PROVISION_CONFIRM;

  if (typeof email !== 'string' || email !== email.trim().toLowerCase()) {
    throw provisioningError(
      'ADMIN_PROVISION_EMAIL_REQUIRED',
      'Set ADMIN_PROVISION_EMAIL to an exact, lowercase administrator email.',
    );
  }

  let authorizedEmail;
  try {
    authorizedEmail = validateAuthorizedAdminEmail(email);
  } catch {
    throw provisioningError(
      'ADMIN_PROVISION_EMAIL_NOT_ALLOWED',
      'ADMIN_PROVISION_EMAIL is not on the administrator allowlist.',
    );
  }

  if (
    typeof temporaryPassword !== 'string'
    || temporaryPassword.length === 0
    || Buffer.byteLength(temporaryPassword, 'utf8') > MAX_PASSWORD_BYTES
  ) {
    throw provisioningError(
      'ADMIN_PROVISION_PASSWORD_INVALID',
      'Set ADMIN_PROVISION_TEMP_PASSWORD to a non-empty value of at most 72 UTF-8 bytes.',
    );
  }
  if (confirmation !== `${CONFIRMATION_PREFIX}${authorizedEmail}`) {
    throw provisioningError(
      'ADMIN_PROVISION_CONFIRMATION_INVALID',
      'Set ADMIN_PROVISION_CONFIRM to PROVISION followed by the exact administrator email.',
    );
  }

  return { email: authorizedEmail, temporaryPassword, confirmation };
}

export async function provisionSingleMissingAdmin({
  database,
  email,
  temporaryPassword,
  confirmation,
  bcryptImplementation = bcrypt,
} = {}) {
  if (!database || typeof database.connect !== 'function') {
    throw provisioningError(
      'ADMIN_PROVISION_DATABASE_UNAVAILABLE',
      'The configured database connection is unavailable.',
    );
  }

  const config = readSingleAdminProvisioningConfig({
    ADMIN_PROVISION_EMAIL: email,
    ADMIN_PROVISION_TEMP_PASSWORD: temporaryPassword,
    ADMIN_PROVISION_CONFIRM: confirmation,
  });

  let passwordHash;
  try {
    passwordHash = await bcryptImplementation.hash(config.temporaryPassword, 12);
  } catch {
    throw provisioningError(
      'ADMIN_PROVISION_HASH_FAILED',
      'The temporary password could not be processed; no database changes were made.',
    );
  }

  let client;
  try {
    client = await database.connect();
  } catch {
    throw provisioningError(
      'ADMIN_PROVISION_CONNECT_FAILED',
      'Could not connect to the configured database; verify its target and availability.',
    );
  }

  let transactionOpen = false;
  let commitAttempted = false;
  let result;

  try {
    await client.query('BEGIN');
    transactionOpen = true;
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('agriconnect-admin-provisioning'))",
    );

    const authorizationResult = await client.query(
      `SELECT id, email, user_id, status
       FROM authorized_admins
       WHERE LOWER(email) = LOWER($1)
       FOR UPDATE`,
      [config.email],
    );
    if (authorizationResult.rows.length > 1) {
      throw provisioningError(
        'ADMIN_PROVISION_AUTHORIZATION_AMBIGUOUS',
        'Multiple authorization mappings exist; no changes were made.',
      );
    }

    const userResult = await client.query(
      `SELECT id, email, role, status
       FROM users
       WHERE LOWER(email) = LOWER($1)
       FOR UPDATE`,
      [config.email],
    );
    if (userResult.rows.length > 1) {
      throw provisioningError(
        'ADMIN_PROVISION_USER_AMBIGUOUS',
        'The administrator email matches multiple user records; no changes were made.',
      );
    }
    if (userResult.rows.length === 1) {
      throw provisioningError(
        'ADMIN_PROVISION_USER_EXISTS',
        'A user with this email already exists; provisioning made no changes.',
      );
    }

    const authorization = authorizationResult.rows[0] || null;
    if (authorization?.status === 'suspended') {
      throw provisioningError(
        'ADMIN_PROVISION_AUTHORIZATION_SUSPENDED',
        'The administrator authorization is suspended; no changes were made.',
      );
    }
    if (authorization?.user_id) {
      throw provisioningError(
        'ADMIN_PROVISION_AUTHORIZATION_LINKED',
        'The authorization is already linked to a user; no changes were made.',
      );
    }

    const activeCountResult = await client.query(
      `SELECT COUNT(*)::int AS total
       FROM authorized_admins
       WHERE status = 'active'`,
    );
    const activeCount = Number(activeCountResult.rows[0]?.total ?? 0);
    if (
      activeCount > MAX_ACTIVE_ADMINS
      || (!authorization && activeCount >= MAX_ACTIVE_ADMINS)
    ) {
      throw provisioningError(
        'ADMIN_PROVISION_LIMIT_REACHED',
        'Provisioning would exceed the three-active-administrator limit.',
      );
    }

    const insertUserResult = await client.query(
      `INSERT INTO users (
         name,
         email,
         phone,
         password,
         role,
         status,
         password_change_required,
         password_version
       ) VALUES (
         'AgriConnect Administrator',
         $1,
         '9000000001',
         $2,
         'admin',
         'active',
         TRUE,
         0
       )
       RETURNING id, password_change_required`,
      [config.email, passwordHash],
    );
    if (insertUserResult.rows.length !== 1) {
      throw provisioningError(
        'ADMIN_PROVISION_INSERT_FAILED',
        'The administrator account was not created.',
      );
    }

    const user = insertUserResult.rows[0];
    if (authorization) {
      const linkResult = await client.query(
        `UPDATE authorized_admins
         SET user_id = $2,
             updated_at = NOW()
         WHERE id = $1
           AND status = 'active'
           AND user_id IS NULL
         RETURNING id`,
        [authorization.id, user.id],
      );
      if (linkResult.rows.length !== 1) {
        throw provisioningError(
          'ADMIN_PROVISION_LINK_FAILED',
          'The existing authorization could not be linked to the new account.',
        );
      }
    } else {
      await client.query(
        `INSERT INTO authorized_admins (email, user_id, status)
         VALUES ($1, $2, 'active')`,
        [config.email, user.id],
      );
    }

    commitAttempted = true;
    await client.query('COMMIT');
    transactionOpen = false;
    result = {
      userId: user.id,
      passwordChangeRequired: user.password_change_required,
    };
  } catch (error) {
    if (commitAttempted) {
      client.release(error);
      throw provisioningError(
        'ADMIN_PROVISION_COMMIT_UNCERTAIN',
        'The commit outcome is uncertain. Verify account state before attempting provisioning again.',
      );
    }

    if (transactionOpen) {
      try {
        await client.query('ROLLBACK');
        transactionOpen = false;
      } catch (rollbackError) {
        client.release(rollbackError);
        throw provisioningError(
          'ADMIN_PROVISION_ROLLBACK_UNCERTAIN',
          'The rollback outcome is uncertain. Verify account state before attempting provisioning again.',
        );
      }
    }

    client.release();
    if (!(error instanceof SingleAdminProvisioningError)) {
      throw provisioningError(
        'ADMIN_PROVISION_DATABASE_OPERATION_FAILED',
        'Provisioning failed; verify database connectivity and schema. No raw database details were printed.',
      );
    }
    throw error;
  }

  client.release();
  return result;
}

export function getSafeSingleAdminProvisioningErrorMessage(error) {
  if (error instanceof SingleAdminProvisioningError) {
    return error.message;
  }
  return 'Provisioning failed unexpectedly. Verify account state before retrying.';
}
