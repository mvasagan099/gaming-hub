# Gaming Hub final pre-staging verification

Date: 2026-10-08. Branch: `main`. Audited production-source baseline: `8564429f6e15da9fa5577a0da0d0308a6727bbe3`. Local cleanup commit: `99c15c0`; recovery harness repair: `a6cc5a3`. Subsequent changes are verification tools and evidence only.

## Verdict

**READY FOR STAGING — local verification passed. STAGING NOT VERIFIED.** No production database access, production writes, push, resource creation or deployment occurred. Wallet/security behavior and production game/socket source were unchanged. This is not production deployment approval or proof that the Render OOM incident is resolved.

## Recovery failures and repair

The initial independent recovery run reproduced **23 passed, 8 failed, 0 skipped**. Every failed test reported exactly `Error: websocket error`. The preceding completed-opponent-departure test killed replica A; later tests tried to connect without starting it again. Port/listener inspection confirmed that replica A was absent. This was a shared fixture lifecycle defect, not evidence of a distributed production recovery defect.

Affected tests:

1. restores an expired countdown deadline after owner death, funds once and starts once
2. deduplicates concurrent starts and pauses countdown on disconnect without funding a new match
3. preserves selected Chess Quick Match settings across replicas, reconnect and rematch
4. pairs players connected to different replicas into one shared room
5. keeps a tournament provision retryable while unavailable, then provisions the same bracket identity
6. refunds a funded intent when its HTTP acknowledgement is lost and the waiting room closes
7. keeps API 503 results across owner death and retries a lost successful HTTP acknowledgement once
8. fails closed while real Redis transport is unavailable, then recovers and accepts one delayed duplicate action

Only `apps/api/src/services/__tests__/multiReplicaRestartRecovery.test.ts` was repaired: restart dead replicas before each test, disconnect fixture sockets/reset faults afterward, allocate localhost ports through the OS, attach connection listeners before connecting, clear paired listeners/timeouts, bound subprocess diagnostics, abort stalled readiness probes and await subprocess `close` during shutdown. Redis is restricted to local targets. The existing overall startup deadline was retained. No test or assertion was removed, skipped or weakened.

The independent rerun passed **31/31** (~312 seconds). The recovery suite repeated inside the full API aggregation and passed **31/31** (~291 seconds). See [failure diagnosis](evidence/pre-staging-2026-10-08/recovery-diagnosis.json), [before](evidence/pre-staging-2026-10-08/recovery-before.json), [after](evidence/pre-staging-2026-10-08/recovery-after.json) and [repeat](evidence/pre-staging-2026-10-08/api/group-02.json).

## Complete current verification

| Suite | Files | Passed | Failed | Skipped |
|---|---:|---:|---:|---:|
| Full API | 99/99 | 1394 | 0 | 0 |
| Game engine | 27 | 425 | 0 | 0 |
| Multiplayer | 27 | 395 | 0 | 0 |
| Web | 41 | 383 | 0 | 0 |
| Security and IDOR, independent selection | 17 | 188 | 0 | 0 |
| Financial concurrency/reconciliation/idempotency/economy, independent | 4 | 48 | 0 | 0 |
| Distributed restart recovery, independent | 1 | 31 | 0 | 0 |

Security, financial and recovery selections overlap the full API suite; they are not additional unique tests. The four non-overlapping complete workspace suites total **2597 passed**. API discovery found 99 current files, rather than the historical 76. The deterministic 23-group [manifest](evidence/pre-staging-2026-10-08/api/manifest.json) assigns every file exactly once, with zero missing or duplicate files. Results persist after every group; [aggregate](evidence/pre-staging-2026-10-08/api/aggregate.json) confirms complete execution.

`npm run typecheck`: PASS across nine workspaces, zero errors. Independent diagnostic profiler TypeScript check: PASS. `npm run build`: PASS. Build warning: AudioManager chunk 1375.14 kB (gzip 357.75 kB), above the chunk-size advisory threshold; a loading/performance concern, not a missing asset or failed build.

