import { defineConfig } from "vitest/config";
import { config as loadDotenv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateTestDatabaseUrl } from "./test/databaseSafety.ts";

const dir = path.dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: path.join(dir, ".env.test") });
const testUrl = validateTestDatabaseUrl(process.env.TEST_DATABASE_URL);
process.env.DATABASE_URL = testUrl;

process.env.NODE_ENV = "test";
process.env.REQUIRE_EMAIL_VERIFICATION = "false";

export default defineConfig({
  test: {
    include: ["src/**/__tests__/**/*.test.ts"],
    globalSetup: ["test/globalSetup.ts"],
    setupFiles: ["test/setupFile.ts"],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    // Keep each test file in its own worker/module cache so mocked external
    // integration suites cannot contaminate real PostgreSQL suites.
    fileParallelism: false,
    pool: "forks",
    maxWorkers: 1,
    env: {
      DATABASE_URL: testUrl,
      TEST_DATABASE_URL: testUrl,
      LOG_LEVEL: "silent",
    },
  },
});
