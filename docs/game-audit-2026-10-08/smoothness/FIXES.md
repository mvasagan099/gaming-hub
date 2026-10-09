# Multiplayer smoothness fixes — 2026-10-08

## Implemented

### Table Tennis

Movement remains on the existing reliable, sequenced, server-validated action route. Up to eight movement requests may overlap network RTT, with a 40 ms send interval. The unsent queue stores only the newest position. When eight requests are outstanding, input coalesces until a slot is released. Request IDs stay unique across reconnects, so an old ACK cannot unlock a new connection's slot. Serve/readiness/result protections remain intact. No server security/rate-limit changes were made; 25 Hz stays below the existing 30-actions/sec game limit.

Same simulated workload (60 input samples/second):

| RTT | Before: requests during movement | After |
|---|---:|---:|
| 40 ms | 21 | 25 |
| 100 ms | 10 | 25 |
| 200 ms | 5 | 25 |

Permanent tests cover high RTT, queue bounds/latest-input coalescing, shutdown, rejection and old/new connection ACK separation. Longer outages still reduce delivery once the bounded window fills; it never becomes an unbounded backlog.

### Snake vs Worms

Presentation uses a 60 ms timestamped buffer capped at 12 snapshots. Input, collisions, scores and winner logic continue to use the latest authoritative state. Remote body positions interpolate between samples instead of repeatedly chasing each newly arrived packet. Gaps hold the most recent sampled body; no invented collision or position extrapolation occurs. Reconnect resets history; pause/death/teleport/body-length changes snap to authoritative data. Duplicate versions are ignored, and same-timestamp updates replace the latest sample without discarding preceding history. Camera smoothing remains.

Permanent tests cover uneven arrivals, no state mutation, stale/duplicate versions, gaps, timestamp replacement, recovery and discontinuities. The added presentation delay trades a small intentional buffer for steadier motion; real device/steering latency still needs staging measurement.

### Carrom

Shot-only broadcasts use a versioned dictionary/tuple trajectory representation. Every frame, float coordinate, pocket status/index and piece ID is preserved exactly. There is no quantization, frame thinning or physics change. The client decodes once at the game-state boundary. Duplicate shot-event trajectories remain omitted. Metadata stays compact; stored engine snapshots, historical replays, authoritative recovery and action receipts keep their existing semantics.

The sampled shot state falls from **242,720 to 93,571 bytes (61.45% smaller)**. Tests verify exact decoded state (with a fixed timer clock), reordered piece IDs/fractional coordinates, unchanged canonical snapshots, shot-event metadata and full recovery. Packing before serialization avoids cloning the large expanded trajectory just to broadcast it.

**Rollout requirement:** the updated frontend decoder and socket-server/engine must be deployed as a coordinated staging release, and old clients refreshed. Existing servers' unpacked packets still work with the updated client. Old clients do not understand the new compact shot format. No deployment was performed in this task.

## Paced local verification

Three local seeded game fixtures, six receiving Socket.IO clients, 60 seconds. No database, Redis fencing, auth, anti-cheat or settlement calls. Client rendering is not included. This is not a capacity or production-smoothness claim.

| Metric | Before | After (quiet run) |
|---|---:|---:|
| CPU, percent of one core | 20.70 | 20.26 |
| Peak RSS, MiB | 187.25 | 182.65 |
| Event-loop p99, ms | 20.69 | 20.94 |
| Carrom action pipeline p95, ms | 28.57 | 24.53 |
| Carrom physics p95, ms (20 samples; tail estimate is the maximum) | 22.21 | 22.58 |
| Carrom shot wire serialization p95, ms | full-state serialization 2.37 | compact serialization 0.226 |
| Socket deliveries | 10,146/10,146 | 10,178/10,178 |
| Queue final pending | 0 | 0 |

These single-run CPU/tail differences do not establish a statistically reliable performance gain. Payload reduction and simulated RTT delivery are directly reproducible. Physics was not optimized and remains a potential shared event-loop pause under larger load. Browser FPS and WAN jitter remain unverified.

An earlier after-run overlapped briefly with engine verification and had a 61 ms physics tail; preserved in paced-profile-after-overlap.json rather than discarded. It was rerun without overlapping tests; the quiet run is paced-profile-after.json. Forced-GC retention pauses are outside the gameplay timing window.

## Regression and build results

| Suite | Files | Passed | Failed | Skipped |
|---|---:|---:|---:|---:|
| Game engine | 28 | 431 | 0 | 0 |
| Multiplayer | 27 | 395 | 0 | 0 |
| Web | 42 | 373 | 0 | 0 |
| Total | 97 | 1,199 | 0 | 0 |

Typecheck: PASS. Production build: PASS. Final status is recorded in fix-regression-results.json. Full engine, multiplayer and web suites were rerun, with no skipped tests. Repository typecheck and production build were run on the resulting changes. Existing oversized frontend chunk warnings remain a loading-performance consideration.

## Scope / remaining checks

Wallet, settlement, authentication, tournament and referral production behavior was not changed. No production data, push or deployment changes occurred. Earlier uncommitted game fixes were preserved.

Before release: coordinated staging frontend/socket rollout; two-client WAN tests; 360/390 px device frame-time capture; reconnect/shot playback under jitter; sustained realistic load. Do not treat local passing tests as proof of smooth live gameplay or a fixed Render OOM incident.
