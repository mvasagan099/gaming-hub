import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const BACKUP_DIR = path.join(ROOT, "backups");

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
  const env = loadEnv();
  const { user, db } = parseDatabaseUrl(env.DATABASE_URL);

  mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const file = path.join(BACKUP_DIR, `gaming-hub-${stamp}.dump`);

  const result = spawnSync(
    "docker",
    ["compose", "exec", "-T", "postgres", "pg_dump", "-U", user, "-d", db, "-F", "c"],
    { cwd: ROOT, stdio: ["ignore", "pipe", "inherit"] },
  );

  if (result.status !== 0) {
    console.error("Backup failed (is the postgres container running?)");
    process.exit(result.status ?? 1);
  }
  writeFileSync(file, result.stdout);
  console.log(`Backup written to ${file}`);
}

main();
