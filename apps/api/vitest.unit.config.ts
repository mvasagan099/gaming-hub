import { defineConfig } from "vitest/config";

process.env.NODE_ENV = "test";
process.env.REQUIRE_EMAIL_VERIFICATION = "false";

export default defineConfig({
  test: {
    include: ["src/**/__tests__/**/*.unit.test.ts"],
    testTimeout: 10_000,
  },
});
