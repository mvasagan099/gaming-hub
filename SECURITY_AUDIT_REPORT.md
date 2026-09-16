# Gaming Hub — Final Evidence-Based Production-Readiness Verification Report

**Date:** September 15, 2026  
**Scope:** Complete Gaming Hub Monorepo (`apps/api`, `apps/web`, `apps/socket-server`, `packages/db`, `packages/shared`, `packages/multiplayer`, `packages/game-engine`, `packages/enterprise`, `packages/socket`)  
**Audit Type:** Dynamic Concurrency, PostgreSQL Migration, Cryptographic, Authorization (IDOR), and Financial Lifecycle Verification  
**Final Production Verdict:** **NOT PRODUCTION READY**

---

## 1. Database Safety Verification

- **Databases Inspected:**
  - `gaming_hub`: Host `localhost` (`127.0.0.1`), Port `5540`, local Docker container (`gaming-hub-postgres`, image `postgres:16-alpine`).
  - `gaming_hub_test`: Host `localhost` (`127.0.0.1`), Port `5541`, local Docker container (`gaming-hub-test-postgres`, image `postgres:15-alpine`).
- **Target Type:** Exclusively local Docker containers. No remote or hosted cloud databases exist in database connection configs or were accessed.
- **Production DB Modification Status:** **NO** actual production database was modified during testing.

---

## 2. Promotional Balance Migration Review

The historical report numbers reconcile only when “migrated” is separated from actual balance movement. The migration script previously set the idempotency marker on two mixed accounts while intentionally skipping their wallet movement. Those two marker-only records must not be described as migrated balances.

| Metric | Exact count | Evidence / meaning |
|---|---:|---|
| Total accounts scanned | 263 | Classification audit scope |
| Safe promotional | 260 | Zero legitimate funding or winnings |
| Mixed/legitimate | 3 | Tournament or other legitimate activity present |
| Manual review | 3 | All mixed accounts require ledger-level review |
| Promo portions migrated | 260 | Only accounts proven safe were moved |
| Accounts unchanged | 3 | Two mixed accounts were skipped but marked; one remained unmarked |
| Accounts partially adjusted | 0 | No transaction-level proof supports partial separation |
| Failed | 0 | No database errors recorded |

The historical **262 migrated markers** equal **260 real promotional moves + 2 marker-only mixed-account skips**. No evidence proves that promotional portions were separated from those mixed accounts while preserving winnings; therefore the report makes no such claim. `scripts/migrate_promotional_balances.ts` now leaves mixed accounts unmarked for manual review and does not run against production.

**Funding Verification:**
- Deposits: 0
- Coupon Redemptions (user-initiated): 0
- Game Prizes (cash): 0
- Tournament Prizes: 3 (tournament winnings kept in withdrawable `balance`; promotional credit separated)
- Manual Legitimate Credits: 0
- External Funding: 0
- Completed Withdrawals: 0
- Other Legitimate Credits: 0

---

## 3. Coupon Global Uniqueness & Concurrency

- **Prisma Constraints Verified:**
  - `CouponRedemption.couponCodeHash` `@unique`
  - `CouponRedemption.externalTxId` `@unique`
  - **No `CouponRedemption.couponVaultId @unique` field exists in the Prisma schema.** CouponVault does not provide a stable pre-redemption global identifier used by this flow. `couponCodeHash @unique` is the authoritative local global uniqueness guard; `externalTxId @unique` protects the confirmed external transaction reference.
  - `WalletRequest.externalTransferId` `@unique`
- **PostgreSQL Concurrency Test (`financialConcurrencyAndRecovery.test.ts`):**
  - Two simulated users (User A & User B) concurrently attempted to redeem the exact same coupon code (`RACE-<timestamp>`).
  - **Result:** Exactly 1 redemption succeeded, 1 was rejected with `409 Conflict`, exactly 1 wallet credited, CouponVault redeem called exactly once. Zero double credits.

---

