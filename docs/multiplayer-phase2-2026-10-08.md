# Gaming Hub multiplayer Phase 2

Date: 2026-10-08. Baseline commit: `b4529a3`. Results apply to that commit plus the working-tree changes listed below, not to a deployed release.

## Verdict: STAGING NOT VERIFIED

Local fixes and regression checks passed. No deployment, restart, migration or load test was performed against the supplied Render services. Those URLs match services previously identified as live production. Their conversion to isolated staging has not been confirmed. The Render dashboard opened at its sign-in screen. The database configured in the root environment is remote; its staging isolation is unverified, and it was not used.

Actual Render CPU/RAM limits, replica count, shared Redis configuration and test-only secrets remain unverified. A 60-minute staging soak, paced authenticated load escalation, real browser input-to-opponent-animation measurements and restarts during active gameplay remain blocked. Local results do not establish production stability or staging capacity.

## Bugs and changes

1. **Oversized Carrom cross-server acknowledgements.** Redis coordination discards messages above 64 KiB. A shot result contained its trajectory in state and two events, exceeding this limit. The authoritative owner could commit a shot while its acknowledgement was discarded, causing a timeout at the other replica. `applySocketGameAction` now returns a compact Carrom receipt. State broadcasts, engine state, retry cache, durable recovery and historical replay retain authoritative data. Invalid match identity still throws synchronously at the existing security boundary.
2. **Repeated completed trajectories.** Routine Carrom metadata broadcasts cloned and sent the previous trajectory. A presentation serializer excludes that field before cloning for non-shot broadcasts. Fresh shot broadcasts and full reconnect snapshots retain the complete trajectory. A marker prevents compact metadata from triggering old shot animation.
3. **Duplicate client packets.** The frontend rejected older versions but accepted equal versions, repeating renders and events. Within the same match, positive sequence versions must now increase. New-match and explicit recovery paths remain separate.
4. **Measured physics cost.** Baseline CPU profiling attributed approximately 14.3% of samples to pocket-distance checks and 25.3% to state cloning. Pocket checks now compare squared distances, and collision pairs calculate square roots only when bodies overlap. Pocket dimensions, substeps, collision response, scoring and server authority remain unchanged.

No wallet, KYC, MFA or financial policy implementation was changed. Existing bounded Table Tennis interpolation and Snake version handling were inspected and regression-tested; their game rules were not changed. Worker threads were not introduced: their checkpoint ordering and recovery costs require a separate measured design.

## Payload measurements

One deterministic synthetic high-power Carrom shot, measured as UTF-8 JSON bytes before transport compression:

| Payload | Before | After |
| --- | ---: | ---: |
| Action acknowledgement | 664,778 | 8,428 |
| Routine metadata snapshot | 222,841 | 4,094 |

The compact Redis reply envelope was 8,475 bytes against a 65,536-byte limit. Full shot/recovery snapshots still contain trajectories. Tests confirm canonical state is unchanged, retries preserve their original replay and reconnect receives the full trajectory.

## CPU comparison

An isolated alternating-order benchmark ran 60 identical simulations on baseline and updated physics. Full results, final coins and striker were compared byte-for-byte: **0 mismatches**.

| Physics metric | Baseline | Updated |
| --- | ---: | ---: |
| CPU consumed, 60 simulations | 2.992 s | 1.756 s |
| Simulation p50 | 32.36 ms | 19.01 ms |
| Simulation p95 | 68.92 ms | 34.19 ms |
| Simulation p99 | 82.78 ms | 66.99 ms |

CPU consumed decreased approximately 41.3% in this local fixture. These are physics measurements, not network or end-user latency guarantees. Full-state cloning, hashing, JSON serialization and shot fan-out remain costs on the authoritative thread.

## Memory and synthetic load

The local diagnostic exercised 100 match lifecycles, 500 connection/reconnection cycles, and bursts at 10/25/50 rooms with up to 100 loopback socket connections. It used actual engines and Socket.IO, but game actions were driven by fixtures; the echo clients were not authenticated deployed gameplay clients.

Baseline peak RSS: approximately **388.0 MiB**. Final peak RSS: approximately **382.3 MiB**. Final heap after forced collection: approximately **29.5 MiB**. These single-run differences are observations, not proof of a memory improvement or plateau over 60 minutes. Baseline and final diagnostics were not conducted on identical idle hosts and the final run additionally measured local Redis.

At cleanup, room/player/timer/sequence/replay-cache maps and socket rooms returned to zero. Three per-game payload counters remained. The anti-cheat idle-player map retained 370 entries by design; its existing two-hour expiry and 5,000-entry cap preserve security history across reconnects. This is bounded retention, not a zero-retention claim.

**Maximum verified stable concurrent games: not established.** A short burst at 50 synthetic rooms completed, but event-loop p99 remained approximately **2,848 ms**. That is unsuitable evidence for low-latency production capacity. Staging must use paced authenticated clients and stop escalation before exhausting the verified instance.

