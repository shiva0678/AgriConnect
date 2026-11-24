import "dotenv/config";
import { spawnSync } from "node:child_process";

const testDatabaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
if (!testDatabaseUrl) {
  console.error("Set DATABASE_URL or TEST_DATABASE_URL before running backend tests.");
  process.exitCode = 1;
} else {
  if (!process.env.TEST_DATABASE_URL) {
    console.warn("TEST_DATABASE_URL is unset; backend tests will use DATABASE_URL.");
  }

  const result = spawnSync(
    process.execPath,
    ["--test", "--test-concurrency=1", ...process.argv.slice(2)],
    {
      env: { ...process.env, NODE_ENV: "test" },
      stdio: "inherit",
    },
  );
  if (result.error) {
    console.error("Could not start backend tests:", result.error.message);
    process.exitCode = 1;
  } else {
    process.exitCode = result.status ?? 1;
  }
}
