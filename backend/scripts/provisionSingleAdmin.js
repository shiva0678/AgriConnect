import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { pool } from '../config/db.js';
import {
  getSafeSingleAdminProvisioningErrorMessage,
  provisionSingleMissingAdmin,
  readSingleAdminProvisioningConfig,
} from '../services/singleAdminProvisioningService.js';

async function main() {
  let provisioned = false;
  try {
    const config = readSingleAdminProvisioningConfig();
    await provisionSingleMissingAdmin({
      database: pool,
      email: config.email,
      temporaryPassword: config.temporaryPassword,
      confirmation: config.confirmation,
    });
    provisioned = true;
    console.info(
      'The authorized administrator account was created. Sign in and change the temporary password immediately.',
    );
  } catch (error) {
    console.error(getSafeSingleAdminProvisioningErrorMessage(error));
    process.exitCode = 1;
  } finally {
    try {
      await pool.end();
    } catch {
      console.error(
        provisioned
          ? 'The account was created, but the connection pool did not close cleanly. Do not retry provisioning.'
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
