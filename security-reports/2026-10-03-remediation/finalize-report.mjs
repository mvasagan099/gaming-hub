import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const dir='security-reports/2026-10-03-remediation';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const manifest=read(dir+'/full-api-manifest.json');
function aggregate(pass){
 const summary=read(dir+'/api-pass-'+pass+'/summary.json');
 const seen=new Set(),records=[];
 for(const [group,expected] of Object.entries(manifest.groups)){
  const s=summary.find(x=>x.group===group);
  if(!s || s.exitCode!==0 || s.failed!==0)throw new Error(pass+': failed or missing group '+group);
  const report=read(dir+'/api-pass-'+pass+'/'+group+'.json');
  if(report.testResults.length!==expected.length)throw new Error('File count mismatch '+group);
  for(const file of report.testResults){
   const name=file.name.replace(process.cwd()+'/apps/api/','');
   if(!expected.includes(name) || seen.has(name))throw new Error('Unexpected/duplicate file '+name);
   seen.add(name);
   const statuses=file.assertionResults.map(a=>a.status);
   const r={file:name,tests:statuses.length,passed:statuses.filter(s=>s==='passed').length,failed:statuses.filter(s=>s==='failed').length,skipped:statuses.filter(s=>s!=='passed' && s!=='failed').length};
   if(r.failed)throw new Error('Failed file '+name);
   records.push(r);
  }
 }
 if(seen.size!==manifest.discovered || manifest.missing.length || manifest.duplicates.length)throw new Error('Incomplete manifest coverage');
 const total={files:records.length,tests:0,passed:0,failed:0,skipped:0,durationSeconds:summary.reduce((n,g)=>n+g.durationSeconds,0),missing:[],duplicates:[],pass:true};
 for(const r of records)for(const k of ['tests','passed','failed','skipped'])total[k]+=r[k];
 fs.writeFileSync(dir+'/api-pass-'+pass+'/aggregate.json',JSON.stringify({...total,groups:summary,records},null,2));
 return {...total,records};
}
const p1=aggregate('final1'),p2=aggregate('final2');
if(JSON.stringify(p1.records.sort((a,b)=>a.file.localeCompare(b.file)))!==JSON.stringify(p2.records.sort((a,b)=>a.file.localeCompare(b.file))))throw new Error('Repeat execution totals differ');
const subset=(names)=>{const rs=p2.records.filter(r=>names.includes(r.file));if(rs.length!==names.length)throw new Error('Missing subset file');return {files:rs.length,tests:rs.reduce((n,r)=>n+r.tests,0),passed:rs.reduce((n,r)=>n+r.passed,0),failed:rs.reduce((n,r)=>n+r.failed,0),skipped:rs.reduce((n,r)=>n+r.skipped,0)};};
const old=read('security-reports/2026-10-03/test-manifest.json');
const securityFiles=[...old.units,...old.auth,...old.finance,...old.privacy_abuse,'src/services/__tests__/auditRemediation.test.ts','src/services/__tests__/securityRemediationHardening.test.ts'];
const security=subset(securityFiles),probes=subset(['src/services/__tests__/auditRemediation.test.ts']),hardening=subset(['src/services/__tests__/securityRemediationHardening.test.ts']);
const selected={security,probes,hardening,tournament:subset(['src/routes/__tests__/tournaments.test.ts']),tiers:subset(['src/services/__tests__/allGameTierCombinations.test.ts']),wallet:subset(['src/routes/__tests__/wallet.test.ts']),finance:subset(['src/services/__tests__/financialConcurrencyAndRecovery.test.ts','src/services/__tests__/financialReconciliationEngine.test.ts','src/services/__tests__/financialIdempotency.test.ts']),privacy:subset(['src/services/__tests__/playerProfileSystem.test.ts'])};
const packages=read(dir+'/package-summary.json'),migrations=read(dir+'/migration-summary.json'),dependency=read(dir+'/dependency-audit-final.json'),productionDependency=read(dir+'/dependency-audit-production-final.json');
if(packages.some(x=>x.exitCode!==0 || x.failed!==0) || migrations.results.some(x=>x.exitCode!==0) || dependency.metadata.vulnerabilities.total || productionDependency.metadata.vulnerabilities.total)throw new Error('Regression/migration/dependency gate failure');
const revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const diff=execFileSync('git',['diff','--binary','--','apps','packages','package.json','package-lock.json']);
const hash=createHash('sha256').update(diff);
const additions=execFileSync('git',['ls-files','--others','--exclude-standard'],{encoding:'utf8'}).trim().split('\n').filter(f=>/^(apps|packages)\//.test(f));
for(const file of additions.sort())hash.update(file).update(fs.readFileSync(file));
const snapshot=hash.digest('hex');
const counts=r=>`${r.passed}/${r.tests}`;
const row=(label,r)=>`| ${label} | ${r.files} | ${r.tests} | ${r.passed} | ${r.failed} | ${r.skipped} | PASS |`;
const report=`# Gaming Hub security remediation — current verification

Date: 2026-10-03  
Base commit: \`${revision}\` (main), plus the uncommitted remediation working tree.  
Source snapshot SHA-256 (tracked app/package/manifest patch + new app/package files): \`${snapshot}\`  
**Dependency audit: PASS** — zero Critical, High, Moderate, Low advisories in both installed and production-tree scans.  
**Verdict: NOT PRODUCTION READY** — local fixes pass; actual static-host header rollout and staging verification remain pending.

## Implemented fixes

| Finding | Result | Change and current evidence |
|---|---|---|
| S1 external success followed by local failure | FIXED | External outcome handling is separated from completion/notification work. Notification failure cannot refund; a completion-write failure stays held for reconciliation. |
| S2 blind refund of unknown outcome | FIXED | Pending/unknown/malformed/unreachable status checks stay held. Only proven success or definitive non-processing reaches a terminal outcome. Generic HTTP 409 alone remains unsafe. |
| S3 held request not discoverable | FIXED | New requests persist WalletRequest.id as the provider identity. Lookup and batch recovery also support legacy external IDs/notes and stale processing claims. |
| S4 optional authentication bypass | FIXED | Optional identity must pass the same session and login-MFA eligibility checks; rejected identity becomes anonymous. |
| S5 missing admin fresh MFA | FIXED | Financial/security admin mutations retain permission checks and add fresh-MFA gates. Privileged/custom roles must enroll MFA. Read-only pages retain their existing authorization. |
| S6 fee lost on refund | FIXED | Principal and fee reverse through the ledger in the same locked transaction as final state. Repeated/concurrent resolution does not duplicate value; stale claims are fenced. |
| S7 email verification default/trust | FIXED | Production defaults verification on. API and socket use the shared trusted-claim/Auth-user check and ignore user-editable verification metadata. |
| S8 process-local budgets | FIXED | Production HTTP/account budgets use atomic PostgreSQL windows and fail closed. HTTP verification across two instances returns 200,200,429; restart remains limited, expiry resets, outage returns 500. Metrics use bounded labels. A final failing HTTP probe also exposed a commented-out proxy-hop option; the patched Fastify also refuses numeric-only trust. The API now requires explicit trusted proxy CIDRs and enforces the hop bound; empty/untrusted/direct peers ignore forwarded headers. Trusted, direct, untrusted and spoofed-chain regressions pass. Review staging proxy configuration before release. |
| S9 silent migration drift/recovery | FIXED | Automatic migration resolution removed. Pre/post catalog validation plus migration seven reject column/type/null/default, key/index/constraint and enum drift in the earlier affiliate/referral compatibility paths. Six applied migration files/checksums are unchanged. |
| S10 deployed frontend headers | CONFIGURATION PREPARED; PENDING | API Permissions-Policy added. Render static-site header fragment and staging rollout guide are provided. Actual deployed frontend settings were not changed or re-certified. |
| S11 unsafe test DB fallback | FIXED | Explicit localhost TEST_DATABASE_URL ending in _test is required before initialization. Remote/app DB fallback is refused. Setup applies migrations; no data-loss schema push. |
| Additional legacy login-MFA defect | FIXED | Verification requires authentication and matching user identity, stamps only the current unrevoked/unexpired session, and cannot revive revoked sessions or verify another user's token. Both verification endpoints share the account budget. |
| KYC persistence regression | FIXED | Required profile backfill is awaited before returning. |

Withdrawal gameplay/business policy is preserved: new valid requests auto-transfer in the current implementation; legacy pending admin-approval records remain supported. No admin approval requirement, deposit policy, game rule, affiliate rule, or production data migration was introduced. Held transfers cannot be cancelled/rejected/reapproved blindly. Request outcome uses existing status model: APPROVED + COMPLETED, REJECTED + REFUNDED, or PENDING + UNCONFIRMED_HOLD.

## Current execution evidence

All **${manifest.discovered}** API test files were assigned exactly once in the deterministic manifest: 83 original files plus two new regression files. Every subgroup persisted its own JSON result and log. All discovered supported API files ran twice on the final source. Unit-only files use the unit configuration; integration files use PostgreSQL. No monolithic timeout result or historical count is substituted.

| Check | Files | Tests | Passed | Failed | Skipped | Result |
|---|---:|---:|---:|---:|---:|---|
${row('Full API pass #1',p1)}
${row('Full API pass #2 after clean DB',p2)}
${row('Security selection including all original 40 files + new regressions (subset of each full pass)',security)}
${row('Original nine reproduced audit safeguards',probes)}
${row('Additional hardening regressions',hardening)}
${row('Tournament routes',selected.tournament)}
${row('All game/tier combinations',selected.tiers)}
${row('Wallet routes',selected.wallet)}
${row('Financial concurrency/reconciliation/idempotency',selected.finance)}
${row('Public profile/privacy',selected.privacy)}
${packages.map(r=>row('Full '+r.name+' suite',r)).join('\n')}

These subset rows overlap the full API passes and must not be added to aggregate totals. Both passes have **0 missing files, 0 duplicate files, 0 failed tests**. Pass #2 reset all application tables only in 127.0.0.1:5541/gaming_hub_remediation_20261003_test; migration history was preserved. Fixtures fund zero-default wallets explicitly through the ledger. Legacy wallet/provider/tournament/search/leaderboard fixture corrections preserve security assertions; they do not loosen 409, ownership, locking, or idempotency behavior.

- MFA evidence includes source inventory of financial/security mutations plus representative route execution and existing lifecycle/RBAC tests; it is not an exhaustive authenticated production-route penetration test.
- Prisma Client generation: **PASS**, retained CLI/client 6.19.3 with the patched dependency override; prisma-generate-final.log.
- Workspace TypeScript: **PASS**, all nine configured workspaces, zero errors; typecheck-final.log.
- Repository build: **PASS**, exit 0; build-final.log. Vite reports the existing >500 KB game chunk performance warning and ignored esbuild settings under its current oxc backend; these are recorded, not claimed fixed.
- Fresh disposable migrations: **PASS**, all seven migrations; zero schema difference.
- Controlled existing-database upgrade: **PASS**, six-migration baseline upgraded to seven; user/wallet/ledger counts and MAIN 100 fixture preserved; zero schema difference. This is not a restored production backup drill.
- Wallet defaults: MAIN **0**, BONUS **0**, LOCKED **0**.
- Drift rejection: seven rolled-back negative DDL probes cover types, nullability, defaults, foreign keys, unique indexes, index definitions, enum drift.
- Shared HTTP budget check: **PASS**, combined requests, restarted instance, expiry and controlled database outage; http-rate-limit-check.json.
- Changed/new source, evidence and current frontend bundle checked against configured private values: **no confirmed credential leaks**. Two matches were existing denied development-key placeholders in production validation blacklists; no values were printed. This exact-value check is not an exhaustive history scan.
- Production database touched: **NO**. Deployment performed: **NO**. Git push performed: **NO**.

## Dependency changes and compatibility

Unused firebase-admin/bull-arena/node-cron dependencies were removed after confirming no active imports, removing their vulnerable transitive trees without introducing a new implementation. Fastify and DOMPurify were patched. Vitest moved to the reviewed 4.x line, with worker configuration updated. Scoped overrides patch brace-expansion, fast-uri, qs, deepmerge-ts and xcode's uuid. Prisma CLI/client remain 6.19.3; generation, fresh/upgrade migration and schema-diff verification passed with deepmerge-ts 8. No forced Prisma prerelease upgrade or Capacitor downgrade was used. Xcode project parse/UUID generation/serialization compatibility was checked. Nodemailer remains installed and has no current advisory.

Installed and production dependency audits: **Critical 0, High 0, Moderate 0, Low 0**. There are no remaining dev-only advisory exceptions to justify. No npm audit fix --force was run. Zero npm advisories does not prove the absence of all application defects.

## Remaining staging/release work

1. Apply the prepared headers to the actual **staging** static site, verify response headers, then tune and enforce the fuller CSP against the exact staging API/socket/Supabase/asset origins. Source configuration alone does not close S10. [Render header guidance](https://render.com/docs/static-sites#custom-response-headers).
2. Run real staging Supabase login/MFA/recovery, email delivery, CouponVault coupon/withdrawal/reconciliation and mobile/two-device multiplayer smoke tests. Provider tests here use controlled local mocks/HTTP servers, not live CouponVault certification.
3. Complete production-like backup/restore, multi-instance scheduler/resource/load and Redis/provider outage drills before deployment review. Existing process-local tournament scheduling coordination and full dev-tooling Docker packaging remain audit observations requiring staging/runtime review; this task does not claim them certified.

No production configuration, live secrets or financial/historical rows were modified. No further production action was taken automatically.

## Evidence files

- [Manifest](${dir}/full-api-manifest.json)
- [API pass #1](${dir}/api-pass-final1/aggregate.json)
- [API pass #2](${dir}/api-pass-final2/aggregate.json)
- [Clean database evidence](${dir}/clean-state-before-pass2.json)
- [Package suites](${dir}/package-summary.json)
- [Migrations/upgrade](${dir}/migration-summary.json)
- [Installed dependency scan](${dir}/dependency-audit-final.json)
- [Production dependency scan](${dir}/dependency-audit-production-final.json)
- [Rollout instructions](docs/SECURITY_REMEDIATION_ROLLOUT.md)

**Final verdict: NOT PRODUCTION READY. Local remediation and verification PASS; staging hosting/smoke evidence remains required.**
`;
fs.writeFileSync('SECURITY_REMEDIATION_REPORT.md',report);
fs.writeFileSync(dir+'/release-summary.json',JSON.stringify({revision,sourceSnapshotSha256:snapshot,apiPass1:p1,apiPass2:p2,selected,packages,migrations,dependencyAudit:'PASS',critical:0,high:0,moderate:0,low:0,productionDbTouched:false,verdict:'NOT PRODUCTION READY',reason:'Actual static-host headers and staging smoke certification pending'},null,2));
const previous='security-reports/2026-10-03/previous-security-audit-report.md';
if(!fs.existsSync(previous))fs.copyFileSync('SECURITY_AUDIT_REPORT.md',previous);
fs.writeFileSync('SECURITY_AUDIT_REPORT.md',`# Gaming Hub current security verification\n\nDate: 2026-10-03. Base commit: \`${revision}\` plus the remediation working tree.\n\n**Dependency audit: PASS — 0 vulnerabilities.**\n\n**Verdict: NOT PRODUCTION READY** — actual frontend hosting headers and staging smoke verification remain pending. No deployment or production DB change was performed.\n\n| Current check | Result |\n|---|---|\n| API pass #1 | ${p1.files}/${manifest.discovered} files; ${counts(p1)} PASS; failed ${p1.failed}; skipped ${p1.skipped} |\n| API pass #2, clean DB | ${p2.files}/${manifest.discovered} files; ${counts(p2)} PASS; failed ${p2.failed}; skipped ${p2.skipped} |\n| Security selection, both passes | ${counts(security)} PASS each |\n| Tournament routes | ${counts(selected.tournament)} PASS |\n| Tier combinations | ${counts(selected.tiers)} PASS |\n| Wallet routes | ${counts(selected.wallet)} PASS |\n| Financial concurrency/reconciliation/idempotency | ${counts(selected.finance)} PASS |\n| Privacy | ${counts(selected.privacy)} PASS |\n${packages.map(r=>`| ${r.name} | ${counts(r)} PASS |`).join('\n')}\n| TypeScript | PASS, 9 workspaces, 0 errors |\n| Build | PASS |\n| Fresh migration | PASS, 7 migrations, no schema difference |\n| Controlled six-to-seven upgrade | PASS, ledger preserved |\n| Runtime dependency Critical / High | 0 / 0 current npm advisories |\n| Production DB touched | NO |\n\nFull implementation, limitations and evidence: [current remediation report](SECURITY_REMEDIATION_REPORT.md). Original pre-fix findings: [audit report](SECURITY_VULNERABILITY_REPORT.md). Historical audit report preserved [here](${previous}). Historical counts are not current evidence.\n`);
const original=fs.readFileSync('SECURITY_VULNERABILITY_REPORT.md','utf8');
if(!original.startsWith('> Remediation update'))fs.writeFileSync('SECURITY_VULNERABILITY_REPORT.md',`> Remediation update, 2026-10-03: this is the preserved **pre-fix** audit. Its failed tests and dependency counts describe the baseline. See [current implementation and verification](SECURITY_REMEDIATION_REPORT.md): two complete API passes, dependency audit PASS with zero advisories, local fixes verified. Actual frontend hosting headers and staging checks remain pending; no production deployment was performed.\n\n`+original);
console.log(JSON.stringify({apiPass1:{files:p1.files,tests:p1.tests,passed:p1.passed,failed:p1.failed,skipped:p1.skipped},apiPass2:{files:p2.files,tests:p2.tests,passed:p2.passed,failed:p2.failed,skipped:p2.skipped},selected},null,2));
