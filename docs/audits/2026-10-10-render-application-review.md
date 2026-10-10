# Gaming Hub deployed application review

Date: 2026-10-10 (Asia/Kolkata). Local source: main `0613c3d`. Deployed web/API/socket: `9a024773a7cd9af0f098cf45e5011ba8a9745ead` as shown by Render.

## Scope and access

Read-only inspection of the signed-in Render dashboard, low-volume public HTTP requests, public game entry screens, source review, and isolated local regressions. Render plugin monitoring/debug skills were used. Its MCP connection tools were not exposed in this chat; no Render CLI was installed. The authenticated dashboard provided the deployment, logs, plan and configuration evidence instead.

No production records, secrets, settings, deployments or resources were modified. No production gameplay, wallet transfers or load tests were performed. Database URL values were inspected only to extract host/database identity and were masked again; credentials are excluded from this report. No production database connection or migration command ran. The existing registrationCountry fixture modification remains untouched.

This is a deployment/application review, not complete production certification, a penetration test, or a full API-suite run.

## Infrastructure findings

| Resource | Current evidence | Assessment |
| --- | --- | --- |
| Web | Static site, deployed `9a02477`, main | PASS deployment baseline |
| API | Dockerfile.api, Singapore, main, auto-deploy on commit; Free instance | PASS startup/readiness, operational capacity risk |
| Socket | Dockerfile.socket, Singapore, main, auto-deploy on commit; 512 MB / 0.15 CPU | PASS startup/readiness, operational capacity risk |
| Render PostgreSQL | gaming-hub-db-1 suspended by owner | Not the active application database |
| Actual API/socket DB | Both point to `ep-round-mud-b341hwsq-pooler.c-4.ap-southeast-1.aws.neon.tech`, database `neondb` | API read-only database readiness PASS; no schema/data inspection |
| Redis | Available, Valkey 8.1.4, 25 MB / 50 connections / 0.05 CPU, persistence off, allkeys-lru | Coordination capacity and eviction risk |
| Redis network | External endpoint unavailable; Valkey-specific inbound rules block all Internet traffic; internal authentication disabled | Public exposure was not demonstrated; review internal tenant access and credentials |
| Isolation | Gaming Hub project lists only Production environment with these five resources | Isolated staging NOT VERIFIED |

API and socket NODE_ENV values were inspected as production; Docker startup also explicitly pins production mode. Required variable names are present for DB, provider authentication, internal API keys and CORS; API additionally has CouponVault, email and TOTP variables. Presence does not prove credential validity, test-provider isolation or key strength. API does not list REDIS_URL, but its production request limiter uses PostgreSQL; this absence alone is not a distributed rate-limit defect.

## Current public checks

- Web `/`, `/reset-password`, and `/wallet`: HTTP 200 application entry; SPA rewrite `/* -> /index.html` confirmed in Render.
- Browser navigation to `/wallet` while signed out redirects to `/login`.
- API `/health/live` and `/health/ready`: HTTP 200, database up. Initial responses took about 32.47 seconds; uptime was about 23 seconds.
- Socket `/health/live` and `/health/ready`: HTTP 200, about 42.52 seconds initially.
- Subsequent API public catalog/auth boundary requests took 0.17–0.30 seconds in this small sample. These are individual timings, not latency percentiles or a load benchmark.
- Both backend dashboards warn that Free instances spin down and requests can be delayed 50 seconds or more. Initial delays are consistent with cold startup, not proof of in-match lag causation.
- Anonymous `/api/auth/me` and `/api/wallet`: 401 UNAUTHORIZED.
- One live Socket.IO WebSocket connection with an invalid token: rejected UNAUTHORIZED and closed; no match created.
- Approved frontend CORS preflight: 204 with exact approved origin. Unapproved-origin preflight: 204 without Access-Control-Allow-Origin; browsers cannot read a credentialed response for that origin.

## Prioritized defects and risks

### High: latest recovery security correction is not deployed

Render is still running `9a02477`. Local `0613c3d` adds recovery-route refresh isolation and Gaming Hub application-session revocation after password reset. The live baseline therefore still lacks the two barriers documented in the earlier authentication review. A successful older deployment is not evidence these newer changes are live.

Solution: review and approve the release separately, then verify fresh reset email, password save, new/old password behavior, and rejection of old API/socket sessions. No push or deploy was performed here.

### Medium: frontend security headers are missing

Actual frontend responses include HSTS and nosniff, but no CSP, frame protection or Permissions-Policy. Render's Headers page contains no custom rules. Repository nginx headers do not apply automatically to this static site.

Solution: configure carefully scoped headers at the actual static hosting layer, validate allowed API/socket/auth/asset origins, and verify externally. Test before enforcing a CSP that could break games or authentication.

API health responses include CSP/frame-ancestors, HSTS, X-Frame-Options, nosniff and Permissions-Policy. Socket raw HTTP health responses do not include those headers; assess route-specific protections separately rather than claiming API Helmet covers the socket HTTP server.

### Medium: socket shutdown emits unhandled Redis rejections

Recent accessible application logs show shutdown at `2026-10-09T17:58:51Z`, followed by two `Connection is closed.` unhandled promise rejections from ioredis. This is a real deployed lifecycle error. It is not evidence of an OOM or a financial settlement failure.

Source shutdown uses unguarded awaited framework/coordinator/Redis cleanup; signal handlers discard the returned promise. Coordinator stop awaits subscriber quit. The log does not identify the exact offending operation; reproduce shutdown with in-flight Redis operations before choosing a patch.

Solution: drain producers and pending work before closing Redis, make shutdown idempotent, handle cleanup failures and verify no unhandled rejection during SIGTERM/restart. Preserve durable ownership fencing and settlement retry safety.