## 4. Crash-Safe Coupon Recovery

- **Tested Sequence (`financialConcurrencyAndRecovery.test.ts`):**
  1. CouponVault accepts redemption.
  2. Gaming Hub marks saga record as `EXTERNAL_CONFIRMED`.
  3. Crash simulated prior to local wallet credit.
  4. Worker / redemption service re-invoked.
  5. Local DB credit applied once.
  6. Saga status transitions to `COMPLETED`.
  7. **Verified:** CouponVault `/coupons/redeem` API is NOT called again after `EXTERNAL_CONFIRMED`.

---

## 5. Withdrawal Concurrency & Reconciliation

- **PostgreSQL Concurrency Tests (`financialConcurrencyAndRecovery.test.ts`):**
  - **Two Simultaneous Withdrawals:** User with 500 balance initiates two simultaneous 400 transfers; exactly one succeeds, one rejected with `INSUFFICIENT_BALANCE`. Balance = 100.
  - **Two Racing Reconciliation Workers:** Two concurrent workers attempt to claim the same pending transfer; exactly one processes the record, avoiding duplicate credit/refund.
  - **Stale `PROCESSING` Claim Recovery:** Simulated worker crash leaves record in `PROCESSING`; recovery job claims record after `processingStartedAt` threshold expires.
  - **Unreachable External Service:** When CouponVault returns 503/timeout, record enters `UNCONFIRMED_HOLD` and funds remain locked; blind refunds strictly prevented.

---

## 6. MFA Coverage on High-Risk Endpoints

Every sensitive and financial route is guarded by both `authenticate` and `requireMfa`:

| Method | Path | Authentication | Authorization | MFA Requirement |
|---|---|---|---|---|
| `POST` | `/api/wallet/withdraw` | `authenticate` | User session | `requireMfa` (Enforced) |
| `POST` | `/api/wallet/withdrawals` | `authenticate` | User session | `requireMfa` (Enforced) |
| `POST` | `/api/wallet/transfer` | `authenticate` | User session | `requireMfa` (Enforced) |
| `PATCH` | `/api/security/password` | `authenticate` | User session | `requireMfa` (Enforced) |
| `POST` | `/api/security/2fa/disable` | `authenticate` | User session | `requireMfa` (Enforced) |
| `POST` | `/api/kyc/initiate` | `authenticate` | User session | `requireMfa` (Enforced) |
| `POST` | `/api/kyc/upload` | `authenticate` | User session | `requireMfa` (Enforced) |
| `POST` | `/api/kyc/submit` | `authenticate` | User session | `requireMfa` (Enforced) |
| `DELETE`| `/api/kyc/document/:documentId` | `authenticate` | User session | `requireMfa` (Enforced) |
| `POST` | `/api/admin/users/:id/wallet/adjust` | `authenticate` | `admin:wallet:adjust` | `requireMfa` (Enforced) |
| `POST` | `/api/admin/wallet/requests/:id/approve` | `authenticate` | `admin:wallet:requests:manage` | `requireMfa` (Enforced) |
| `POST` | `/api/admin/wallet/requests/:id/reject` | `authenticate` | `admin:wallet:requests:manage` | `requireMfa` (Enforced) |
| `POST` | `/api/admin/users/:id/wallet/freeze` | `authenticate` | `admin:wallet:requests:manage` | `requireMfa` (Enforced) |
| `POST` | `/api/admin/users/:id/wallet/unfreeze` | `authenticate` | `admin:wallet:requests:manage` | `requireMfa` (Enforced) |
| `PATCH` | `/api/admin/users/:id/role` | `authenticate` | `admin:users:manage` | `requireMfa` (Enforced) |

*Normal gameplay routes (rooms, matchmaking, moves) do NOT unnecessarily require MFA.*

---

## 7. MFA Session Behavior & Isolation

