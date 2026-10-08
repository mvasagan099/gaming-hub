# Carrom multiplayer synchronization fix

Date: 2026-10-08. Baseline `51ab426` plus local changes. No production database access, push or deployment.

## Findings and changes

1. **Preview backlog:** every striker preview (sent around 30 times/second) entered the distributed owner's durable checkpoint path. This serialized the complete engine, trajectory and accumulated match history into PostgreSQL for presentation-only movement. Carrom previews now retain room-owner serialization, fencing, membership/seat/turn checks and preview sequence validation, but do not serialize/write a checkpoint. Real placement, strike, timeout, result and settlement mutations still use the durable path. This exception applies only to `carrom:striker-position` on local and forwarded-owner commands.
2. **Reconnect listener loss:** the driver bound its preview listener to the initial socket and removed it from whichever socket existed at stop. On socket replacement it could miss updates and leave the old listener attached. It now explicitly detaches the old socket, attaches the replacement once, and removes the attached listener on stop.
3. **Oversized shot packets:** shot trajectories appeared in state and in both shot events. The network broadcast now retains the state trajectory once and removes duplicate keyframes only from the matching Carrom shot events. Pocket/shot metadata and server action-history records are preserved. Other games' packets are unchanged.

No client becomes authoritative for physics, scores, fouls, turns, winner or wallet settlement. No physics-rule changes or database migration are introduced.

## Verification

| Check | Current evidence |
|---|---|
| Carrom frontend driver/input/placement/preview tests | 59/59 PASS |
| Full frontend suite | 367/367 PASS |
| Full multiplayer suite | 358/358 PASS |
| Real API + two socket processes + PostgreSQL/Redis | Selected Carrom case PASS; 29 other cases filtered |
| Root build | PASS; existing large web chunk warning remains |
| Diff whitespace | PASS |

The integration case checks rejected wrong-turn previews, accepted broadcasts, unchanged checkpoint revision/snapshot across preview bursts, then a real authoritative shot, owner process termination, recovery, continuation, rematch and exactly-once financial settlement. This is correctness evidence; it is not a production latency benchmark or full API aggregation.

Testing used disposable local PostgreSQL `gaming_room_flow_test` at `127.0.0.1:5540` and a separate non-persistent Redis at `127.0.0.1:56480`. The Redis container was removed after testing. Production and external providers were not used.

Concurrent private-room invitation changes in the workspace were preserved. Their test fixture has unrelated Prisma JSON typing errors in the workspace-wide typecheck; root typecheck **FAILS** on those two errors at `apps/api/src/routes/__tests__/roomInvitations.test.ts:17` and `:21`. The affected web, socket-server and multiplayer workspace typechecks **PASS**. No Carrom typing errors remain. These unrelated fixture files were not changed.

## Remaining live verification

Deploy the web and socket-service changes together through the normal release process, then check the affected account with two real browsers/devices. Measure shot-to-opponent-update latency, socket reconnects and hosting/Redis/PostgreSQL health. The exact live environment has not been inspected, so local fixes do not establish that every possible source of lag is eliminated.

[Machine-readable results](carrom-multiplayer-sync-2026-10-08-results.json).
