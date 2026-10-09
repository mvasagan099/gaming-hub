-- Immutable historical records: closing a room never deletes its action journal.
CREATE TABLE "MatchActionArchive" (
  "matchId" TEXT NOT NULL,
  "turnNumber" INTEGER NOT NULL,
  "roomId" TEXT NOT NULL,
  "playerId" TEXT NOT NULL,
  "actionId" TEXT,
  "record" JSONB NOT NULL,
  CONSTRAINT "MatchActionArchive_pkey" PRIMARY KEY ("matchId", "turnNumber"),
  CONSTRAINT "MatchActionArchive_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "LiveRoomCheckpoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "MatchActionArchive_matchId_playerId_actionId_key" ON "MatchActionArchive"("matchId", "playerId", "actionId");
CREATE INDEX "MatchActionArchive_roomId_idx" ON "MatchActionArchive"("roomId");
