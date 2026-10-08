# Game room settings fixes

Date: 2026-10-08. Follow-up to the [game/room audit](game-room-flow-2026-10-08.md). Baseline is `5deea5b` plus local working-copy changes. Production database untouched; no push or deployment performed.

## Resolved findings

### Chess Quick Match settings

Distributed matchmaking now persists validated clock/rated settings in each PostgreSQL queue reservation. Compatibility includes base time, increment, delay and rated status, in addition to the existing game/stake/mode conditions. Changing a waiting selection replaces the old reservation; reconnect keeps the compatible reservation and updates its socket. An already assigned pairing retains its immutable settings.

Room provisioning reads the saved settings, validates them and passes them into the authoritative room/engine configuration. Reconnect and rematch preserve those settings. Client-only labels and reserved/unrecognized settings cannot enter this stored configuration; existing validation and financial admission remain in place. Non-Chess games do not use Chess clock settings.

Files: `apps/socket-server/src/distributed/matchmaking.ts`, Prisma schema, additive migration, and queue/two-replica regression tests.

### Lobby entry stakes

The lobby loads `/games/:gameId/config` instead of generating multiples of a catalog default. Only configured fees are displayed. A valid incoming selected stake is preserved; an invalid stake switches to the configured default. Quick Match/private creation are unavailable until configuration loads, and remain unavailable when online play is disabled or configuration fails. Code-based joining and existing room controls do not depend on this new-room selection.

Late responses from a previous game are ignored. Prize display uses the server's winner percentage. Server-side fee and wallet validation remain authoritative.

Files: `apps/web/src/pages/Lobby/LobbyPage.tsx`, five new lobby tests and the existing navigation test's API stub.

## Migration and rollout

`20261008140000_matchmaking_settings` adds `settings` JSONB, `settingsKey` text and a compatibility lookup index. Existing reservations receive the previous untimed/rated defaults. No tables/rows/financial history are deleted. Prisma client generation completed.

Before running the updated socket service, apply the committed migration with `prisma migrate deploy` through the normal deployment process. Drain the old matchmaking service before enabling the new version; old binaries do not respect the new compatibility key. This report does not authorize or perform deployment.

## Current verification

| Check | Result |
|---|---|
| PostgreSQL queue transitions/settings on upgraded local test DB | 18/18 PASS |
| Same queue tests on a fresh local test DB | 18/18 PASS |
| Real two-replica Chess incompatible settings → reconnect → compatible pairing → rematch | 1/1 selected case PASS |
| Full web suite | 39 files, 345/345 PASS |
| Full multiplayer suite | 24 files, 357/357 PASS |
| Fresh migration chain | PASS |
| Fresh DB versus Prisma schema | No difference detected |
| Root workspace typecheck | PASS, 0 errors |
| Root build | PASS |
| Diff whitespace check | PASS |

The selected integration run intentionally filters the other 29 cases in that file. It is not a claim that the entire API suite ran again. Prior all-game engine/restart audit results remain recorded in the original report.

Separate game-navigation changes appeared concurrently in this shared workspace and were preserved. The rematch test fixture was updated to mock its newly imported router blocker/native-handler dependencies; it does not load the real router/auth stack. Initial full web runs exposed missing test mocks; the final complete run passes. No related production navigation code was changed by this settings fix.

Temporary isolated Redis was removed after testing; existing local services remain running. Live account, mobile hardware and deployed smoke checks remain unverified.

Machine evidence: [results](game-room-settings-2026-10-08-results.json).

Build retains the existing >500 kB web chunk warning; no build failure. Both settings findings are resolved locally. This is not deployed smoke evidence or a new production-readiness certification.
