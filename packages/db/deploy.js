import { execSync } from "node:child_process";

console.log("==> [Database] Running Prisma migrations...");

function run(cmd) {
  return execSync(cmd, { stdio: "inherit", env: process.env });
}

try {
  // Attempt normal migrate deploy first
  run("npx prisma migrate deploy --schema packages/db/prisma/schema.prisma");
  console.log("==> [Database] Migrations deployed successfully.");
} catch (deployError) {
  console.warn("==> [Database] prisma migrate deploy failed. Checking if baseline migration needs resolution...");
  try {
    // If the database has an existing schema created prior to Prisma migrations,
    // resolve baseline migration 20260801000000_init as applied
    run("npx prisma migrate resolve --applied 20260801000000_init --schema packages/db/prisma/schema.prisma");
    console.log("==> [Database] Baseline migration 20260801000000_init recorded as applied. Resuming deploy...");
    run("npx prisma migrate deploy --schema packages/db/prisma/schema.prisma");
    console.log("==> [Database] Migrations deployed successfully after baseline resolution.");
  } catch (resolveError) {
    console.error("==> [Database] Migration resolution failed:", resolveError);
    process.exit(1);
  }
}
