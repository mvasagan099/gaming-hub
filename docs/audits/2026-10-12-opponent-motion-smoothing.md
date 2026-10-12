# Opponent motion smoothing

Date: 2026-10-12. Baseline: `a28e294`. User confirms startup/performance improved and specifies remaining opponent movement jumps.

## Change

Table Tennis and Snake vs Worms already use timestamped interpolation. Fixed 40/60 ms buffers can run out of history when packets arrive in bursts or server snapshot cadence slows, causing the opponent to hold then jump. Controlled replays reproduced this behavior without any server/gameplay changes.

`NetworkPlaybackClock` learns recent snapshot cadence and substantial arrival variation. The normal 40/60 ms buffers remain on healthy links. The buffer grows only when needed, caps at 150 ms, and changes gradually at 0.2 ms per elapsed millisecond instead of rewinding the playback cursor. The timing histories each retain at most 20 samples. Existing body/ball histories remain bounded. This adds some visual delay during jitter in exchange for steadier remote movement; it cannot remove a sustained network/database stall.

Table Tennis retains immediate local paddle input preview; spectator and opponent positions use buffered authoritative history. Snake uses the original base delay for the local authoritative trail and the adaptive delay for opponents. Outgoing input scheduling is unchanged. Prediction is still capped at 100 ms; it does not invent turns, contacts, collisions, points, death, respawn, growth or winners. Pause/reconnect/discontinuity handling and match clocks remain authoritative. Wallet, security, backend ownership, settlement and the other game implementations are unchanged.

## Measured replay evidence

Two deterministic 4-second traces contain 80 snapshots at 50 ms cadence, rendered at 60 Hz. Straight movement is identical; only delivery delays vary. These are synthetic presentation measurements, not live network latency or capacity results.

| Trace / opponent | Before p95 frame movement | After | Held frames before / after |
|---|---:|---:|---:|
| Moderate jitter, Table Tennis paddle | 5 units | 1.83 units | 70 / 7 |
| Larger recurring gaps, Snake | 5 units | 1.67 units | 43 / 8 |
| Larger recurring gaps, Table Tennis paddle | 5 units | 5 units | 118 / 62 |

Neither replay shows backward travel. The large-gap Table Tennis worst frame jump falls from 16 to 5 units, but its p95 does not improve: the bounded buffer cannot conceal all long gaps. Moderate Snake motion was already smooth: p95 stays 1.67 units and its maximum increases from 1.67 to 2 units during buffer catch-up. No claim of universal improvement is made. The unchanged short prediction cap holds safely when updates stop.

Reproduce current-code results from the repository root:

```
node --import tsx docs/evidence/multiplayer-smoothing-2026-10-12/jitter-replay.ts
node --import tsx docs/evidence/multiplayer-smoothing-2026-10-12/jitter-replay.ts --severe
```

Before measurements were captured against the baseline timeline implementations. Regression tests assert remote-motion improvement, monotonic/bounded clock adjustment, identical timing for same-frame consumers, recovery reset, and no added jitter buffer on the local Snake trail. Existing boundary tests verify stale/replayed updates, pause, finish, paddle contact, no invented bounce and finite gap prediction.

## Verification

Complete web: 58 files, 516 passed, zero failed/skipped. Typecheck: nine workspaces PASS. Production build: PASS with existing large web chunk warnings. Web tests use a temporary Node WebSocket shim and synthetic Supabase configuration, with no production auth traffic. No full API/backend suite rerun is claimed for these presentation-only changes.

## Deployment and remaining limits

Push the tested change through the existing direct-to-main deployment workflow. Verify opponent movement with two actual clients after the frontend deployment finishes. General live smoothness is not certified by a virtual replay. The preceding hosted investigation documented intermittent database connectivity/owner-recovery delays; this change does not solve those operational failures. No resource sizes, credentials or production financial data are changed.

Evidence: `../evidence/multiplayer-smoothing-2026-10-12/`.
