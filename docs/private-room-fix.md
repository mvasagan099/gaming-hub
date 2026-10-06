# Private-room fix verification

Date: 2026-10-06. Baseline commit: `55c4536`. Verified changes are in the local working copy.

## Defects reproduced and fixed

1. Room create/join/ready/start acknowledgements returned `RoomRuntime` instead of the client `RoomFull` snapshot. Socket.IO encoded its player/spectator Maps as objects; the frontend calls `room.players.find` and expects flat game/stake fields. The new real Socket.IO Chess test failed at the player-array assertion before remediation. These acknowledgements now share `SyncManager.serializeRoom` with room broadcasts. The legacy match join/ready responses also use the same projection. Internal engine/socket runtime fields are excluded; spectators include the required player metadata.
2. A valid room code entered from a different game's lobby did not switch to the room's game. The frontend ignored the room when its game differed from the URL. Both waiting-room and already-playing cross-game regression tests failed before remediation. The lobby now follows the authoritative room game, then opens that game's multiplayer route when started.

Existing lifecycle handlers were moved into `roomHandlers.ts` so the integration tests exercise the same registrations used by the socket-server entry point, with its existing authenticated identity, feature guard, and funding callback.

## Current verification

| Check | Files | Passed | Failed | Skipped |
|---|---:|---:|---:|---:|
| Entire multiplayer suite | 13 | 149/149 | 0 | 0 |
| Entire web test suite | 14 | 110/110 | 0 | 0 |
| Private-room real Socket.IO cases (included above) | 1 | 12/12 | 0 | 0 |
| Private-room lobby cases (included above) | 1 | 5/5 | 0 | 0 |

The Socket.IO cases start a real ephemeral localhost server and independent host/guest clients. For all nine games they cover creation, lowercase room-code join, stable seats, ready, host start, matching acknowledgement/broadcast snapshots, duplicate-start rejection, and rejoin on a new socket with the original match/seat. Additional cases cover invalid codes, capacity, membership, host-only start, readiness, spectator serialization, feature rejection, and funding failure returning to waiting without a playing broadcast. Private rooms remain excluded from public listings. The funding hook is a test fixture: exactly one start callback is verified, with no real wallet deduction or external transfer.

Web tests use the existing temporary Node/WebSocket test harness with dummy Supabase configuration. The complete web run also includes the matchmaking acknowledgement-order tests present in the current working copy. Their separate working-copy edits were preserved.

Commands: multiplayer workspace `npm test -- --reporter=json`; web `vitest run --config /tmp/gaming-hub-bubble-web-vitest.config.mts --reporter=json`; repository `npm run typecheck`; repository `npm run build`.

- Typecheck: PASS across all nine workspaces, zero errors.
- Build: PASS for multiplayer, web, API, and socket server. Existing web chunk-size warning remains; no compilation failures.
- Diff whitespace check: PASS.
- Production database touched: NO.
- Deployment performed: NO.

These results verify local transport and application behavior, using fixture identity/funding rather than deployed authentication or real financial services. Live Render behavior has not been re-tested or deployed. Both the socket-server and web changes must be released for these fixes to affect the live application. A private match still requires two separate signed-in players: guest marks Ready, then host starts.

Machine-readable evidence: `private-room-fix-results.json`.
