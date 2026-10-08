# Socket server memory audit and remediation

Date: 2026-10-08. Baseline commit: `2bba5f2`. Changes tested in this working tree. Production and staging were not accessed or deployed. No instance-size or Node heap-limit increase was used.

## Finding and result

**Confirmed local retention defects fixed. Live Render reliability still requires sustained deployed monitoring.** The Render alert provides no heap snapshot, instance RAM limit, or per-process memory trace, so these are reproduced causes, not a claim that every possible production cause has been excluded.

Sampled peak RSS: **577.4 MiB before → 379.9 MiB after**.
Sampled peak heap used: **381.9 MiB before → 168.9 MiB after**.
Final post-GC heap: **375.5 MiB before → 29.6 MiB after**, against an after-run baseline of 24.0 MiB.

RSS stays above startup after cleanup because V8/native allocators retain committed memory. The heap and owning-map counts demonstrate released objects; a drop in RSS to its startup value is not guaranteed. No heap dump was necessary for these reproduced defects.

## Root causes and fixes

1. Full action results (including Carrom trajectory/state and realtime state) had a two-minute TTL but no hard size limit. The baseline retained **4,600** results. Limit to **256 globally**, retain the existing 120-second pruning, and clear room results on unregister. The canonical match action history still prevents reapplication after result eviction; an added test proves an evicted action retry causes zero additional engine calls. Financial idempotency and ownership fencing are unchanged.
2. Player runtime, activity and statistics maps survived room cleanup. Baseline retained **370 players/activity entries**. Release them on waiting-room leave, kick and unregister; preserve players already assigned to another room.
3. Sync sequence maps and acknowledgement sets survived room cleanup. Baseline retained **185 room sequence entries and 370 acknowledgement scopes**. Scope acknowledgements by room/user, cap each set at **128**, reject unknown rooms/nonmembers and invalid numbers, and release room/player sync records.
4. Settled local operation queues retained promises. Remove only the final settled queue entry by promise identity; concurrent operations remain serialized. The distributed queue already removed settled entries.
5. Delayed spectators created a separate timer per packet. Track **one flush timer per room**, release buffers/config/socket subscriptions on room cleanup, and coalesce event-free realtime snapshots into 100ms buckets. Shot, score and finish events are preserved. Buffers expire as the configured delay elapses; memory still scales with real spectators and their delay window.
6. Coalesce disconnect presence timers per user and clear them at shutdown. Quit the shared adapter Redis clients at shutdown. Coordinator start is guarded against repeated registration; stop removes its message handler and rejects pending RPCs, whose rejection clears timeout handles.
7. Inactive anti-cheat evidence is kept separately from player runtime for a **two-hour, maximum 5,000-profile** window, pruned on release and diagnostics. This preserves recent abuse evidence across room hopping; active profiles are not evicted by this idle policy.

## Instrumentation

Every 60 seconds `[MEMORY]` logs aggregate `rss`, `heapTotal`, `heapUsed`, `external`, `arrayBuffers`, sockets, rooms, matches, application-owned timers/intervals, pending Carrom actions, pending realtime ticks, cache/queue counts, Redis connections/subscriptions, CPU usage and event-loop p50/p95/p99. It also reports latest serialized state bytes per game, reusing the existing checksum serialization. It does not log state contents, tokens, secrets or player identities. Stop disables the histogram and diagnostic interval.

Timer counts include the single shared matchmaking sweep, optional replay timers, room/match timers, physics/ping/AFK intervals, presence timers, coordinator heartbeat, result worker, matchmaking recovery and diagnostics. They are application counters, not a count of all internal Node/Socket.IO/ioredis handles.

## Load evidence

