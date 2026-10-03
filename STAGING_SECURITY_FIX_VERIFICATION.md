# Verify the readiness fixes on staging

Production has not been changed. Local regressions do not prove live email,
CouponVault, mobile callbacks or hosting configuration.

## Frontend headers

Generate a Render header fragment using **staging** API, socket and Supabase
HTTPS URLs:

```sh
node scripts/render-security-headers.mjs "$STAGING_API_URL" "$STAGING_SOCKET_URL" "$STAGING_SUPABASE_URL" > /tmp/gaming-hub-staging-headers.json
```

Review the exact connection origins. Enter these headers on the existing
staging static site's Render Headers page, or merge them into its existing
Blueprint. This command only generates JSON; it does not deploy anything.
Do not apply staging URLs to the production site.

The enforced policy prevents framing, plugins and arbitrary document base
URLs. The broader policy remains report-only until login, game assets,
external fonts/images, callbacks and socket traffic have been checked. Read
the browser's CSP violations and add only necessary exact origins before
enforcing the broader policy. Recheck actual HTTP responses: repository
nginx files do not configure Render's static host.

## Scheduler connections and images

If the normal PostgreSQL URL uses transaction pooling, set
`DATABASE_LOCK_URL` to a direct/session connection to the **same staging
database**. Session advisory locks require a persistent connection. Never
point this setting at a different database or environment. Verify two API
instances cannot simultaneously run the same scheduler/recovery job.

Build the updated API/socket images. They omit development dependencies but
retain the Prisma migration CLI used by the existing pre-deploy job. Run
`node packages/db/deploy.js` against staging before startup. It validates
existing objects and uses `prisma migrate deploy`; no migration reset or
automatic migration resolution is introduced.

## Required live checks

Record PASS, FAIL or BLOCKED for each:

- Actual deployed SHA and staging-only environment/secrets.
- Frontend response headers, CSP violations and approved-origin CORS.
- Login, refresh with pending MFA, fresh/stale MFA and logout.
- Verification/recovery aliases and canonical callback pages in web/native.
- Android App Links domain verification; iOS custom-scheme callbacks.
  iOS HTTPS Universal Links also require Apple associated-domain entitlement
  and hosted association records; native sync alone does not prove these.
- Real HTTP email delivery and OTP timeout handling without sensitive logs.
- Real CouponVault coupon redemption, withdrawal and reconciliation.
- Two-client gameplay, reconnect, authoritative settlement and tournament
  lifecycle under two API instances.
- Provider/database/Redis interruption and realistic backup restoration.

Do not mark production ready until these environment checks are complete.
