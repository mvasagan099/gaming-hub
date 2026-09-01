import crypto from "node:crypto";
import { prisma } from "@gaming-hub/db";
import { AppError } from "@gaming-hub/shared";
import type { TournamentResultSnapshotData } from "@gaming-hub/shared";

export interface VerifyMatchResultParams {
  tournamentId: string;
  roundId: string;
  matchId: string;
  winnerId: string;
  loserId?: string;
  scores?: Record<string, number>;
  resultReason?: string;
}

export interface VerificationResult {
  isVerified: boolean;
  reviewStatus: "VERIFIED" | "RESULT_REVIEW_REQUIRED" | "OVERRIDDEN";
  integrityHash: string;
  snapshot: TournamentResultSnapshotData;
}

/**
 * Validates a tournament match result against server authoritative state,
 * generates a tamper-evident SHA-256 integrity hash, and saves an immutable Result Snapshot.
 */
export async function verifyAndSnapshotTournamentMatchResult(
  params: VerifyMatchResultParams,
): Promise<VerificationResult> {
  const { tournamentId, roundId, matchId, winnerId, scores, resultReason = "NORMAL" } = params;

  // 1. Verify tournament exists
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { id: true, title: true, status: true, stateVersion: true },
  });
  if (!tournament) {
    throw new AppError("NOT_FOUND", `Tournament ${tournamentId} not found`, 404);
  }

  // 2. Verify round slot exists and belongs to tournament
  const slot = await prisma.tournamentRound.findUnique({
    where: { id: roundId },
  });
  if (!slot) {
    throw new AppError("NOT_FOUND", `Tournament round slot ${roundId} not found`, 404);
  }
  if (slot.tournamentId !== tournamentId) {
    throw new AppError("INVALID_ACTION", "Round slot does not belong to specified tournament", 400);
  }
  if (slot.matchId && slot.matchId !== matchId) {
    throw new AppError("INVALID_ACTION", `Match ${matchId} does not match assigned slot match ${slot.matchId}`, 400);
  }

  // 3. Verify both players in slot
  const playerAId = slot.playerAId;
  const playerBId = slot.playerBId;

  if (!playerAId || !playerBId) {
    throw new AppError("INVALID_ACTION", "Both players must be assigned to round slot to verify result", 400);
  }

  // 4. Verify winner is one of the participants
  if (winnerId !== playerAId && winnerId !== playerBId) {
    throw new AppError("INVALID_ACTION", `Winner ${winnerId} is not a participant in round slot (${playerAId} vs ${playerBId})`, 400);
  }

  const loserId = params.loserId ?? (winnerId === playerAId ? playerBId : playerAId);

  // 5. Verify valid result reason
  const validReasons = ["NORMAL", "TIME_LIMIT", "TIMEOUT", "FORFEIT", "ABANDONED", "ADMIN_OVERRIDE"];
  if (resultReason && !validReasons.includes(resultReason.toUpperCase())) {
    throw new AppError("INVALID_ACTION", `Invalid match result reason: ${resultReason}`, 400);
  }

  // 6. Authoritative Match Record check (if exists in DB)
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      moves: { select: { id: true, turnNumber: true, appliedAt: true } },
    },
  });

  const winnerScore = scores?.[winnerId] ?? 0;
  const loserScore = scores?.[loserId] ?? 0;

  // Validate non-negative scores
  if (winnerScore < 0 || loserScore < 0) {
    throw new AppError("INVALID_ACTION", "Match scores cannot be negative numbers", 400);
  }

  const playerAScore = slot.playerAId === winnerId ? winnerScore : loserScore;
  const playerBScore = slot.playerBId === winnerId ? winnerScore : loserScore;

  // 7. Consistency validation:
  // If result is NORMAL and both scores are non-zero, winner's score must not be strictly less than loser's score
  let reviewStatus: "VERIFIED" | "RESULT_REVIEW_REQUIRED" | "OVERRIDDEN" = "VERIFIED";
  let isVerified = true;

  if (resultReason === "NORMAL" && winnerScore < loserScore && winnerScore !== 0) {
    // Inconsistent score vs winner declared without forfeit or timeout
    reviewStatus = "RESULT_REVIEW_REQUIRED";
    isVerified = false;
  }

  // Compute duration
  let durationSeconds = 0;
  let startedAt = slot.scheduledAt ?? new Date();
  let endedAt = new Date();
  let eventsCount = 0;

  if (match) {
    if (match.startedAt) startedAt = match.startedAt;
    if (match.endedAt) endedAt = match.endedAt;
    if (match.startedAt && match.endedAt) {
      durationSeconds = Math.max(0, Math.floor((match.endedAt.getTime() - match.startedAt.getTime()) / 1000));
    }
    eventsCount = match.moves.length;
  }

  // 7. Server-Authoritative SHA-256 Integrity Hash
  const hashPayload = [
    `tournament:${tournamentId}`,
    `round:${slot.roundNumber}`,
    `match:${slot.matchNumber}`,
    `matchId:${matchId}`,
    `playerA:${playerAId}`,
    `playerB:${playerBId}`,
    `winner:${winnerId}`,
    `loser:${loserId}`,
    `scoreA:${playerAScore}`,
    `scoreB:${playerBScore}`,
    `reason:${resultReason}`,
    `events:${eventsCount}`,
    `duration:${durationSeconds}`,
    `version:${tournament.stateVersion}`,
  ].join("|");

  const integrityHash = crypto.createHash("sha256").update(hashPayload).digest("hex");

  // 8. Upsert Immutable Result Snapshot in DB
  const snapshotRecord = await prisma.tournamentResultSnapshot.upsert({
    where: { matchId },
    create: {
      matchId,
      tournamentId,
      roundNumber: slot.roundNumber,
      matchNumber: slot.matchNumber,
      playerAId,
      playerBId,
      winnerId,
      loserId,
      playerAScore,
      playerBScore,
      resultReason,
      integrityHash,
      eventsCount,
      startedAt,
      endedAt,
      durationSeconds,
      stateVersion: tournament.stateVersion,
      isVerified,
      reviewStatus,
    },
    update: {
      winnerId,
      loserId,
      playerAScore,
      playerBScore,
      resultReason,
      integrityHash,
      eventsCount,
      durationSeconds,
      stateVersion: tournament.stateVersion,
      isVerified,
      reviewStatus,
      endedAt,
    },
  });

  const snapshot: TournamentResultSnapshotData = {
    id: snapshotRecord.id,
    matchId: snapshotRecord.matchId,
    tournamentId: snapshotRecord.tournamentId,
    roundNumber: snapshotRecord.roundNumber,
    matchNumber: snapshotRecord.matchNumber,
    playerAId: snapshotRecord.playerAId,
    playerBId: snapshotRecord.playerBId,
    winnerId: snapshotRecord.winnerId,
    loserId: snapshotRecord.loserId,
    playerAScore: snapshotRecord.playerAScore,
    playerBScore: snapshotRecord.playerBScore,
    resultReason: snapshotRecord.resultReason,
    integrityHash: snapshotRecord.integrityHash,
    eventsCount: snapshotRecord.eventsCount,
    startedAt: snapshotRecord.startedAt ? snapshotRecord.startedAt.toISOString() : null,
    endedAt: snapshotRecord.endedAt ? snapshotRecord.endedAt.toISOString() : null,
    durationSeconds: snapshotRecord.durationSeconds,
    stateVersion: snapshotRecord.stateVersion,
    isVerified: snapshotRecord.isVerified,
    reviewStatus: snapshotRecord.reviewStatus as "VERIFIED" | "RESULT_REVIEW_REQUIRED" | "OVERRIDDEN",
    createdAt: snapshotRecord.createdAt.toISOString(),
  };

  if (!isVerified) {
    throw new AppError(
      "RESULT_REVIEW_REQUIRED",
      `Match ${matchId} result is inconsistent with authoritative score records. Result snapshot saved for review.`,
      422,
    );
  }

  return {
    isVerified,
    reviewStatus,
    integrityHash,
    snapshot,
  };
}

