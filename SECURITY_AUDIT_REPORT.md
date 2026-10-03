# Gaming Hub current security verification

Date: 2026-10-03. Baseline commit: `8507d07234bc307096f266c35a3480e9ab125ec9`, branch `main`. Results below verify the uncommitted readiness fixes on that baseline, not a deployed release.

**Dependency audit: PASS — 0 known vulnerabilities in full and production dependency audits.**

**Verdict: NOT PRODUCTION READY. Repository fixes are verified; actual hosting headers and real staging business/recovery flows remain pending. No deployment, push or production database access was performed.**

| Current check | Result |
|---|---|
| API aggregate pass #1 | 87/87 files; 1222/1222 PASS; failed 0; skipped 0 |
| API aggregate pass #2, clean DB | 87/87 files; 1222/1222 PASS; failed 0; skipped 0 |
| Security selection, both passes | 44 files; 630/630 PASS each |
| All tournament/tier-named tests, both passes | 23 files; 531/531 PASS each |
| Tournament routes | 61/61 PASS each pass |
| Tier combinations | 93/93 PASS each pass |
| Wallet routes | 11/11 PASS each pass |
| Financial concurrency/reconciliation/idempotency | 32/32 PASS each pass |
| Privacy | 12/12 PASS each pass |
| Game engine | 24 files; 329/329 PASS |
| Multiplayer | 9 files; 89/89 PASS |
| Web | 3 files; 22/22 PASS |
| TypeScript | PASS, 9 workspaces, 0 errors |
| Build | PASS; large shared rendering/audio chunk remains |
| Fresh migration | PASS, all 7 migrations, no schema difference |
| Controlled six-to-seven upgrade | PASS, fixture user/wallet/ledger preserved |
| Local API/socket images | PASS: builds, non-root runtime, startup, health, framework imports and migration CLI |
| Capacitor Android / iOS sync | PASS in isolated copies; signed builds/device callbacks not certified |
| Known runtime dependency Critical / High advisories | 0 / 0 |
| Production DB touched | NO |

Both API aggregates cover every discovered file exactly once, with zero missing or duplicate files. Before pass #2, all 95 application tables in the isolated localhost audit database were emptied through the guarded test reset. API subset rows overlap and are not extra tests.

The first aggregate includes a rerun of five corrected tier fixtures that previously expected destructive active-bracket rebuilding, plus refreshed email groups for the final sanitization regression. The second aggregate ran all groups again from clean database state. The full [fix report](READINESS_FIX_REPORT.md) records initial failures, fixes, test-harness limits and pending staging evidence.

Current evidence: [verification summary](security-reports/2026-10-03-readiness-fixes/verification-summary.json), [manifest](security-reports/2026-10-03-readiness-fixes/full-api-manifest.json), [pass #1](security-reports/2026-10-03-readiness-fixes/api-pass-1/aggregate.json), [pass #2](security-reports/2026-10-03-readiness-fixes/api-pass-2/aggregate.json).

Hosting changes are prepared in [the staging checklist](STAGING_SECURITY_FIX_VERIFICATION.md) and have not been applied to a live site. Mocked financial/email tests do not prove real provider transactions or delivery. Dedicated job locks require a direct/session connection to the same database; network-partition fencing and operational recovery still require staging verification.

Original baseline audit: [PRODUCTION_READINESS_REPORT.md](PRODUCTION_READINESS_REPORT.md). Earlier remediation history: [SECURITY_REMEDIATION_REPORT.md](SECURITY_REMEDIATION_REPORT.md). Historical results are not substituted for the current evidence above.
