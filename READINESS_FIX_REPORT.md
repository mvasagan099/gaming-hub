# Gaming Hub readiness fixes and verification

Date: 2026-10-03. Baseline commit: `8507d07234bc307096f266c35a3480e9ab125ec9`, branch `main`.

**Repository fixes verified. Verdict: NOT PRODUCTION READY — live hosting protections and staging business-flow verification remain pending.**

These are uncommitted working-tree changes on the audited baseline. No deployment, Git push, production database access or production financial operation was performed. The original audit is retained in [PRODUCTION_READINESS_REPORT.md](PRODUCTION_READINESS_REPORT.md).

## Fix status

| Finding | Repository change | Verification / remaining work |
|---|---|---|
| Tournament coordination | Dedicated one-connection PostgreSQL session owns each automation lock. Scheduler and recovery share the maintenance lock and run sequentially. Status transitions use a conditional update. Active brackets cannot be deleted/rebuilt. | PASS: independent-process exclusion, release after failure, one winner among eight transition contenders, active-bracket preservation; tournament regressions pass. |
| Auth-link routing | Verification aliases normalize to `/auth/callback`; recovery aliases normalize to `/reset-password`. Browser aliases use the same validator. Safe code/token parameters survive; navigation parameters are stripped. Android declares both approved HTTPS domains; iOS registers the existing custom scheme. | PASS: 25 validator tests, typecheck, native sync. Real provider callbacks, domain associations and devices still need staging verification. |
| Email deadlines / sensitive errors | Brevo and SendGrid have a 15-second abort deadline covering the request and response body. Provider errors redact keys, email addresses and six-digit codes, including non-JSON Brevo responses. Withdrawal OTP failures log a user ID and return a generic error. | PASS: six new safety tests plus existing email and withdrawal tests. Timeout invalidates the generated OTP. Real inbox delivery remains pending. |
| Runtime development tooling | API/socket/generic Docker runners take pruned production dependencies. Production socket logging no longer requires `pino-pretty`. Prisma remains a production dependency because the existing migration job uses its CLI. | PASS: API/socket builds and startup under `NODE_ENV=production`, non-root UID 1001, health/readiness, migration command, and absence of `vitest`, `tsup`, `pino-pretty`, `tsx`. Production transitive/optional dependencies remain. |
| Shared package missing from image | A runtime import exposed `ERR_MODULE_NOT_FOUND` for the multiplayer artifact's shared dependency. Its build now bundles shared definitions. | PASS: framework import and both service startups in the rebuilt images. No multiplayer gameplay logic was changed. |
| Frontend game loading / ignored minifier options | All nine game components load separately. Supported Rolldown minifier options replace the ignored esbuild configuration. | PASS: build/typecheck and current game regressions. Game-page chunk decreased from 2026.36 kB to 6.60 kB. A shared rendering/audio chunk remains large; mobile performance smoke testing is still required. |
| Actual Render frontend headers | Added HSTS to the prepared fragment and an exact-endpoint header generator with HTTPS/credential/wildcard checks. Added a staging verification checklist. | PREPARED, NOT APPLIED: the live static service must receive reviewed headers and be checked externally. No hosting configuration was changed. |
| Real staging flows / recovery | Documented required staging-only checks and requested staging URLs/configuration locations. | BLOCKED: no identified staging endpoints or credential configuration locations were supplied in this run. Local mocks are not live provider evidence. |

### Scope and safety

Wallet accounting, deposit policy, TOTP/email withdrawal selection, coupon conflict handling, financial idempotency and settlement logic were not redesigned. The withdrawal change only tightens email failure handling and disclosure. No migration SQL or historical game/financial data was changed. The nine supported games remain covered by the game/tier regressions; Cricket remains retired.

