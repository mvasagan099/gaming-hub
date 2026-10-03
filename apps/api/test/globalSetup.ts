import {
  createTestDatabaseIfMissing,
  getTestDatabaseUrl,
  migrateTestDatabase,
} from "./db";

export default async function globalSetup(): Promise<() => Promise<void>> {
  const testUrl = getTestDatabaseUrl();
  process.env.DATABASE_URL = testUrl;

  // The test database may not exist yet on a fresh machine.
  await createTestDatabaseIfMissing(testUrl);

  // Apply the same versioned migration chain used at deployment.
  migrateTestDatabase(testUrl);

  return async () => {
    // Nothing to tear down; per-test cleanup happens in setupFile.
  };
}
