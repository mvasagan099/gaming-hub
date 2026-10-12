# Multiplayer startup, lag and memory investigation

Date: 2026-10-12 (Asia/Kolkata). Baseline main commit: `d925f7a`.

## Confirmed defect and correction

The user reports Snake vs Worms stopping at ready/countdown. `applyRoomReply` accepted a delayed start acknowledgement for the same match after the server had broadcast `playing`. This rewound the client room to `starting`; GamePage then rejected the playable route. A second stale reply could restore `awaitingGameLoad=true` after both boards were loaded, preventing actions in the client.

Eleven newly added regressions fail before the correction: nine supported games receiving a delayed countdown start reply, plus Carrom and Snake vs Worms receiving a delayed board-loading reply. The correction preserves the newer playing/load-complete broadcast when applying those stale command acknowledgements. It does not filter authoritative room broadcasts, bypass board readiness or change server timers, participant checks, Redis/PostgreSQL fencing, input validation, wallet operations or settlement.

After correction, the room lifecycle file passes 51/51. This demonstrates a genuine startup race, but does not prove it was the sole cause of the reported hosted incident. A two-client live retest remains required after deployment.

## Hosted evidence — read only

The public frontend bundle points to `https://gaming-hubsocket-server-production.up.railway.app`; that endpoint's readiness check returns HTTP 200. This does not prove continuing database connectivity.

Railway service `@gaming-hub/socket-server` is live in Singapore with one replica and a socket-specific start override. Its sampled current limits are 2 CPU / approximately 1 GB memory. The returned two-hour resource series has peak CPU usage 0.276 core and peak memory accounting around 0.090 GB; the application RSS samples reach about 154 MiB. Platform memory accounting and application RSS are different measurements and should not be substituted for each other. No exhaustion or OOM appears in the returned window. Periods before the service started are included in the platform aggregate, so average/minimum figures do not certify capacity.

HTTP telemetry reports 81 requests over two hours (75 2xx, two 4xx, four 5xx); this includes initial deployment failures. Runtime samples show at most two connected sockets and one room. These measurements do not show an incoming HTTP surge. WebSocket messages are not individually counted by HTTP request telemetry, so a socket-event traffic spike is not ruled out. Trace/auto-instrumentation is disabled.

Runtime counters return to zero for active rooms, matches, physics/countdown/load timers, tracked players, pending owner operations and sockets after clients leave. Remaining idle security profiles are intentionally bounded by a two-hour retention window and 5000-entry cap; they are not deleted merely to claim zero retention. Peak active sampled event-loop p99 is approximately 38 ms, dropping to around 24–26 ms idle. Short sampled windows are not a sustained soak.

Confirmed operational errors:

- 08:44 and 08:47 UTC: matchmaking provisioning remains retryable.
- 08:49 UTC: disconnect/reconnect waiting for owner recovery.
- 08:59 UTC: Prisma LoginSession lookup cannot reach the external database server.
- Render API logs additionally report tournament scheduler/DB job-lock session failures. No job-lock or financial safeguards were weakened.

The API remains on Render Free, with a sampled 0.15-core / 512-MB limit and roughly 100-MB memory usage. The old Render socket service is also still running. Whether it shares Railway's exact Redis identity is not established: Railway OAuth exposes variable names only. Coexisting servers are not themselves a proven defect; ownership is fenced. Avoid disabling a potentially active server or changing Redis while matches exist without confirming ownership and draining first.

No credentials, personal log payloads, production database rows, service settings or paid resources were written during investigation.

## Current local performance and retention

The existing local Socket.IO memory exercise runs 100 match lifecycles, up to 50 concurrent fixture rooms/100 sockets, and 500 reconnect cycles. After cleanup and forced GC, heap is 29.74 MiB, versus 29.46 MiB in the stored October 8 baseline. Peak RSS is 385.60 MiB versus 380.84 MiB. Room/player/socket/action-cache/timer counters drain; 370 idle security profiles remain under their deliberate cap. Three fixed game-payload byte counters remain diagnostic metadata. This does not demonstrate an unbounded match-state leak.

Forced-GC/burst timings are excluded from realistic gameplay claims. The separate 60-second paced fixture run uses three engines and six receiving clients, without concurrent forced-GC profiling. CPU is 15.84% of one local core; peak RSS 194.80 MiB, heap 70.53 MiB; event-loop p50/p95/p99 10.47/14.72/19.30 ms. Action p95: Carrom 27.18 ms, Table Tennis 0.11 ms, Snake vs Worms 0.66 ms. These fixtures exclude real authentication, PostgreSQL, Redis ownership, anti-cheat and financial settlement. They cannot establish live latency, safe player capacity or that a past hosted OOM was fixed. Local Node 24 differs from deployed Node 22.

## Verification

| Suite | Files | Passed | Failed | Skipped |
|---|---:|---:|---:|---:|
| Complete web | 56 | 509 | 0 | 0 |
| Complete multiplayer | 32 | 451 | 0 | 0 |
| Complete game engine | 29 | 444 | 0 | 0 |

Typecheck: PASS across nine workspaces. Production build: PASS; existing large web chunk warnings remain. Full API aggregation is not rerun for this frontend-only correction. Server load safety, lifecycle, ordering and cleanup tests run in the full multiplayer suite. Web tests use a temporary Node WebSocket setup and synthetic provider configuration; no production auth requests or games are created by the tests.

## Remaining actions

1. Deploy the verified startup correction through the existing main workflow; retest with two actual accounts using the same game/stake. Verify countdown, both board-loaded receipts, movement, reconnect and no duplicate finish.
2. Investigate external database availability, pooled-connection behavior and DB job-lock errors in the provider dashboards. Confirm Railway/API share the intended DB and Redis identities. OAuth variable-name inventory is not identity verification. Do not change production database URLs, pool modes or finance logic based on this report alone.
3. Measure client-to-ACK/opponent-render latency during the retest. A sleeping Render API can delay provisioning even though the socket now runs on Railway. Keep essential cross-provider links in the same region and verify Redis/database connectivity; do not switch coordination storage mid-match.
4. Capture a longer active soak and frame-rate measurements on affected devices. No instance upgrade is justified solely by the current low-load resource sample. If CPU/memory or queue depth rises toward the actual limits under sustained play, size resources using that evidence and obtain cost approval.

## Verdict

The reproduced startup race is fixed and locally verified. General hosted smoothness, database connectivity stability and OOM resolution remain unverified. Evidence is in `../evidence/multiplayer-2026-10-12/`.
