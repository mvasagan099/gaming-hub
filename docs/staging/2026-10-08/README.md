# Isolated staging preparation and verification report

Prepared 2026-10-08 against **9b813000599d7abf99734858bcc6e69b356e2dd9**. This package is a proposal, not a Render Blueprint, deployment script or permission to spend. No push, provisioning, deployment, production credential inspection or database connection occurred.

## Verdict and test status

**READY FOR STAGING — existing local release evidence. STAGING NOT VERIFIED. Production deployment review is blocked by unperformed live verification.**

The previous local report records API 1394/1394, distributed recovery 31/31, engine 425/425, multiplayer 395/395, web 383/383, security/IDOR 188/188, financial 48/48, typecheck/build and 11 fresh migrations PASS. Those suites were not rerun for this documentation-only preparation. They are not substituted for live staging tests.

[verification-matrix.csv](verification-matrix.csv) lists **158 explicit checks: 4 PASS, 0 FAIL, 154 NOT TESTED**. PASS applies only to preparation/source inspection. Every deployment, live game, financial provider and performance check is NOT TESTED pending approval and isolated resources. Each eventual execution must record date, commit, client/replica identities, sanitized evidence and actual result. A missing environment is NOT TESTED, never a fake PASS.

## 1. Current Render inventory — freshly inspected, read-only

Only **Production**, five resources, is visible in project `gaming hub` (`prj-db1iq0ad0e5s73fussb0`). No Staging environment is provisioned.

| Component | Production resource ID | Actual selected plan/state | Branch and successful commit |
|---|---|---|---|
| API, gaming-hub | srv-dab6lgp42hec73a1ohtg | Free, 0.1 CPU / 512 MB | main / 8564429 |
| Socket, gaming-hub-socket | srv-dab7uk942hec73a5jl5g | Free, 0.1 CPU / 512 MB, one instance | main / 8564429 |
| Web, gaming-hub-frontend | srv-dab8klid0e5s73dmuht0 | Static | main / 8564429 |
| PostgreSQL, gaming-hub-db-1 | dpg-db08gdtg1s2s73d0r5ug-a | PostgreSQL 18, suspended by owner | N/A |
| Key Value, gaming-hub-redis | red-dab8euh42hec73a75t9g | Valkey 8, compute not inspected | N/A |

API/socket show inactivity spin-down warnings and no Free scaling. Their current compute metrics page does not provide captured data for the past 48 hours; that is not evidence of healthy runtime behavior. Recent deployments show Auto-Deploy. No main push is authorized. The suspended Render database does not identify the application's actual database; production may use Neon. Production database URLs and secrets were not opened.

