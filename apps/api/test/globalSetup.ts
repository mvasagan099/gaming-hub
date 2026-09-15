import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import {
  createTestDatabaseIfMissing,
  getTestDatabaseUrl,
  pushSchemaToTestDatabase,
} from "./db";

export default async function globalSetup(): Promise<() => Promise<void>> {
  // globalSetup runs in its own process; load env explicitly.
  const dir = path.dirname(fileURLToPath(import.meta.url));
  loadDotenv({ path: path.join(dir, "..", ".env") });
  if (!process.env.DATABASE_URL) {
    loadDotenv({ path: path.join(dir, "..", "..", "..", ".env") });
  }

  const devUrl = process.env.DATABASE_URL;
  if (!devUrl) throw new Error("DATABASE_URL is required for API tests");

  const testUrl = getTestDatabaseUrl();

  // The test database may not exist yet on a fresh machine.
  await createTestDatabaseIfMissing(devUrl, testUrl);

  // Recreate the schema from the Prisma schema (the repo uses db push, not
  // migrations, so this mirrors how the dev database is kept in sync).
  pushSchemaToTestDatabase(testUrl);

  return async () => {
    // Nothing to tear down; per-test cleanup happens in setupFile.
  };
}
