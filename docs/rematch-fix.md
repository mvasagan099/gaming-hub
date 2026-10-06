# Game rematch verification

Date: 2026-10-06. Base commit: `31ee31c`; fixes are in the working tree.

## Defects reproduced

- Table Tennis and Snake vs Worms result buttons invoked their AI reset functions in multiplayer. Fruit Ninja's replay callback also performed a local restart.
- The socket rematch flow did not serialize votes, clear completed consent, enforce expiry, or restore the ended room after failed funding. The legacy rematch event only cleared consent.
- A second paid match in a room failed because `Match.roomId` is unique. The added PostgreSQL/HTTP test failed before the service correction: the original 13 startup tests passed, and the new paid-rematch test failed on funding the second match.
- Several game views kept finished-screen/animation state across matches. Delayed acknowledgments, reconnect snapshots and old-match packets could also restore stale state.

## Corrections

All socket rematch events use the shared match manager. Non-spectator participants must be connected and unanimously consent after a completed match. Votes, cancellations and starts run through the room's existing serialized queue. Expired votes are discarded. Tournament rooms cannot start an ad-hoc rematch.

Each accepted rematch uses a new match ID and engine with the existing seats, room, settings and entry stake. The normal funding hook remains mandatory. Failed funding leaves the previous result accessible, clears consent and permits a fresh request. Old runtime/timers are released only after successful funding.

Paid rematches lock the PostgreSQL room row. The unique `Room.match` relation points to the current match: its previous association is detached only if that match is `FINISHED` or `ABORTED`. **No match, participant, replay, statistic, transaction or settlement record is deleted.** These remain addressable by the original match ID. This pointer change and new match/entry debits occur inside the same existing idempotent funding transaction. An active/unsettled previous match is rejected. Failed entry funding rolls back both the pointer change and all debits. Concurrent different match IDs can fund only one new match.

The three affected replay buttons now request server consent. The game route keys its view by authoritative match ID, resetting result screens and drivers for all nine games without leaving the room. Waiting/error feedback is displayed; acknowledgments cannot revive an old offer after a new match starts. Old-match state, result, event, disconnect, timer and delayed reconnect snapshots are ignored.

## Verification

| Check | Files | Passed | Failed | Skipped |
|---|---:|---:|---:|---:|
| Full multiplayer suite | 12 | 137 | 0 | 0 |
| Web tests | 7 | 62 | 0 | 0 |
| Full game-engine suite | 24 | 334 | 0 | 0 |
| Rematch authorization, match startup/rematches, financial concurrency/recovery and security regressions | 12 | 156 | 0 | 0 |

New tests cover unanimous consent for all nine games, stable seats and fresh engines; duplicate/concurrent votes; expired/cancelled consent; failed funding/retry; spectator/outsider/disconnected/active/tournament rejection; paid rematches through the socket HTTP funding client and actual API route; retained history, retry idempotency, concurrent different match IDs, insufficient-funds rollback; replay button routing, new-match view identity and stale packet/ACK/reconnect isolation.

Database tests used only disposable local PostgreSQL at `127.0.0.1:5541`, database `gaming_hub_match_start_20261006_test`. External providers used test-only configuration. Web tests use a temporary harness supplying WebSocket in the Node test worker; no production auth calls are made.

Repository typecheck: **PASS across all 9 workspaces**. Repository build: **PASS** for multiplayer, web, API and socket server. The existing web chunk-size warning remains; it is a bundle optimization concern, not a build failure or rematch defect. Diff whitespace check: **PASS**.

No production database access, deployment, Git commit or push was performed. The disposable test database was stopped after verification. Deployed two-device smoke testing remains a deployment-stage check.

## Security recheck

The follow-up recheck reproduced and fixed action-cache isolation, concurrent action retry, stale-match action replay, and rematch session/settings enforcement defects. Current verification totals above include these changes: **689/689 tests passed**, with zero failures or skips. See [Rematch security recheck](rematch-security-recheck.md) for findings, test limitations and deployment compatibility requirements.
