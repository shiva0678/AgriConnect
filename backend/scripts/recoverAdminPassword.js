import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { pool } from '../config/db.js';
import {
  getSafeAdminPasswordRecoveryErrorMessage,
  readAdminPasswordRecoveryConfig,
  recoverAuthorizedAdminPassword,
} from '../services/adminPasswordRecoveryService.js';

async function main() {
  let recoveryCompleted = false;
  try {
    const config = readAdminPasswordRecoveryConfig();
    await recoverAuthorizedAdminPassword({
      database: pool,
      email: config.email,
      temporaryPassword: config.temporaryPassword,
      confirmation: config.confirmation,
    });
    recoveryCompleted = true;
    console.info(
      'Administrator password recovery completed. Sign in and change the temporary password immediately.',
    );
  } catch (error) {
    console.error(getSafeAdminPasswordRecoveryErrorMessage(error));
    process.exitCode = 1;
  } finally {
    try {
      await pool.end();
    } catch {
      console.error(
        recoveryCompleted
          ? 'Recovery completed, but the connection pool did not close cleanly. Do not repeat the operation.'
          : 'The database connection pool could not be closed cleanly.',
      );
      process.exitCode = 1;
    }
  }
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;
if (invokedPath === import.meta.url) {
  await main();
}
