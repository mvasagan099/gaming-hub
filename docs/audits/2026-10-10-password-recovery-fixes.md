# Password recovery isolation and session revocation

Date: 2026-10-10. Baseline: main `8dc2c97`. This phase addresses the two authentication gaps reviewed on 2026-10-09. No production writes, migrations, pushes or deployments were performed.

## Changes

- Clean reset routes remain recovery context after SDK URL consumption or page refresh. Entering recovery clears normal frontend authorization and fences pending login verification.
- Password recovery now saves the provider password, revokes the owner's Gaming Hub sessions, then requests global provider sign-out. It navigates to login only after those operations succeed.
- The new self-service logout-all route requires a verified bearer identity; a request body cannot select another account. It grants no application access and does not change passwords or bypass protected-route MFA.
- Session revocation is serialized against login-session creation, clears MFA freshness, and retains recovery-session tombstones. Replays cannot revoke a later legitimate login. A rotated access token does not incorrectly suppress revocation of its active provider session.
- Partial cleanup failures show a retry action; successful password updates are not repeated during that retry.

Gaming Hub checks its own session records because provider logout alone does not immediately invalidate already-issued access JWTs. See [Supabase sign-out documentation](https://supabase.com/docs/reference/javascript/auth-signout).

## Current verification

| Gate | Files | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: | ---: |
| Affected API/authentication and socket-boundary tests | 8 | 75 | 0 | 0 |
| Full web test suite | 52 | 476 | 0 | 0 |

The new database-backed recovery tests pass 7/7 and use only disposable PostgreSQL at localhost:5540 and isolated local Redis. External authentication providers are mocked. They verify owner isolation, old API-token rejection, actual socket-session revalidation rejection, idempotent replay, concurrent calls, refreshed credentials and token rotation.

Web coverage includes recovery-route classification, in-flight authorization fencing, password-save/cleanup ordering and retries under provider/application failure. Repository typecheck passes with zero errors across nine workspaces; the production build passes. The build retains its existing large-chunk warning; no build error occurred.

These API tests are selected authentication regressions, not the full API or repository test suite. The full web suite was run.

## Limits and next verification

- These fixes are local and have not been pushed. Live email recovery, new-password login, old-password rejection and cross-device logout still require controlled deployed verification.
- Connected sockets reject revoked credentials on their existing revalidation cycle (approximately two seconds) and protected-event checks; this is not an immediate cross-instance disconnect broadcast.
- A database/provider outage after the password was saved can leave cleanup incomplete until retry succeeds. The UI reports this failure and does not report completed recovery.
- Warm-open native implicit recovery links and actual frontend security headers remain separate outstanding checks from the previous audit.
- The unrelated registration-country fixture change is preserved and excluded from this task's commit.

Verdict: **The two reviewed gaps are fixed and locally verified. Live authentication certification remains outstanding.**
