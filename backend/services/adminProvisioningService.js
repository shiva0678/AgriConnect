import { randomBytes } from 'node:crypto';
import bcrypt from 'bcrypt';

export const AUTHORIZED_ADMIN_EMAILS = Object.freeze([
  'shivaadmin@gmail.com',
  'sourabhadmin@gmail.com',
  'satwikadmin@gmail.com',
]);

export const MAX_AUTHORIZED_ADMINS = 3;

export function validateAuthorizedAdminEmail(email) {
  const normalized = typeof email === 'string'
    ? email.trim().toLowerCase()
    : '';
  if (!AUTHORIZED_ADMIN_EMAILS.includes(normalized)) {
    throw new Error('Email is not authorized for administrator provisioning.');
  }
  return normalized;
}

export function generateTemporaryCredential() {
  const password = `${randomBytes(18).toString('base64url')}A1!`;
  return {
    password,
    passwordHash: null,
  };
}

export async function provisionAuthorizedAdmins({
  database,
  bcryptImplementation = bcrypt,
  passwordGenerator = generateTemporaryCredential,
} = {}) {
  if (!database) {
    throw new Error('A PostgreSQL database connection is required.');
  }

  const client = await database.connect();
  let transactionStarted = false;
  const results = [];

  try {
    await client.query('BEGIN');
    transactionStarted = true;
    await client.query("SELECT pg_advisory_xact_lock(hashtext('agriconnect-admin-provisioning'))");

    const activeCountResult = await client.query(
      `SELECT COUNT(*)::int AS total
       FROM authorized_admins
       WHERE status = 'active'`,
    );
    const activeCount = Number(activeCountResult.rows[0]?.total ?? 0);
    if (activeCount > MAX_AUTHORIZED_ADMINS) {
      throw new Error('More than three active authorized administrators exist.');
    }

    for (let index = 0; index < AUTHORIZED_ADMIN_EMAILS.length; index += 1) {
      const email = AUTHORIZED_ADMIN_EMAILS[index];
      const authorizationResult = await client.query(
        `SELECT id, email, user_id, status
         FROM authorized_admins
         WHERE LOWER(email) = LOWER($1)
         LIMIT 1`,
        [email],
      );
      const authorization = authorizationResult.rows[0] || null;

      const userResult = await client.query(
        `SELECT id, name, email, role, status, password_change_required
         FROM users
         WHERE LOWER(email) = LOWER($1)
         LIMIT 1
         FOR UPDATE`,
        [email],
      );
      const existingUser = userResult.rows[0] || null;

      if (authorization?.user_id) {
        if (!existingUser) {
          throw new Error(`Authorized administrator ${email} is linked to a missing user account.`);
        }
        if (existingUser.id !== authorization.user_id) {
          throw new Error(`Authorized administrator ${email} is linked to an unexpected account.`);
        }
        if (existingUser.role !== 'admin') {
          throw new Error(`Authorized administrator ${email} is not an administrator account.`);
        }
        if (existingUser.email.toLowerCase() !== email) {
          throw new Error(`Authorized administrator ${email} is linked to an unexpected email.`);
        }
        results.push({
          email,
          status: authorization.status === 'active' ? 'unchanged' : 'suspended',
          created: false,
          requiresPasswordChange: Boolean(existingUser.password_change_required),
        });
        continue;
      }

      if (authorization?.status === 'suspended') {
        results.push({
          email,
          status: 'suspended',
          created: false,
          requiresPasswordChange: false,
        });
        continue;
      }

      if (existingUser && existingUser.role !== 'admin') {
        throw new Error(
          `Cannot provision ${email}: an existing farmer or buyer account owns this email.`,
        );
      }

      if (!authorization || authorization.status !== 'active') {
        const projectedActiveCount = activeCount
          + (!authorization || authorization.status !== 'active' ? 1 : 0);
        if (projectedActiveCount > MAX_AUTHORIZED_ADMINS) {
          throw new Error('Provisioning would exceed the three-administrator limit.');
        }
      }

      let user = existingUser;
      let temporaryPassword = null;

      if (!user) {
        const credential = passwordGenerator();
        if (!credential?.password) {
          throw new Error('A temporary administrator password could not be generated.');
        }
        temporaryPassword = credential.password;
        const passwordHash = await bcryptImplementation.hash(temporaryPassword, 12);
        const phone = `900000000${index + 1}`.slice(0, 10);
        const insertResult = await client.query(
          `INSERT INTO users (
             name,
             email,
             phone,
             password,
             role,
             status,
             password_change_required
           ) VALUES ($1, $2, $3, $4, 'admin', 'active', TRUE)
           RETURNING id, name, email, role, status, password_change_required`,
          [
            'AgriConnect Administrator',
            email,
            phone,
            passwordHash,
          ],
        );
        user = insertResult.rows[0];
      }

      if (authorization) {
        await client.query(
          `UPDATE authorized_admins
           SET user_id = $2,
               status = 'active',
               updated_at = NOW()
           WHERE id = $1`,
          [authorization.id, user.id],
        );
      } else {
        await client.query(
          `INSERT INTO authorized_admins (email, user_id, status)
           VALUES ($1, $2, 'active')
           ON CONFLICT (email) DO UPDATE
           SET user_id = EXCLUDED.user_id,
               status = 'active',
               updated_at = NOW()`,
          [email, user.id],
        );
      }

      results.push({
        email,
        status: 'provisioned',
        created: !existingUser,
        requiresPasswordChange: Boolean(user.password_change_required),
        temporaryPassword: temporaryPassword || undefined,
      });
    }

    const finalCountResult = await client.query(
      `SELECT COUNT(*)::int AS total
       FROM authorized_admins
       WHERE status = 'active'`,
    );
    const finalCount = Number(finalCountResult.rows[0]?.total ?? 0);
    if (finalCount > MAX_AUTHORIZED_ADMINS) {
      throw new Error('Provisioning would exceed the three-administrator limit.');
    }

    await client.query('COMMIT');
    transactionStarted = false;
    return results;
  } catch (error) {
    if (transactionStarted) {
      await client.query('ROLLBACK');
    }
    throw error;
  } finally {
    client.release();
  }
}
