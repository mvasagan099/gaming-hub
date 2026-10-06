# Multiplayer matchmaking verification

## Follow-up: paid startup failure confirmed

The subsequent two-account logs on 2026-10-06 exposed a separate real defect:
paid startup failed with Prisma `P2003` / `Match_roomId_fkey`. Framework rooms
were in memory while the API expected a persisted room. The earlier zero-stake
tests below did not cover that funding path. See
[the funded startup fix and current verification](multiplayer-match-start-fix.md).
Single-account waiting remains expected; two compatible funded accounts must
start successfully.

Date: 2026-10-06 (Asia/Kolkata). Baseline: `d04d907`.

## Reported behavior

The user confirmed that only one account was searching. A lone account staying
in the queue is expected: online matches require two distinct players with
compatible game, entry stake, time control, rated setting, and queue mode.
Opening another device with the same account does not provide an opponent.
VS AI is the existing solo-play option.

## Changes

- Clarified the waiting message in the shared search modal and lobby.
- Corrected the Quick Match subtitle: it finds another online player rather
  than joining an arbitrary open room.
- Added 18 regressions covering all nine games: single-player waiting,
  rejection of duplicate-account queue entries, and two-player match startup.

No server, authentication, wallet, settlement, tournament, or game-engine
production logic was changed. No deployment or production-data mutation was
performed.

## Evidence

- Live socket `/health/ready`: HTTP 200, `status: ok`.
- Live Engine.IO polling handshake: HTTP 200; CORS allows the deployed frontend.
- Deployed frontend references `https://gaming-hub-socket.onrender.com`.
- Full multiplayer suite: 9 files, 107 passed, 0 failed, 0 skipped.
- Full game-engine suite: 24 files, 329 passed, 0 failed, 0 skipped.
- Web regressions: 3 files, 22 passed, 0 failed, 0 skipped.
- Repository typecheck: PASS across all nine workspaces.
- Web build: PASS; existing shared Phaser/audio chunk-size warning remains.

The new matchmaking tests exercise the actual shared framework using socket
stubs and zero-stake matches. They verify queue ownership, participant seats,
room membership, authoritative engine creation, playing status, queue removal,
and match-found notifications. They do not certify live paid match funding or
a deployed two-browser match. The live checks above were read-only.

## How to play online

Use two different signed-in accounts. Select the same game and entry stake,
and matching chess time control/rated settings when applicable. Both accounts
must search at the same time. Alternatively, create a private room and have
the second account join using its room code. Both need enough balance for
their selected entry stake.

The wording changes are local and require a frontend release to appear live.