Sources: signed-in [project](https://dashboard.render.com/project/prj-db1iq0ad0e5s73fussb0), [API compute](https://dashboard.render.com/web/srv-dab6lgp42hec73a1ohtg/compute), [socket compute](https://dashboard.render.com/web/srv-dab7uk942hec73a5jl5g/compute), [web](https://dashboard.render.com/static/srv-dab8klid0e5s73dmuht0).

## 2. Proposed resources and costs — approval required

Singapore for backend/datastores, global static frontend. Create a **network-isolated Staging environment**, with protection against accidental deletion, independent resources and no production environment groups. Pro workspace is included in this estimate because network-isolated environments require Pro or higher. If the current workspace already has Pro, the extra $25 is not incremental. Workspace plan was not changed or inspected for billing.

| Proposed service | Size/replicas | Estimated USD/month |
|---|---|---:|
| gaming-hub-staging-web | Static | 0 |
| gaming-hub-staging-api | 1 × 1 CPU / 2 GB | 25 |
| gaming-hub-staging-socket | 2 × 1 CPU / 2 GB | 50 |
| gaming-hub-staging-db | 0.5 CPU / 1 GB, 100 connections | 19 |
| gaming-hub-staging-redis | 1 GB | 20 |
| PostgreSQL extra storage | 5 GB total, first 1 GB included | 1.20 |
| Pro workspace, if an upgrade is needed | Network isolation | 25 |
| **Estimated Render subtotal** | **Including potential workspace upgrade** | **140.20** |

Prices checked on [Render pricing](https://render.com/pricing) and the dashboard on 2026-10-08. This is a planning estimate, not a guaranteed bill or spending authorization. Excludes tax, bandwidth/build overages, Supabase staging auth/storage, CouponVault test hosting, email/provider fees, paid observability and domains. These provider costs remain unquoted and require separate approval. If Pro already exists, estimate is $115.20 incremental. Suggested Render-only authorization ceiling is $145/month, excluding unapproved overages and providers; Render does not provide a proven hard cap through this document.

Sizes are initial test allocations, not capacity certification. Redis pricing lists 250 connections for the proposed 1 GB tier while compute documentation lists 1000; plan conservatively for 250 and confirm the provisioned limit before load. PostgreSQL connection limit is 100: API pool 20 plus socket pools 10 each leaves 60 nominal connections for migrations, workers/advisory locks and monitoring; measure actual totals. Redis should use internal authentication, paid persistence and `noeviction` so memory pressure fails writes rather than silently dropping coordination/job keys. Alert before memory exhaustion.

Infrastructure source: [compute plans](https://render.com/docs/compute-plans), [network isolation](https://render.com/docs/blueprint-spec), [Key Value policy](https://render.com/docs/key-value). These sources and the actual creation screen must be rechecked before spending.

## 3. Isolation gates — cannot yet be certified

[resources.proposal.json](resources.proposal.json) deliberately leaves all staging IDs/identities null and both write/deployment permissions false. Fill identities after approval, then verify before the first migration:

1. Dedicated Render DB instance, hostname, database and role. Its credentials have access only to staging. Do not use production Neon, clone live secrets or restore production PII/financial rows. Empty staging DB with synthetic fixture users only.
2. Dedicated Redis instance with authentication and environment isolation. Both socket replicas share staging Redis, never production keys/queues/locks. Disable external access except narrowly approved operator IPs when needed; no all-IP allowlist.
3. Separate Supabase staging project, signing issuer, publishable key, API service-role key and private `kyc_upload` bucket. Restrict account creation/invitations to controlled test users. No production accounts, shared sessions or KYC documents.
4. Different internal API key and 32-byte base64 TOTP encryption key, generated only for staging and entered directly into approved secret settings. Compare provenance/secret identities without logging values. Never add credentials to this proposal or Git.
5. Exact staging API/socket/frontend URLs and CORS origin. Production tokens must fail against the staging issuer and staging tokens must not authorize production. No shared production cookie/domain storage. Negative authorization tests use test tokens only; no probing production APIs with writes.
6. Separate CouponVault test tenant, database, API key and test wallet. Test-mode status must be independently confirmed by provider metadata/operator evidence, not inferred from hostname containing 'staging'. Live payment/cash-out connectors must be disabled at the provider. Do not configure unknown payment integrations merely to make tests green.
7. Email: commit requires a real supported provider in `NODE_ENV=production`; `EMAIL_PROVIDER=mock` is rejected. Use a separate Brevo test account/subaccount and controlled inboxes. The existing adapter does not inject Brevo's sandbox header or enforce a recipient allowlist, so do not claim sandbox protection from the app. Provider-side recipient restrictions or a closed test-user population must be verified before enabling sends. Supabase auth emails need their own staging/test-safe delivery configuration.
8. KYC at this commit uses internal administration and Supabase storage; no separately configurable external KYC provider was found in env contracts. Use conspicuously synthetic documents, a private staging bucket and staging administrators with MFA. If an external provider is later enabled, require its documented sandbox first.

Private-network isolation does not block access to public production Neon/Supabase/provider endpoints. Distinct least-privilege credentials and exact endpoint verification are mandatory. Until actual identities/secrets and negative tests are checked, **staging cannot-modify-production remains NOT TESTED**, not certified by these templates.

## 4. Prepared configuration and deployment sequence

Templates: [API](api.env.example), [socket](socket.env.example), [web](web.env.example). All secret values are blank; they must fail startup until deliberately configured. Names match current source contracts. No invented `KYC_PROVIDER`, `PAYMENT_MODE` or application `STAGING=true` safety flag is claimed. Secret values belong only in Render staging settings, not Vite build config. Frontend gets only public URLs and a staging Supabase publishable/anon key.

After explicit resource/cost **and deployment** approval:

1. Publish only an approved staging branch, proposed `codex/staging-9b81300`, pointing to exactly `9b813000599d7abf99734858bcc6e69b356e2dd9`. Do not push main. Set every staging service's auto-deploy off; pin the same commit for all three deployments. Prepared documentation is not itself an approved changed release.
2. Create the isolated environment and independent resources. Record actual IDs, URLs, selected plans/limits and provider test identities. No import of production env groups.
3. API image: `Dockerfile.api`. Socket image: `Dockerfile.socket`. Web root build: `npm ci && npm run build -w @gaming-hub/web`; publish `apps/web/dist`, SPA rewrite `/*` to `/index.html`, verified real hosted security headers. Generate headers with `scripts/render-security-headers.mjs` using exact staging endpoints. Review KYC camera permissions if selfie capture is part of the smoke test; do not blindly apply `camera=()` to that flow.
4. Before API/socket start, single staging API pre-deploy job: `npx prisma migrate deploy --schema packages/db/prisma/schema.prisma`. Check target identity first; inspect all 11 migration results and `prisma migrate status`. Never db push, migrate dev, reset or data-loss flags. Socket startup waits for migration success. Do not run migrations on both replicas concurrently.
5. Check `/health/live`, `/health/ready`, DB read-only identity/connection counts and Redis connectivity separately. API readiness checks PostgreSQL, not Redis. Socket readiness checks initialized framework/distributed readiness, not every provider. Health 200 alone cannot prove full integration.
6. Verify two distinct socket instances actually receive authenticated clients. Redis adapter alone does not prove distributed gameplay; identify owner/replica and exercise cross-replica matchmaking, recovery and action fencing. Check polling stickiness or force the verified WebSocket client path where appropriate; do not weaken auth/CORS.
7. Scan deployed frontend assets/logs for credentials without exposing values. Public Supabase publishable key is expected; service-role/internal/provider/database secrets are forbidden. Check SPA direct routes, auth callback/recovery and missing Cricket route.
8. Run the matrix and attach sanitized browser recordings, action IDs/state versions, ledger/withdrawal IDs and provider test transaction identities.

### Native staging blocker

`apps/web/capacitor.config.ts` hardcodes the production frontend URL and production app ID. `packages/shared/src/deepLink.ts` accepts `com.gaminghub.app:` and only production HTTPS hosts; a new staging scheme/host is currently rejected. `apps/web/src/lib/authUtils.ts` has a production fallback origin. Do not run the existing native build as a staging client.

Native testing requires a separately reviewed staging-only build/configuration with a distinct app ID, staging URL, exact approved callback host/scheme and staging Supabase redirects, without broadening the production allowlist. That build differs in configuration from the immutable baseline and needs its own review/regression evidence. Browser-only staging can start first after approval; native Back/deep-link results remain NOT TESTED until a safe native build exists. No production mobile configuration was changed here.

## 5. Real games and financial test method

Canonical supported nine-game list: Ludo, Chess, Carrom, Snooker, Table Tennis, Snake & Ladder, Fruit Ninja, Bubble Shooter, Snake vs Worms. **Cricket was removed and must not be reintroduced.** Test its absence as a negative case: no catalog/engine/selector and `/games/cricket` cannot launch gameplay. Preserve historical data.

For each supported game use two distinct staged user accounts on two independent real clients; different browser profiles/devices, not two tabs sharing one session. Exercise Quick Match/private join, seats/colors/order, valid/rejected actions, disconnect/reconnect, ready/countdown, timers, server winner, rematch and tournament where supported. Multiplayer IDs/history/FEN/outcomes must converge. Capture each Carrom shot exactly once on both clients, queen/pocket/foul behavior and placement recovery; Chess history remains chronological SAN regardless of orientation. In-game Exit opens Cancel/Exit Game confirmation and performs cleanup once; browser/gesture/native Back navigates directly without this modal, letting existing unmount cleanup run.

Only controlled CouponVault test coupons fund MAIN through the normal path. Do not use direct balance writes, admin deposits or production funds. Redeem/duplicate/concurrent requests, game entry/prize and tournament refunds must produce one ledger effect per reference. Before explicit withdrawal, external transfer count must remain zero. Approved withdrawal transfers once with `WalletRequest.id` as idempotency key. Unknown result holds funds; confirmed failure refunds once; processed reconciliation completes once. Repeat/replay/race tests must preserve ownership, locking, generic-409 rejection, MFA, KYC, OTP atomic consumption and server-authoritative settlement. No security bypasses for tests.

## 6. Performance and soak plan

Start with a two-client baseline, then paced 10/25/50 simultaneous players, increasing only when resource and latency measurements remain acceptable. Mix all games; separately profile Carrom, Table Tennis and Snake. Include realistic pauses, legal moves, spectators, completed matches/rematches and reconnect churn. Do not flood artificial actions or interpret a burst maximum as capacity.

Collect per replica, at fixed intervals:

- Render CPU/RSS and restart/OOM events, selected plan/replica count and timestamp.
- Existing socket `[MEMORY]` diagnostics: RSS/heap, CPU, event-loop p50/p95/p99, sockets, rooms/timers, pending coordinator operations, Redis connections. Sampling is 60 seconds; no forced GC during live gameplay.
- Client monotonic action/ack/opponent-render timings, state versions, missed/duplicate/out-of-order events and receipt/broadcast rates. Different-device clocks need synchronization or RTT-based measurements; do not subtract unsynchronized timestamps.
- API authenticated `/metrics` using only staging internal key, plus client latency/status. It supplies request histograms and process memory; not all socket performance costs are exposed there.
- PostgreSQL connections, lock waits and query latency; Redis `INFO` used memory, clients, rejected connections/evictions and persistence/reconnect.

Run at least **two hours** at a sustainable observed level, then drain/idle 15 minutes to verify cleanup; a longer 8–24 hour soak is a subsequent approval decision. Record cold/warm phases, GC pauses and network/provider disruptions separately. Candidate initial gates (to agree before testing): no OOM/crash/unplanned restart, no duplicated finance/outcomes, no growing settled-room retention, event-loop p99 below 50 ms and opponent-update p95 below 200 ms on the controlled test network. These are proposed acceptance targets, not measurements or capacity promises.

Stop increasing load if sustained CPU exceeds 80%, RSS exceeds 80% of the actual replica limit, datastore connections/memory approach 80%, queues grow without draining or errors/timeouts increase. Gracefully finish/leave test rooms rather than deleting financial state. Diagnose bottlenecks before requesting larger paid resources. After the soak, failure-inject only staging API/socket restart, temporary Redis/DB outage and provider/email timeout, then verify recovery and exactly-once ledger outcomes. No production load or chaos tests.

Existing local measurements (three 60-second paced runs) are historical comparison: CPU 17.8–18.8% of one local core, loop p99 19.3–19.9 ms, peak RSS 180–188 MiB. Separate forced-GC burst retention ends at 29.5 MiB heap. Local Node 24/hardware differs from production Node 22/Render; no direct capacity scaling is justified.

## 7. Remaining blockers and approval scope

- Staging resources/costs and deployment not approved or provisioned.
- Supabase test project, CouponVault test tenant, email account, test recipient controls and their costs unverified.
- Exact DB/Redis/auth/provider identities and production disjointness not verified.
- Native staging callback/app configuration requires separate review.
- Live multiplayer, provider financial flows, real resource limits/latency and sustained soak not tested.
- Large AudioManager build chunk remains a loading/performance risk; no feature changes made.

Approve the named resources/plans/region, Render spending ceiling, duration/cleanup expectations and separately quoted provider costs before creation. Deployment/push permission must be explicit too. Approval of a plan does not silently authorize production deployment or indefinite cost increases. After deployment, **STAGING VERIFIED** requires critical matrix checks to pass with evidence; production deployment remains a separate review.
