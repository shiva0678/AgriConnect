import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import {
  getSafeSingleAdminProvisioningErrorMessage,
  readSingleAdminProvisioningConfig,
  provisionSingleMissingAdmin,
  SingleAdminProvisioningError,
} from '../services/singleAdminProvisioningService.js';

const ADMIN_EMAIL = 'shivaadmin@gmail.com';
const ADMIN_ID = '57ac5ea2-0ae9-4c8f-b763-568c02e0f911';
const TEMPORARY_PASSWORD = 'temporary-password-for-test';

function config(overrides = {}) {
  return {
    ADMIN_PROVISION_EMAIL: ADMIN_EMAIL,
    ADMIN_PROVISION_TEMP_PASSWORD: TEMPORARY_PASSWORD,
    ADMIN_PROVISION_CONFIRM: `PROVISION ${ADMIN_EMAIL}`,
    ...overrides,
  };
}

function args(database) {
  const values = readSingleAdminProvisioningConfig(config());
  return { database, ...values };
}

function createDatabase({
  authorizations = [],
  users = [],
  activeCount = 0,
  failInsert = false,
  failRollback = false,
} = {}) {
  const state = {
    authorizations: authorizations.map((row) => ({ ...row })),
    users: users.map((row) => ({ ...row })),
  };
  const calls = [];
  let snapshot = null;
  let releaseCount = 0;
  const releaseErrors = [];

  const client = {
    async query(sql, values = []) {
      const normalizedSql = sql.replace(/\s+/g, ' ').trim();
      calls.push({ sql: normalizedSql, values });
      if (normalizedSql === 'BEGIN') {
        snapshot = {
          authorizations: state.authorizations.map((row) => ({ ...row })),
          users: state.users.map((row) => ({ ...row })),
        };
        return { rows: [] };
      }
      if (normalizedSql.includes('pg_advisory_xact_lock')) {
        return { rows: [] };
      }
      if (normalizedSql.includes('FROM authorized_admins') && normalizedSql.includes('FOR UPDATE')) {
        return { rows: state.authorizations };
      }
      if (normalizedSql.includes('FROM users') && normalizedSql.includes('FOR UPDATE')) {
        return { rows: state.users };
      }
      if (normalizedSql.includes('COUNT(*)::int AS total')) {
        return { rows: [{ total: activeCount }] };
      }
      if (normalizedSql.startsWith('INSERT INTO users')) {
        if (failInsert) {
          throw new Error('mock insert failure');
        }
        const user = {
          id: ADMIN_ID,
          email: values[0],
          role: 'admin',
          status: 'active',
          password: values[1],
          password_change_required: true,
          password_version: 0,
        };
        state.users.push(user);
        return {
          rows: [{
            id: user.id,
            password_change_required: user.password_change_required,
          }],
        };
      }
      if (normalizedSql.startsWith('INSERT INTO authorized_admins')) {
        state.authorizations.push({
          id: 'auth-new',
          email: values[0],
          user_id: values[1],
          status: 'active',
        });
        return { rows: [] };
      }
      if (normalizedSql.startsWith('UPDATE authorized_admins')) {
        const authorization = state.authorizations.find((row) => row.id === values[0]);
        if (!authorization || authorization.user_id !== null) {
          return { rows: [] };
        }
        authorization.user_id = values[1];
        return { rows: [{ id: authorization.id }] };
      }
      if (normalizedSql === 'COMMIT') {
        return { rows: [] };
      }
      if (normalizedSql === 'ROLLBACK') {
        if (failRollback) {
          throw new Error('mock rollback failure');
        }
        state.authorizations = snapshot.authorizations;
        state.users = snapshot.users;
        return { rows: [] };
      }
      throw new Error(`Unexpected provisioning query: ${normalizedSql}`);
    },
    release(error) {
      releaseCount += 1;
      releaseErrors.push(error);
    },
  };

  return {
    database: {
      async connect() {
        return client;
      },
    },
    state,
    calls,
    get releaseCount() {
      return releaseCount;
    },
    releaseErrors,
  };
}

test('provisioning requires an allowlisted exact email, temporary password, and confirmation', () => {
  assert.deepEqual(readSingleAdminProvisioningConfig(config()), {
    email: ADMIN_EMAIL,
    temporaryPassword: TEMPORARY_PASSWORD,
    confirmation: `PROVISION ${ADMIN_EMAIL}`,
  });

  for (const environment of [
    config({ ADMIN_PROVISION_EMAIL: '' }),
    config({ ADMIN_PROVISION_EMAIL: 'not-allowed@example.com' }),
    config({ ADMIN_PROVISION_TEMP_PASSWORD: '' }),
    config({ ADMIN_PROVISION_CONFIRM: 'YES' }),
  ]) {
    assert.throws(() => readSingleAdminProvisioningConfig(environment));
  }
});

