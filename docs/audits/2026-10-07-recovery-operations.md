# Distributed match recovery operations

Keep PostgreSQL and private/ACL-protected Redis accessible to every socket replica. Redis leases admit an owner; PostgreSQL's monotonic sequence fences checkpoints and result creation. Never reset the PostgreSQL fencing sequence. Restore database backups consistently with their snapshots and sequence; Redis recovery does not replace database recovery.

Set `DISTRIBUTED_MATCHES=true`, `REDIS_URL`, `DATABASE_URL`, `API_URL` and `INTERNAL_API_KEY` on socket replicas. Production refuses process-local mode, missing Redis, non-HTTPS API URLs and placeholder service credentials. Socket and API must use the same deployed `INTERNAL_API_KEY`; the header is `x-internal-key`. Startup probes the authenticated API `/metrics` endpoint without reading/logging its body or logging any credential. A saved Render setting does not prove the running process uses it; redeploy both services after changes and verify `INTERNAL_API_AUTH_OK`.

The final engine result and its outbox record commit in one fenced PostgreSQL transaction before publication. The worker retries with an expiring unique claim; the API owns financial settlement. A network failure or lost acknowledgement must keep the result retryable. Inspect persistent pending/retryable results and alert on prolonged age. Never mark an outbox delivered manually to hide an error. Tournament provisions likewise retain their original bracket match ID and retry until a canonical room exists.

Before migration, use a read-only database role to run `npm run db:preflight -- /absolute/path/reconciliation.json` with the intended database connection supplied privately. The script executes a READ ONLY transaction and only SELECT queries. Review every paid duplicate, participant conflict, legacy live match and unsettled result with its ledger. Do not delete paid records or run migration deploy as part of preflight.

Upgrade policy: drain legacy processes and allow their existing matches to finish under the original engine code. Do not load unversioned or incompatible Ludo/Fruit snapshots into the new engine. If draining cannot finish, an operator must reconcile the canonical result versus entry ledger and use the existing idempotent cancellation/refund API under the product rules. Preserve all match/player/ledger records. Only proceed when the preflight report is clean or each finding has an approved documented reconciliation. This audit has not accessed production or authorized cancellation/refunds.

Use `TEST_DATABASE_URL` (database name must clearly indicate test), `TEST_REDIS_URL` and the recovery integration suite for local failure testing. Tests start real socket processes on ports 14007/14008 and the real HTTP API on 14006. Never point the test suite at production: its setup resets the isolated test database. Shut down test-owned processes only.

Do not deploy automatically. Device certification remains separate.
