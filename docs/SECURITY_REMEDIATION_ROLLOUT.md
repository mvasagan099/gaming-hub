# Security remediation rollout

No production deployment or data repair is performed by these changes.

## Database

Run `node packages/db/deploy.js` in the reviewed migration job. It validates existing affiliate/referral definitions, runs `prisma migrate deploy`, and validates the resulting definitions. The seventh migration also checks existing definitions and adds `RateLimitWindow`. Do not use schema push or automatic migration resolution.

If schema validation or a failed migration blocks deployment, inspect the catalog against `packages/db/prisma/schema-guards/affiliate-schema.json`. Correct differences only through a reviewed migration/data recovery. Previously applied migrations retain their original checksums.

Held legacy withdrawals do not need new transfers: reconciliation finds `WalletRequest.id`, `externalTransferId`, or the old `note`. Review a dry-run inventory of held/stale-processing requests before enabling reconciliation in staging. Never refund or replay a transfer without a definitive provider outcome.

## Static frontend headers

Render static sites use hosting configuration rather than this repository's Nginx settings. Apply `apps/web/render-security-headers.yaml` to the **existing staging** site's Headers settings or merge its fields into the existing Blueprint. This is a configuration fragment, not a new service or deployment.

The enforced policy blocks framing, plugins, and external base URLs. The fuller policy is report-only so legitimate external API, socket, authentication, font, or asset requests remain functional. In staging, inspect browser policy violations and replace the report-only connect/image/font allowances with the exact approved environment origins. After auth, all nine games, and mobile flows pass, promote that tested policy to enforcement. Do not add broad wildcard hosts or `unsafe-eval` just to suppress violations.

Verify actual responses externally after applying hosting settings. Source configuration alone does not close the deployed-header finding. See [Render custom headers](https://render.com/docs/static-sites#custom-response-headers) and [Blueprint header fields](https://render.com/docs/blueprint-spec).

## Disposable API tests

Set `TEST_DATABASE_URL` explicitly to a disposable localhost PostgreSQL database whose name ends in `_test`. The test configuration refuses remote databases before initialization and replaces `DATABASE_URL` with this validated target. `.env.test` is optional; application `.env` is not a test fallback. Setup creates the disposable database through the same local server's maintenance database and applies migrations. Reset operates only inside this verified boundary.

## Production settings

Email verification defaults on in production. Confirm the Supabase email-confirmation policy and use trusted verification claims. Configure the reviewed Supabase API key for both API and socket services (`SUPABASE_SERVICE_ROLE_KEY` in the current environment contract). Ordinary Supabase access tokens may omit an email-verification claim; those tokens require the trusted Auth-user lookup. A missing key or unavailable lookup fails closed. Verify this with staging login and socket connection before release. High-risk custom roles, ADMIN, and MODERATOR require enrolled MFA and a fresh verified session. Public optional-auth APIs use the same eligibility checks as protected routes.

Production HTTP and account security limits share atomic PostgreSQL budgets. A database outage fails closed; there is no memory fallback. Monitor `RateLimitWindow` size, database latency, and rejected requests. Keys are hashed and expired rows are removed incrementally.

## Trusted proxy configuration

The patched Fastify release refuses hop-count-only trust. Set `TRUST_PROXY_CIDRS` to the exact reviewed proxy addresses/CIDR ranges and `TRUST_PROXY_HOPS` to the maximum trusted chain length for the staging deployment. Empty CIDRs or zero hops ignore all forwarded headers. Do not use `0.0.0.0/0`, `::/0`, or blanket proxy trust. Confirm the immediate peer network with the hosting configuration and test the real client IP in staging; an incorrect list groups clients under the proxy IP for rate limiting. Direct clients must never control their identity by supplying X-Forwarded-For.