Disposable PostgreSQL targets: `127.0.0.1:5540`, databases `gaming_prestaging_20261008_test`, `gaming_prestaging_security_test`, `gaming_prestaging_financial_test`. Isolated Redis: `127.0.0.1:56482`, container `gaming-prestaging-redis`, separate suite DB numbers. Test configuration rejects remote PostgreSQL and requires a test database name. All 11 current migrations applied to the newly created API fixture database; failed/rolled-back migrations: zero. Only local fixture writes and migrations ran. Production Neon was not connected. Payment/email providers were test mocks or local unavailable endpoints, not real financial integrations.

Reproduction: supply local-only `TEST_DATABASE_URL`, `TEST_REDIS_URL` and project test-only service configuration, then run `node scripts/prestaging-api-verification.mjs <output-directory>`. Append `security` or `financial` for independent selections. Complete engine, multiplayer and web suites use their workspace Vitest configurations. Performance reproduction: `node --expose-gc --import tsx scripts/multiplayer-paced-profile.ts <report.json>`. Do not reuse remote application environment values.

## Repository cleanup

Removed tracked `scratch/check.ts` and `scratch/check2.ts`; they printed arbitrary SiteSetting values and were not executed. Moved `memory-report.json` to `docs/evidence/pre-staging-2026-10-08/historical-memory-report.json`, explicitly labeled historical/unpaced/forced-GC. Added ignore rules for the three original diagnostic paths. Cleanup was committed normally, without rewriting history. Pattern scans of these artifacts and available revisions found no embedded credentials. Negative test names containing credential-shaped dummy URLs were redacted in new evidence without changing counts. This targeted scan is not a comprehensive repository/history secret audit.

## Paced CPU, synchronization and memory

Three reproducible 60-second runs use seeded legal Carrom placements/shots, 30 Hz realtime ticks, 10 Hz Table Tennis/Snake controls, three active local game fixtures and six real receiving Socket.IO clients. Ended rounds restart as new fixture rooms so each game remains active. Carrom shots occur every three seconds. No catch-up burst. Invalid actions: zero. Node v24.20.0 on the local host differs from production Node 22.

| Run | CPU, one-core equivalent | Loop p50 / p95 / p99, ms | Peak RSS, MiB | Peak heap, MiB | Broadcasts/sec | Received / expected |
|---|---:|---|---:|---:|---:|---:|
| 1 | 17.77% | 10.85 / 15.32 / 19.25 | 186.7 | 69.8 | 87.77 | 10538 / 10538 |
| 2 | 18.17% | 10.98 / 15.46 / 19.71 | 188.3 | 66.8 | 87.30 | 10478 / 10478 |
| 3 | 18.80% | 11.13 / 15.82 / 19.92 | 180.3 | 68.4 | 86.40 | 10370 / 10370 |

Run 1 engine-action p50/p95/p99 (ms): Table Tennis **0.050/0.102/0.149**; Snake **0.333/0.549/1.498**; Carrom **10.734/21.478/31.379**, combining 20 placements and 20 shots. Local pipeline includes engine, recording and broadcast: TT **0.153/0.296/0.397**, Snake **1.106/1.710/2.323**, Carrom **18.504/30.853/41.991**. Run 3 strike-only Carrom measurement (20 samples, including engine validation/cloning and physics) was **12.975/37.323/37.323 ms**; it is not isolated physics-core cost. TT and Snake tick p99 were **0.298 ms** and **4.239 ms**. Instrumented per-room serial queue peak pending: **1**, final **0**.

Run 3 microbenchmarks, 100 samples, p95 milliseconds (outside the paced CPU/loop measurement):

