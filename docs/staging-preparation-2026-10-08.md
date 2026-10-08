> Updated preparation, costs and full PASS/FAIL/NOT TESTED matrix: [isolated staging package](staging/2026-10-08/README.md). This earlier checklist remains historical context; no resources were provisioned.

# Staging preparation — 2026-10-08

## Current infrastructure (read-only dashboard inspection)

The signed-in Render `gaming hub` project contains only a **Production** environment. No staging services or environment were visible. No settings, deployments, resources, secrets or production data were changed.

| Component | Existing service | Environment | Branch | Verified limits / state |
|---|---|---|---|---|
| API | gaming-hub (`srv-dab6lgp42hec73a1ohtg`) | Production | main | Selected Free: 0.1 CPU, 512 MB RAM; deployed baseline 8564429 |
| Socket | gaming-hub-socket (`srv-dab7uk942hec73a5jl5g`) | Production | main | Selected Free: 0.1 CPU, 512 MB RAM; deployed baseline 8564429; Free does not support multiple replicas |
| Web | gaming-hub-frontend (`srv-dab8klid0e5s73dmuht0`) | Production | main | Static hosting; deployed baseline 8564429 |
| PostgreSQL | gaming-hub-db-1 | Production | N/A | Suspended by owner; PostgreSQL 18; not accessed |
| Redis | gaming-hub-redis | Production | N/A | Valkey 8; not accessed |

Render warns the existing free web services sleep when inactive and can delay requests by 50 seconds or more. These limits and sleep behavior do not establish multiplayer capacity. Production database routing was not inspected and must not be inferred from the suspended Render database: the application may use external Neon.

Dashboard sources: [project](https://dashboard.render.com/project/prj-db1iq0ad0e5s73fussb0), [API compute](https://dashboard.render.com/web/srv-dab6lgp42hec73a1ohtg/compute), [socket compute](https://dashboard.render.com/web/srv-dab7uk942hec73a5jl5g/compute).

## Prepared isolation plan — not provisioned

Create a separate **Staging** environment with these proposed names, after approval:

- `gaming-hub-staging-web`: static frontend, approved verification branch/commit, automatic deployment off initially.
- `gaming-hub-staging-api`: Dockerfile.api, same pinned commit, `/health/ready` readiness check, automatic deployment off.
- `gaming-hub-staging-socket`: Dockerfile.socket, same pinned commit, `/health/ready`, shared staging Redis, `DISTRIBUTED_MATCHES=true`.
- `gaming-hub-staging-db`: independent PostgreSQL instance/database, never the production Neon database; migration credentials scoped to staging.
- `gaming-hub-staging-redis`: independent Redis/Valkey endpoint and credentials, never production queues, locks or keyspace.

Do not reuse the three current public URLs as staging. Do not deploy unreviewed changes on `main`: current production services auto-deploy from it. Use an explicitly approved separate branch and pinned verification commit.

For a multi-replica smoke test, socket staging needs two replicas; the current free plan cannot provide this. Proposed review target is 1 CPU / 2 GB per socket replica, but this is a starting test allocation, **not an established capacity recommendation**. Paid plans, replica counts, DB/Redis sizes and final monthly cost require user approval before provisioning. No blueprint that automatically creates billable resources was applied.

## Configuration checklist (secret values stay in hosting configuration)

- All server processes: `NODE_ENV=production`.
- `DATABASE_URL`: separately approved staging host/database; compare host/database identity to production without logging credentials. Reject the production Neon target.
- `REDIS_URL`: staging-only endpoint. Both socket replicas share it; API uses it for distributed limits/coordination as configured.
- `API_URL`: HTTPS staging API; `SOCKET_SERVER_URL`: HTTPS staging socket.
- `CORS_ORIGIN`: exact staging frontend origin plus explicitly approved mobile origins, no wildcard or production/preview hosts.
- `INTERNAL_API_KEY`: random staging-only value shared only by staging API/socket.
- `SUPABASE_URL`, service-role key, JWT settings and frontend publishable key: separate staging project. Approved callback/recovery/mobile redirects only.
- `TOTP_ENCRYPTION_KEY`: base64-encoded 32-byte staging key, independently generated; verify parser contract without printing it.
- `COUPON_API_URL` / `COUPON_API_KEY`: actual CouponVault test environment/key. Test-only integration is currently **unverified**; do not copy live provider settings.
- HTTP email provider: staging test-safe recipients/sandbox, no OTP values or API keys in logs.
- Frontend build: staging `VITE_API_URL` ending in `/api`, staging `VITE_SOCKET_URL`, staging Supabase publishable configuration; never service-role/internal secrets.
- Rate limiting, MFA, KYC, withdrawal verification and immutable financial ledger remain enabled; do not bypass them for staging.

## Migration and release sequence

1. Approve independent resource identities, plans, branch and commit; provision staging only.
2. Verify DB/Redis identities using redacted host/database metadata, not inherited root `.env`.
3. Run once before API/socket startup: `npx prisma migrate deploy --schema packages/db/prisma/schema.prisma`. Use the **current** migration count, not the historical four-migration assumption. No db push/migrate dev/data-loss flags.
4. Verify schema/migration status, start API then socket, build frontend against staging URLs.
5. Two authenticated sessions: create/join/ready/start, legal and rejected actions, reconnect/restart recovery, settlement and rematch. Exercise Carrom, Table Tennis and Snake movement during recovery.
6. Coupon funding/withdrawal/timeout reconciliation, MFA/IDOR, tournament registration/settlement, test-safe email, headers/CORS and observability.
7. Paced load and extended soak on actual resource limits; stop before exhaustion. Record CPU/RAM/event-loop/Redis/PG connections and end-to-end opponent latency.
8. Only successful deployment plus live multiplayer verification permits **STAGING VERIFIED**. Production deployment remains a separate review.

## Blocker

No isolated staging resources currently exist in the inspected project, and creation/deployment approval has not been granted. Staging isolation, secrets, test-only payment integrations and live smoke verification therefore remain **BLOCKED**, not passed.
