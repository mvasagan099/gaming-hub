# Game smoothness investigation — 2026-10-08

Baseline: d2cac19 plus the uncommitted game fixes documented in ../FIXES.md. Existing modifications were preserved. This investigation adds evidence only: no gameplay/protocol, wallet/security, database, deployment or push changes.

## Local improvements

The measured bottlenecks have since received local improvements. See [FIXES.md](FIXES.md) for current behavior, measurements and rollout requirements. This file retains the original investigation.

## Original investigation conclusion

**Smoothness is not fully verified.** Current rule and lifecycle suites pass for all nine games. A paced local workload and simulated-latency input test identify specific bottlenecks, but no physical-device frame-time capture or deployed two-client WAN session was available. Do not interpret passing tests as a 60 FPS guarantee.

## Current regression results

| Suite | Files | Passed | Failed | Skipped |
|---|---:|---:|---:|---:|
| Game engine | 27 | 429 | 0 | 0 |
| Multiplayer | 27 | 395 | 0 | 0 |
| Web | 41 | 367 | 0 | 0 |
| Total | 95 | 1,191 | 0 | 0 |

These entire suites were rerun during this investigation. The separate simulated-latency measurement passed 3/3 checks and is preserved as a reproduction fixture, not part of normal test discovery. Typecheck/build passed in the immediately preceding fix verification; they were not rerun here because application code did not change.

## Measured local workload

Command: `node --expose-gc --import tsx scripts/multiplayer-paced-profile.ts report.json`.
Duration: 60.04 seconds. Three simultaneous fixtures: Carrom, Table Tennis, Snake vs Worms; six receiving localhost Socket.IO clients. Legal engine inputs, seeded physics and 30 Hz paced loop. No production connections, auth, database, Redis fencing, anti-cheat, settlement or actual browser rendering.

- CPU: 20.70% of one local core.
- Peak RSS: 187.25 MiB; peak heap: 66.77 MiB.
- Event-loop delay p50/p95/p99: 11.46 / 17.58 / 20.69 ms. The monitor uses 10 ms resolution; this is not browser frame duration or network latency.
- Queue peak: 1 pending task; final pending: 0. Work is serially paced, so this does not test overload/backlog capacity.
- Socket deliveries: 10,146 / 10,146. Rejected actions: 0.
- Forced GC: 21.79 ms, measured after the workload and excluded from CPU/gameplay event-loop measurements.

| Game | Physics p50 / p95 / p99, ms | Full action pipeline p95, ms | Sampled state JSON bytes |
|---|---|---:|---:|
| Carrom | 14.00 / 22.21 / 22.21 (20 shots) | 28.57 | 242,720 |
| Table Tennis | 0.137 / 0.201 / 0.255 | 0.278 | 1,342 |
| Snake vs Worms | 2.532 / 3.888 / 4.324 | 1.754 | 19,755 |

State encoding/cloning/hash distributions are in paced-profile.json. Carrom full-state serialization p95 was 2.37 ms, JSON cloning 2.89 ms, and the sampled StateValidator hash 2.99 ms. These final-state microbenchmarks are separate from the paced workload and do not measure production capacity. Normal Carrom metadata broadcasts already omit settled trajectories; large shot/recovery state remains necessary in the current protocol.

Prior same-script local reports had CPU 17.77–18.80%, RSS 180.32–188.35 MiB, and event-loop p99 19.25–19.92 ms. The current single run is slightly slower on CPU/event-loop, not evidence of a source regression or performance improvement. Different background load and local machine conditions are uncontrolled. No before/after optimization claim is made.

## Priority findings and safe next steps

### 1. Table Tennis movement is limited by acknowledgement RTT — measured

TableTennisMultiplayerDriver.ts allows one paddle request in flight. Its intended 40 ms send interval cannot deliver 25 updates/sec when RTT exceeds 40 ms. A test feeds 60 changing positions over one second through the actual driver:

| Simulated RTT | Requests sent during movement |
|---|---:|
| 40 ms | 21 |
| 100 ms | 10 |
| 200 ms | 5 |

Final positions arrive correctly; stale positions are coalesced, not lost. However, an opponent sees fewer movement updates on high-latency links. This is a latency tradeoff in a safe bounded queue, not proof of packet loss. The ball already has buffered timestamp interpolation and bounded extrapolation.

