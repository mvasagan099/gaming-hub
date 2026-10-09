# Password reset and authentication verification

Date: 2026-10-09. Source: main, `9a02477`. Scope: read-only source review, public HTTP checks and isolated local authentication regressions. No application code, production account, password, database record or deployment was changed.

## Verified

- Public frontend `/`, `/auth/callback?next=/reset-password` and `/reset-password` return HTTP 200 and the application entry HTML.
- The deployed reset-page asset contains `ResetPasswordLink`, and the former `3500` timer is absent. These are fix markers, not proof of the exact deployment SHA or a complete successful email/password flow.
- Frontend responses have HSTS and `X-Content-Type-Options: nosniff`.
- Selected web tests: 3 files, 30 passed, 0 failed, 0 skipped.
- Selected API tests: 6 files, 61 passed, 0 failed, 0 skipped.
- Local API fixtures used only the disposable localhost test PostgreSQL/Redis configuration and mocked external providers.
- The earlier code-consumption correction and expired-link rejection tests remain green. Login-time MFA, provider password reauthentication, application logout/revocation and deep-link tests in the selected suites pass.

These are selected authentication suites, not the complete repository test suite. No application code changed, so typecheck/build were not repeated in this audit phase.

## Findings requiring follow-up

### High: recovery does not invalidate Gaming Hub application sessions

`ResetPasswordPage.tsx:116-128` updates the password through Supabase and calls provider sign-out, then clears local frontend state. It does not notify Gaming Hub to revoke its `LoginSession` rows. In contrast, the normal authenticated password-change route in `routes/security.ts` explicitly revokes all of those rows and clears MFA stamps.

The API verifies provider JWTs through JWKS and checks its own session revocation records. Provider sign-out alone does not invalidate an already-issued JWT before expiry; this behavior is also documented in the installed Supabase SDK. An existing unexpired access token with an unrevoked Gaming Hub session therefore lacks the reset-specific invalidation barrier. This finding follows from the production code paths; no live account or stolen-token experiment was performed.

Correction: complete recovery through a server-verified recovery operation that revokes all application sessions, clears their MFA freshness and disconnects/revalidates affected sockets. Do not trust a client-provided recovery flag or weaken ordinary login MFA. Test recovery followed by replay of old API and socket credentials, including provider sign-out failure and concurrent requests.

### Medium: clean reset-page refresh is classified as normal session restoration

`App.tsx:116` requires code/hash parameters to identify `/reset-password` as a recovery target. Once the SDK consumes those parameters and the page is refreshed, the in-memory recovery flag is gone. The App restoration branch then calls `verifySession`, potentially racing the reset page's attempt to park the session as recovery-only.

A probe executed the actual `isRecoveryTarget` function extracted from App: clean `/reset-password` returned false, while a code-bearing reset URL and the recovery callback returned true. This confirms incorrect classification; it is not a demonstrated MFA bypass or a live protected-page exploit.

Correction: treat mounted recovery routes as recovery context even after token removal; fence any in-flight normal-session verification. Test refresh, delayed restoration, token refresh and recovery completion without granting protected application access prematurely.

### Additional checks

- Warm-open native implicit recovery remains a coverage gap: native routing can supply a token hash after SDK initialization, while the helper only manually exchanges a late query code. Verify session establishment and correct user identity with actual Android/iOS recovery links before certifying native recovery.
- The sampled live frontend responses lack CSP, X-Frame-Options and Permissions-Policy headers. The root HTML has no CSP meta tag. Apply the intended security headers at the actual static hosting layer and verify externally; repository server configuration alone does not prove Render static response headers.

## Not verified live

- Fresh reset email -> password form -> saved password -> new-password login -> old-password rejection.
- Provider redirect allowlist, link lifetime and mail-scanner behavior.
- API and socket health: both public `/health` GET requests timed out after 20 seconds. This is inconclusive about service availability or endpoint correctness, and must not be reported as a confirmed service outage.
- Immediate rejection of existing API/socket sessions after recovery.
- Actual deployment SHA, native devices and provider behavior under outages.

Evidence is stored in `docs/evidence/auth-recovery-2026-10-09/`. Public probes collected only safe response/status/header and asset-marker information; no reset tokens or credentials were collected.

Verdict: **Recovery fix markers are live and selected local auth tests pass. Full authentication verification remains incomplete due to the session-invalidation and refresh-isolation gaps and outstanding real-email verification.**