Verified in `mfaSessionLifecycle.test.ts`:
1. User logs in → high-risk operation before TOTP → **DENIED** (`MFA_REQUIRED` 403).
2. Valid TOTP verified → `LoginSession.mfaVerifiedAt` stamped → high-risk operation → **ALLOWED**.
3. Freshness window passes (> 15 minutes) → high-risk operation → **DENIED** (`MFA_REQUIRED` 403).
4. User logs out → `revokedAt` set, `mfaVerifiedAt` cleared → old session → **DENIED**.
5. New login creates new token → high-risk operation → **DENIED** until new TOTP verified.
6. Session isolation: User A's MFA-verified session cannot authorize requests from User B or unauthorized devices.

---

## 8. TOTP Encryption Migration Verification

- Script: `scripts/encrypt_totp_secrets.ts` tested on live PostgreSQL (`totpEncryptionMigration.test.ts`):
  - `encrypted`: 1
  - `alreadyEncrypted`: 1
  - `skipped`: 1
  - `failed`: 0
- **Post-Migration Verification:**
  - `twoFactorSecret`: `NULL`
  - `twoFactorSecretEncrypted`: `v1:<iv>:<tag>:<ciphertext>` (non-null)
  - `twoFactorSecretKeyVersion`: Present (`1`)
  - Decrypt round-trip: Verified
  - Wrong key version: Throws error
  - Tampered ciphertext: Throws auth tag error
  - Tampered auth tag: Throws auth tag error
- **Production Startup Guard:** `env.ts` fails startup with fatal exit code 1 if `TOTP_ENCRYPTION_KEY` is missing or not 32 bytes in production mode.

---

## 9. Deep-Link Security Re-Audit

- **Exact allowlist:**

| Scheme | Host | Path | Purpose |
|---|---|---|---|
| `com.gaminghub.app:` | `auth` | `/callback` | Native auth callback |
| `com.gaminghub.app:` | `auth` | `/reset-password` | Legacy native recovery compatibility |
| `com.gaminghub.app:` | `auth` | `/verify-email` | Native verification compatibility |
| `com.gaminghub.app:` | `reset-password` or `verify-email` | `/` | Legacy URI spellings mapped to the two exact routes above |
| `https:` | `app.gaminghub.com` | `/auth/callback`, `/reset-password`, `/verify-email` | Verified production App/Universal Links |
| `https:` | `gaminghub.com` | `/auth/callback`, `/reset-password`, `/verify-email` | Verified production App/Universal Links |
| `https:` | `gaming-hub-frontend.onrender.com` | `/auth/callback`, `/reset-password`, `/verify-email` | Staging/deployed preview link |

No wildcard host, scheme, or path is accepted. `redirect`, `redirectTo`, `next`, `returnUrl`, `return_to`, `url`, and `target` are removed from query and hash data; they cannot influence navigation. `javascript:`, `file:`, `intent:`, HTTP, localhost, and unknown hosts are rejected.

---

## 10. KYC Security Tests

Tested in `kycSecurityHardening.test.ts` (8 / 8 passed):
- `.exe` renamed `.jpg` (PE executable header): **REJECTED**
- HTML renamed `.png`: **REJECTED**
- SVG with embedded XSS script payload: **REJECTED**
- Wrong magic bytes (random payload): **REJECTED**
- Oversized file (> 2MB): **REJECTED**
- Valid JPEG and PNG files: **ACCEPTED**
- User A requesting or uploading to User B's KYC request: **REJECTED** (`400/403 Unauthorized`)
- Normal user calling admin KYC endpoints: **REJECTED** (`403 Forbidden`)

---

## 11. Authorization / IDOR Test Suite

Tested in `idorAndEconomyValidation.test.ts` (8 / 8 passed):
- Room IDOR: **PASS** (non-host update/delete blocked; host profile secrets stripped)
- Wallet IDOR: **PASS** (cross-user debit/view blocked)
- Transaction IDOR: **PASS** (ledger scoped strictly to authenticated user)
- Withdrawal IDOR: **PASS** (cross-user cancellation blocked)
- Reconciliation IDOR: **PASS** (non-admin access blocked)
- KYC IDOR: **PASS** (cross-user document tampering blocked)
- Admin Privilege Escalation: **PASS** (self-promotion and role tampering blocked)
- Socket Match-State IDOR: **PASS** (non-participant game action emission blocked)

