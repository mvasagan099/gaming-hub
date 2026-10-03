# Gaming Hub production readiness check

> This is the original audit of commit `8507d07`. Repository fixes and their new verification evidence are tracked in [READINESS_FIX_REPORT.md](READINESS_FIX_REPORT.md); findings below describe the pre-fix baseline. Production has not been modified.

Date: 2026-10-03. Audited commit: `8507d07234bc307096f266c35a3480e9ab125ec9` on `main`.

## Verdict

**NOT PRODUCTION READY. Local verification passes; deployment protections and operational verification remain incomplete.**

No application logic, dependencies, migration files, deployment settings, or financial records were changed during this audit. No deployment or Git push was performed. This report and its evidence are new audit artifacts.

The working tree was clean at the first source-control check. The saved baseline was captured after the evidence directory was created, so it lists that directory as untracked. The audited commit remained unchanged throughout verification.

## Current verification results

All results below were generated during this check; historical results were not substituted.

| Gate | Files | Passed / total | Failed | Skipped | Result |
|---|---:|---:|---:|---:|---|
| Entire API pass #1 | 85 | 1197 / 1197 | 0 | 0 | PASS |
| Entire API pass #2 after database reset | 85 | 1197 / 1197 | 0 | 0 | PASS |
| Security selection, each API pass | 42 | 605 / 605 | 0 | 0 | PASS |
| All tournament/tier-named API tests, each pass | 22 | 527 / 527 | 0 | 0 | PASS |
| Tournament routes, each pass | 1 | 61 / 61 | 0 | 0 | PASS |
| Tier combinations, each pass | 1 | 93 / 93 | 0 | 0 | PASS |
| Wallet routes, each pass | 1 | 11 / 11 | 0 | 0 | PASS |
| Financial concurrency, reconciliation, idempotency, each pass | 3 | 32 / 32 | 0 | 0 | PASS |
| Player profile/privacy, each pass | 1 | 12 / 12 | 0 | 0 | PASS |
| Entire game-engine suite | 24 | 329 / 329 | 0 | 0 | PASS |
| Entire multiplayer package suite | 9 | 89 / 89 | 0 | 0 | PASS |
| All discovered web tests | 3 | 22 / 22 | 0 | 0 | PASS |
| Workspace typecheck | 9 workspaces | 0 errors | — | — | PASS |
| Repository build | All configured build targets | Successful | — | — | PASS with warnings below |
| Android Capacitor sync, isolated copy | — | Successful | — | — | PASS |
| iOS Capacitor sync, isolated copy | — | Successful | — | — | PASS |

The security, tournament, wallet, finance, and privacy rows are overlapping subsets of the API runs, not additional tests. One API pass plus the three other suites covers **121 test files and 1637 tests**. The second API pass repeats its 1197 tests. Native sync does not establish a signed APK/IPA build or successful device behavior.

The current API inventory is **85 files**, rather than the historical 76. All files were assigned exactly once to 29 deterministic groups. Both passes executed 85/85, with zero missing or duplicate files. Pass #1 took 467.013 seconds across its groups; pass #2 took 444.994 seconds. Group logs and JSON results were persisted after each group.

