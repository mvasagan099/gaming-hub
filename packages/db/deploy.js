import { execSync } from "node:child_process";

console.log("==> [Database] Running Prisma migrations...");

function run(cmd) {
  return execSync(cmd, { stdio: "inherit", env: process.env });
}

try {
  run("npx prisma migrate deploy --schema packages/db/prisma/schema.prisma");
  console.log("==> [Database] Migrations deployed successfully.");
} catch (error) {
  console.warn(
    "==> [Database] Initial prisma migrate deploy failed. Checking for unrecovered failed migration (20260918_affiliate_fraud_and_risk)...",
  );
  try {
    // If 20260918_affiliate_fraud_and_risk failed in a prior deployment due to table dependency order,
    // mark it as rolled back so Prisma can re-apply it with the idempotent schema definition.
    run(
      "npx prisma migrate resolve --rolled-back 20260918_affiliate_fraud_and_risk --schema packages/db/prisma/schema.prisma",
    );
    console.log("==> [Database] Successfully rolled back failed migration state. Retrying migrate deploy...");
    run("npx prisma migrate deploy --schema packages/db/prisma/schema.prisma");
    console.log("==> [Database] Migrations deployed successfully after resolving failed migration.");
  } catch (recoverError) {
    console.error(
      "==> [Database] Migration recovery failed; inspect and resolve the database schema explicitly.",
    );
    process.exit(typeof error?.status === "number" ? error.status : 1);
  }
}
