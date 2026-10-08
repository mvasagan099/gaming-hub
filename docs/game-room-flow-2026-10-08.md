# Gaming Hub game and room flow verification

Date: 2026-10-08. Baseline commit: `79a4296`, with the queue fixes and regression tests described below in the working copy. No production data access, push, or deployment was performed.

## Scope

All nine supported games: Ludo, Chess, Carrom, Snake & Ladder, Fruit Ninja, Bubble Shooter, Table Tennis, Snake vs Worms, and Snooker. Reviewed the catalog/game route, frontend lobby/store, local room manager, distributed owner commands, shared matchmaking, engine actions, reconnect checkpoints, rematch, Exit/Back, and API funding/settlement paths.

Testing uses two real localhost socket-server processes, a real HTTP API, PostgreSQL databases `gaming_room_flow_test` and `gaming_room_queue_test` at `127.0.0.1:5540`, and a separate temporary Redis container at `127.0.0.1:56480`. Test identities and ledger-funded fixture wallets are used. No remote database, live player, real payment provider, production credentials, or external email provider is required.

## Defects reproduced and fixed

1. **Queue reconnect retained the obsolete socket.** Duplicate waiting requests now update the socket ID while preserving the queue entry and joining order. A newly paired opponent can reach the reconnected player.
2. **Changing game/stake retained the previous search.** Eligible changes cancel the old waiting request and create the requested search under the shared PostgreSQL matchmaking lock. An unaffordable change leaves the old request intact.
3. **Duplicate queue requests skipped wallet availability checks.** Resume now checks balance/freeze status before accepting the request. This changes queue eligibility, not wallet accounting or settlement.
4. **Private-room creation/join left a waiting search active.** Room admission cancels a waiting search under the same matchmaking lock. An unexpired assigned pairing blocks entry into another room; joining its assigned room remains allowed. Expired assignments no longer block new entry.

The first new PostgreSQL run exposed seven genuine failing edge cases plus one invalid test stake (200 was outside the configured Chess fee list). The fixture was corrected to an allowed 500-coin fee; server fee validation was preserved. Thirteen queue-transition cases now pass, including concurrent duplicate requests and a pairing-lock race.

Existing active-room guards, server-owned identity/seat assignment, membership checks, owner fencing, engine validation, ledger funding, result outbox, and settlement behavior remain intact. No schema migration or wallet/security redesign was introduced.

## Flow coverage

| Flow | Evidence |
|---|---|
| All nine catalogs/routes/engines | Web catalog/navigation regressions and complete engine suite |
| Private create, code join, capacity and host/ready/start | Real two-socket multiplayer cases for all nine games; real paid API/socket admission cases |
| Quick Match across replicas | Two real socket processes share one authoritative room and countdown |
| Valid actions, duplicate/stale/unauthorized actions | Engine suite, real socket action tests, membership guards and replay regressions |
| Reconnect and owner restart | Real checkpoint/owner-loss/continuation/settlement cases for all nine games |
| Spectators | Admission limits, metadata, action authorization and terminal-room cleanup regressions |
| Result and payout | Single result outbox, exactly-once settlement, paid wallet balance assertions and retry/failure tests |
| Rematch | Fresh engine/match identity, both-player consent, reconnect/state reset, failed funding, stale previous-match actions and authorization regressions |
| Finished room → new game | Completed-room recovery tests and queued/private admission gates |
| Exit and Back | Nine-game navigation tests: Exit confirmation, Cancel, one cleanup, normal native/browser Back, StrictMode |
| Initialization failure/cancel | No premature prize; countdown/load failure refunds once; lost funding acknowledgement handled safely |
| Redis/API outage | Real transport failure and restart tests; held result delivery/retry without duplicate payout |

These checks do not prove every possible browser/device, network schedule, or deployed configuration. They are game/room-focused verification, not a full API aggregation or a new production-readiness certification.

## Results