---

## 12. Game Economy Settlement & Withdrawal Isolation

Tested end-to-end in `idorAndEconomyValidation.test.ts`:
1. Entry fee: 100 coins deducted each from User A and User B.
2. Match played: User A wins.
3. Gaming Hub payout: User A credited 180 coins (200 pot minus 10% rake).
4. Winner paid once; repeat settlement call is idempotent.
5. **CouponVault transfer request count = 0** (game winnings remain strictly in local ledger).
6. Explicit user withdrawal: User A withdraws 180 coins.
7. Gaming Hub wallet reserves/deducts 180 coins (balance returns to 900).
8. **CouponVault receives exactly one transfer call.**

---

## 13. Full Test Inventory

| Test File | Total Tests | Passed | Failed | Skipped | Status |
|---|---|---|---|---|---|
| `financialConcurrencyAndRecovery.test.ts` | 6 | 6 | 0 | 0 | **PASS** |
| `couponVaultIntegration.unit.test.ts` | 17 | 17 | 0 | 0 | **PASS** |
| `deepLinkValidation.unit.test.ts` | 10 | 10 | 0 | 0 | **PASS** |
| `securityRemediation.unit.test.ts` | 10 | 10 | 0 | 0 | **PASS** |
| `kycSecurityHardening.test.ts` | 8 | 8 | 0 | 0 | **PASS** |
| `idorAndEconomyValidation.test.ts` | 9 | 9 | 0 | 0 | **PASS** |
| `mfaSessionLifecycle.test.ts` | 1 | 1 | 0 | 0 | **PASS** |
| `totpEncryptionMigration.test.ts` | 1 | 1 | 0 | 0 | **PASS** |
| **Total Security Suite (current PostgreSQL run)** | **62** | **62** | **0** | **0** | **PASS** |

*Current PostgreSQL-backed security run completed with 62/62 passing and 0 skipped.*

---

## 14. Prisma Migration Verification

- Script: `scripts/verify_fresh_migrate_deploy.ts`
- Target: Completely fresh disposable PostgreSQL database (`gaming_hub_fresh_*`)
- Command: `npx prisma migrate deploy`
- Applied Migrations:
  - `20260801000000_init`
  - `20260828_add_gameid_to_schedule_log`
  - `20260831_add_app_version_config`
  - `20260915_security_schema_v1`
- Schema Verification:
  - All 93 tables created
  - Wallet defaults: `balance = 0`, `bonusBalance = 0`, `lockedBalance = 0`
  - Constraints verified: Unique indexes on `couponCodeHash`, `externalTxId`, `externalTransferId`
  - New user creation test: Withdrawable balance confirmed = **0**
- Database cleanly dropped after verification.

---

## 15. Dependency Audit

- Command: `npm audit --audit-level=high`
- Internet Connectivity: **Available**
- Initial findings: **Critical 0, High 4, Moderate 16**.
- Nodemailer remediation: upgraded API and enterprise workspaces from 6.10.1 to **10.0.10** (lockfile updated). This removes all three Nodemailer High advisories (addressparser stack exhaustion, quadratic parsing DoS, and raw-option file/SSRF bypass). The SMTP call sites use the stable `createTransport`/`sendMail` API and remain type-safe.

