/** Reject unsafe targets before Prisma is initialized or reset operations run. */
export function validateTestDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error("Explicit TEST_DATABASE_URL is required; application DATABASE_URL is never used as a fallback.");
  const url = new URL(value);
  if (!["postgresql:", "postgres:"].includes(url.protocol) ||
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    throw new Error("API test database must be disposable PostgreSQL on localhost; remote targets are refused.");
  }
  const name = decodeURIComponent(url.pathname.slice(1));
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*_test$/.test(name)) {
    throw new Error("Disposable API test database name must end in _test and contain only SQL identifier characters.");
  }
  if (url.searchParams.has("schema") && url.searchParams.get("schema") !== "public") {
    throw new Error("API test database must use the public schema.");
  }
  return url.toString();
}
