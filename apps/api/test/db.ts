import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@gaming-hub/db";

import { validateTestDatabaseUrl } from "./databaseSafety";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SCHEMA = path.join(ROOT, "packages", "db", "prisma", "schema.prisma");

export function getTestDatabaseUrl(): string {
  return validateTestDatabaseUrl(process.env.TEST_DATABASE_URL);
}

export async function createTestDatabaseIfMissing(testUrl: string): Promise<void> {
  validateTestDatabaseUrl(testUrl);
  const maintenance = new URL(testUrl);
  maintenance.pathname = "/postgres";
  const client = new PrismaClient({ datasources: { db: { url: maintenance.toString() } } });
  const name = new URL(testUrl).pathname.split("/").filter(Boolean).at(-1);
  try {
    const rows = await client.$queryRawUnsafe<Array<{ datname: string }>>(
      "SELECT datname FROM pg_database WHERE datname = $1",
      name,
    );
    if (rows.length === 0) {
      await client.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
    }
  } finally {
    await client.$disconnect();
  }
}

export function migrateTestDatabase(testUrl: string): void {
  validateTestDatabaseUrl(testUrl);
  execFileSync(
    "npx", ["prisma", "migrate", "deploy", "--schema", SCHEMA],
    {
      env: { ...process.env, DATABASE_URL: testUrl },
      stdio: "pipe",
      cwd: ROOT,
    },
  );
}

const globalForTestPrisma = globalThis as unknown as {
  testPrisma?: PrismaClient;
};

/** Prisma client bound to the test database. Shared across the test process. */
export function getTestPrisma(): PrismaClient {
  if (!globalForTestPrisma.testPrisma) {
    globalForTestPrisma.testPrisma = new PrismaClient({
      datasources: { db: { url: getTestDatabaseUrl() } },
    });
  }
  return globalForTestPrisma.testPrisma;
}

/** Deletes every row from every public table so each test starts clean. */
export async function resetTestDatabase(): Promise<void> {
  const client = getTestPrisma();
  const tables = await client.$queryRawUnsafe<Array<{ tablename: string }>>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE '_prisma%'",
  );
  if (tables.length === 0) return;
  const names = tables.map((t) => `"public"."${t.tablename.replaceAll('"', '""')}"`).join(", ");
  await client.$executeRawUnsafe(`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE`);
}