Session advisory locks require a direct/session PostgreSQL connection. If the normal URL uses transaction pooling, `DATABASE_LOCK_URL` must identify the **same database** through a direct/session connection. The helper refuses a URL explicitly marked `pgbouncer=true`. A lost session is detected during unlock and reported for reconciliation; the tests do not certify a full network-partition fencing design. Cross-instance outage/recovery testing remains a staging release gate. See [PostgreSQL advisory-lock documentation](https://www.postgresql.org/docs/17/explicit-locking.html#ADVISORY-LOCKS).

Auth host/path allowlists are retained to preserve issued links; aliases converge onto two mounted pages. `redirect`, `redirectTo`, `next`, `returnUrl`, `url` and `target` cannot select a navigation destination. iOS HTTPS Universal Links still require the appropriate signing entitlement and hosted association records. Native sync does not establish signed builds or working device/provider callbacks.

The header generator writes a reviewable fragment and never calls Render. The restrictive framing/base/plugin policy is enforced in the fragment; the broader exact-origin CSP stays report-only until required assets and auth/socket traffic have been validated. Use [STAGING_SECURITY_FIX_VERIFICATION.md](STAGING_SECURITY_FIX_VERIFICATION.md).

## Current test evidence

| Gate | Files | Passed / total | Failed | Skipped |
|---|---:|---:|---:|---:|
| Full API aggregate pass #1 | 87 | 1222 / 1222 | 0 | 0 |
| Full API aggregate pass #2, clean database | 87 | 1222 / 1222 | 0 | 0 |
| Security selection, each API pass | 44 | 630 / 630 | 0 | 0 |
| All tournament/tier-named tests, each pass | 23 | 531 / 531 | 0 | 0 |
| Tournament routes, each pass | 1 | 61 / 61 | 0 | 0 |
| Tier combinations, each pass | 1 | 93 / 93 | 0 | 0 |
| Wallet routes, each pass | 1 | 11 / 11 | 0 | 0 |
| Financial concurrency/reconciliation/idempotency, each pass | 3 | 32 / 32 | 0 | 0 |
| Privacy, each pass | 1 | 12 / 12 | 0 | 0 |
| Game engine | 24 | 329 / 329 | 0 | 0 |
| Multiplayer | 9 | 89 / 89 | 0 | 0 |
| Web | 3 | 22 / 22 | 0 | 0 |

Security, tournament, wallet, finance and privacy rows overlap the API aggregates; do not add them to the overall total. One API pass plus the other three suites covers **123 files / 1662 tests**. The second API pass repeats the API tests.

All 87 API files were discovered and assigned exactly once to deterministic groups, with zero missing or duplicate executed files. Results were saved after every group. Before pass #2, the project's guarded reset emptied all **95 application tables** on `127.0.0.1:5541`, database `gaming_hub_readiness_8507d07_test`. Production configuration was cleared/replaced with dummy values in the API runner.

Pass #1 initially exposed five tier fixtures that explicitly rebuilt active brackets after starting tournaments. Those fixtures now require rejection and preservation of every slot. The corrected tier group passed. Its affected email groups were also refreshed after the final error-sanitization test was added. The saved aggregates use the latest passing result per group; initial failures are documented rather than described as a first-attempt clean run.

The web-folder runner failed to load one test because that runner environment lacked native WebSocket support. The repository-level runner used in the original audit then ran all three discovered web files successfully: 22/22. No production workaround or weakened assertion was added for that harness issue.

Evidence: [manifest](security-reports/2026-10-03-readiness-fixes/full-api-manifest.json), [pass #1](security-reports/2026-10-03-readiness-fixes/api-pass-1/aggregate.json), [pass #2](security-reports/2026-10-03-readiness-fixes/api-pass-2/aggregate.json), [current summary and security file selection](security-reports/2026-10-03-readiness-fixes/verification-summary.json).

## Build, dependency, database and native checks

| Check | Current result |
|---|---|
| Workspace typecheck | PASS, 9 workspaces, 0 errors |
| Repository build | PASS; remaining size warning classified below |
| Full dependency audit | PASS: Critical 0, High 0, Moderate 0, Low 0 |
| Production dependency audit | PASS: Critical 0, High 0, Moderate 0, Low 0 |
| Fresh disposable deployment | PASS: all 7 migrations applied |
| Fresh schema comparison | PASS: no difference |
| Controlled six-to-seven migration upgrade | PASS: fixture user, wallet, ledger and MAIN 100 preserved |
| New wallet defaults | PASS: MAIN 0, BONUS 0, LOCKED 0 |
| API/socket images | PASS: local builds, startup, health/readiness, runtime imports and migration command |
| Android / iOS Capacitor sync | PASS in isolated native project copies |
| Header generator safety checks | PASS: exact HTTPS origins accepted; HTTP, embedded credentials, wildcard hosts and query parameters rejected |
| Production database touched | NO |

**Dependency audit: PASS.** Prisma changed dependency classification, not installed version (`6.19.3`). No forced dependency upgrade was used. Zero advisory counts do not establish the absence of application or unknown dependency vulnerabilities.

The ignored esbuild/oxc configuration warning is gone. Game code is split into individual chunks, but the shared rendering/audio chunk is still approximately **1375.14 kB / 357.75 kB gzip**. The size-warning threshold was not raised. No published web source maps or `debugger;` statements were found in the final assets. Network/device measurements remain pending.

The scoped secret scan covered 1512 text files, including the built frontend, plus 100 commits. No configured database URL or private Supabase key was found. Matches for an internal development-key literal are in the explicit forbidden-key lists, not a newly discovered live key. This exact-value scan is not a complete entropy/history audit. Previously disclosed credentials still require rotation verification before release.

Evidence: [build log](security-reports/2026-10-03-readiness-fixes/build.log), [typecheck](security-reports/2026-10-03-readiness-fixes/typecheck.log), [dependencies](security-reports/2026-10-03-readiness-fixes/dependency-audit.json), [production dependencies](security-reports/2026-10-03-readiness-fixes/dependency-audit-production.json), [migration summary](security-reports/2026-10-03-readiness-fixes/migration-summary.json), [image checks](security-reports/2026-10-03-readiness-fixes/image-verification.json), [native sync](security-reports/2026-10-03-readiness-fixes/native-sync-summary.json), [secret scan](security-reports/2026-10-03-readiness-fixes/secret-scan.json).

## Remaining release work

1. Identify staging services and staging-only credential configuration; deploy the reviewed changes there.
2. Apply and inspect actual staging frontend headers; resolve broader CSP violations before enforcing that policy.
3. Verify real email, CouponVault, MFA refresh, mobile callbacks, two-client multiplayer and tournament flows.
4. Verify interruption/recovery, realistic backup restoration and multi-instance operation on staging.

No live flow is marked PASS based solely on a mock. **Final verdict: NOT PRODUCTION READY. No production deployment performed.**
