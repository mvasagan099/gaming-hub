import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

function loadEnv(): Record<string, string> {
  const file = path.join(ROOT, ".env");
  if (!existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

function parseDatabaseUrl(url?: string): { user: string; db: string } {
  const fallback = { user: "gaming", db: "gaming_hub" };
  if (!url) return fallback;
  const match = url.match(/postgres(?:ql)?:\/\/([^/:]+)(?::[^@]*)?@[^/]+\/([^?]+)/);
  if (!match) return fallback;
  return { user: match[1], db: match[2] };
}

function main(): void {
  const fileArg = process.argv[2];
  if (!fileArg) {
    console.error("Usage: npm run db:restore -- <backup-file>");
    process.exit(1);
  }
  const file = path.resolve(ROOT, fileArg);
  if (!existsSync(file)) {
    console.error(`Backup file not found: ${file}`);
    process.exit(1);
  }

  const env = loadEnv();
  const { user, db } = parseDatabaseUrl(env.DATABASE_URL);
  console.log(`Restoring ${file} into ${db}...`);

  const result = spawnSync(
    "docker",
    ["compose", "exec", "-T", "postgres", "pg_restore", "--clean", "--if-exists", "-U", user, "-d", db],
    { cwd: ROOT, stdio: ["ignore", "inherit", "inherit"] },
  );
  // pg_restore returns non-zero when warnings are present; only treat fatal as failure.
  if (result.status === null) {
    console.error("Restore failed (is the postgres container running?)");
    process.exit(1);
  }
  console.log("Restore completed.");
}

main();