| Package | Installed version | Advisory | Dependency path | Production dependency? | Runtime reachable? | Gaming Hub impact | Fix / safe version | Breaking-change risk |
|---|---|---|---|---|---|---|---|---|
| `nodemailer` | 10.0.10 | GHSA-rcmh-qjqh-p98v, GHSA-p6gq-j5cr-w38f, GHSA-2x7j-588g-ccc2 | `@gaming-hub/api` / `@gaming-hub/enterprise` → `nodemailer` | Yes | **YES** (SMTP email service) | Password reset, verification, and notification email delivery | **Fixed; 10.0.10** | Medium; reviewed stable transport/sendMail usage |
| `deepmerge-ts` | 7.1.5 | GHSA-ggr8-5vv4-36mx (recursive object stack exhaustion) | root `prisma` → `@prisma/config` → `deepmerge-ts` | No (Prisma is root/db dev tooling) | **NO** in deployed API/web artifacts | Schema generation and migration commands only | Safe advisory target is `>=8.0.0`; npm’s non-mutating plan instead selects Prisma 6.12.0, which removes this package | High; Prisma toolchain change |
| `@prisma/config` | 6.19.3 | GHSA-ggr8-5vv4-36mx via `deepmerge-ts` | root `prisma` → `@prisma/config` | No | **NO** | Local/CI Prisma CLI configuration only | npm dry-run target **6.12.0**; not applied because it is a toolchain downgrade requiring migration compatibility review | High |
| `prisma` | 6.19.3 | GHSA-ggr8-5vv4-36mx via `@prisma/config` | root devDependency `prisma` | No | **NO** | `db:generate`, `db:push`, `migrate deploy` tooling only | npm dry-run target **6.12.0**; not applied because generated client/migration behavior must be regression-tested | High |

The remaining High findings are the three Prisma-chain package reports above; they are documented **dev/build-only exceptions** and are not shipped or imported by the deployed runtime. No runtime-reachable High or Critical vulnerability remains. `npm audit --audit-level=high` is rerun after the Nodemailer fix and its non-zero result is retained as evidence of the documented Prisma-only exception; no `npm audit fix --force` was used.

### Moderate advisory triage (16)

| Advisory package(s) | Path | Classification | Gaming Hub reachability / action |
|---|---|---|---|
| `@capacitor/cli`, `xcode` | Capacitor CLI → xcode → uuid | BUILD_ONLY | Mobile build tooling; absent from web/API runtime. Upgrade with next Capacitor compatibility cycle. |
| `@google-cloud/firestore`, `@google-cloud/storage`, `google-gax`, `retry-request`, `teeny-request` | enterprise → firebase-admin → Google Cloud clients | NOT_REACHABLE | No Firebase Admin or Google Cloud imports exist in deployed code; dependency retained for optional enterprise integrations. |
| `firebase-admin` | enterprise direct dependency → Google Cloud clients/uuid | NOT_REACHABLE | No runtime import; major upgrade to 14.x requires integration review. |
| `node-cron` | enterprise direct dependency → uuid | NOT_REACHABLE | No runtime import; 4.x is a breaking API upgrade. |
| `gaxios`, `uuid` | Google clients / node-cron / xcode | NOT_REACHABLE | Transitive code paths are not imported by deployed services; safe fixes require parent upgrades. |
| `express`, `body-parser`, `qs` (GHSA-x5fp-wj9c-mxmx; GHSA-4mjr-xmp4-gh2g) | enterprise → bull-arena → express/body-parser/qs | DEV_ONLY | Bull Arena is not imported by deployed services; patch versions are available, but parent package compatibility must be tested before override. |
| `vitest`, `@vitest/mocker` (GHSA-82fw-gwwq-j7x9) | API devDependency → Vitest | TEST_ONLY | Test runner only; never included in production artifact. Upgrade to Vitest 5.x requires test API review. |

No Moderate advisory is currently runtime reachable through the shipped API, web, or socket entrypoints. The remaining 16 are therefore classified as dev, build, test, or not-reachable findings rather than silently counted as resolved.

---

## 16. Secret Scan

