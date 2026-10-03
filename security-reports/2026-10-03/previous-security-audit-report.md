# Gaming Hub Security and Release-Gate Report

**Verification date:** 2026-09-17

**Scope:** local release gate and staging deployment smoke verification

**Production deployment:** not performed

## Final verdict

# **STAGING VERIFICATION BLOCKED**

All local release gates passed on the final source and test set. The deployed
Render stack cannot yet be certified as isolated staging, so it is not ready
for production deployment review.

## Release checklist

| Gate | Current result |
|---|---:|
| Migration collision safety | **PASS** |
| Fresh migration deployment | **PASS — 4/4** |
| Migrated schema equals Prisma schema | **PASS — no difference** |
| API aggregation pass #1 | **PASS — 76 files, 1,102/1,102** |
| Clean test database reset | **PASS** |
| API aggregation pass #2 | **PASS — 76 files, 1,102/1,102** |
| Tournament routes | **PASS — 61/61** |
| Tier combinations | **PASS — 98/98** |
| Game engine | **PASS — 317/317** |
| Multiplayer | **PASS — 90/90** |
| Security selection | **PASS — 62/62** |
| Wallet routes | **PASS — 9/9** |
| Financial reconciliation/concurrency | **PASS — 48/48** |
| Privacy | **PASS — 27/27** |
| Withdrawal OTP service | **PASS — 22/22** |
| TypeScript, 9 workspaces | **PASS** |
| Production build | **PASS** |
| Production database touched in this verification | **NO** |

## Migration safety

The migration audit found and corrected two unsafe patterns:

1. `packages/db/deploy.js` previously treated any failed migration as permission to mark the baseline migration applied. It now fails closed and requires explicit inspection and resolution.
2. Later migrations used `IF NOT EXISTS` and object-name checks that could accept a table, column, constraint, or index with the wrong definition. Those recovery paths were removed. Existing-object collisions now fail instead of silently accepting schema drift.

The migration definitions were also aligned with Prisma:

- Prisma `DateTime` columns use `TIMESTAMP(3)`.
- `UserPrivacy.updatedAt` has the Prisma-managed default behavior.
- `UserPrivacy_userId_fkey` uses the expected delete and update actions.
- Unique constraints and indexes are created with their exact expected columns.

Final verification used the disposable local database:

```text
host: localhost
port: 5540
database: gaming_hub_release_gate_20260916
```

`npx prisma migrate deploy` applied all four migrations. `prisma migrate diff` then reported `No difference detected` between the resulting database and `packages/db/prisma/schema.prisma`.

## API aggregation

Manifest integrity:

- API files discovered: **76**
- API files assigned: **76**
- Missing: **0**
- Duplicates: **0**

### Pass #1

| Group | Files | Tests | Passed | Failed | Skipped |
|---|---:|---:|---:|---:|---:|
| A | 14 | 146 | 146 | 0 | 0 |
| B | 17 | 200 | 200 | 0 | 0 |
| C | 23 | 461 | 461 | 0 | 0 |
| D | 12 | 116 | 116 | 0 | 0 |
| E | 10 | 179 | 179 | 0 | 0 |
| **Total** | **76** | **1,102** | **1,102** | **0** | **0** |

### Pass #2

The disposable `gaming_hub_test` database was dropped and recreated before this pass.

| Group | Files | Tests | Passed | Failed | Skipped |
|---|---:|---:|---:|---:|---:|
| A | 14 | 146 | 146 | 0 | 0 |
| B | 17 | 200 | 200 | 0 | 0 |
| C | 23 | 461 | 461 | 0 | 0 |
| D | 12 | 116 | 116 | 0 | 0 |
| E | 10 | 179 | 179 | 0 | 0 |
| **Total** | **76** | **1,102** | **1,102** | **0** | **0** |

Per-subgroup machine-readable results are stored in `apps/api/release-evidence/`.

## Real-flow security verification

### Withdrawal and reconciliation

Current route and service coverage proves:

- approval deducts or reserves MAIN funds exactly once;
- CouponVault receives the wallet-request ID as the transfer identity;
- confirmed success completes the request;
- definitive failure refunds exactly once;
- timeout or uncertain response produces `UNCONFIRMED_HOLD` with no blind refund;
- reconciliation completes a confirmed processed transfer;
- reconciliation refunds once when CouponVault definitively reports not processed;
- an unknown reconciliation result remains held;
- concurrent reconciliation workers cannot double-process or double-refund.

### Deposit funding

- Direct deposit creation returns `DEPOSITS_DISABLED`.
- Admin approval of a deposit is blocked.
- CouponVault coupon redemption remains the normal MAIN-wallet funding path.
- Game and tournament payouts remain within Gaming Hub and do not call CouponVault automatically.

### OTP

- The production withdrawal OTP path invokes `sendSmtpEmail`.
- The database stores only the salted OTP hash.
- Two concurrent verification attempts using the same valid OTP produce exactly one success.
- Invalid, expired, exhausted, and consumed OTPs are rejected.

### MFA and authorization

