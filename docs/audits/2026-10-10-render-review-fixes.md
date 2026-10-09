# Render review: verified local fixes

Baseline: `0613c3d`, branch `main`. This follows the read-only Render application review. No push, deployment, live hosting settings, migrations, or production data writes occurred.

## Fixes

### Chess and Ludo board recreation

Both Phaser creation effects depended on the identity of the names array. The parents construct a new array during store updates, so identical names destroyed and recreated the board. The effects now compare serialized name contents. Genuine configuration changes still recreate and dispose the previous scene.

Regression tests render twenty equivalent name updates and verify one board creation, no destruction, and retained state. They also verify that a seat change rebuilds the board with the new configuration.

Files: `apps/web/src/games/chess/ChessPhaserGame.tsx`, `apps/web/src/games/ludo/LudoPhaserGame.tsx`, `apps/web/src/games/shared/__tests__/phaserLifecycle.test.tsx`.

### Carrom spectator authority and rendering

The router converted an absent seat to seat zero and omitted spectator identity. A spectator consequently acquired white-player controls whenever White was active. The router now preserves a null participant seat, including when the store marks a spectator with a stale seat. A separate numeric camera position controls presentation only.

The driver rejects spectator placement, live placement previews, and shots. Component guards use the current participant identity. Spectators receive both players' remote previews, follow the authoritative striker baseline, see spectator labels instead of player ownership, and cannot request a rematch. Server authority, shot ordering, recovery, physics, settlement, and wallet logic were not changed.

A new rendering assertion exposed another spectator bug: the animation loop forced the striker onto the opponent baseline. It now follows the authoritative baseline for spectators.

Files: `apps/web/src/games/carrom/CarromGame.tsx`, `CarromMultiplayer.tsx`, `CarromMultiplayerDriver.ts`, and the Carrom `multiplayerRouter`, `multiplayerInput`, and `multiplayerDriver` tests.

### Redis shutdown ordering

The production entry point closed Redis clients before closing Socket.IO. The installed Redis adapter's close method issues two asynchronous unsubscribe operations without handling their rejection. When clients were already closed, those operations produced the observed unhandled connection-closed rejections.

Shutdown now closes Socket.IO while Redis remains available, then stops framework/coordinator resources, and finally closes Redis. A shared promise prevents repeated signals from repeating teardown. Disconnect handlers do not enqueue new recovery/presence work during shutdown. Cleanup continues after a failed stage, and the signal handler logs a shutdown failure and exits unsuccessfully instead of leaving an unhandled rejection.

A regression uses the actual Socket.IO Redis adapter with controlled clients and verifies unsubscribe-before-quit ordering and repeated-signal behavior. A second test verifies that failed cleanup is reported while subsequent cleanup still executes. Distributed restart recovery was rerun against isolated local PostgreSQL and Redis.

Files: `apps/socket-server/src/index.ts`, `apps/socket-server/src/shutdown.ts`, `apps/api/src/services/__tests__/socketShutdown.test.ts`.

## Current verification

| Suite | Files | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: | ---: |
| Full web | 54 | 490 | 0 | 0 |
| Full multiplayer | 32 | 451 | 0 | 0 |
| Full game engine | 29 | 444 | 0 | 0 |
| Distributed recovery and shutdown | 2 | 39 | 0 | 0 |
| Selected security, MFA, privacy, wallet and financial checks | 8 | 111 | 0 | 0 |
| Total | 125 | 1,535 | 0 | 0 |

The current recovery file contains 37 passing tests; shutdown adds 2. The earlier 31-test recovery baseline is not reused here. Full API aggregation was not rerun; the exact ten executed API files are listed in the evidence.

- Typecheck: PASS across 9 workspaces, 0 errors.
- Production build: PASS. Existing large web bundle/chunk warnings remain a performance consideration.
- Disposable test DB: local `127.0.0.1:5540/gaming_auth_20261009_test`.
- Disposable Redis: local `127.0.0.1:56482`.
- Production data touched: NO.

Machine-readable counts and test-file manifests: `docs/evidence/render-fixes-2026-10-10/verification.json`.

## Remaining live verification and blockers

These changes are locally verified and remain undeployed. Live two-client matches, shutdown logs, sustained memory/CPU behavior, and recovery must be checked after an approved deployment. This report does not establish that the Render OOM incident is resolved.

The previous review's hosting findings remain: free-tier cold starts and socket CPU limits, missing frontend CSP/frame/permissions headers, no isolated staging environment, and no sustained live load evidence. No paid upgrades or hosting configuration changes were made.

The unrelated modification to `registrationCountry.test.ts` and the previous untracked Render review artifacts were preserved and excluded from this fix commit.
