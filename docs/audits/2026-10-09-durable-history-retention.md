# Durable multiplayer history retention — 2026-10-09

## Scope and baseline

Work began on clean `main` at `7b066b1`, with explicit approval to implement safe history limits after restoring prerequisites. Unrelated Snake vs Worms and Table Tennis changes were preserved in their separate commits. The final verification base is `43d742f`; companion evidence records source hashes for this history change.

Production socket startup requires fenced distributed ownership, and the entry point disables legacy in-memory replay recording. No wallet, authentication, security-policy, game-engine or frontend gameplay code was changed by this task.

## Safety design

- Successful actions remain in live history until the owner commits their immutable prefix and the compact checkpoint in one PostgreSQL transaction.
- Committed live history is capped at 128 records; crossing that limit archives the prefix and keeps 64. One in-flight transition can temporarily hold 129. This is a record-count limit, not a byte/RSS ceiling.
- A new `MatchActionArchive` stores original facts, keyed by match/turn and uniquely by match/player/action ID. Its restrictive room foreign key preserves historical records when a room closes.
- Archive inserts that encounter existing keys must prove exact JSONB equality and matching identity in PostgreSQL. Different records, missing records or identity conflicts roll back checkpoint advancement. PostgreSQL-side comparison avoids Prisma floating-point decoding changes.
- Older duplicate requests consult the exact archive after live history/cache eviction, with room, match and authenticated player scope. Archive-read failure and missing lookup configuration fail closed before engine mutation.
- A fixed 8 KiB negative filter avoids routine DB lookups for proven-new IDs. It never authorizes a retry: every possible match still needs an exact DB receipt. Filter and archive cursor commit with the checkpoint. Legacy pruned checkpoints without a filter retain DB fallback; suffix-only filters are forbidden.
- Reconnect restores the canonical engine, sequence counters, history cursor and filter. Trimming occurs only after commit; the owner's existing rollback/recovery and publication ordering remain intact.
- Distributed recovery retains one verification snapshot. Non-distributed development retains at most 32 snapshots; its unarchived action history is intentionally preserved for safe local duplicate handling. Legacy replay-enabled SDK use is outside the production entry point and is not newly bounded by this change.
- Terminal commits persist every remaining action with the canonical result outbox, even if optional replay-document materialization fails. Complete historical documents are assembled in PostgreSQL. The socket hashes at most 64 archived records per read, using exact JSON text instead of Prisma JSON-number decoding, then its bounded live tail.
- Game outcomes, shot event payloads/animations, engine history, funding, settlement and outbox protections remain unchanged.

## Current checks

| Check | Files | Passed | Failed | Skipped |
|---|---:|---:|---:|---:|
| Complete multiplayer | 32 | 442 | 0 | 0 |
| Complete web | 46 | 404 | 0 | 0 |
| Complete game engine | 29 | 444 | 0 | 0 |
| Selected API recovery/financial/security batch | 10 | 130 | 0 | 0 |
| Final archive/checkpoint retest | 2 | 15 | 0 | 0 |

The selected API batch includes 37 distributed recovery, 49 financial/IDOR/economy, 29 socket-security, 12 checkpoint-performance and 3 archive tests. Final exact-text hashing and real-shot archival were reverified in the subsequent 15-test focused run; these tests overlap the batch and must not be added to its total. This is not the entire API suite.

Typecheck: **PASS**, all nine workspaces on final source. Complete production build: **PASS**. Existing frontend chunks-over-500-kB warning remains a loading-performance concern.

Fresh disposable PostgreSQL migration chain: **13/13 applied**. Schema diff against Prisma: **No difference detected**. Only `127.0.0.1:5540/gaming_history_20261009_test` was used for API fixture/migration work, with isolated local Redis and dummy external providers. No production/staging data or migrations were accessed. No push or deployment occurred.

### New regression coverage

Nine unit tests cover planning without mutation, bounded snapshots, durable scoped retries, storage/configuration failure, fixed-size filtering of 10,000 identities, legacy fallback, negative-filter fast paths, positive-filter receipt requirements and malformed filters. Three PostgreSQL/Redis integration tests cover:

1. 310 legal Carrom placements with bounded live history, cache eviction, old-ID replay with a forged newer sequence, owner takeover, restored packet sequencing, a real shot trajectory and resignation. All 312 actions remain archived, chronological and checksummed from original finalization facts; one result outbox exists.
2. Uniqueness failure rolls back both archival and checkpoint advancement.
3. Terminal facts survive independently of optional replay materialization; exact repeated archives are idempotent, and conflicting record changes fail without advancing revision.

## Memory evidence and limits

The existing local cleanup exercise ran 100 game lifecycles, bursts of 10/25/50 rooms with up to 100 Socket.IO connections, and 500 reconnect cycles. At the final sample there were zero active rooms, sockets, adapter rooms, room timers and live player/sync records. The existing bounded idle security-profile cache retained 370 recent entries; this is not a claim that every process-wide map is empty.

Current baseline heap/RSS: **24.34 / 132.96 MiB**. Final heap/RSS: **29.87 / 379.91 MiB**. Peak heap/RSS: **167.39 / 379.91 MiB**. The established October 8 pre-staging harness ended at **29.46 MiB heap / 380.84 MiB RSS**. Current cleanup is broadly similar; differing game changes and execution conditions prevent attributing small differences to this patch.

This exercise uses synthetic bursts and forced GC. Its event-loop/CPU figures include GC effects and are not paced gameplay capacity evidence. Its short matches do not cross the new history limit; the separate real PostgreSQL/Redis long-action test covers that limit, retries and recovery. A live Render OOM fix is **not proven**.

## Remaining release risks and rollout

- Apply migration `20261009150000_match_action_archive` to an approved isolated staging DB before starting upgraded sockets. Old and new owners must not mix while pruned checkpoints are active: pause/drain admission and replace all socket replicas in a controlled rollout. No deployment is authorized by this verification.
- Archive storage requires an explicit retention/backup policy. No historical records are automatically deleted.
- Large per-action payloads, engine-internal histories, legacy checkpoint backfill and other managers still require byte-level/soak review. Record-count limits alone do not set a memory capacity.
- The negative filter can saturate on very long/high-input matches; measure positive rates, DB-read latency, archival batch costs, event-loop delay and RSS under a realistic staging soak.
- Legacy `verifyReplay()` compares snapshots with time-varying serialization and can report a false Carrom mismatch; it has no production call sites. This pre-existing helper concern was not changed or used to claim integrity. Tests verify retained board facts and exact archived finalization facts directly.
- Full API aggregation/release gates and deployed staging performance remain outstanding. Optional replay materialization remains best effort, but complete action records and the result are now durable before it runs.

**History-retention change: VERIFIED LOCALLY. Overall verdict: NOT PRODUCTION READY.**
