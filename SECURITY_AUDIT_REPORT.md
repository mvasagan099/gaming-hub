# Gaming Hub current pre-staging verification

Date: 2026-10-08. Production-source baseline: `8564429`; local recovery harness repair: `a6cc5a3`.

**Verdict: READY FOR STAGING (local). STAGING NOT VERIFIED.** No push, deployment or production database access/writes. Wallet/security production logic unchanged.

| Current suite | Files | Passed | Failed | Skipped |
|---|---:|---:|---:|---:|
| Complete API | 99/99 | 1394 | 0 | 0 |
| Game engine | 27 | 425 | 0 | 0 |
| Multiplayer | 27 | 395 | 0 | 0 |
| Web | 41 | 383 | 0 | 0 |
| Independent security/IDOR | 17 | 188 | 0 | 0 |
| Independent financial concurrency/reconciliation | 4 | 48 | 0 | 0 |
| Independent distributed recovery | 1 | 31 | 0 | 0 |

Recovery also passed 31/31 inside the full API suite. All API files assigned exactly once; zero missing or duplicate files. Subset rows overlap API. Typecheck: PASS, nine workspaces, zero errors. Production build: PASS, with a large AudioManager chunk warning. Fresh disposable local migration: 11 applied, zero failed. No current dependency vulnerability audit was run as part of this verification; historical advisory counts below are not current evidence.

Paced local runs: CPU 17.77–18.80% of one core; event-loop p99 19.25–19.92 ms; peak RSS 180.3–188.3 MiB. Separate unpaced forced-GC retention run: final heap 29.5 MiB, peak RSS 380.8 MiB. These do not prove Render capacity or production OOM resolution.

Only Production services were observed in Render. Isolated staging infrastructure, secrets, test providers and live multiplayer remain unverified. Resource creation/deployment requires approval. See [complete current report](docs/pre-staging-verification-2026-10-08.md), [raw evidence](docs/evidence/pre-staging-2026-10-08/README.md) and [staging preparation](docs/staging-preparation-2026-10-08.md).

---

## Archived 2026-10-03 verification — historical evidence only

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
