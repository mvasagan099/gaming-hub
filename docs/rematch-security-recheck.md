# Rematch security recheck

Date: 2026-10-06. Base commit: `31ee31c`. Verified source: current working tree, including the prior rematch corrections. No commit, push or deployment was performed.

## Findings and corrections

| Finding reproduced before correction | Impact | Correction and regression evidence |
|---|---|---|
| Action cache used room/action ID only | An action ID from the previous match could return stale state; two participants sharing an ID could receive each other's cached result. | Cache scope includes room, match and authenticated participant. Tests verify a new opening move is applied after rematch and both participants' actions are processed independently. |
| Cache lookup preceded the room queue | Concurrent retries could miss the cache before the first action finished. | Lookup runs inside the serial queue. Concurrent identical retries receive the same result and produce one history entry. Membership and match identity are rechecked inside the queue. |
| Socket action did not require match identity | A delayed move from the previous match could be applied to the new match. | `game:action` requires the authoritative match ID. Missing or stale IDs are rejected. Current web and shared clients send it; tests verify stale moves leave state/history unchanged. |
| Rematch entry point reused connection-time authentication | An already connected revoked/expired session, invalid JWT, deleted/banned account or MFA-pending user could record consent. | Request, accept, legacy request and decline use the existing authentication service again. Tests use real PostgreSQL account/session/MFA records and reject each ineligible condition without altering consent. |
| Rematch omitted practice/real-money and game-specific disable checks | New play could begin despite the relevant shutdown setting. | Existing feature and game checks run before accepting consent. Disabled practice, real-money, game and online settings are tested. |

Initial red runs demonstrated the defects: two action-cache failures, eight authentication/settings failures, and one stale-match replay failure. No wallet policy, MFA requirement, tournament settlement rule or provider idempotency rule was weakened.

## Preserved controls

- Only actual non-spectator room participants can vote. Outsiders, disconnected participants, active matches and ad-hoc tournament rematches are rejected.
- All participants must consent. Duplicate/concurrent votes start one new match; expired or cancelled votes are discarded.
- Each new paid match uses the existing internal HTTP funding route, idempotency service and immutable entry ledger. The PostgreSQL room lock prevents two competing rematch IDs from both funding.
- An unsettled prior match cannot be replaced. Insufficient funds roll back every debit and the current-match pointer. Old match, participant and ledger records remain intact.
- Socket game actions use the connection's authenticated participant ID. Supplying another player ID in the action cannot impersonate that player.
- Old results, events, timer messages, consent acknowledgments and reconnect snapshots cannot overwrite the new web match state.

## Current verification

| Check | Files | Passed/total | Failed | Skipped |
|---|---:|---:|---:|---:|
| API security, rematch entry point, funding routes and financial concurrency/recovery | 12 | 156/156 | 0 | 0 |
| Full multiplayer suite | 12 | 137/137 | 0 | 0 |
| Full game-engine suite | 24 | 334/334 | 0 | 0 |
| Web tests | 7 | 62/62 | 0 | 0 |
| **Total** | **55** | **689/689** | **0** | **0** |

`npm run typecheck`: **PASS**, all nine workspaces. `npm run build`: **PASS**, all configured build workspaces. The existing Vite large-chunk warning remains. `git diff --check`: **PASS**.

The API selection includes rematch authorization (17), real multiplayer funding routes (26), financial concurrency/recovery (6), and nine additional security suites (107). This is a targeted API verification, not the entire API aggregation. The [results manifest](rematch-security-results.json) lists every executed file and its count.

Database tests used only disposable PostgreSQL at `127.0.0.1:5541`, database `gaming_hub_match_start_20261006_test`. Its versioned migrations were applied by the existing safe test harness. External email, Supabase and CouponVault settings were test-only; JWT cryptographic verification was mocked in the new rematch-entry tests while production session/MFA/account/settings services read PostgreSQL. Browser transport was mocked for client tests. No production data was accessed or modified.

## Deployment compatibility and limits

Deploy the updated web/mobile clients and socket server together. Older clients that omit `game:action.matchId` are intentionally rejected and must refresh/update. A real two-device staging smoke test remains necessary; this local verification does not prove deployed infrastructure, external JWT verification or multi-replica behavior.

Result: **rematch security recheck PASS locally**. This report makes no new overall production-readiness verdict.