Next step: design/test a separately bounded, ordered latest-input movement path that is not paced by every movement ACK; retain server validation, sequence checks, reconnect guards and reliable discrete actions. Do not simply remove the in-flight guard and allow an unbounded promise queue.

### 2. Carrom shot computation and payloads can cause pauses — measured

Authoritative shot simulation is synchronous. This fixture's p95 shot CPU exceeds a 16.67 ms frame budget and can delay other rooms sharing the Node event loop. This comparison indicates potential server dispatch delay, not measured client FPS. Full shot state was about 243 KB in this run, so WAN transfer and client parsing can add delay.

Next step: measure real shot payload/arrival/playback timing on two staging clients; optimize trajectory encoding/transport and remove repeated processing while preserving exact final outcomes, shot IDs, ordered replay, recovery and settlement. Consider physics isolation only after workload measurements justify it. Do not change physics outcomes to make the benchmark faster.

### 3. Snake vs Worms presentation follows arriving snapshots — source finding

The server updates at 20 Hz. The client exponentially smooths all body segments toward the latest packet, rather than rendering a short timestamped history. Variable arrivals therefore vary visible velocity. Input/camera/body smoothing adds delay, especially when a packet gap is followed by a large correction. This mechanism is confirmed in source; the visible effect on the user's device is not yet measured.

Next step: add bounded timestamped presentation interpolation with controlled gap handling, reset on reconnect/death/teleport, and measure steering latency. Preserve authoritative collision, winner and score rules.

### 4. Mobile rendering costs need real device measurements — not yet quantified

Static Carrom/Snooker boards and Snake floor/Table Tennis arena are already cached. Shared animation loops correctly use requestAnimationFrame and reset their clock after backgrounding. Do not remove these working optimizations.

Dynamic gradients/shadows/segments and visual effects still draw each frame. Table Tennis redraws its table surface/net; Snake work scales with visible body segments and food. Carrom pocket ripple changes and Table Tennis ball spin use per-frame increments, so those cosmetic effects vary at different frame rates. These are candidates for GPU/frame-time investigation, not confirmed causes of dropped frames without browser profiling.

## Per-game coverage

| Game | Rules/lifecycle tests | Render/update paths reviewed | Paced performance / WAN evidence |
|---|---|---|---|
| Ludo | PASS | Phaser/wrapper lifecycle | Device FPS/WAN NOT TESTED |
| Chess | PASS | Phaser/history/clock paths | Device FPS/WAN NOT TESTED |
| Carrom | PASS | Shot replay, board cache, shared rAF | Local paced workload; WAN/FPS NOT TESTED |
| Snake & Ladder | PASS | Phaser/wrapper lifecycle | Device FPS/WAN NOT TESTED |
| Fruit Ninja | PASS | Phaser/timer/driver paths | Device FPS/WAN NOT TESTED |
| Bubble Shooter | PASS | Shared rAF/update/render paths | Device FPS/WAN NOT TESTED |
| Table Tennis | PASS | Buffered ball timeline, input pacing, canvas | Local paced workload + RTT test; WAN/FPS NOT TESTED |
| Snake vs Worms | PASS | Body/camera interpolation and input | Local paced workload; WAN/FPS NOT TESTED |
| Snooker | PASS | Persistent rAF, cached table, replay | Device FPS/WAN NOT TESTED |

## Required live verification

Collect two staging clients' RTT/jitter, packet gaps, frame p50/p95/p99, long tasks, render resolution, device model, refresh rate and thermal state. Compare AI and multiplayer for the same game. Correlate server CPU/RSS/event-loop/queue metrics with client stalls. Sustained soak and concurrency tests must use approved isolated staging infrastructure. No Render OOM fix, concurrency capacity or complete smoothness claim is supported by this 60-second fixture.

Evidence: paced-profile.json, paddle-rtt.json, regression-results.json and paddlePerformance.audit.test.ts.txt. The probe can be copied temporarily to its original Table Tennis __tests__ directory and run with Vitest; it writes only /tmp/gaming-paddle-rtt.json. No persistent database changes occur.