Identical local runtime workload for baseline and fix: **100 create/play/close cycles**, mixed Carrom/Table Tennis/Snake; **10, 25 and 50 concurrent synthetic game states**; two real loopback Socket.IO clients per concurrent game (**100 peak sockets**); **500 fresh connection/disconnection cycles**. GC runs at recorded checkpoints. This is not a fully authenticated deployed game-client load test: gameplay uses real engines/runtime managers, transport uses an echo server, ownership tasks run locally without PostgreSQL, and test completion bypasses financial settlement. Real paid restart recovery is tested separately below. The 500 transport cycles exercise repeated connection cleanup, not 500 paid-match recoveries.

Values in MiB, sampled after forced GC:

| Checkpoint | Before RSS | Before heap | After RSS | After heap |
|---|---:|---:|---:|---:|
| baseline | 131.4 | 30.2 | 116.9 | 24.0 |
| after-100-lifecycles | 324.3 | 118.4 | 247.5 | 27.3 |
| active-10-games | 361.4 | 154.7 | 268.6 | 62.8 |
| cleaned-10-games | 360.3 | 153.4 | 268.6 | 28.8 |
| active-25-games | 447.4 | 233.6 | 311.9 | 103.8 |
| cleaned-25-games | 447.5 | 230.1 | 312.1 | 29.1 |
| active-50-games | 575.9 | 381.9 | 379.9 | 168.9 |
| cleaned-50-games | 574.6 | 375.3 | 378.9 | 29.2 |
| final | 577.4 | 375.5 | 379.5 | 29.6 |

Final after-run room, player runtime, sync scopes, operation queues, action cache, game timers, spectator timers, sockets and adapter rooms: **0**. Intentional bounded inactive security profiles: **370**. The framework-wide matchmaking sweep remains until shutdown.

### Local latency and CPU

Action-phase durations include synchronous engine simulation, JSON serialization and waiting behind competing synthetic game tasks; they are **not deployed end-to-end shot/animation latency**:

| Game | p50 ms | p95 ms | p99 ms |
|---|---:|---:|---:|
| carrom | 182.3 | 364.6 | 389.5 |
| table-tennis | 184.5 | 364.7 | 390.3 |
| snake-vs-worms | 183.0 | 364.5 | 390.4 |

Loopback Socket.IO echo: p50 **0.21 ms**, p95 **0.29 ms**, p99 **0.42 ms**.
Isolated local Redis PING: p50 **0.90 ms**, p95 **1.31 ms**, p99 **1.56 ms**. One shared harness Redis connection, closed after testing; no per-room clients.
Event-loop delay p50/p95/p99: **10.2/18.2/3345.0 ms**. The p99 burst remains high: this deliberately unpaced test batches synchronous Carrom physics/trajectory simulation, serialization and forced GC. CPU during active 10/25/50 stages is roughly **104–105%** of one core; forced-GC checkpoints use additional V8 worker CPU. Therefore **50 simultaneous burst workloads are not proven smooth on Render**. Memory fixes reduce retention but do not eliminate CPU saturation. Establish a staging capacity limit from paced real clients before increasing concurrency; no game validation was weakened to improve these numbers.

State-only serialized sizes in this fixture: Carrom **150,470 bytes**, Table Tennis **1,085 bytes**, Snake **5,086 bytes**. These exclude Socket.IO framing/events; live Snake size scales with its world. Carrom sends its latest trajectory in state and existing code strips duplicate copies from shot events. Physics frames are not appended to realtime match history. Carrom retains canonical action facts for safe retry/recovery, latest verification snapshot and current/latest-shot state, released with the room. Histories are not destructively truncated.

## Listener, timer and persistence audit

