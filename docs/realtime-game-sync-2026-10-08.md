# Table Tennis and Snake vs Worms sync verification

Date: 2026-10-08. Local changes on baseline `4263a9634dd2f9ccc9d6e78c1fb942fa270cf273`. No deployment or production database access.

## Causes and changes

- Snake world speed previously depended on completed checkpoint frequency. The engine now advances by elapsed time using 60 Hz collision/boost substeps, retains fractional time in checkpoints, and caps catch-up to 250 ms per update. Server updates run at 20 Hz instead of about 60 Hz, reducing checkpoint pressure while preserving simulation speed under ordinary delayed updates. Legacy snapshots without fractional time default to zero.
- Commands for a locally owned room now bypass redundant PostgreSQL routing lookup; the owner still asserts its Redis fencing token before processing and publication. Remote routing remains through the existing owner/RPC path.
- Table Tennis/Snake checkpoint commits with unchanged participants avoid a redundant participant query. The atomic PostgreSQL update verifies the stored participants together with owner, fencing token, revision and lease. Membership changes still use the existing participant locks/conflict checks. Results and outbox commits remain durable.
- Table Tennis reconnect discards obsolete in-flight paddle requests. An old acknowledgement cannot unlock a new connection's request. Fresh authoritative state is requested before input resumes.
- Late Table Tennis snapshots cannot rewind paddles, clock or pause state, or resurrect a cleared rally. Prediction remains bounded and cannot invent a hit or score.

## Current verification

| Check | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| Entire game-engine suite | 424 | 0 | 0 |
| Entire web suite | 370 | 0 | 0 |
| Entire multiplayer suite | 360 | 0 | 0 |
| Real Redis/PostgreSQL ownership and result outbox | 9 | 0 | 0 |
| Selected real two-replica restart/recovery cases | 2 | 0 | 28 filtered |

The selected integration cases exercise Table Tennis and Snake vs Worms with real local API/socket servers, owner restart, recovery, rematch and paid-match settlement. The other 28 tests in that file were intentionally filtered; this is not a full API audit. The ownership regression proves unchanged membership commits successfully, forged cached membership fails without advancing revision, and a joining participant reserved by another room is rejected.

Repository build: PASS (existing large frontend chunk warning). Repository typecheck: FAIL due to two unrelated existing Prisma JSON fixture errors in `apps/api/src/routes/__tests__/roomInvitations.test.ts`, lines 17 and 21. These were not modified in this task. See companion JSON for machine-readable totals.

## Limits

These are correctness/regression checks, not measurements of live hosting latency, browser frame rate or production Redis health. Deployment and a two-device live smoke test remain necessary to measure the improvement. Zero network latency cannot be guaranteed. Redis ownership/fencing and PostgreSQL durable checkpoints remain authoritative; no caching of wallet balances or client-side financial settlement was introduced.