test('creates exactly one authorized admin with a bcrypt hash and forced password change', async () => {
  const mock = createDatabase();
  const result = await provisionSingleMissingAdmin(args(mock.database));

  assert.equal(result.userId, ADMIN_ID);
  assert.equal(result.passwordChangeRequired, true);
  assert.equal(mock.state.users.length, 1);
  assert.equal(mock.state.users[0].role, 'admin');
  assert.equal(mock.state.users[0].password_version, 0);
  assert.equal(await bcrypt.compare(TEMPORARY_PASSWORD, mock.state.users[0].password), true);
  assert.equal(mock.state.authorizations.length, 1);
  assert.equal(mock.state.authorizations[0].user_id, ADMIN_ID);
  assert.equal(mock.calls[0].sql, 'BEGIN');
  assert.ok(mock.calls.some((call) => call.sql.includes('FOR UPDATE')));
  assert.equal(mock.calls.at(-1).sql, 'COMMIT');
  assert.equal(mock.releaseCount, 1);
  assert.equal(mock.releaseErrors[0], undefined);
});

test('links an existing active orphan authorization without replacing its mapping', async () => {
  const existingAuthorization = {
    id: 'auth-existing',
    email: ADMIN_EMAIL,
    user_id: null,
    status: 'active',
  };
  const mock = createDatabase({ authorizations: [existingAuthorization] });
  const result = await provisionSingleMissingAdmin(args(mock.database));

  assert.equal(result.userId, ADMIN_ID);
  assert.equal(mock.state.authorizations.length, 1);
  assert.equal(mock.state.authorizations[0].id, existingAuthorization.id);
  assert.equal(mock.state.authorizations[0].user_id, ADMIN_ID);
});

test('refuses existing users, linked or suspended mappings, and the active-admin limit', async () => {
  const cases = [
    {
      mock: createDatabase({ users: [{ id: ADMIN_ID, email: ADMIN_EMAIL, role: 'admin' }] }),
      expected: /already exists/i,
    },
    {
      mock: createDatabase({
        authorizations: [{
          id: 'auth-linked',
          email: ADMIN_EMAIL,
          user_id: 'other-user',
          status: 'active',
        }],
      }),
      expected: /already linked/i,
    },
    {
      mock: createDatabase({
        authorizations: [{
          id: 'auth-suspended',
          email: ADMIN_EMAIL,
          user_id: null,
          status: 'suspended',
        }],
      }),
      expected: /suspended/i,
    },
    {
      mock: createDatabase({ activeCount: 3 }),
      expected: /three-active-administrator limit/i,
    },
  ];

  for (const { mock, expected } of cases) {
    await assert.rejects(provisionSingleMissingAdmin(args(mock.database)), expected);
    assert.equal(mock.calls.some((call) => call.sql.startsWith('INSERT INTO users')), false);
    assert.equal(mock.calls.at(-1).sql, 'ROLLBACK');
    assert.equal(mock.releaseCount, 1);
  }
});

test('rolls back user creation when the insert fails and discards a client after rollback failure', async () => {
  const insertFailure = createDatabase({ failInsert: true });
  await assert.rejects(
    provisionSingleMissingAdmin(args(insertFailure.database)),
    /Provisioning failed; verify database connectivity and schema/i,
  );
  assert.equal(insertFailure.state.users.length, 0);
  assert.equal(insertFailure.calls.at(-1).sql, 'ROLLBACK');
  assert.equal(insertFailure.releaseCount, 1);

  const rollbackFailure = createDatabase({ failInsert: true, failRollback: true });
  await assert.rejects(
    provisionSingleMissingAdmin(args(rollbackFailure.database)),
    /rollback outcome is uncertain/i,
  );
  assert.equal(rollbackFailure.calls.at(-1).sql, 'ROLLBACK');
  assert.equal(rollbackFailure.releaseCount, 1);
  assert.match(rollbackFailure.releaseErrors[0].message, /rollback failure/);
});

test('safe diagnostics never echo raw database errors', () => {
  const known = new SingleAdminProvisioningError(
    'ADMIN_PROVISION_LIMIT_REACHED',
    'The administrator limit was reached.',
  );
  assert.equal(
    getSafeSingleAdminProvisioningErrorMessage(known),
    'The administrator limit was reached.',
  );
  assert.doesNotMatch(
    getSafeSingleAdminProvisioningErrorMessage(new Error('password=secret; token=private')),
    /secret|private/i,
  );
});