- Game/socket event handlers are installed once per accepted socket in the connection callback, not on every move. Socket.IO drops per-socket listeners on disconnection. The actual echo lifecycle ends with zero sockets/adapter rooms.
- Redis adapter pub/sub are constructed once at server startup; coordinator uses one additional shared connection plus its duplicate subscriber. Reconnect reuses ioredis clients. No per-player/per-room Redis construction was found. Production subscription counts require the new deployed logs; the local memory harness does not prove prolonged Redis reconnect behavior.
- Physics loops are one per match; pending realtime ticks coalesce; detach clears physics/countdown/load timers. Room unregister now also clears match timers, sync state, spectator buffers and player records.
- Disconnect grace metadata uses existing owned reconnect timers, canceled on reconnect or room cleanup. No new permanent reconnect cache was added.
- Production (`NODE_ENV=production`) requires distributed ownership and disables the legacy process-local ReplayManager recording cache. That legacy replay cache remains for nonproduction playback; it is not claimed bounded here and should not be enabled in a long-running production host. Durable database replay/checkpoint/history and financial records are preserved.
- No duplicate shot animation store was added; existing shot identity/sequence and durable retry protections remain. Full-result cache eviction is tested independently of ownership/recovery.

## Leak classification

| Resource | Finding |
|---|---|
| Memory | Confirmed retention of action results, players and sync metadata; fixed and locally reproduced before/after |
| Listeners | No per-move/per-reconnect game handler accumulation found; coordinator repeat-start/stop made explicit |
| Timers | Delayed broadcasts and presence callbacks were not centrally owned; now tracked/coalesced and canceled |
| Rooms | Runtime/Socket.IO room counts returned to zero; associated player/sync metadata previously survived |
| Redis connections | No per-room client creation found; shared clients now explicitly quit; prolonged deployed reconnect soak remains unverified |
| Pending states | Settled local queues leaked entries; now released. Realtime tick coalescing already exists; no frame history is retained |

## Verification

- Complete multiplayer suite: **388/388 PASS, 25 files, 0 failed, 0 skipped**, including eight new regressions for room retention, queue ordering, cache size/eviction idempotency, unknown acknowledgement scopes, spectator timers/coalescing, security TTL and diagnostics stop.
- Real PostgreSQL + isolated Redis + HTTP API + two socket processes: **3/3 selected restart tests PASS** for Carrom, Table Tennis and Snake vs Worms. Kill real owner, recover identity/checkpoint, continue play and settle once. **27 unrelated cases skipped by the explicit filter**; this is not a claim that all 30 integration cases ran.
- Workspace typecheck: PASS (final command evidence recorded alongside this report).
- Repository build: PASS. Existing frontend chunk-size warning remains; no new build failure.
- Production database touched: **NO**. No deployment, push, database reset, heap-size flag or instance upgrade was performed.

## Changed files

`apps/socket-server/src/index.ts`, `memoryDiagnostics.ts`, `distributed/coordinator.ts`; multiplayer `framework.ts`, `gameplay/GameStateManager.ts`, `gameplay/StatisticsCollector.ts`, managers `AntiCheatManager.ts`, `MatchManager.ts`, `MatchmakingManager.ts`, `PlayerManager.ts`, `ReplayManager.ts` (counter only), `RoomManager.ts`, `SpectatorManager.ts`, `SyncManager.ts`, `TimerManager.ts`; `__tests__/memoryRetention.test.ts`; `scripts/socket-memory-load.ts`; this report and evidence files.

## Reproduce and deployment follow-up

Local-only memory command (requires Node with exposed GC, plus optional disposable local Redis):

```sh
SOCKET_MEMORY_REDIS_URL=redis://127.0.0.1:56480 node --expose-gc --import tsx scripts/socket-memory-load.ts /tmp/socket-memory.json
```

Raw evidence is in `docs/evidence/socket-memory-2026-10-08/`. JSON files contain aggregate local fixture measurements and test results, not production secrets.

**Not deployed automatically.** After authorized staging deployment, monitor `[MEMORY]` and Render graphs through a sustained, paced real-client multiplayer period and repeated disconnect/reconnect. Verify post-idle heap/cache/player/room counts stabilize, Redis connection/subscription counts remain flat, CPU/lag meet targets, and no restart occurs. Measure actual browser-to-server latency and packet bytes under Carrom/TT/Snake traffic. Only that confirms instance capacity and closes the live Render incident.


## Follow-up: verification of the quoted seven findings

