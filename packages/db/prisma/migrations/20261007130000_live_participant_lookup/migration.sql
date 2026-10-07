CREATE INDEX "LiveRoomCheckpoint_active_players_idx" ON "LiveRoomCheckpoint" USING GIN (("snapshot"->'players')) WHERE "closed"=false;