/**
 * Get snapshot by matchId
 */
export async function getTournamentResultSnapshot(matchId: string): Promise<TournamentResultSnapshotData | null> {
  const snapshotRecord = await prisma.tournamentResultSnapshot.findUnique({
    where: { matchId },
  });
  if (!snapshotRecord) return null;

  return {
    id: snapshotRecord.id,
    matchId: snapshotRecord.matchId,
    tournamentId: snapshotRecord.tournamentId,
    roundNumber: snapshotRecord.roundNumber,
    matchNumber: snapshotRecord.matchNumber,
    playerAId: snapshotRecord.playerAId,
    playerBId: snapshotRecord.playerBId,
    winnerId: snapshotRecord.winnerId,
    loserId: snapshotRecord.loserId,
    playerAScore: snapshotRecord.playerAScore,
    playerBScore: snapshotRecord.playerBScore,
    resultReason: snapshotRecord.resultReason,
    integrityHash: snapshotRecord.integrityHash,
    eventsCount: snapshotRecord.eventsCount,
    startedAt: snapshotRecord.startedAt ? snapshotRecord.startedAt.toISOString() : null,
    endedAt: snapshotRecord.endedAt ? snapshotRecord.endedAt.toISOString() : null,
    durationSeconds: snapshotRecord.durationSeconds,
    stateVersion: snapshotRecord.stateVersion,
    isVerified: snapshotRecord.isVerified,
    reviewStatus: snapshotRecord.reviewStatus as "VERIFIED" | "RESULT_REVIEW_REQUIRED" | "OVERRIDDEN",
    createdAt: snapshotRecord.createdAt.toISOString(),
  };
}
