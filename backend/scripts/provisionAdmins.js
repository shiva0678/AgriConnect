import dotenv from 'dotenv';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const backendDirectory = resolve(scriptDirectory, '..');
dotenv.config({ path: resolve(backendDirectory, '.env') });

const { pool, initializeDatabase } = await import('../config/db.js');
const { provisionAuthorizedAdmins } = await import('../services/adminProvisioningService.js');

async function main() {
  await initializeDatabase();
  const results = await provisionAuthorizedAdmins({ database: pool });

  const created = results.filter((result) => result.created);
  console.log('Administrator provisioning complete.');
  console.log(`Processed: ${results.length}; newly created: ${created.length}.`);

  if (created.length > 0) {
    const credentialDirectory = process.env.ADMIN_CREDENTIAL_OUTPUT_DIR?.trim()
      ? resolve(process.env.ADMIN_CREDENTIAL_OUTPUT_DIR.trim())
      : tmpdir();
    await mkdir(credentialDirectory, { recursive: true, mode: 0o700 });

    const outputFile = process.env.ADMIN_CREDENTIAL_OUTPUT_FILE?.trim()
      ? resolve(process.env.ADMIN_CREDENTIAL_OUTPUT_FILE.trim())
      : join(
          credentialDirectory,
          `agriconnect-admin-credentials-${randomBytes(12).toString('hex')}.json`,
        );

    await mkdir(dirname(outputFile), { recursive: true, mode: 0o700 });
    await writeFile(
      outputFile,
      JSON.stringify(
        created.map((result) => ({
          email: result.email,
          temporaryPassword: result.temporaryPassword,
        })),
        null,
        2,
      ),
      { encoding: 'utf8', mode: 0o600, flag: 'wx' },
    );

    console.warn(
      `Temporary credentials were written to a protected local file: ${outputFile}`,
    );
    console.warn(
      'The file is not application or CI log output and must be deleted after setup.',
    );
  }

  await pool.end();
}

main().catch(async (error) => {
  console.error(`Administrator provisioning failed: ${error.message}`);
  await pool.end().catch(() => {});
  process.exitCode = 1;
});
