# Nine-game workflow recheck

Date: 2026-10-09. Audited main commit: `7b40b90ae08969d915e72a36bbf2e7ee6fbce3cf`.

## Outcome

All selected automated suites pass, but two game-specific UI defects remain. This is not a claim that the games are bug-free or production-ready. No application code, wallet/security behavior, production data, deployment or remote branch was changed during this audit.

The pre-existing modified `apps/api/src/services/__tests__/registrationCountry.test.ts` fixture was preserved. It was outside the selected API tests. The only new repository files are this report and its evidence files.

## Findings

### 1. Chess and Ludo recreate their boards on unchanged player-name updates — medium priority

`ChessGame.tsx` and `LudoGame.tsx` generate fresh `names` arrays on each parent render. The board creation effects in `ChessPhaserGame.tsx:67` and `LudoPhaserGame.tsx:82` depend on the array reference. A room update can therefore destroy and recreate the Phaser board although the names, match and seat are unchanged.

An isolated source-executing hook probe rendered each component twice with identical names in different arrays. Each produced two board creations and one destruction, instead of one creation and no destruction. The probe uses mocked Phaser and a React-style hook dependency comparator; it is not a real browser or animation measurement. Rebuilding interrupts local presentation and creates unnecessary initialization work. The authoritative server state remains separate; this probe does not prove loss of server game state.

Recommended correction: stabilize the player-name content dependency, update display metadata without restarting the active board, and retain deliberate recreation for a new match or a genuine board configuration change. Add tests that metadata-only room updates preserve the game instance and that new matches still reset it.

### 2. Carrom presents spectators as seat 0 — medium priority

`CarromGame.tsx:38` passes `mySeat ?? 0` to `CarromMultiplayer` and does not pass spectator identity. `CarromMultiplayer` derives the user's turn, coin color and controls from this numeric seat. Its driver also checks turn ownership against that seat.

The isolated router probe supplied `isSpectator: true` and `mySeat: null`; the child received seat 0 and no spectator flag. During seat 0's turn, the current client logic consequently treats that spectator as the white player rather than a read-only viewer.

Server enforcement remains intact: `MatchManager.processAction` rejects spectators and participants without an assigned seat. This is a UI/control defect, not evidence that spectators can alter authoritative gameplay.

Recommended correction: keep viewing orientation separate from participant identity, preserve the null/unassigned seat, display spectator information and disable placement, shot and participant-only result controls. Add both-seat spectator regressions while preserving backend rejection tests.

## Workflow coverage

All nine supported games remain in the shared registry and game route. Cricket is absent from those active paths; unsupported game IDs redirect home.

| Game | Local private-room/start/exit socket checks | Local gameplay/recovery/rematch checks | Newly identified UI issue |
| --- | --- | --- | --- |
| Ludo | PASS | PASS | Board recreation |
| Chess | PASS | PASS | Board recreation |
| Carrom | PASS | PASS | Spectator identity |
| Snake & Ladder | PASS | PASS | None found in reviewed coverage |
| Fruit Ninja | PASS | PASS | None found in reviewed coverage |
| Bubble Shooter | PASS | PASS | None found in reviewed coverage |
| Table Tennis | PASS | PASS | None found in reviewed coverage |
| Snake vs Worms | PASS | PASS | None found in reviewed coverage |
| Snooker | PASS | PASS | None found in reviewed coverage |

The multiplayer suite includes real localhost Socket.IO clients with the production framework, room handlers and engines. External funding is mocked. Coverage includes private create/join/ready/start, matchmaking ordering, capacity, invalid and duplicate actions, spectator rejection, reconnect, rematch consent, concurrent exits, initialization cancellation and starting another room after exit. Game-specific coverage includes Chess chronology and colors, Carrom shots and previews, Snooker shot playback, Table Tennis rallies and Snake steering/boost.

The complete engine suite exercises game rules. The complete web suite exercises existing frontend regressions, including visible Exit confirmation, immediate native/browser Back navigation, late replies, departed-room events and game drivers. These tests do not mount every full rendered game screen; the two component probes demonstrate gaps in the green suite.

API coverage includes game history and ownership, practice-wallet isolation, entry/start/finish/settlement, retry/concurrency/refunds, tournament routes and all-game tier scheduling. Carrom and Snake vs Worms retain board-loaded startup gates; the other seven retain immediate activation.

## Fresh verification results

| Suite | Files | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: | ---: |
| Complete web | 49 | 453 | 0 | 0 |
| Complete multiplayer | 32 | 451 | 0 | 0 |
| Complete game engine | 29 | 444 | 0 | 0 |
| API room/recovery/rematch/history selection | 9 | 129 | 0 | 0 |
| API tournament/tier/game-lifecycle selection | 4 | 183 | 0 | 0 |
| Total selected tests | 123 | 1660 | 0 | 0 |

Current API tournament breakdown: tournament routes 61/61, tier combinations 93/93, productionGameAudit 14/14, unifiedGameLifecycle 15/15. API groups ran sequentially against disposable localhost PostgreSQL and Redis, with external providers mocked. The complete API suite was **not** rerun; these totals describe the 13 selected API files only.

Repository typecheck: **PASS**, exit 0. Production build: **PASS**, exit 0, using dummy provider configuration. The existing web chunk-over-500-kB warning remains; no live cold-load performance claim is made.

Evidence: `docs/evidence/entire-game-workflows-2026-10-09/results.json`, `component-probes.json` and `component-probes.cjs`. Run the probe from the repository root with Node. A zero probe exit means the reported defects reproduced, not that those behaviors are correct.

## Still unverified

- Deployed Render gameplay with two real browser/device sessions.
- Full visual and input testing of every practice/AI screen and real Android/iOS Back/gesture behavior.
- Sustained gameplay under latency, packet loss and concurrent load; CPU, memory and frame-rate behavior on deployed instance limits.
- Live provider funding, withdrawals and production/staging financial integrations.

## Next steps

1. Correct the two UI defects with focused regression tests; retain server validation and settlement behavior.
2. Repeat affected web tests plus the multiplayer/engine suites and build gates.
3. Use approved isolated staging for two-client play, reconnect/rematch/exit testing and a paced soak test before making a readiness claim.

Verdict: **Automated game workflows pass; game UI fixes and live verification remain outstanding.**