Evidence: [manifest](security-reports/2026-10-03-readiness-8507d07/full-api-manifest.json), [pass #1](security-reports/2026-10-03-readiness-8507d07/api-pass-1/aggregate.json), [pass #2](security-reports/2026-10-03-readiness-8507d07/api-pass-2/aggregate.json), [all current totals and security file selection](security-reports/2026-10-03-readiness-8507d07/verification-summary.json).

## Dependency audit

**Dependency audit: PASS.**

Both `npm audit --audit-level=high` and `npm audit --omit=dev --audit-level=high` exited successfully. Each reported Critical 0, High 0, Moderate 0, Low 0, total 0. No exceptions or forced fixes were used.

Installed packages specifically checked: `nodemailer@10.0.10`, `prisma@6.19.3`, `@prisma/client@6.19.3`, and the overridden `deepmerge-ts@8.0.0` under `@prisma/config`. There are no remaining High advisories to triage in these audit results.

These counts describe known dependency advisories at audit time. They do not certify that application logic has no vulnerabilities.

Evidence: [all dependencies](security-reports/2026-10-03-readiness-8507d07/dependency-audit.json), [production dependencies](security-reports/2026-10-03-readiness-8507d07/dependency-audit-production.json).

## Database and migration safety

All database tooling targeted a disposable PostgreSQL instance at **127.0.0.1:5541**. The API database was `gaming_hub_readiness_8507d07_test`. Integration tests used explicit test URLs; application database credentials were not used as a fallback. Root environment values were cleared or replaced with local dummy configuration in the API runner.

Before pass #2, the project's guarded `resetTestDatabase()` emptied all **95 application tables**, preserving migration metadata. Saved counts verify every application table was empty.

| Migration/restore check | Result |
|---|---|
| Fresh database through `packages/db/deploy.js` and `prisma migrate deploy` | PASS: all 7 migrations finished |
| Fresh database compared with current Prisma schema | PASS: no schema difference, exit 0 |
| Six-migration baseline upgraded to seven migrations | PASS |
| Controlled upgrade preservation | PASS: user, wallet, ledger transaction and MAIN 100 preserved |
| Upgraded schema compared with Prisma | PASS: no schema difference |
| New wallet defaults | PASS: MAIN 0, BONUS 0, LOCKED 0 |
| Synthetic database backup and restoration | PASS: all table counts and constraint definitions match; wallet preserved |
| Backup/restore duration | 3.4 seconds for the small synthetic fixture |
| Negative schema-drift probes | PASS: type, nullability, default, primary key, foreign key, unique index and ordinary index differences all rejected |

The deployment script validates existing definitions before applying migrations and validates again afterward. It does not automatically resolve failed migrations. The affiliate/referral guard checks column types, nullability and defaults, constraint definitions/validation, index definitions/validity/readiness, and enum labels. Current security tests also reject unexpected enum changes. Fresh/upgrade comparisons cover the resulting whole Prisma schema.

This is a controlled upgrade and restore drill, **not a restoration of a production-like backup containing all business entities**. A realistic staging restore remains required before production approval. The drift probes ran on the restored disposable database and rolled back each injected change.

Evidence: [migration summary](security-reports/2026-10-03-readiness-8507d07/migration-summary.json), [reset proof](security-reports/2026-10-03-readiness-8507d07/database-reset.json), [restore/drift proof](security-reports/2026-10-03-readiness-8507d07/restore-drift-summary.json).

**Production database directly accessed or targeted by database tooling: NO.** Public HTTP probes were unauthenticated reads/preflights; these can generate ordinary hosting logs or rate-limit counters. No production account, wallet, match, tournament, or financial mutation was requested.

## Game catalog and Cricket removal

The canonical shared catalog, frontend game switch, engine registry, and multiplayer configuration retain these nine games:

Ludo, Chess, Carrom, Snake & Ladder, Fruit Ninja, Bubble Shooter, Table Tennis, Snake vs Worms, Snooker.

Cricket has no frontend game entry, game component import, registered engine, multiplayer game configuration, or Cricket-named active asset found in `apps`/`packages`. An unknown game slug follows the unavailable-game path instead of creating an engine. The tier test explicitly rejects `isGameId("cricket")`.

Remaining source references were reviewed and classified:

| Location | Classification |
|---|---|
| `packages/shared/src/history.ts` | Historical statistics compatibility |
| `apps/api/src/services/gameHistoryService.ts` | Archived match statistics |
| `apps/web/src/components/MatchHistory/MatchHistoryView.tsx` | Historical display: “Cricket — no longer available” |
| Tournament history/email tests and global history tests | Historical data fixtures/compatibility |
| `allGameTierCombinations.test.ts` | Negative retired-game validation |
| Old JSON test reports and audit documentation | Historical evidence, not executable registration |

Current engine tests pass, including the recent Carrom controls/pocket changes. This is repository and automated-test evidence; all nine games were not manually exercised on real mobile devices during this check.

## Security and financial flow evidence

The current tests cover login-time MFA isolation, fresh/stale MFA, session revocation, ownership checks, admin financial gates, KYC, shared PostgreSQL rate limits, privacy persistence, coupon conflicts, and financial concurrency/recovery. Source review confirms socket authentication checks session validity and pending MFA; this does not replace a real deployed two-client smoke test.

Specific current negative/regression tests passed in both API runs:

- Route-created withdrawal timeout returns a discoverable request ID and is found by batch reconciliation.
- Pending/unknown provider results remain held without a blind refund.
- Definitive failure restores principal and charged fee; concurrent refunds occur once; stale reconciliation workers cannot refund a newer claim.
- Provider identity/amount mismatches stay held. Local completion or notification failures after external success do not trigger an unsafe refund.
- Direct deposit routes are disabled; coupons remain the normal MAIN funding path.
- Enabled 2FA requires fresh MFA without email OTP; disabled 2FA uses email OTP. Concurrent OTP consumption is atomic.
- Unenrolled, pending and stale admin MFA are denied for protected cancellation/refund operations; fresh MFA is allowed.
- Optional authentication rejects revoked sessions and prevents a pending-MFA admin from viewing another private profile.
- Independent/recreated PostgreSQL rate-limit stores consume the same atomic budget.

The current withdrawal implementation auto-processes new verified withdrawals; legacy approval handling remains. It uses the wallet request ID as the external transaction identity. It should not be described as requiring admin approval for every new withdrawal.

`CouponRedemption` has `couponCodeHash @unique` and `externalTxId @unique`; it does **not** have a `couponVaultId` field. The local code-hash guard and external transaction uniqueness are present. Whether CouponVault offers another stable coupon ID must be confirmed against its staging contract. Generic HTTP 409 alone is not accepted as transfer success: identity evidence/status confirmation is required.

Provider calls are mocked in local route tests. Despite its filename, `couponVaultLiveIntegration.test.ts` also mocks environment, Prisma and external behavior. A passing local suite is **not evidence of a real CouponVault transfer, received email, or deployed login**.

## Read-only deployed HTTP checks

The observed deployment SHA was not available from these responses, so the following describes the live hosts, not proof that the audited commit is deployed.

| Probe | Observed result |
|---|---|
| `https://gaming-hub-frontend.onrender.com/` | HTTP 200; HTTPS, HSTS and `nosniff` present |
| Frontend CSP / frame protection / Permissions-Policy / Referrer-Policy | **Absent from the observed response** |
| `https://gaming-hub-zqv0.onrender.com/health/live` | HTTP 200, liveness OK |
| API security headers | CSP, HSTS, frame protections, `nosniff`, Permissions-Policy and Referrer-Policy present |
| API `/api/auth/me`, no bearer token | HTTP 401 `UNAUTHORIZED` |
| Approved frontend CORS preflight | Exact frontend origin allowed; HTTP 204 |
| Unapproved origin CORS preflight | No `Access-Control-Allow-Origin`; HTTP 204 |

No wildcard credentialed CORS grant was observed. Liveness is not a PostgreSQL, Redis, email, or CouponVault readiness check. Rate-limit headers were present, but deliberate saturation of the deployed service was not attempted.

Evidence: [frontend headers](security-reports/2026-10-03-readiness-8507d07/web-headers.txt), [API headers](security-reports/2026-10-03-readiness-8507d07/api-headers.txt), [anonymous auth](security-reports/2026-10-03-readiness-8507d07/api-auth-me-headers.txt), [approved CORS](security-reports/2026-10-03-readiness-8507d07/api-cors-approved.txt), [unapproved CORS](security-reports/2026-10-03-readiness-8507d07/api-cors-unapproved.txt).

## Findings and prioritized solutions

### 1. P1 — Deployed frontend lacks configured security protections

**Confirmed live response gap.** The prepared `apps/web/render-security-headers.yaml` fragment is not reflected in the response. Repository nginx configuration cannot protect a static site served directly by Render.

Apply the reviewed headers to the actual static service. Start the broader CSP in report-only mode with exact required API/socket/Supabase endpoints, investigate violations, then enforce it. Re-probe the actual frontend response and test login, games and auth callbacks. Render supports [custom response headers on static sites](https://render.com/docs/static-sites#custom-response-headers). No hosting settings were changed in this audit.

### 2. P1 for multiple replicas — Tournament lifecycle coordination is process-local

**Source-backed concern; cross-process failure not reproduced here.** `tournamentScheduler.ts:23–43` uses `schedulerRunning`, which cannot coordinate separate API processes. The schedule-log uniqueness guard protects hourly creation, but does not by itself serialize all lifecycle work. `transitionTournamentStatus()` reads status then performs an unconditional update; `buildSingleEliminationBracket()` deletes existing rounds before rebuilding.

Before enabling multiple scheduler instances, add/review a database-backed lease or transaction-scoped advisory/row lock with proper fencing. Make lifecycle claims conditional and prevent a second worker from rebuilding active rounds. Prove safety with two independent processes sharing one disposable database. A dedicated singleton scheduler is an interim deployment restriction, not proof that concurrent admin/start actions are safe. Financial idempotency tests passing does not establish lifecycle serialization.

### 3. P1 — Real staging business flows and recovery remain unverified

**Missing release evidence, not a demonstrated failure.** Real email delivery, real CouponVault redemption/withdrawal, provider identity behavior, deployed MFA login/refresh, two-client multiplayer/reconnect/settlement, and tournament cancellation must be exercised with staging-only accounts and secrets. Verify deployment SHAs and environment separation first. Record PASS/FAIL/BLOCKED individually, then perform restart/Redis/provider timeout tests and a realistic backup restoration. Do not exercise these financial flows on production to fill the gap.

### 4. P2 — Accepted auth-link aliases do not match frontend routes

**Reproduced validator/router mismatch.** `/auth/callback` and `/reset-password` are mounted. The validator also returns `/auth/verify-email`, `/verify-email`, and `/auth/reset-password` without a recovery parameter; those paths have no corresponding frontend route. For example, `com.gaminghub.app://auth/verify-email?code=audit` is accepted and produces an unmounted target. `com.gaminghub.app://auth/reset-password?type=recovery` correctly maps to `/reset-password`, but the same link without that parameter does not.

Map required verification aliases to the canonical callback while preserving safe authentication parameters, and map required recovery aliases consistently. Remove unused aliases only after checking provider redirects and installed app links. Add validator-to-router integration tests and actual Android/iOS verification/recovery smoke tests. No auth behavior was changed here.

The current allowlist has no wildcard host/path:

| Scheme | Host | Accepted URL paths |
|---|---|---|
| `https` | `gaminghub.com`, `app.gaminghub.com` | `/auth/callback`, `/auth/reset-password`, `/auth/verify-email`, `/reset-password`, `/verify-email` |
| `com.gaminghub.app` | `auth` | `/callback`, `/reset-password`, `/verify-email` |
| `com.gaminghub.app` | `reset-password`, `verify-email` | Empty path or `/` |

Redirect/redirectTo/next/returnUrl/url/target parameters are stripped from query and hash. All accepted paths are intended for auth, recovery or verification; successful routing is the unresolved issue. Android currently declares the `gaminghub.com` HTTPS host but not `app.gaminghub.com`, which also needs device/provider alignment.

Evidence: [actual validator outputs](security-reports/2026-10-03-readiness-8507d07/deep-link-route-probes.json), `packages/shared/src/deepLink.ts`, `apps/web/src/router/index.tsx`, native manifests.

### 5. P2 — Email error logging exposes PII; HTTP email deadlines are absent

**Source-confirmed.** `walletRequests.ts:146` writes the user's email address on withdrawal-OTP delivery failure. `emailTransport.ts` uses HTTP providers, but Brevo/SendGrid fetches lack a bounded abort deadline; SendGrid error bodies are included without the Brevo sanitization path.

Use a user/request ID in logs and sanitize all provider errors consistently. Add bounded request deadlines and controlled timeout tests. Prove an OTP delivery timeout fails safely and cannot leave a withdrawal authorized incorrectly. Confirm the deployed provider is the intended HTTP provider; SMTP code still exists for compatibility and deployment configuration was not inspected through an authenticated dashboard.

### 6. P2 — Production images include build/development tooling

**Source-backed packaging concern.** API/socket runner images copy the complete build-stage `node_modules`. This increases image size and included attack surface. Review a production-dependency runtime layout; account for the socket server's unconditional `pino-pretty` transport before removing tooling. Then build and smoke-test both images. Docker images were inspected, not rebuilt or pushed in this audit.

### 7. P2 — Build warnings require follow-up

The game page chunk is **2026.36 kB / 531.62 kB gzip**. Separate games with lazy imports where appropriate, then measure on representative mobile networks; do not hide the warning by raising its threshold.

Vite reports that oxc options supersede the configured esbuild options, including `drop: ['debugger']` and legal-comment handling. Move the intended behavior to supported oxc configuration and inspect the final bundle. Build success does not prove those ignored options were applied.

## Secret scan and operational limits

The exact-value scan covered **1311 tracked/generated text files**, including the current frontend build, plus the latest 100 commits. No configured database URL or Supabase private key match was found. The two current INTERNAL_API_KEY matches and one history match are an explicitly forbidden development-key literal in environment validators, not evidence of a leaked live production key. Root `.env` is ignored by Git. No secret values are included in this report.

This is a scoped exact-configured-value scan, not a complete historical/entropy secret audit. Credentials previously shared outside the repository still need independent rotation verification before release.

Not established by this audit:

- Real deployed provider credentials, service replica counts, Redis availability/failover, and deployment commit identity.
- Production-like backup restoration, all-business-table upgrade preservation, or disaster recovery time at real scale.
- Every RBAC route combination, a full UI accessibility/360px–desktop visual sweep, signed native builds, or real device back/deep-link behavior.
- Staging load at 100/500/1000 concurrent clients, memory trends, restart/outage injection, or multi-instance socket authority routing.
- A production ledger-wide reconciliation. No production data was scanned or modified.

Evidence: [scoped secret scan](security-reports/2026-10-03-readiness-8507d07/secret-scan.json), [native sync scope/results](security-reports/2026-10-03-readiness-8507d07/native-sync-summary.json), [build log](security-reports/2026-10-03-readiness-8507d07/build.log).

## Release decision

Local compilation, automated regression, dependency audit, disposable migrations, and synthetic restore checks pass. Resolve the confirmed hosting/auth-link gaps, address or constrain multi-instance lifecycle execution, and obtain real staging evidence before production approval.

**Final verdict: NOT PRODUCTION READY. No deployment performed.**
