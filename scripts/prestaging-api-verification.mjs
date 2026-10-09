/** Persist complete API evidence after deterministic small groups. Local fixtures only. */
import { readdirSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const cwd = join(root, 'apps/api');
const output = resolve(process.argv[2] ?? join(root, 'docs/evidence/pre-staging-2026-10-08/api'));
const db = new URL(process.env.TEST_DATABASE_URL ?? 'invalid:');
const redis = new URL(process.env.TEST_REDIS_URL ?? 'invalid:');
if (!['postgres:', 'postgresql:'].includes(db.protocol) || !['127.0.0.1', 'localhost'].includes(db.hostname) || !/\w+_test$/.test(db.pathname) || !['127.0.0.1', 'localhost'].includes(redis.hostname)) throw new Error('Explicit disposable localhost PostgreSQL and Redis required');
mkdirSync(output, { recursive: true });
const files = [];
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (/\/__tests__\/.*\.test\.ts$/.test(path)) files.push(relative(cwd, path));
  }
}
walk(join(cwd, 'src')); files.sort();
const selection = process.argv[3] ?? 'all';
const filters = { security: /security|idor|mfa|kyc|totp|globalRate|deepLink|password|singleActive|privacy|playerProfile|role/i, financial: /financialConcurrencyAndRecovery|financialReconciliationEngine|financialIdempotency|financialEconomy/ };
if (selection !== 'all') {
  const pattern = filters[selection];
  if (!pattern) throw new Error('Unknown independent suite');
  const selected = files.filter(file => pattern.test(file.split('/').at(-1)));
  files.splice(0, files.length, ...selected);
}
const groups = [], ordinary = [];
for (const file of files) {
  if (/multiReplicaRestartRecovery|tournament.*(Load|Lifecycle|Concurrency|Scheduler)|automaticTournament/i.test(file)) groups.push([file]);
  else ordinary.push(file);
}
for (let i = 0; i < ordinary.length; i += 5) groups.push(ordinary.slice(i, i + 5));
const assigned = groups.flat();
if (assigned.length !== files.length || new Set(assigned).size !== files.length || files.some(f => !assigned.includes(f))) throw new Error('Manifest mismatch');
const manifest = groups.map((files, i) => ({ id: String(i + 1).padStart(2, '0'), files }));
writeFileSync(join(output, 'manifest.json'), JSON.stringify({ discovered: files.length, grouped: assigned.length, missing: [], duplicates: [], groups: manifest }, null, 2));
console.log(JSON.stringify(manifest, null, 2));
const results = [];
for (const group of manifest) {
  const at = Date.now(), report = join(output, `group-${group.id}.json`);
  const child = spawn(process.execPath, [join(root, 'node_modules/vitest/vitest.mjs'), 'run', ...group.files, '--reporter=json', `--outputFile=${report}`], {
    cwd, env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL }, stdio: ['ignore', 'pipe', 'pipe'] });
  // Keep logs local and bounded; do not store arbitrary fixture payloads in Git evidence.
  let tail = '';
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { tail = (tail + chunk).slice(-20000); });
  const exit = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
  let json;
  try {
    const raw = readFileSync(report, 'utf8');
    const sanitized = raw.replace(/((?:postgres(?:ql)?|rediss?):\/\/)[^\s"']+:[^\s"']+@/g, '$1[redacted]@');
    json = JSON.parse(sanitized);
    if (sanitized !== raw) writeFileSync(report, sanitized);
  } catch {}
  const result = { group: group.id, expectedFiles: group.files.length, executedFiles: json?.testResults?.length ?? 0,
    tests: json?.numTotalTests ?? null, passed: json?.numPassedTests ?? null, failed: json?.numFailedTests ?? null,
    skipped: json?.numPendingTests ?? null, exit, durationMs: Date.now() - at, complete: !!json && json.testResults.length === group.files.length };
  results.push(result);
  const aggregate = { expectedFiles: files.length, executedFiles: results.reduce((n, r) => n + r.executedFiles, 0),
    tests: results.reduce((n, r) => n + (r.tests ?? 0), 0), passed: results.reduce((n, r) => n + (r.passed ?? 0), 0),
    failed: results.reduce((n, r) => n + (r.failed ?? 0), 0), skipped: results.reduce((n, r) => n + (r.skipped ?? 0), 0),
    complete: results.length === manifest.length && results.every(r => r.complete), results };
  writeFileSync(join(output, 'aggregate.json'), JSON.stringify(aggregate, null, 2));
  console.log(JSON.stringify(result));
  if (exit !== 0) console.error(tail);
}
process.exitCode = results.every(r => r.exit === 0 && r.failed === 0 && r.complete) ? 0 : 1;
