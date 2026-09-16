import { defineConfig } from "vitest/config";
import { config as loadDotenv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: path.join(dir, ".env") });

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
    poolOptions: {
      forks: { singleFork: false, maxForks: 1, minForks: 1 },
    },
    env: {
      // Dedicated test database; created and pushed in globalSetup when DATABASE_URL is set.
      ...(process.env.DATABASE_URL ? {
        DATABASE_URL: (() => {
          const dev = process.env.DATABASE_URL;
          try {
            const url = new URL(dev);
            const name = url.pathname.split('/')
              .filter(Boolean)
              .at(-1);
            const base = name?.endsWith("_test") ? name : `${name}_test`;
            url.pathname = url.pathname.replace(/[^/]*$/, base);
            return url.toString();
          } catch (e) {
            // If invalid URL, fallback to original value.
            return dev;
          }
        })(),
      } : {}),
      LOG_LEVEL: "silent",
    },
  },
});
