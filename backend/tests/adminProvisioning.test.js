import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  AUTHORIZED_ADMIN_EMAILS,
  MAX_AUTHORIZED_ADMINS,
  generateTemporaryCredential,
  provisionAuthorizedAdmins,
  validateAuthorizedAdminEmail,
} from '../services/adminProvisioningService.js';

test('only the three specified administrator emails are authorized', () => {
  assert.deepEqual(AUTHORIZED_ADMIN_EMAILS, [
    'shivaadmin@gmail.com',
    'sourabhadmin@gmail.com',
    'satwikadmin@gmail.com',
  ]);
  assert.equal(MAX_AUTHORIZED_ADMINS, 3);

  for (const email of AUTHORIZED_ADMIN_EMAILS) {
    assert.equal(validateAuthorizedAdminEmail(email), email);
  }
  assert.throws(
    () => validateAuthorizedAdminEmail('unauthorized@example.com'),
    /not authorized/i,
  );
});

test('temporary administrator credentials are generated securely and not hardcoded', () => {
  const first = generateTemporaryCredential();
  const second = generateTemporaryCredential();

  assert.equal(typeof first.password, 'string');
  assert.ok(first.password.length >= 24);
  assert.notEqual(first.password, second.password);
  assert.equal(first.passwordHash, null);
  assert.match(first.password, /[A-Z]/);
  assert.doesNotMatch(first.password, /\s/);
});

test('duplicate provisioning is idempotent and does not recreate accounts', async () => {
  let authorizationIndex = 0;
  const client = {
    async query(sql, values = []) {
      if (/BEGIN|pg_advisory_xact_lock|ROLLBACK|COMMIT/.test(sql)) {
        return { rows: [] };
      }
      if (/COUNT\(\*\).*authorized_admins/is.test(sql)) {
        return { rows: [{ total: 3 }] };
      }
      if (/FROM authorized_admins/.test(sql)) {
        const email = AUTHORIZED_ADMIN_EMAILS[authorizationIndex];
        authorizationIndex = (authorizationIndex + 1) % 3;
        return {
          rows: [{
            id: `authorization-${email}`,
            email,
            user_id: `user-${email}`,
            status: 'active',
          }],
        };
      }
      if (/FROM users/.test(sql)) {
        const email = values[0];
        return {
          rows: [{
            id: `user-${email}`,
            name: 'AgriConnect Administrator',
            email,
            role: 'admin',
            status: 'active',
            password_change_required: true,
          }],
        };
      }
      throw new Error(`Unexpected duplicate provisioning query: ${sql}`);
    },
    release() {},
  };

  const database = {
    async connect() {
      return client;
    },
  };

  const results = await provisionAuthorizedAdmins({ database });
  assert.equal(results.length, 3);
  assert.ok(results.every((result) => result.status === 'unchanged'));
  assert.ok(results.every((result) => result.created === false));
});

test('provisioning rejects databases that already have more than three active admins', async () => {
  const client = {
    async query(sql) {
      if (/BEGIN|pg_advisory_xact_lock|ROLLBACK/.test(sql)) {
        return { rows: [] };
      }
      if (/COUNT\(\*\).*authorized_admins/is.test(sql)) {
        return { rows: [{ total: 4 }] };
      }
      throw new Error(`Unexpected maximum-limit query: ${sql}`);
    },
    release() {},
  };

  await assert.rejects(
    provisionAuthorizedAdmins({
      database: {
        async connect() {
          return client;
        },
      },
    }),
    /more than three active/i,
  );
});

test('provisioning script does not print plaintext credentials', async () => {
  const script = await readFile(
    new URL('../scripts/provisionAdmins.js', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(
    script,
    /Temporary credential for.*temporaryPassword|console\.(log|warn|error).*temporaryPassword/i,
  );
  assert.match(script, /writeFile/);
  assert.match(script, /0o600/);
});