| Current check | Files | Passed | Failed | Skipped |
|---|---:|---:|---:|---:|
| Complete multiplayer suite, final queue code | 24 | 357 | 0 | 0 |
| Complete game-engine suite | 27 | 421 | 0 | 0 |
| Complete web suite | 38 | 315 | 0 | 0 |
| API room/lifecycle/recovery core | 4 | 63 | 0 | 0 |
| API queue/security/financial checks | 6 | 59 | 0 | 0 |
| Real API/two-server restart and outage suite, final queue code | 1 | 28 | 0 | 0 |
| Additional remaining-account restart recovery case | Same restart file | 1 | 0 | 28 filtered, already covered above |
| **Unique targeted API aggregate** | **11** | **151** | **0** | **0 unexecuted selected cases** |

The complete 28-case real restart suite passed twice, before and after the queue fixes. The extra remaining-account test was subsequently added and executed separately: Table Tennis completed → opponent left → original owner process killed → other process restored the terminal checkpoint → remaining account created another room. The old room closed, balances did not change again, and only one result outbox row existed. The 28 filter-skipped cases in that selected run are not extra untested cases: the immediately preceding full run already executed them. Aggregation deduplicates by file and test name.

- Root `npm run typecheck`: **PASS**, all nine workspaces. API typecheck after the final test addition also passed.
- Root `npm run build`: **PASS**. Existing web bundle/chunk-size warnings remain a performance concern; no chunk failure was observed. Integration tests also warn that Node 20 support in Supabase is deprecated; the deployment runtime should remain on the supported Node 22 line.
- `git diff --check`: **PASS**.
- Temporary isolated Redis test container: removed after execution. Existing local services were not stopped.
- Production database touched: **NO**. Deployment/push: **NOT PERFORMED**.

Machine-readable results, durations and per-suite file manifests are saved in [game-room-flow-2026-10-08-results.json](game-room-flow-2026-10-08-results.json). These totals are current game/room-focused evidence; 151 API cases are not the entire API suite.

## Remaining findings

### P2 — Distributed Quick Match drops selected Chess settings

Source evidence: `apps/socket-server/src/distributed/matchmaking.ts` and `packages/db/prisma/schema.prisma` (`MatchmakingQueue`). The frontend sends `settings.timeControl`/`rated`, and validation accepts them. Distributed matchmaking only persists game/stake/mode/socket metadata. Its room provisioner does not pass the selected settings to `createRoom`. Therefore the selected clock/rated setting is not preserved, and differently selected clocks can enter the same shared pool. The process-local matchmaking bucket distinguishes these settings, so behavior also differs by deployment mode.

**Solution:** persist the validated settings with the queue reservation, include their normalized signature in pairing compatibility, and provision the room with that immutable configuration. Add two-replica tests for matching clocks, different clocks, reconnect, and rematch. This needs a deliberate queue persistence change; it was not silently replaced with a different feature or default.

### P2 — Lobby generates stakes the server may reject

Source evidence: `apps/web/src/pages/Lobby/LobbyPage.tsx:436` and `apps/web/src/components/MatchSetupModal.tsx:55`. `LobbyPage` derives buttons from multiples of the catalog default instead of the server game configuration. For the default 100-coin games it offers 200, while default allowed fees are 50, 100, 500, and 1000. The server correctly rejects 200. Admin customizations can create more discrepancies.

**Solution:** use the public `/games/:gameId/config` response for lobby entry fees/defaults, as the existing match setup modal already does. Retain server enforcement and add custom-fee/config-change tests.

### Deployment/manual verification outstanding

The user's affected live account was not inspected or reset. Changes from this check are not deployed. After review/deployment, verify the real account can complete → leave → create/search again, and test two real browsers/mobile devices for gameplay, reconnect, rematch and Exit. Infrastructure credentials, production auth providers, mobile hardware, and Render deployment state are outside this local evidence.

## Verdict

All executed core room-flow regressions and targeted financial/security checks passed (0 failures). The two configuration findings above remain open. This report does not declare every game feature or the deployed application fully verified.
