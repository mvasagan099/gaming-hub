CREATE SEQUENCE "match_owner_fencing_seq" AS BIGINT;
CREATE TABLE "LiveRoomCheckpoint" (
 "id" TEXT PRIMARY KEY, "code" TEXT NOT NULL UNIQUE, "matchId" TEXT UNIQUE,
 "schemaVersion" INTEGER NOT NULL DEFAULT 1, "snapshot" JSONB NOT NULL,
 "revision" INTEGER NOT NULL DEFAULT 0, "ownerId" TEXT, "fencingToken" BIGINT NOT NULL DEFAULT 0,
 "leaseExpiresAt" TIMESTAMP(3), "closed" BOOLEAN NOT NULL DEFAULT false, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "LiveRoomCheckpoint_closed_leaseExpiresAt_idx" ON "LiveRoomCheckpoint" ("closed", "leaseExpiresAt");
CREATE TABLE "GameResultOutbox" (
 "id" TEXT PRIMARY KEY, "matchId" TEXT NOT NULL UNIQUE, "roomId" TEXT NOT NULL, "result" JSONB NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'PENDING', "attempts" INTEGER NOT NULL DEFAULT 0,
 "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "claimedBy" TEXT, "claimExpiresAt" TIMESTAMP(3),
 "deliveredAt" TIMESTAMP(3), "lastError" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "GameResultOutbox_status_nextAttemptAt_claimExpiresAt_idx" ON "GameResultOutbox" ("status", "nextAttemptAt", "claimExpiresAt");
CREATE TABLE "TournamentProvisionJob" (
 "matchId" TEXT PRIMARY KEY, "context" JSONB NOT NULL, "status" TEXT NOT NULL DEFAULT 'PENDING_PROVISION',
 "attempts" INTEGER NOT NULL DEFAULT 0, "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "claimedBy" TEXT, "claimExpiresAt" TIMESTAMP(3), "lastError" TEXT, "readyAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "TournamentProvisionJob_status_nextAttemptAt_claimExpiresAt_idx" ON "TournamentProvisionJob" ("status", "nextAttemptAt", "claimExpiresAt");
