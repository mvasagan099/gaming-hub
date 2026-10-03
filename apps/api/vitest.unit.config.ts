import { validateTestDatabaseUrl } from "./test/databaseSafety.ts";
import { defineConfig } from "vitest/config";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
  ? validateTestDatabaseUrl(process.env.TEST_DATABASE_URL)
  : "postgresql://unit:dummy@127.0.0.1:1/no_connection_test";
process.env.REQUIRE_EMAIL_VERIFICATION = "false";

export default defineConfig({
  test: {
    include: ["src/**/__tests__/**/*.unit.test.ts"],
    testTimeout: 10_000,
  },
});
