# Gaming Hub staging approval package

Prepared 2026-10-10. Verified application code: `986f2b6`; local report/evidence commit: `becbb1412c4f484ca5a9924495a9f6928763d3d7`. Proposal only: no provisioning, deployment, push, production data writes or live environment changes.

## Current findings — freshly inspected

The signed-in [Gaming Hub Render project](https://dashboard.render.com/project/prj-db1iq0ad0e5s73fussb0) contains only Production with five resources. No staging environment exists. API, socket and frontend all show last successfully deployed commit `9a02477`, branch `main`, with automatic deploy triggers. The API and socket are Free; the socket compute selection is 0.1 CPU / 512 MB. Inactivity can delay requests by 50 seconds or more. The socket compute page provides no captured metrics, so this inspection does not establish runtime health, capacity or resolution of past OOMs.

Render PostgreSQL 18 is suspended by the owner. The application database identity was not inspected, and the suspended database must not be assumed to be the active application database. Valkey 8 exists in Production; its plan was not refreshed. No environment secrets were opened. Read-only inventory is in `inspection.json`.

## Local release evidence — separate from live staging

[Current local verification](../../audits/2026-10-10-pre-staging-final-verification.md): API 111 files / 1522 passing tests, web 56 / 498, multiplayer 32 / 451, engine 29 / 444, zero failed/skipped. Distributed recovery contributes 37 passing API tests. Typecheck (nine workspaces), build, 13 fresh migrations and fresh-schema parity passed. One current API pass was run. The report identifies a legacy test outside the configured discovery and preserved developer fixture edits. These results are from the previous local verification step, not rerun in this documentation-only step.

The local authenticator QR privacy fix is not deployed. Do not treat existing production behavior as evidence for the new code.

## Proposed isolated resources — approval required

Singapore backends/datastores and global static frontend. Staging must use network isolation, independent resources, no production environment groups, and auto-deploy disabled.

| Resource | Allocation | Monthly USD |
|---|---|---:|
| gaming-hub-staging-web | Static | 0 |
| gaming-hub-staging-api | 1 replica, 1 CPU / 2 GB | 25 |
| gaming-hub-staging-socket | 2 replicas, each 1 CPU / 2 GB | 50 |
| gaming-hub-staging-db | 0.5 CPU / 1 GB, 100 connections | 19 |
| gaming-hub-staging-redis | 1 GB, persistent, noeviction | 20 |
| DB storage beyond included 1 GB | 4 GB additional | 1.20 |
| Pro workspace if an upgrade is needed | Network-isolated environments | 25 |
| **Total without / with workspace upgrade** | | **115.20 / 140.20** |

Prices refreshed from [Render pricing](https://render.com/pricing) and socket compute on 2026-10-10. Excludes taxes, bandwidth/build overages, auth/storage, CouponVault, email, KYC and observability fees. Provider pricing and existing workspace subscription remain unverified. A suggested Render-only planning ceiling is $145/month; this is not a hard billing cap or permission to spend. Instance sizes are test allocations, not certified capacity.

[Compute-plan documentation](https://render.com/docs/compute-plans) lists 1000 connections for 1 GB Key Value, while pricing lists 250. Budget for 250 and verify the provisioned limit. DB pools proposed at API 20 plus two socket pools of 10; reserve connection headroom for migrations/locks/monitoring and measure actual totals. Do not silently enable storage autoscaling or paid add-ons.

## Safe source delivery is a release gate

An ordinary `origin/main` push would deploy Production. It is prohibited for this staging-only phase. The earlier proposal's new staging branch is superseded: no branch is created under this repository's direct-to-main policy.

Before publishing code, approve a separate staging-only source/repository or equivalent immutable delivery of the verified commit that does not trigger Production. Creating that source, uploading code and connecting Render are separate authorized actions still pending. Staging deploys must pin the approved exact commit; reject accidental latest-main deployment. Do not disable Production auto-deploy or change production settings automatically.

## Environment isolation checklist

The three `.env.example` files are review templates, not active credentials or deployable settings. Secrets remain blank and must be set only after exact staging identities are approved.

- Dedicated empty staging PostgreSQL instance/database/role; no production Neon host, production backup, PII or wallet rows. Never copy the root `.env`.
- Dedicated staging Redis, internal authenticated URL, noeviction. No shared production coordination keys.
- Separate Supabase test auth/storage project. API/socket and web public key must belong to that issuer. Never expose service-role keys to the frontend. [Supabase environment guidance](https://supabase.com/docs/guides/deployment/managing-environments) recommends separate staging and production projects.
- Independent random staging internal API and 32-byte TOTP encryption keys. NODE_ENV remains production to exercise real safeguards; no mock-provider bypass.
- HTTPS CouponVault test tenant/test key with live cash-out rails disabled. Test-only payment/KYC providers wherever used. Confirm isolation at provider account/tenant level, not merely by host names.
- Separate email provider account with controlled recipient restrictions and synthetic inboxes. Production mode prohibits mock email in current validation; do not weaken it for staging.
- Exact staging frontend origin in CORS/callbacks, plus narrowly approved native callback requirements. No production callbacks or preview wildcard.
- Verify all identities before first migration. Actual staging isolation remains NOT TESTED because resources do not yet exist.

## Migration/startup and mobile prerequisites

Current Docker API/socket startup launches the service directly; it does not run migrations. Root production dependencies retain the Prisma CLI. Configure a **single staging API pre-deploy job** with `npx prisma migrate deploy --schema packages/db/prisma/schema.prisma`, using only the approved staging URL. Gate API/socket availability on success and verify all 13 migrations/status/schema parity. Do not use db push, migrate dev or accept-data-loss. Validate CLI availability in the built staging image before running the job; do not let npx fetch an unpinned replacement.

`apps/web/capacitor.config.ts` currently points to the production frontend and uses the production app identity. Do not run native staging smoke tests using that configuration. Prepare a separately reviewed staging native build/callback/app identity before installing test clients. Production mobile configuration remains unchanged.

## Execution after explicit approvals

1. Approve named resource sizes, region, monthly budget, duration/cleanup and separately quoted provider fees. Establish staging-only delivery without a Production trigger.
2. Provision isolated identities and populate staging secrets; verify DB/Redis/auth/provider disjointness. Fail closed if anything is unknown.
3. Deploy the pinned verified commit, run the single migration job, verify health/readiness, Redis, sockets, routing and actual deployed security headers.
4. Execute the 158-check `verification-matrix.csv` using two actual test clients and synthetic funds. All current live checks are NOT TESTED; missing infrastructure never counts as PASS. Cricket remains unavailable; test the nine supported games.
5. Test auth/MFA, rooms, gameplay/reconnect/exit, sandbox coupon/withdrawal/refund/reconciliation, tournament progression and duplicate prevention.
6. Run paced load and at least a two-hour soak with CPU/RSS/heap/event-loop/latency/connection/queue metrics. No forced GC in realistic gameplay measurements. Stop increasing load at sustained resource pressure; drain cleanly. No production load or failure injection.

## Verdict

**Local gates passed; isolated staging preparation is reviewable. STAGING NOT VERIFIED.**

Blocked on resource/cost/provider approvals, safe source delivery, staging identities, native test configuration and all deployment/live smoke/soak evidence. No production deployment approval is inferred.