### Synthetic action pipeline, final run

These numbers include engine application, fixture bookkeeping, queueing and broadcast preparation under burst contention. They do **not** measure real client input-to-ACK or opponent-display latency.

| Game | p50 | p95 | p99 |
| --- | ---: | ---: | ---: |
| Carrom | 155.41 ms | 329.36 ms | 381.41 ms |
| Table Tennis | 158.39 ms | 334.28 ms | 383.75 ms |
| Snake vs Worms | 156.73 ms | 333.01 ms | 383.74 ms |

Loopback Redis p50/p95/p99: **0.97 / 1.56 / 2.59 ms**. This is not Render Redis latency. End-to-end input-to-ACK, opponent display, animation playback and staging packet-loss/duplicate rates are **not measured**.

## Redis and restart verification

Six selected integration tests passed using a real local HTTP API, two separate socket processes, disposable PostgreSQL and isolated Redis:

- Large Carrom shot through a non-owner replica: successful ACK, one action on retry, trajectory persisted, one payout.
- Carrom, Table Tennis and Snake owner termination: identity and state recovered, duplicate action rejected/deduplicated, private-room rematch funded under a new identity, settlement once.
- Tournament provision retries recovered the same bracket identity.
- Redis transport outage failed closed, recovered, and accepted a delayed duplicate action once.

These verify local ownership, replay and financial integration invariants. They do not substitute for staging restarts timed during a visible Carrom animation, active Table Tennis rally, Snake movement or tournament match. Actual deployed Redis subscriptions, credentials and cross-region latency remain unverified.

## Final verification

| Check | Result |
| --- | --- |
| Complete game-engine suite | 425/425 PASS, 27 files |
| Complete multiplayer suite | 395/395 PASS, 27 files |
| Complete web test discovery | 383/383 PASS, 41 files |
| Relevant API startup/recovery/rematch/security/settlement | 56/56 PASS, 4 files |
| Selected real two-server/Redis/restart API tests | 6/6 PASS, 1 file; 25 unrelated cases not selected |
| Workspace typecheck | PASS |
| Repository build | PASS |
| Fresh local migration deployment | 11/11 migrations PASS |
| Fresh database versus Prisma schema | PASS: no difference detected |
| Production services/database touched | NO |
| Isolated staging deployment and 60-minute soak | BLOCKED |

Total executed automated tests: **1,265 passed, 0 failed**. This is not a full repository API aggregation: the report distinguishes complete package suites from selected relevant API suites. New regressions cover oversized replies, compact/full snapshots, canonical preservation, duplicate/older packets, pocket geometry, and Carrom delivery delayed by 100/300/500 ms. The delayed-delivery tests use simulated timers, not two deployed browsers with network shaping.

Build warning: frontend chunks exceed 500 KiB, including the AudioManager chunk. Build succeeds; startup cost on mobile remains to be measured. The local integration environment emitted a Node 20 deprecation warning from Supabase; deployed Node configuration was not inspected.

## Files changed

- `apps/socket-server/src/gameActions.ts`
- `packages/game-engine/src/carrom/physics.ts`
- `packages/game-engine/src/carrom/engine.ts`
- `packages/game-engine/src/types.ts`
- `packages/multiplayer/src/managers/SyncManager.ts`
- `apps/web/src/store/multiplayerStore.ts`
- `apps/web/src/games/carrom/CarromMultiplayerDriver.ts`
- `packages/game-engine/__tests__/carromPockets.test.ts`
- `packages/multiplayer/__tests__/carromActionReceipt.test.ts`
- `apps/web/src/store/multiplayerStore.roomLifecycle.test.ts`
- `apps/web/src/games/carrom/__tests__/multiplayerDriver.test.ts`
- `apps/api/src/services/__tests__/multiReplicaRestartRecovery.test.ts`

Previous memory fixes were already committed in the baseline. Phase 2 changes and this report remain uncommitted; nothing was pushed or deployed.

## Remaining staging work

1. Identify isolated services and database; sign in to Render and verify actual CPU/RAM, replica count, shared Redis and staging-only secrets.
2. Deploy a verified commit only there after migration preflight.
3. Add bounded tracing for the complete deployed client-to-animation path; collect p50/p95/p99 and missing/duplicate counters without logging credentials or private payloads.
4. Exercise two authenticated clients at 100/300/500 ms latency, then paced 10/25/50-game levels only while resources permit.
5. Run the required 60-minute soak and active-game/private-room/tournament failure injection. Inspect RSS/heap, CPU, event-loop lag, throughput, disconnects and restarts.
6. Choose admission limits, instance capacity or isolated physics workers from that evidence. The burst event-loop tail remains an unresolved reliability risk.

Evidence: `docs/evidence/multiplayer-phase2-2026-10-08/`. No keys, passwords or remote database connection strings are stored there.
