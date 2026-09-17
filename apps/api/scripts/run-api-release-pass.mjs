import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = decodeURIComponent(new URL('..', import.meta.url).pathname);
const pass = process.argv[2];
if (!['1', '2'].includes(pass)) throw new Error('Usage: node scripts/run-api-release-pass.mjs <1|2>');

const files = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (/__tests__\/.*\.test\.ts$/.test(relative(root, path))) files.push(relative(root, path));
  }
}
walk(join(root, 'src'));
files.sort();

const groups = { A: [], B: [], C: [], D: [], E: [] };
for (const file of files) {
  const name = file.split('/').pop();
  let group = 'E';
  if (/password|mfa|singleActive|deepLink|idor|kyc|security|totp|playerProfile|globalPlatformSearch|globalRateLimiting|smtp|productionSmoke/.test(name)) group = 'A';
  else if (/wallet|coupon|financial|coinWorkflow|productionCoin|insufficientBalance|atomicEntryFee|entryFeeConfirmation/.test(name)) group = 'B';
  else if (/^tournament|^automaticTournament|universalSettlement|centralRefund/.test(name)) group = 'C';
  else if (/match|multiplayer|persistentMatch|matchmaking|unifiedGame|practiceMatch|gameHistory|gameResult|gameCoin|concurrentJoin|universalMatchRoom/.test(name)) group = 'D';
  groups[group].push(file);
}

const c1 = groups.C.filter((file) => /tournaments\.test|tournamentHistory|tournamentPlayerDashboard|tournamentLeaderboardStats/.test(file));
const c2 = groups.C.filter((file) => /automaticTournamentManagement|tournamentAdminControlCenter|tournamentAdminManagementSystem|tournamentAnalyticsReporting|tournamentNotificationSystem|tournamentEmailService/.test(file));
const c3 = groups.C.filter((file) => /tournamentCrashRecovery|tournamentLoadPerformanceSimulation|tournamentRegistrationAntiAbuse|tournamentSeedingBracket/.test(file));
const c4 = groups.C.filter((file) => ![...c1, ...c2, ...c3].includes(file));
const splitC = [...c1, ...c2, ...c3, ...c4];
const duplicates = Object.values(groups).flat().filter((file, index, all) => all.indexOf(file) !== index);
const missingC = groups.C.filter((file) => !splitC.includes(file));
const duplicateC = splitC.filter((file, index) => splitC.indexOf(file) !== index);

const evidenceDir = join(root, 'release-evidence');
mkdirSync(evidenceDir, { recursive: true });
const evidencePath = join(evidenceDir, `api-pass-${pass}.json`);
const evidence = {
  pass: Number(pass),
  startedAt: new Date().toISOString(),
  manifest: groups,
  manifestCheck: {
    discovered: files.length,
    grouped: Object.values(groups).flat().length,
    duplicates,
    missingC,
    duplicateC,
  },
  cSubgroups: { C1: c1, C2: c2, C3: c3, C4: c4 },
  results: [],
};

function persist() {
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
}
persist();
console.log(JSON.stringify({ manifest: groups, cSubgroups: evidence.cSubgroups, check: evidence.manifestCheck }, null, 2));
if (files.length !== 76 || duplicates.length || missingC.length || duplicateC.length) {
  throw new Error('API manifest integrity check failed');
}

const jobs = [
  ['A', groups.A],
  ['B', groups.B],
  ['C1', c1],
  ['C2', c2],
  ...c3.map((file, index) => [`C3.${index + 1}`, [file]]),
  ...c4.map((file, index) => [`C4.${index + 1}`, [file]]),
  ['D', groups.D],
  ['E', groups.E],
];

for (const [name, jobFiles] of jobs) {
  const outputFile = join(evidenceDir, `api-pass-${pass}-${name.replaceAll('.', '-')}.json`);
  const started = Date.now();
  const run = spawnSync(
    'npx',
    ['vitest', 'run', ...jobFiles, '--reporter=json', `--outputFile=${outputFile}`],
    { cwd: root, encoding: 'utf8', timeout: 240_000, maxBuffer: 30 * 1024 * 1024, env: process.env },
  );
  let report = {};
  try { report = JSON.parse(readFileSync(outputFile, 'utf8')); } catch {}
  const result = {
    group: name,
    files: jobFiles.length,
    testFilesPassed: report.numPassedTestSuites ?? null,
    testFilesFailed: report.numFailedTestSuites ?? null,
    tests: report.numTotalTests ?? null,
    passed: report.numPassedTests ?? null,
    failed: report.numFailedTests ?? (run.status === 0 ? 0 : null),
    skipped: report.numPendingTests ?? null,
    durationMs: Date.now() - started,
    exit: run.status,
    timedOut: run.error?.code === 'ETIMEDOUT',
    stderrTail: run.stderr?.slice(-4000) ?? '',
  };
  evidence.results.push(result);
  persist();
  console.log(JSON.stringify(result));
  if (run.status !== 0) {
    evidence.completedAt = new Date().toISOString();
    evidence.status = 'FAIL';
    persist();
    process.exit(run.status ?? 1);
  }
}

evidence.totals = evidence.results.reduce((total, result) => ({
  files: total.files + result.files,
  tests: total.tests + result.tests,
  passed: total.passed + result.passed,
  failed: total.failed + result.failed,
  skipped: total.skipped + result.skipped,
}), { files: 0, tests: 0, passed: 0, failed: 0, skipped: 0 });
evidence.completedAt = new Date().toISOString();
evidence.status = evidence.totals.files === 76 && evidence.totals.failed === 0 ? 'PASS' : 'FAIL';
persist();
console.log(JSON.stringify({ status: evidence.status, totals: evidence.totals }, null, 2));
if (evidence.status !== 'PASS') process.exit(1);
