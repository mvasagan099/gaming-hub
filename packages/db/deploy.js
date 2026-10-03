import { execFileSync } from "node:child_process";

console.log("==> [Database] Checking existing schema and deploying migrations...");
try {
  execFileSync(process.execPath, ["packages/db/validate-schema.js", "--existing"], { stdio: "inherit", env: process.env });
  execFileSync("npx", ["prisma", "migrate", "deploy", "--schema", "packages/db/prisma/schema.prisma"], { stdio: "inherit", env: process.env });
  execFileSync(process.execPath, ["packages/db/validate-schema.js"], { stdio: "inherit", env: process.env });
  console.log("==> [Database] Schema verified and migrations deployed.");
} catch {
  console.error("==> [Database] Deployment stopped. Inspect schema drift/failed migration before an explicit reviewed recovery; no automatic migrate resolve.");
  process.exit(1);
}
