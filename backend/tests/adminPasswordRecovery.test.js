import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import { readFile } from 'node:fs/promises';
import {
  AdminPasswordRecoveryError,
  getSafeAdminPasswordRecoveryErrorMessage,
  readAdminPasswordRecoveryConfig,
  recoverAuthorizedAdminPassword,
} from '../services/adminPasswordRecoveryService.js';

const ADMIN_EMAIL = 'shivaadmin@gmail.com';
const ADMIN_ID = '57ac5ea2-0ae9-4c8f-b763-568c02e0f911';
const TEMPORARY_PASSWORD = 'temporary-password-for-test';

function createRecoveryDatabase({
  users = [{
    id: ADMIN_ID,
    email: ADMIN_EMAIL,
    role: 'admin',
    status: 'active',
    password: 'old-hash',
    password_version: 6,
    password_change_required: false,
  }],
  authorizations = [{
    id: 'auth-1',
    email: ADMIN_EMAIL,
    user_id: ADMIN_ID,
    status: 'active',
  }],
  failUpdate = false,
  failRollback = false,
} = {}) {
  const state = {
    users: users.map((user) => ({ ...user })),
    authorizations: authorizations.map((authorization) => ({ ...authorization })),
  };
  const initialUsers = state.users.map((user) => ({ ...user }));
  const calls = [];
  let releaseCount = 0;
  const releaseErrors = [];

  const client = {
    async query(sql, values = []) {
      const normalizedSql = sql.replace(/\s+/g, ' ').trim();
      calls.push({ sql: normalizedSql, values });

      if (normalizedSql === 'BEGIN' || normalizedSql === 'COMMIT') {
        return { rows: [] };
      }
      if (normalizedSql === 'ROLLBACK') {
        if (failRollback) {
          throw new Error('mock rollback failure');
        }
        state.users = initialUsers.map((user) => ({ ...user }));
        return { rows: [] };
      }
      if (normalizedSql.includes('FROM users') && normalizedSql.includes('FOR UPDATE')) {
        return { rows: state.users };
      }
      if (
        normalizedSql.includes('FROM authorized_admins')
        && normalizedSql.includes('FOR UPDATE')
      ) {
        return { rows: state.authorizations };
      }
      if (normalizedSql.startsWith('UPDATE users')) {
        if (failUpdate) {
          throw new Error('mock update failure');
        }
        const user = state.users.find((candidate) => candidate.id === values[0]);
        if (!user || user.role !== 'admin') {
          return { rows: [] };
        }
        user.password = values[1];
        user.password_change_required = true;
        user.password_version += 1;
        return {
          rows: [{
            id: user.id,
            password_version: user.password_version,
            password_change_required: user.password_change_required,
          }],
        };
      }
      throw new Error(`Unexpected recovery query: ${normalizedSql}`);
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

function recoveryConfig(overrides = {}) {
  return {
    ADMIN_RECOVERY_EMAIL: ADMIN_EMAIL,
    ADMIN_RECOVERY_TEMP_PASSWORD: TEMPORARY_PASSWORD,
    ADMIN_RECOVERY_CONFIRM: `RECOVER ${ADMIN_EMAIL}`,
    ...overrides,
  };
}

function recoveryArguments(database) {
  return {
    database,
    ...readAdminPasswordRecoveryConfig(recoveryConfig()),
  };
}

test('the recovery script requires direct invocation and never initializes or provisions the database', async () => {
  const script = await readFile(
    new URL('../scripts/recoverAdminPassword.js', import.meta.url),
    'utf8',
  );
  assert.match(script, /if \(invokedPath === import\.meta\.url\)/);
  assert.doesNotMatch(script, /initializeDatabase|provisionAuthorizedAdmins/);
  assert.doesNotMatch(
    script,
    /console\.(?:info|log|error)\([^)]*(?:temporaryPassword|passwordHash|token)/i,
  );
});

test('recovery requires the exact authorized email, temporary password, and confirmation', () => {
  assert.deepEqual(readAdminPasswordRecoveryConfig(recoveryConfig()), {
    email: ADMIN_EMAIL,
    temporaryPassword: TEMPORARY_PASSWORD,
    confirmation: `RECOVER ${ADMIN_EMAIL}`,
  });

  for (const environment of [
    recoveryConfig({ ADMIN_RECOVERY_EMAIL: '' }),
    recoveryConfig({ ADMIN_RECOVERY_EMAIL: 'SHIVAADMIN@gmail.com' }),
    recoveryConfig({ ADMIN_RECOVERY_EMAIL: 'other@example.com' }),
    recoveryConfig({ ADMIN_RECOVERY_TEMP_PASSWORD: '' }),
    recoveryConfig({ ADMIN_RECOVERY_CONFIRM: 'YES' }),
  ]) {
    assert.throws(() => readAdminPasswordRecoveryConfig(environment));
  }
});

test('safe CLI diagnostics explain known failures without exposing raw errors', () => {
  const knownError = new AdminPasswordRecoveryError(
    'RECOVERY_AUTHORIZATION_MISSING',
    'No active authorization mapping was found.',
  );
  assert.equal(
    getSafeAdminPasswordRecoveryErrorMessage(knownError),
    'No active authorization mapping was found.',
  );

  const unsafeDatabaseError = new Error(
    'connection failed with password=secret; query contained a token',
  );
  assert.match(
    getSafeAdminPasswordRecoveryErrorMessage(unsafeDatabaseError),
    /Verify account state before retrying/,
  );
  assert.doesNotMatch(
    getSafeAdminPasswordRecoveryErrorMessage(unsafeDatabaseError),
    /secret|token/i,
  );
});

test('recovery hashes the password and changes only the authorized account transactionally', async () => {
  const mock = createRecoveryDatabase();
  const initialAuthorization = { ...mock.state.authorizations[0] };
  const result = await recoverAuthorizedAdminPassword({
    ...recoveryArguments(mock.database),
  });

  assert.equal(result.userId, ADMIN_ID);
  assert.equal(result.passwordVersion, 7);
  assert.equal(result.passwordChangeRequired, true);
  assert.equal(mock.state.users.length, 1);
  assert.equal(mock.state.users[0].id, ADMIN_ID);
  assert.equal(mock.state.users[0].password_change_required, true);
  assert.equal(mock.state.users[0].password_version, 7);
  assert.notEqual(mock.state.users[0].password, TEMPORARY_PASSWORD);
  assert.equal(
    await bcrypt.compare(TEMPORARY_PASSWORD, mock.state.users[0].password),
    true,
  );
  assert.deepEqual(mock.state.authorizations[0], initialAuthorization);
  assert.equal(mock.calls[0].sql, 'BEGIN');
  assert.match(mock.calls[1].sql, /FROM users .*FOR UPDATE$/);
  assert.match(mock.calls[2].sql, /FROM authorized_admins .*FOR UPDATE$/);
  assert.match(mock.calls[3].sql, /password_change_required = TRUE/);
  assert.match(mock.calls[3].sql, /password_version = password_version \+ 1/);
  assert.deepEqual(mock.calls[3].values, [ADMIN_ID, mock.state.users[0].password]);
  assert.equal(mock.calls.at(-1).sql, 'COMMIT');
  assert.equal(mock.releaseCount, 1);
  assert.equal(mock.releaseErrors[0], undefined);
});

test('recovery refuses a missing or ambiguous user without updating accounts', async () => {
  for (const users of [[], [
    {
      id: ADMIN_ID,
      email: ADMIN_EMAIL,
      role: 'admin',
      status: 'active',
      password_version: 0,
    },
    {
      id: 'f9f657e6-412a-4bfc-b705-d5a590f9b680',
      email: ADMIN_EMAIL,
      role: 'admin',
      status: 'active',
      password_version: 0,
    },
  ]]) {
    const mock = createRecoveryDatabase({ users });
    await assert.rejects(
      recoverAuthorizedAdminPassword({
        ...recoveryArguments(mock.database),
      }),
    );
    assert.equal(mock.calls.some((call) => call.sql.startsWith('UPDATE users')), false);
    assert.equal(mock.calls.at(-1).sql, 'ROLLBACK');
    assert.equal(mock.releaseCount, 1);
  }
});

test('recovery refuses non-admin and unauthorized targets', async () => {
  const nonAdmin = createRecoveryDatabase({
    users: [{
      id: ADMIN_ID,
      email: ADMIN_EMAIL,
      role: 'farmer',
      status: 'active',
      password_version: 0,
    }],
  });
  await assert.rejects(
    recoverAuthorizedAdminPassword({
      ...recoveryArguments(nonAdmin.database),
    }),
    /not the requested administrator/i,
  );
  assert.equal(nonAdmin.calls.some((call) => call.sql.startsWith('UPDATE users')), false);

  const unauthorized = createRecoveryDatabase({ authorizations: [] });
  await assert.rejects(
    recoverAuthorizedAdminPassword({
      ...recoveryArguments(unauthorized.database),
    }),
    /No active authorization mapping/i,
  );
  assert.equal(unauthorized.calls.some((call) => call.sql.startsWith('UPDATE users')), false);
  assert.equal(unauthorized.calls.at(-1).sql, 'ROLLBACK');
});

test('recovery refuses ambiguous authorization mappings', async () => {
  const mock = createRecoveryDatabase({
    authorizations: [
      {
        id: 'auth-1',
        email: ADMIN_EMAIL,
        user_id: ADMIN_ID,
        status: 'active',
      },
      {
        id: 'auth-2',
        email: ADMIN_EMAIL,
        user_id: ADMIN_ID,
        status: 'active',
      },
    ],
  });
  await assert.rejects(
    recoverAuthorizedAdminPassword({
      ...recoveryArguments(mock.database),
    }),
    /Multiple authorization mappings/i,
  );
  assert.equal(mock.calls.some((call) => call.sql.startsWith('UPDATE users')), false);
});

test('an update failure rolls back without changing or releasing the client as broken', async () => {
  const mock = createRecoveryDatabase({ failUpdate: true });

  await assert.rejects(
    recoverAuthorizedAdminPassword({
      ...recoveryArguments(mock.database),
    }),
    /recovery operation failed/i,
  );

  assert.equal(mock.state.users[0].password, 'old-hash');
  assert.equal(mock.state.users[0].password_version, 6);
  assert.equal(mock.state.users[0].password_change_required, false);
  assert.equal(mock.calls.at(-1).sql, 'ROLLBACK');
  assert.equal(mock.releaseCount, 1);
  assert.equal(mock.releaseErrors[0], undefined);
});

test('a failed rollback runs no later SQL and releases the client as broken exactly once', async () => {
  const mock = createRecoveryDatabase({ failUpdate: true, failRollback: true });

  await assert.rejects(
    recoverAuthorizedAdminPassword({
      ...recoveryArguments(mock.database),
    }),
    /rollback outcome is uncertain/i,
  );

  assert.equal(mock.calls.at(-1).sql, 'ROLLBACK');
  assert.equal(mock.releaseCount, 1);
  assert.match(mock.releaseErrors[0].message, /rollback failure/);
});