| Game / serialized bytes | JSON clone | Structured clone | Engine serialize | JSON encode | State hash |
|---|---:|---:|---:|---:|---:|
| Carrom / 242720 | 3.188 | 4.463 | 3.179 | 1.550 | 3.365 |
| Table Tennis / 1360 | 0.020 | 0.020 | 0.021 | 0.006 | 0.024 |
| Snake / 20670 | 0.349 | 0.522 | 0.269 | 0.135 | 0.249 |

Forced GC runs only after timed gameplay stops. Its pauses are separately reported, never included in the paced event-loop percentiles. These runs omit deployed authentication, anti-cheat, Redis adapter, database checkpoints and financial settlement costs. Packet delivery is local transport evidence, not WAN/browser animation latency. There was no production CPU change in this task, so repeated runs demonstrate reproducibility, not a before/after optimization gain. Three short runs do not establish concurrent capacity.

The separate established retention workload repeats 100 lifecycle games, 500 reconnects, burst rooms 10/25/50 and 100 sockets. Current post-cleanup/GC heap: **29.5 MiB**, versus established pre-fix **375.5 MiB** and established post-fix **29.6 MiB**. Peak RSS: **380.8 MiB**. Its event-loop p99 **2036 ms** includes unpaced bursts/GC and is not representative gameplay latency. Match-owned rooms, players, sync maps, queue entries, timer handles and spectator buffers were cleared. Three bounded per-game payload diagnostics and 370 bounded security idle-cache entries remained. See [retention evidence](evidence/pre-staging-2026-10-08/memory-retention.json).

## Production reachability and remaining risks

Docker's socket entry point runs `apps/socket-server/dist/index.js`, which instantiates the active `@gaming-hub/multiplayer` framework and distributed coordinator. The legacy socket `rooms/RoomManager` is not instantiated by this entry point. Its cleanup changes alone cannot explain a production OOM fix. Active framework room/player/timer/sync cleanup remains intact and was exercised by the retention workload. Legacy GameStateSyncManager still supplies a bounded, membership-guarded sync-rate check; its full legacy state/replay architecture is not the active game engine path.

Remaining production-reachable risks requiring staging observation:

- Full match action history grows until room cleanup; no hard per-match byte budget. Do not trim authoritative recovery/idempotency facts casually.
- Serialized per-room work and pending owner RPCs have cleanup/timeouts but no demonstrated overload admission/backpressure capacity.
- Large Carrom checkpoints and transient clone/hash/serialization buffers consume CPU and memory under concurrent games.
- Network partitions, actual deployed RSS, long-lived rooms and post-match cleanup require extended live soak and failure injection.

No gameplay outcomes were intentionally changed. Complete game-engine/multiplayer tests pass; the profiler executes legal authoritative actions and preserves ordering. Production shot idempotency, recovery and settlement code were not edited.

## Staging blockers

Read-only Render inspection found only the project's **Production** environment. API and socket are on `main`, showing baseline `8564429`; both selected Free plans are **0.1 CPU / 512 MB**. Web is a static service on `main`. The project's Render PostgreSQL is owner-suspended and Redis is in Production; neither was connected. This does not establish which database the deployed application uses. Free services warn of cold starts and cannot provide the requested multi-replica socket verification.

No isolated staging web/API/socket/PostgreSQL/Redis, staging secrets or test payment integrations were verified. A separately reviewable [staging preparation plan](staging-preparation-2026-10-08.md) identifies proposed resources, branches, isolation checks and live smoke/soak gates. Paid-resource creation and deployment need approval. Do not push to auto-deploying production `main`. Live multiplayer, provider timeout/reconciliation, reconnect and resource measurements must pass before **STAGING VERIFIED** can be issued.

## Changed files

Cleanup: `.gitignore`, removed root memory report and two scratch files, relocated historical report and targeted scan evidence. Harness: the single recovery test file above. Verification additions: `scripts/prestaging-api-verification.mjs`, `scripts/multiplayer-paced-profile.ts`, this report, staging preparation, current evidence files and `SECURITY_AUDIT_REPORT.md`. No production wallet/auth/tournament/security/game/socket implementation changed.