The quoted investigation mixed the active framework with an older, uninstantiated RoomManager. The current socket entry point constructs `MultiplayerFramework`; its handlers/coordinator use that framework. The final socket build has no legacy RoomManager, UniversalMatchFinalizer, MatchTimeoutMonitoringService or NetworkOptimizationsManager code. `currentEngineStateSync.ts` does actively use `GameStateSyncManager.checkSyncRateLimit`; it renders the current framework engine rather than using the legacy match-state cache.

| Quoted finding | Current result |
|---|---|
| 1. Static state/replay/cache cleanup incomplete | Confirmed latent defect. `cleanupMatch` now releases state, replay, snapshot timestamps, cached action results and match-scoped pocket IDs. Current live gameplay does not populate these legacy match maps. |
| 2. Static cleanup helpers never called | Confirmed for the older room implementation. It now calls both cleanup helpers when closing or discarding a match for rematch/abort. It retains finished-match state while the room remains available for reconnect/rematch, rather than clearing immediately at finalization. |
| 3. Legacy closeRoom misses static cleanup | Fixed and tested by actually closing 100 synthetic legacy rooms; no database writes escape the mocked test. |
| 4. Unbounded duration arrays | Confirmed latent defect. Global and per-game arrays replaced with count/total/maximum aggregates, preserving lifetime average/max. Tested with 10,000 completions. The legacy monitoring service is not currently in the production entry graph. |
| 5. SyncManager map cleanup | Already fixed in the first pass: room-scoped bounded ACKs, room sequence release and player connection-quality/ping release. |
| 6. PlayerManager map cleanup | Already fixed in the first pass: release on leave/kick/unregister; bounded reconnect lifetime and security evidence remain separate. |
| 7. Network optimization maps | Optional manager is not instantiated by production. Added explicit room/player release APIs for previous-state and prediction records and tested 100 lifecycles. Predictions already clear on reconciliation and are capped per player. Compression cache has no writer anywhere in the class and stays empty; it is not a reproduced leak. |

Rate limits are security state, not match-owned gameplay state. Match cleanup deliberately does **not** erase an unexpired client budget. Added one unreferenced shared cleanup timer to expire idle rate-limit identities even when no further sync request arrives. It stops when the map is empty. Test proves cleanup cannot bypass the five-request budget and that the scope expires after its existing 10-second window. Diagnostics now expose legacy cache counts, sync rate-limit scope counts and this timer count without identifiers.

### Why actionHistory was not truncated

The observation is accurate: canonical action history is retained for the lifetime of an active match. That is intentional: distributed checkpoint restore, replay, server validation and cache-evicted retry rejection depend on it. It is not a permanent global list: closed/unregistered rooms release the owning match. Production verification snapshots remain one latest snapshot, realtime physics ticks do not create frame history, and Carrom history keeps one canonical trajectory per shot rather than duplicate shot-event copies. Trimming this history merely to lower memory would weaken reconnect/replay/idempotency. Active-match histories still consume legitimate memory; the reported burst-capacity limitation remains.

Additional files changed in this follow-up: `apps/socket-server/src/rooms/RoomManager.ts`, `rooms/MatchTimeoutMonitoringService.ts`, `sync/GameStateSyncManager.ts`, `packages/multiplayer/src/managers/NetworkOptimizationsManager.ts`, `__tests__/legacyMemoryCleanup.test.ts`; socket diagnostics updated. No wallet, settlement, auth or tournament behavior was redesigned, and no historical database record was deleted.

Follow-up complete multiplayer suite: **392/392 PASS, 26 files, 0 failed, 0 skipped**. Four added tests cover actual legacy room closure, security rate-limit preservation/expiry, constant-space metric aggregates and optional network-map cleanup. Repository build and workspace typecheck rerun; evidence recorded in `followup-verification.json`. Original before/after load measurements above are from the first-pass harness, not falsely relabeled as a new benchmark of these mostly dormant-class changes. Production remains untouched and undeployed.
