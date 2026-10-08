# All-game private room verification — 2026-10-08

Scope: Snake & Ladder, Ludo, Chess, Carrom, Fruit Ninja, Bubble Shooter, Table Tennis, Snake vs Worms and Snooker.

## Findings and repairs

A countdown interruption changes the room to starting/READY_CHECK and requires the reconnecting participant to ready again. The lobby disabled Ready whenever status was not waiting, making this recovery action unavailable. Lobby and shared room controls now match the server readiness states; a gameplay board-loading receipt remains separate from lobby readiness. A cancelled authoritative countdown also suppresses stale legacy countdown values.

A paid rematch could overwrite the completed room checkpoint while its result outbox was still retrying API delivery. Settlement validates that checkpoint, so the previous payout could become unrecoverable. Paid rematch request/accept now waits until the previous immutable result outbox is DELIVERED, preserving the completed checkpoint while payment retries. Free rematches retain their existing behavior. Database/coordination failure does not permit bypassing the guard.

A new room previously became visible in PostgreSQL with no owner lease, before its creator acquired Redis ownership. A recovery scan on another replica could claim it during that gap and reject the creator with MATCH_HAS_ANOTHER_OWNER. Creation now acquires Redis admission first and installs the creator fence and database-clock lease in the same transaction that publishes the room. Failed creation releases only its own lease and removes its local runtime; existing fencing and participant reservation remain enforced.

## Verification

Complete multiplayer regression: 209 passing tests, 20 files. Complete web regression with readiness recovery coverage: 246 passing tests, 34 files. Paid integration after the ownership repair: 42 passing tests, 3 files, 258.83 seconds, exit 0. Total for this follow-up: **497 passing tests across 57 files, zero failures or skipped tests in the final runs**. Workspace typecheck and production build passed; socket typecheck/build also passed again against the final ownership repair. The full API and engine suites were not repeated; no engine behavior changed.

Expanded real two-server tests check private room code joining and seats, host-only start, readiness and capacity enforcement, rejected pre-start actions, cancelled-countdown refunds and duplicate cancellation for every game. Every game's real owner-death/reconnect/action/end/settlement case now also starts a fresh paid rematch, verifies renewed board receipts where required, rejects stale match actions, confirms the new entry reservation and one payout. The retryable API-result failure case verifies that both players' rematch attempts are rejected until previous settlement is delivered.

All paid integration runs use explicitly selected disposable localhost PostgreSQL and Redis, a real HTTP API and two socket processes. No production rooms were created and no live wallets changed. The initial public endpoint requests timed out. A subsequent read-only retry returned socket readiness HTTP 200/status ok and API game registry HTTP 200 with all nine games enabled. This endpoint check did not exercise live room play. No browser/device/private-room play certification is inferred from local tests. Existing admin/social edits were preserved.

The first expanded paid integration run passed 40/41 tests and exposed one room-create ownership race in Carrom. The final rerun added a regression for atomically publishing the creator lease and passed all 42 cases; the first run is not described as fully passing.

This follow-up has not committed, pushed or deployed the new changes.

## Evidence matrix

All nine games passed each column in the real two-server test matrix:

| Game | Paid create/join/readiness/start | Action + owner restart/reconnect | New funded rematch + stale action rejection | Cancelled countdown + duplicate refund |
|---|---|---|---|---|
| Snake & Ladder | PASS | PASS | PASS | PASS |
| Ludo | PASS | PASS | PASS | PASS |
| Chess | PASS | PASS | PASS | PASS |
| Carrom | PASS | PASS | PASS | PASS |
| Fruit Ninja | PASS | PASS | PASS | PASS |
| Bubble Shooter | PASS | PASS | PASS | PASS |
| Table Tennis | PASS | PASS | PASS | PASS |
| Snake vs Worms | PASS | PASS | PASS | PASS |
| Snooker | PASS | PASS | PASS | PASS |

Successful paid original/rematch results each delivered one payout, with expected wallet balances. Cancelled countdowns returned both wallets to their original balance and created zero MATCH_PAYOUT records. Invalid code/capacity/readiness/non-host starts were rejected before debit. Carrom/Snake load failures, immutable payout/refund conflicts, real Redis outage, lost funding/settlement acknowledgement and retryable API failure are covered by the final selected integration set. Game completion in the cross-replica cases uses an authoritative resignation after valid gameplay; natural scoring/timeout rules are additionally covered by the full multiplayer suite, not by playing every production match to its natural end.

Temporary logs: gaming-private-all-mp.log, gaming-private-all-web.log, gaming-private-all-api2.log, gaming-private-all-typecheck.log, gaming-private-all-build.log, gaming-private-socket-typecheck-final2.log and gaming-private-socket-build-final2.log under /tmp. Test-owned processes shut down and the two isolated containers stopped after verification. No raw player records or credentials are included here.
