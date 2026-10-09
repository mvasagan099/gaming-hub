# Gameplay checkpoint performance — 2026-10-09

The supplied production log reports healthy startup and an idle server with zero active rooms; it cannot measure gameplay latency. Inspection found that every canonical frame used an interactive PostgreSQL transaction even when it had unchanged participants and no result. This added BEGIN/COMMIT database round trips to the serialized gameplay queue.

Routine state checkpoints now use one atomic guarded UPDATE. Owner identity, fencing token, expected revision, lease expiry, closed status, and stored membership are still checked by that statement. The coordinator supplies its prior participant roster for every game, so unchanged-membership saves in all nine games can use the same path. Membership changes, closures, and results still use the full transaction; result outbox conflicts roll back the checkpoint.

Verification: 21 real PostgreSQL/Redis checkpoint, ownership, and settlement tests plus 178 gameplay, physics, recovery, and player-exit tests passed. The new tests persist 20 consecutive frames for each of nine games with zero interactive transactions, and verify stale owner/revision/lease rejection, forged roster rejection, participant exclusivity, result conflict rollback, and closed-room release. Workspace type checks and production builds passed. No production wallet, room, or game records were changed during tests.

This removes avoidable database work. Actual end-to-end improvement depends on production database/network latency and the player's device, and requires an active game to measure. No claim of a measured production frame-rate improvement is made from the idle log.
