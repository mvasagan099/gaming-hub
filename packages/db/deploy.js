import { execSync } from "node:child_process";

console.log("==> [Database] Running Prisma migrations...");

function run(cmd) {
  return execSync(cmd, { stdio: "inherit", env: process.env });
}

// Never auto-baseline an existing database. A failed migration can indicate
// schema drift, a broken migration, or an unavailable database; marking the
// baseline as applied would hide all three. Legacy databases must be inspected
// and baselined explicitly after their complete schema has been verified.
try {
  run("npx prisma migrate deploy --schema packages/db/prisma/schema.prisma");
  console.log("==> [Database] Migrations deployed successfully.");
} catch (error) {
  console.error(
    "==> [Database] Migration failed. Refusing automatic baseline recovery; inspect and resolve the database schema explicitly.",
  );
  process.exit(typeof error?.status === "number" ? error.status : 1);
}