- ADMIN and MODERATOR accounts without enrolled 2FA are denied high-risk actions.
- Missing and stale MFA sessions are denied.
- Fresh MFA sessions are allowed.
- Revoked sessions and cross-session verification are denied.
- Protected coverage includes wallet, tournament, KYC, role, and administrative financial mutations.

### CouponVault identity

- A generic HTTP 409 is not accepted as transfer success.
- An unproven conflict returns `COUPON_TRANSFER_CONFLICT`.
- Idempotent success requires a matching, verified transaction identity.

### Privacy

- Privacy state is stored in PostgreSQL `UserPrivacy`.
- Public profile and search respect private visibility.
- Public responses mask email, wallet data, histories, and private statistics.

### Multiplayer authority

- Rejected out-of-turn and spectator actions are compared with the serialized authoritative engine snapshot.
- Rejected actions leave authoritative engine state unchanged.

## Final build gates

- `npm run typecheck --workspaces --if-present`: **PASS**, 0 errors across 9 workspaces.
- `npm run build`: **PASS** for multiplayer, web, API, and socket-server.
- Final fresh `npx prisma migrate deploy`: **PASS**.
- Final schema comparison: **PASS**, no difference detected.

## Deployment status

The verified commit was deployed to the existing Render web, API, and socket
services. No production deployment was performed. Data-changing smoke tests
were stopped because the existing Render resources do not provide sufficient
evidence that they are isolated staging resources.

## Staging deployment and smoke verification — 2026-09-17

Deployed source: `a9ac318476781c1c62fa65d70eb286e204d8d11b`.

| Check | Result | Evidence |
|---|---:|---|
| Frontend deployment | **PASS** | Render static site is live on the verified commit. |
| API deployment | **PASS** | Render Docker service is live on the verified commit. |
| Socket deployment | **PASS** | Render Docker service is live on the verified commit. |
| Prisma startup gate | **PASS** | API deploy log reports 4 migrations found; deploy completed and readiness reports the database up. |
| API liveness | **PASS** | `/health/live` returned HTTP 200. |
| API readiness | **PASS** | `/health/ready` returned HTTP 200 with database `up`. |
| Socket liveness/readiness | **PASS** | Both deployed endpoints returned HTTP 200. |
| Frontend load | **PASS** | Home and login pages rendered; no browser warning/error logs were observed. |
| Runtime mode | **PASS** | API `NODE_ENV` is `production`. |
| CORS | **PASS** | Approved frontend origin receives its exact allow-origin value; an unapproved origin receives no allow-origin header. |
| Rate limiting | **PASS** | API responses include an active 300-request/60-second rate-limit window. |
| API security headers | **PASS** | CSP, HSTS, X-Frame-Options, nosniff, and referrer policy are present. |
| Frontend security headers | **FAIL** | HSTS and nosniff are present; CSP, X-Frame-Options/frame-ancestors, and Permissions-Policy are absent from the Render static-site response. |
| Frontend secret scan | **PASS** | Deployed bundle contains no database URL, service-role key, internal API key, CouponVault key, or SMTP password marker. |
| Metrics access control | **PASS** | Anonymous `/metrics` request is rejected with HTTP 401. |
| API and scheduler logs | **PASS** | Startup, health traffic, and tournament crash-recovery logs are visible. |
| SMTP readiness | **FAIL** | API startup log reports SMTP connection verification failure (`ESOCKET`). |
| Staging database isolation | **BLOCKED** | The existing database is named `gaming_hub_db_nojq`; resources are ungrouped and have generic names, with no staging designation or separate production-resource evidence. |
| CouponVault staging isolation | **BLOCKED** | Configured host is `coupon-api-qyer.onrender.com` and has no staging/test/sandbox designation. |
| Redis staging isolation | **BLOCKED** | Existing resource is generically named `gaming-hub-redis`; no separate staging designation is present. |
| Signup/login/email verification/logout/password reset | **BLOCKED** | Requires an isolated staging stack and working staging-safe email delivery. |
| MFA smoke | **BLOCKED** | Requires an isolated staging account and TOTP enrollment. |
| Coupon redemption and duplicate protection | **BLOCKED** | Requires confirmed CouponVault staging/test credentials and an isolated staging database. |
| Withdrawal success/failure/timeout/reconciliation | **BLOCKED** | Requires confirmed CouponVault staging/test controls, working OTP email, and an isolated staging database. |
| Two-session multiplayer and settlement | **BLOCKED** | Requires isolated staging users and wallet data. |
| Tournament lifecycle and refunds | **BLOCKED** | Requires an isolated staging database and staging admin account. |
| Memory-growth observation | **BLOCKED** | Meaningful authenticated staging traffic was not generated. |

### Required closure

1. Create or identify explicitly isolated staging PostgreSQL, Redis, API,
   socket, web, Supabase/auth, SMTP, and CouponVault resources.
2. Prove that no production database, Redis, CouponVault, auth, or SMTP value is
   linked to those services.
3. Restore staging-safe SMTP connectivity.
4. Add the required security headers to the Render static-site response.
5. Rerun the blocked authenticated and financial smoke tests with dedicated
   staging users and controlled CouponVault staging outcomes.

Until those checks pass, the staging result remains **BLOCKED** and the release
must not advance to production deployment review.
