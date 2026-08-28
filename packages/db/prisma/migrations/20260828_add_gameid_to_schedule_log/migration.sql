-- Migration: add gameId to TournamentTierScheduleLog and change unique constraint
-- so the scheduler can create one tournament per (tier, game, hour) instead of
-- one per (tier, hour) — enabling all 10 games per tier = 50 slots per hour.

-- 1. Clear existing schedule log entries (they lack gameId and would violate NOT NULL).
--    This is safe: the log is only an idempotency guard; the Tournament rows themselves
--    are NOT deleted. The scheduler will recreate new log entries on its next run.
DELETE FROM "TournamentTierScheduleLog";

-- 2. Drop the old unique constraint and index
DROP INDEX IF EXISTS "TournamentTierScheduleLog_tierId_slotHour_key";
DROP INDEX IF EXISTS "TournamentTierScheduleLog_tierId_slotHour_idx";

-- 3. Add the new gameId column (NOT NULL after data is cleared above)
ALTER TABLE "TournamentTierScheduleLog"
  ADD COLUMN "gameId" TEXT NOT NULL DEFAULT '';

-- 4. Remove the temporary default now that all rows are gone
ALTER TABLE "TournamentTierScheduleLog"
  ALTER COLUMN "gameId" DROP DEFAULT;

-- 5. Create the new unique constraint and index
CREATE UNIQUE INDEX "TournamentTierScheduleLog_tierId_gameId_slotHour_key"
  ON "TournamentTierScheduleLog"("tierId", "gameId", "slotHour");

CREATE INDEX "TournamentTierScheduleLog_tierId_gameId_slotHour_idx"
  ON "TournamentTierScheduleLog"("tierId", "gameId", "slotHour");