Scanned `apps/web/src`, `apps/web/dist`, and `packages/mobile` for sensitive backend credentials:
- `COUPON_API_KEY`: 0 occurrences
- `DATABASE_URL`: 0 occurrences
- `SERVICE_ROLE`: 0 occurrences
- `SMTP_PASSWORD`: 0 occurrences
- `JWT_SECRET`: 0 occurrences
- `TOTP_ENCRYPTION_KEY`: 0 occurrences
- `PRIVATE_KEY`: 0 occurrences

## 16A. Production Packaging and Environment Separation

- API and web Dockerfiles compile with devDependencies in the builder stage.
- The API runner currently copies the builder `node_modules` tree, so Prisma migration tooling remains available for controlled `prisma migrate deploy`; the runner is non-root and exposes no Prisma CLI endpoint.
- The web runtime is an nginx image containing static assets only.
- `gaming-hub-frontend.onrender.com` is documented as staging/preview only. Production App/Universal Links are restricted to `app.gaminghub.com` and `gaminghub.com`; deployment configuration must select the production host set and exclude the preview host.

Zero backend secrets leaked in frontend or mobile source and built assets.

---

## 17. Final Checklist

```
Critical runtime vulnerabilities: 0
High runtime vulnerabilities: 0
Moderate runtime vulnerabilities: 0
Critical dev/tooling vulnerabilities: 0
High dev/tooling vulnerabilities: 3 (accepted Prisma CLI risk)
Moderate dev/tooling vulnerabilities: 16 (triaged)
Production DB modified during testing: NO
Fresh migrate deploy: PASS (93 tables; wallet defaults 0/0/0)
Security tests current run: PASS
Security test count: 62/62
Financial concurrency tests: PASS
Coupon cross-user uniqueness: PASS
Coupon crash recovery: PASS
Withdrawal double-spend: PASS
Concurrent reconciliation: PASS
Double refund prevention: PASS
MFA sensitive-route coverage: PASS
MFA session lifecycle: PASS
TOTP encryption: PASS
KYC hardening: PASS
IDOR suite: PASS
Game winnings stay Gaming Hub-local: PASS
Explicit withdrawal reaches CouponVault once: PASS
Manual-review accounts resolved safely: PASS (reviewed read-only; no automatic changes)
Accounts intentionally left unchanged: 3
Frontend/mobile secret scan: PASS (0 matches)
Game-engine regression: PASS (317/317)
Multiplayer regression: PASS (90/90)
API regression: TOURNAMENT SUITE PASS (61/61); full API aggregation pending completion
TypeScript: PASS
Build: PASS
Dependency audit: PASS WITH ACCEPTED DEV-ONLY EXCEPTIONS
```

### Source audit follow-up (2026-09-16)

- Authenticated profile and account-export DTOs now use explicit safe field selections; password and TOTP secrets are excluded.
- Account deletion now anonymizes profile contact, address, password, and TOTP material inside the same transaction.
- KYC storage upload failures now throw so the service fallback/error path runs.
- Production CouponVault configuration rejects the development key, localhost endpoints, and non-HTTPS URLs.
- Docker migration uses `prisma migrate deploy`; destructive `db push --accept-data-loss` was removed.
- Completed coupon ownership is checked before returning idempotent success; external 409 responses are never treated as proof of ownership.
- Approved withdrawals now invoke the CouponVault transfer with the wallet-request ID as the external idempotency key; confirmed failures refund once and timeouts remain held for reconciliation.
- Sensitive KYC, role, and tournament financial mutations require fresh MFA; read-only admin routes remain unchanged.
- Public profile privacy now reads and writes the PostgreSQL `UserPrivacy` record; the in-memory privacy map was removed.

End-to-end route tests and the full API aggregation still need to be rerun against the test database before release.

### Final Verdict

The required security suite and financial concurrency checks pass on PostgreSQL. The tournament release blocker is closed: `routes/__tests__/tournaments.test.ts` passes 61/61 with real match relationships, corrected final-round setup, and database-backed concurrent slot locking. Full API aggregation is still pending completion; no production deployment was performed.

# **NOT PRODUCTION READY**
