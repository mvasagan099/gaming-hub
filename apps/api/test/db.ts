import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@gaming-hub/db";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SCHEMA = path.join(ROOT, "packages", "db", "prisma", "schema.prisma");

export function getTestDatabaseUrl(): string {
  const dev = process.env.DATABASE_URL;
  if (!dev) throw new Error("DATABASE_URL is required for API tests");
  // Point at a dedicated test database derived from the dev database name.
  const url = new URL(dev);
  const name = url.pathname.split("/").filter(Boolean).at(-1);
  if (!name) throw new Error("DATABASE_URL has no database name");
  url.pathname = url.pathname.replace(/[^/]*$/, `${name}_test`);
  return url.toString();
}

export async function createTestDatabaseIfMissing(devUrl: string, testUrl: string): Promise<void> {
  const client = new PrismaClient({ datasources: { db: { url: devUrl } } });
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

export function pushSchemaToTestDatabase(testUrl: string): void {
  execSync(
    `npx prisma db push --schema "${SCHEMA}" --skip-generate --accept-data-loss`,
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
  const names = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
  await client.$executeRawUnsafe(`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE`);
}