### Medium: Free backend capacity and Redis eviction are unsuitable evidence of stable multiplayer capacity

Socket has 0.15 CPU; Redis has 25 MB and uses allkeys-lru while it also participates in coordination. Memory pressure can evict coordination keys and cause owner recovery/churn. This is a configuration risk, not an observed eviction in this review. PostgreSQL ownership fencing remains relevant; cache policy must not be treated as a financial correctness guarantee.

Solution: use approved isolated staging and a paced active-match soak against actual limits; measure CPU/event-loop/action latency and Redis evictions/connections. Size an always-on plan based on those results. Evaluate non-evicting coordination storage with explicit memory/error handling. Do not upgrade or change policy blindly.

### Medium: existing game UI defects remain

Current source-executing component probes again reproduce:

- Chess and Ludo recreate the board on equivalent player-name arrays: two creations and one destruction instead of one/no destruction.
- Carrom spectator identity becomes seat zero in the child component.

These are UI defects. The probes mock Phaser/hooks and are not live frame-rate measurements. Server spectator rejection and authoritative state remain separate.

Solution: stabilize metadata dependencies and preserve spectator identity independently of view orientation, with focused regressions. These fixes were not implemented during this inspection.

## Games and live screen coverage

Live API catalog contains exactly nine enabled games, including configured 50-coin stakes. Local shared registry also contains these nine:

| Game | Public entry screen | Local engine/framework suites | Two-client live gameplay |
| --- | --- | --- | --- |
| Ludo | PASS loaded | PASS | NOT TESTED |
| Chess | PASS loaded | PASS | NOT TESTED |
| Carrom | PASS loaded | PASS | NOT TESTED |
| Snake & Ladder | PASS loaded | PASS | NOT TESTED |
| Fruit Ninja | PASS loaded | PASS | NOT TESTED |
| Bubble Shooter | PASS loaded | PASS | NOT TESTED |
| Table Tennis | PASS loaded | PASS | NOT TESTED |
| Snake vs Worms | PASS loaded | PASS | NOT TESTED |
| Snooker | PASS loaded | PASS | NOT TESTED |

Screen loading does not establish full gameplay correctness. Strategy filter shows four games. `/games/cricket` redirects home and does not launch Cricket. No production entry-fee or prize operation was attempted.

## Memory observations

Accessible historical socket log samples around 17:51–17:58 UTC on October 9 show roughly 128.1–128.8 MB RSS, 35.2–36.5 MB heap used, about 0.46–0.49% reported process CPU, event-loop p95 about 20.3–20.5 ms and p99 about 21.4–22.2 ms. All samples had zero connected players/active matches/rooms, with four Redis connections and five Redis subscriptions. These idle observations neither reproduce nor prove a fix for the prior Render OOM incident. No active-load capacity claim is justified.

Render's Free socket dashboard does not expose CPU/memory utilization graphs; it displays limits and an upgrade notice. Redis dashboard displays limits but yielded no numeric utilization values in the inspected view.

## Current local verification

| Suite | Files | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: | ---: |
| Full game engine | 29 | 444 | 0 | 0 |
| Full multiplayer | 32 | 451 | 0 | 0 |
| Full web | 52 | 476 | 0 | 0 |
| Selected API security/IDOR/MFA/wallet/financial/privacy | 8 | 111 | 0 | 0 |
| Total executed tests | 121 | 1,482 | 0 | 0 |

Selected API breakdown: wallet routes 11, financial concurrency/recovery 6, IDOR/economy 9, MFA lifecycle 1, password recovery sessions 7, privacy/KYC safety 22, attack simulation 16, remediation hardening 39. Fixtures used disposable localhost PostgreSQL/Redis and mocked external providers; not production Neon. The full API suite was not run in this review.

Production dependency advisory scan: zero reported advisories at all severities (`npm audit --omit=dev`). This does not prove absence of application vulnerabilities. Repository typecheck and build passed for the current local code in the immediately preceding recovery-fix phase; they were not rerun during this read-only review. No source changes were made here.

## Outstanding verification matrix

| Area | Status | Reason / next evidence |
| --- | --- | --- |
| Real login/reset-email/MFA/device logout | NOT TESTED | No controlled deployed test-account flow |
| Authenticated admin/RBAC/KYC operations | NOT TESTED | Live least-privilege accounts required |
| CouponVault/deposit/withdrawal/reconciliation | NOT TESTED live | Test providers and isolated accounts/funds required |
| Tournament registration/settlement/refunds | NOT TESTED live | Isolated test data and controlled financial flow required |
| Friends/messages/support ownership | NOT TESTED live | Two controlled accounts required |
| All-game matchmaking/private rooms/reconnect/rematch/exit | NOT TESTED live | Two clients and staging required |
| Mobile native Back/gesture and device layout | NOT TESTED | Real Android/iOS builds/devices required |
| Active CPU/memory/network soak and failure injection | NOT TESTED | Isolated staging, approval and resource monitoring required |
| Migration chain/backup restore/current live schema | NOT TESTED in this review | Disposable restore/migration drill; no production mutation |
| Full API aggregation | NOT TESTED in this review | Deterministic isolated groups needed; selected API results are not a substitute |

## Verdict

**NOT FULLY VERIFIED FOR PRODUCTION.** Deployment readiness/public boundaries and current selected local regressions pass, but live security release parity, UI defects, shutdown lifecycle, hosting configuration and critical authenticated/live workflows remain outstanding.

No automatic push, deployment, production mutation, resource purchase or revert was performed. Evidence: `docs/evidence/render-review-2026-10-10/`.
