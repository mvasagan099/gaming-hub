# Distributed match recovery operations

Keep PostgreSQL and private/ACL-protected Redis accessible to every socket replica. Redis leases admit an owner; PostgreSQL's monotonic sequence fences checkpoints and result creation. Never reset the PostgreSQL fencing sequence. Restore database backups consistently with their snapshots and sequence; Redis recovery does not replace database recovery.

Set `DISTRIBUTED_MATCHES=true`, `REDIS_URL`, `DATABASE_URL`, `API_URL` and `INTERNAL_API_KEY` on socket replicas. Production refuses process-local mode, missing Redis, non-HTTPS API URLs and placeholder service credentials. Socket and API must use the same deployed `INTERNAL_API_KEY`; the header is `x-internal-key`. Startup probes the authenticated API `/metrics` endpoint without reading/logging its body or logging any credential. A saved Render setting does not prove the running process uses it; redeploy both services after changes and verify `INTERNAL_API_AUTH_OK`.

The final engine result and its outbox record commit in one fenced PostgreSQL transaction before publication. The worker retries with an expiring unique claim; the API owns financial settlement. A network failure or lost acknowledgement must keep the result retryable. Inspect persistent pending/retryable results and alert on prolonged age. Never mark an outbox delivered manually to hide an error. Tournament provisions likewise retain their original bracket match ID and retry until a canonical room exists.

Before migration, use a read-only database role to run `npm run db:preflight -- /absolute/path/reconciliation.json` with the intended database connection supplied privately. The script executes a READ ONLY transaction and only SELECT queries. Review every paid duplicate, participant conflict, legacy live match and unsettled result with its ledger. Do not delete paid records or run migration deploy as part of preflight.

Upgrade policy: drain legacy processes and allow their existing matches to finish under the original engine code. Do not load unversioned or incompatible Ludo/Fruit snapshots into the new engine. If draining cannot finish, an operator must reconcile the canonical result versus entry ledger and use the existing idempotent cancellation/refund API under the product rules. Preserve all match/player/ledger records. Only proceed when the preflight report is clean or each finding has an approved documented reconciliation. This audit has not accessed production or authorized cancellation/refunds.

Use `TEST_DATABASE_URL` (database name must clearly indicate test), `TEST_REDIS_URL` and the recovery integration suite for local failure testing. Tests start real socket processes on ports 14007/14008 and the real HTTP API on 14006. Never point the test suite at production: its setup resets the isolated test database. Shut down test-owned processes only.

Do not deploy automatically. Device certification remains separate.

## Render startup failure after the recovery release

The supplied 2026-10-07 17:34 UTC logs show INTERNAL_API_AUTH_OK (200), Redis adapter attachment and framework initialization, followed by a fatal error before port binding. The operator confirmed the new production migrations have not been applied. The socket startup requires LiveRoomCheckpoint, GameResultOutbox and match_owner_fencing_seq. API health/authentication does not prove this schema is installed. Missing schema is a required prerequisite to resolve; the original error object was not serialized, so Redis/database connectivity should also be checked if startup still fails after migration.

Startup failures now log the original Error under Pino's `err` field, including its message/stack, plus a stage identifying Redis connection or distributed room startup. Missing-schema errors name the required objects and migration prerequisite. Startup remains fail-closed; it does not create schema, modify wallets or fall back to process-local paid play. Focused diagnostics/authentication regression: 10 passing tests across two files. Socket typecheck and production bundle: PASS, exit 0. The earlier complete 2,184-test result remains historical; the entire suite was not repeated for this diagnostic-only change.

A Mac terminal can run the release migration tools against Render's External Database URL; the premium service shell is not needed. Use the intended production database connection privately, never paste it into chat. In zsh:

```sh
cd "/Users/lakoffice/Documents/gaming hub"
read -r -s "DATABASE_URL?Paste the Render External Database URL: "
echo
export DATABASE_URL
npm run db:preflight -- /tmp/gaming-hub-production-preflight.json
```

Inspect the report. Proceed only after CLEAN or approved reconciliation and after existing games are drained. The migration command applies all pending committed migrations, including the unique seat constraint; do not bypass duplicate-seat findings or use db push to conceal migration history.

```sh
npx prisma migrate status --schema packages/db/prisma/schema.prisma
npx prisma migrate deploy --schema packages/db/prisma/schema.prisma
unset DATABASE_URL
```

Restart/redeploy the API and socket services against the same migrated database. Confirm INTERNAL_API_AUTH_OK and Socket server listening on port 4001; if failure remains, inspect the new startupStage and err.message. This follow-up has not accessed or migrated production, refunded historical entries, or verified a successful running deployment.
