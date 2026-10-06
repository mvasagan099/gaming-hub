# Paid multiplayer match startup fix

Date: 2026-10-06. Baseline commit: `76aed6c`; changes are local and uncommitted.

## Confirmed defect

The supplied logs show two accounts successfully paired for Bubble Shooter.
The internal create-and-fund route then failed with Prisma `P2003`, constraint
`Match_roomId_fkey`: the shared framework's room existed only in memory, but
the new database Match referenced that room ID. Both players were requeued.

The runtime also attached the match and timers before funding succeeded.
Closing the failed room consequently attempted to cancel a nonexistent
database match, producing the secondary `Match not found` error.

## Fix

- The socket service sends its authoritative room snapshot alongside the
  existing match ID, participants, and stake, using the protected internal route.
- The API validates the snapshot and creates Room, RoomPlayer, Match,
  MatchPlayer, and entry-fee ledger records in the same database transaction.
  Insufficient funds roll back the room, match, and all prior debits.
- Existing room identities cannot be overwritten by a different host, game,
  code, or stake. Already persisted legacy rooms remain supported.
- The existing match-ID idempotency guard prevents retry debits.
- The runtime stays `starting` until funding succeeds; only then does it
  attach the match, start monitoring, and broadcast gameplay. Failed funding
  leaves no active runtime to trigger a phantom cancellation.
- Simultaneous start requests are checked again after asynchronous engine
  loading. A regression reproduced two funding calls before this guard;
  only one start is now accepted.

No schema migration, wallet arithmetic, settlement, authentication, game-engine
rules, or zero-stake funding policy was changed.

## Verification scope

The new regression joins two distinct funded users through the actual shared
matchmaking framework for every supported game. The actual socket API helper
calls the real local Fastify internal route over HTTP, which writes to disposable
PostgreSQL. Each test verifies persisted room/match linkage, active status,
empty queue, exactly one debit per player, and safe HTTP retry.

Additional cases cover insufficient-funds rollback, internal-key authorization,
room ownership mismatch, and compatibility with already persisted rooms.
Framework tests cover deferred funding and failure without active timers or
spurious cancellation. Socket transport is stubbed; these are not deployed
two-browser smoke tests.

Current machine-readable totals and build/typecheck outcomes are recorded in
`../security-reports/2026-10-06-multiplayer-startup/verification.json`.

| Check | Files | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: | ---: |
| Paid startup HTTP/PostgreSQL and financial regressions | 6 | 65 | 0 | 0 |
| Full multiplayer suite | 9 | 110 | 0 | 0 |
| Full game-engine suite | 24 | 329 | 0 | 0 |

The 13 new API regressions include paid startup and retry checks for all nine
games. Repository typecheck passed across all nine workspaces. Repository build
passed for multiplayer, web, API, and socket server. The existing frontend
chunk-size warning remains; it is unrelated to match funding.

The test database is `gaming_hub_match_start_20261006_test` on loopback port
5541. Production data was not changed. No push or deployment was performed.
The disposable audit container was stopped after verification.
Restart local development services to load the rebuilt multiplayer package;
live services require a release of these changes before the fix applies there.
