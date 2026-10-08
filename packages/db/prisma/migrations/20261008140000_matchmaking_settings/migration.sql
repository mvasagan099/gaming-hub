-- Existing reservations used untimed/rated defaults; preserve that behavior.
ALTER TABLE "MatchmakingQueue"
  ADD COLUMN "settings" JSONB NOT NULL DEFAULT '{"timeControl":null,"rated":true}',
  ADD COLUMN "settingsKey" TEXT NOT NULL DEFAULT 'untimed:rated';
CREATE INDEX "MatchmakingQueue_settings_pool_idx" ON "MatchmakingQueue"
  ("gameId", "entryFee", "gameMode", "settingsKey", "status", "joinedAt");
