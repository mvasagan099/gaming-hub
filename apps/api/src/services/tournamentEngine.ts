import { prisma } from "@gaming-hub/db";
import type { Prisma } from "@gaming-hub/db";
import { AppError } from "@gaming-hub/shared";
import type {
  TournamentStatus,
  TournamentFormat,
  PrizeDistributionEntry,
} from "@gaming-hub/shared";
import {
  canTransitionTournamentStatus,
  generateFirstRoundSlots,
  generateFullBracketStructure,
  computeTotalRounds,
  nextPowerOfTwo,
  calculatePrizes,
  defaultPrizeDistribution,
  isSupportedTournamentFormat,
} from "@gaming-hub/shared";
export { generateFullBracketStructure };
import { applyTransaction } from "./wallet";
import { WalletTransactionService } from "./walletTransactionService";
import { IdempotencyService } from "./idempotencyService";
import { audit } from "./audit";
import { TournamentMatchService } from "./tournamentMatchService";
import { TournamentNotificationService } from "./tournamentNotificationService";
import { verifyAndSnapshotTournamentMatchResult } from "./tournamentResultVerification";

// ---------------------------------------------------------------------------
// State machine transition (with DB update)
// ---------------------------------------------------------------------------

export async function transitionTournamentStatus(
  tournamentId: string,
  newStatus: TournamentStatus,
  updatedBy: string | null = null,
): Promise<void> {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { status: true, title: true },
  });
  if (!tournament) throw new AppError("NOT_FOUND", "Tournament not found", 404);

  const current = tournament.status as TournamentStatus;
  if (!canTransitionTournamentStatus(current, newStatus)) {
    throw new AppError(
      "INVALID_ACTION",
      `Cannot transition tournament from ${current} to ${newStatus}`,
      409,
    );
  }

  await prisma.tournament.update({
    where: { id: tournamentId },
    data: {
      status: newStatus,
      stateVersion: { increment: 1 },
    },
  });

  audit({
    actorType: "user",
    actorId: updatedBy,
    action: "tournament.status.changed",
    category: "game",
    targetType: "tournament",
    targetId: tournamentId,
    meta: { from: current, to: newStatus },
  });
}

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

export async function seedPlayers(tournamentId: string): Promise<string[]> {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { seedMethod: true },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;

  const seedMethod = (tournament?.seedMethod ?? "RANDOM").toUpperCase();

  const players = await prisma.tournamentPlayer.findMany({
    where: { tournamentId },
    include: {
      user: {
        include: {
          competitiveRanks: {
            orderBy: { updatedAt: "desc" },
            take: 1,
          },
        },
      },
    },
  });

  let seeded: typeof players;

  if (seedMethod === "RATING" || seedMethod === "RATING_BASED") {
    seeded = players.sort((a, b) => {
      const ratingA = a.user.competitiveRanks[0]?.rating ?? 1000;
      const ratingB = b.user.competitiveRanks[0]?.rating ?? 1000;
      if (ratingB !== ratingA) return ratingB - ratingA; // descending
      return a.registeredAt.getTime() - b.registeredAt.getTime(); // tiebreak by registration time
    });
  } else if (seedMethod === "ADMIN_DEFINED" || seedMethod === "MANUAL" || seedMethod === "REGISTRATION_ORDER") {
    // If manual seeds exist use them, otherwise default to deterministic registration order
    const hasManualSeeds = players.some((p) => p.seed !== null);
    if (hasManualSeeds) {
      seeded = players.sort((a, b) => {
        const seedA = a.seed ?? Number.MAX_SAFE_INTEGER;
        const seedB = b.seed ?? Number.MAX_SAFE_INTEGER;
        if (seedA !== seedB) return seedA - seedB;
        return a.registeredAt.getTime() - b.registeredAt.getTime();
      });
    } else {
      seeded = players.sort((a, b) => a.registeredAt.getTime() - b.registeredAt.getTime());
    }
  } else {
    // RANDOM — Fisher-Yates shuffle
    seeded = [...players];
    for (let i = seeded.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [seeded[i], seeded[j]] = [seeded[j], seeded[i]];
    }
  }

  // Assign seeds atomically
  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < seeded.length; i++) {
      await tx.tournamentPlayer.update({
        where: { id: seeded[i].id },
        data: { seed: i + 1 },
      });
    }
  });

  return seeded.map((p) => p.userId);
}

export async function assignManualSeeds(
  tournamentId: string,
  assignments: { userId: string; seed: number }[],
  adminId: string | null = null,
): Promise<void> {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { players: true },
  });
  if (!tournament) throw new AppError("NOT_FOUND", "Tournament not found", 404);

  const acceptableStatuses = ["DRAFT", "REGISTRATION_OPEN", "REGISTRATION_CLOSED"];
  if (!acceptableStatuses.includes(tournament.status)) {
    throw new AppError("INVALID_ACTION", "Cannot modify seeds after tournament starts", 400);
  }

  const playerUserIds = new Set(tournament.players.map((p) => p.userId));
  const seenSeeds = new Set<number>();

  for (const a of assignments) {
    if (!playerUserIds.has(a.userId)) {
      throw new AppError("INVALID_ACTION", `User ${a.userId} is not registered in this tournament`, 400);
    }
    if (a.seed < 1 || a.seed > tournament.players.length) {
      throw new AppError("INVALID_ACTION", `Invalid seed ${a.seed}. Must be between 1 and ${tournament.players.length}`, 400);
    }
    if (seenSeeds.has(a.seed)) {
      throw new AppError("INVALID_ACTION", `Duplicate seed ${a.seed} assigned`, 400);
    }
    seenSeeds.add(a.seed);
  }

  await prisma.$transaction(async (tx) => {
    for (const a of assignments) {
      await tx.tournamentPlayer.update({
        where: { tournamentId_userId: { tournamentId, userId: a.userId } },
        data: { seed: a.seed },
      });
    }
    await tx.tournament.update({
      where: { id: tournamentId },
      data: { seedMethod: "ADMIN_DEFINED" as any },
    });
  });

  audit({
    actorType: "user",
    actorId: adminId,
    action: "tournament.manual_seeds_assigned",
    category: "game",
    targetType: "tournament",
    targetId: tournamentId,
    meta: { assignmentsCount: assignments.length },
  });
}

// ---------------------------------------------------------------------------
// Bracket generation
// ---------------------------------------------------------------------------

export async function buildSingleEliminationBracket(tournamentId: string): Promise<void> {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { players: true },
  });
  if (!tournament) throw new AppError("NOT_FOUND", "Tournament not found", 404);

  const playerCount = tournament.players.length;
  if (playerCount < 2) {
    throw new AppError("INVALID_ACTION", "Not enough players to build bracket", 400);
  }

  // Clear any existing rounds
  await prisma.tournamentRound.deleteMany({ where: { tournamentId } });

  const seededIds = await seedPlayers(tournamentId);
  const bracketStructure = generateFullBracketStructure(seededIds);

  // Insert all rounds and slots
  await prisma.$transaction(async (tx) => {
    const createdSlots: { roundNumber: number; matchNumber: number; id: string }[] = [];

    for (const round of bracketStructure) {
      for (const slot of round.slots) {
        const status = slot.isBye ? "BYE" : slot.playerAId && slot.playerBId ? "READY" : "PENDING";
        const created = await tx.tournamentRound.create({
          data: {
            tournamentId,
            roundNumber: round.roundNumber,
            matchNumber: slot.matchNumber,
            playerAId: slot.playerAId,
            playerBId: slot.playerBId,
            isBye: slot.isBye,
            status,
          },
          select: { id: true },
        });
        createdSlots.push({ roundNumber: round.roundNumber, matchNumber: slot.matchNumber, id: created.id });
      }
    }

    // Wire up nextSlotId references
    for (const round of bracketStructure) {
      for (const slot of round.slots) {
        if (slot.nextSlotMatchNumber === null) continue;
        const thisSlot = createdSlots.find(
          (s) => s.roundNumber === round.roundNumber && s.matchNumber === slot.matchNumber,
        );
        const nextSlot = createdSlots.find(
          (s) => s.roundNumber === round.roundNumber + 1 && s.matchNumber === slot.nextSlotMatchNumber,
        );
        if (thisSlot && nextSlot) {
          await tx.tournamentRound.update({
            where: { id: thisSlot.id },
            data: { nextSlotId: nextSlot.id },
          });
        }
      }
    }

    // Increment stateVersion
    await tx.tournament.update({
      where: { id: tournamentId },
      data: { stateVersion: { increment: 1 } },
    });
  });

  // Auto-advance BYE slots
  await processAllByeSlots(tournamentId);
}

// ---------------------------------------------------------------------------
// BYE slot auto-advancement
// ---------------------------------------------------------------------------

export async function processAllByeSlots(tournamentId: string): Promise<void> {
  const byeSlots = await prisma.tournamentRound.findMany({
    where: { tournamentId, isBye: true, status: "BYE" },
  });

  if (byeSlots.length === 0) return;

  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { title: true },
  });
  const totalRoundsAgg = await prisma.tournamentRound.aggregate({
    where: { tournamentId },
    _max: { roundNumber: true },
  });
  const totalRounds = totalRoundsAgg._max.roundNumber ?? 1;

  for (const slot of byeSlots) {
    if (slot.playerAId && slot.nextSlotId) {
      await TournamentNotificationService.notifyBye({
        tournamentId,
        tournamentTitle: tournament?.title ?? "Tournament",
        roundNumber: slot.roundNumber,
        totalRounds,
        playerId: slot.playerAId,
        nextSlotId: slot.nextSlotId,
      });
      await advanceToNextSlot(tournamentId, slot.id, slot.playerAId);
    }
  }
}

// ---------------------------------------------------------------------------
// Tournament Match creation
// ---------------------------------------------------------------------------

export async function createTournamentMatch(roundId: string): Promise<string> {
  const slot = await prisma.tournamentRound.findUnique({
    where: { id: roundId },
    include: { tournament: true },
  });
  if (!slot) throw new AppError("NOT_FOUND", "Tournament round slot not found", 404);
  if (!slot.playerAId || !slot.playerBId) {
    throw new AppError("INVALID_ACTION", "Slot is not ready for a match", 400);
  }
  if (slot.matchId) {
    // Already created — idempotent
    return slot.matchId;
  }

  const match = await prisma.$transaction(async (tx) => {
    const m = await tx.match.create({
      data: {
        gameId: slot.tournament.gameId,
        status: "CREATED",
        stake: 0, // Tournament matches have 0 stake — prize handled separately
        players: {
          create: [
            { userId: slot.playerAId!, seat: 0 },
            { userId: slot.playerBId!, seat: 1 },
          ],
        },
      },
    });

    await tx.tournamentRound.update({
      where: { id: roundId },
      data: { matchId: m.id, status: "IN_PROGRESS" },
    });

    return m;
  });

  return match.id;
}

// ---------------------------------------------------------------------------
// Process match result (called from internal route — idempotent)
// ---------------------------------------------------------------------------

export interface ProcessMatchResultParams {
  matchId: string;
  tournamentId: string;
  roundId: string;
  winnerId: string;
  loserId?: string;
  scores?: Record<string, number>;
}

export async function processMatchResult(params: ProcessMatchResultParams): Promise<void> {
  const { matchId, tournamentId, roundId, winnerId, scores } = params;

  // Idempotency check
  const existing = await prisma.tournamentResultIdempotency.findUnique({
    where: { matchId },
  });
  if (existing) return;

  const slot = await prisma.tournamentRound.findUnique({ where: { id: roundId } });
  if (!slot) throw new AppError("NOT_FOUND", "Tournament round slot not found", 404);
  if (slot.tournamentId !== tournamentId) {
    throw new AppError("INVALID_ACTION", "Round does not belong to this tournament", 400);
  }

  const loserId = params.loserId ?? (slot.playerAId === winnerId ? slot.playerBId : slot.playerAId);

  // Authoritative Result Verification & Immutable Snapshot
  await verifyAndSnapshotTournamentMatchResult({
    tournamentId,
    roundId,
    matchId,
    winnerId,
    loserId: loserId ?? undefined,
    scores,
  });

  const winnerScore = scores?.[winnerId] ?? 0;
  const loserScore = scores?.[loserId ?? ""] ?? 0;
  const playerAScore = slot.playerAId === winnerId ? winnerScore : loserScore;
  const playerBScore = slot.playerBId === winnerId ? winnerScore : loserScore;

  await prisma.$transaction(async (tx) => {
    // Record idempotency
    await tx.tournamentResultIdempotency.create({
      data: { matchId, tournamentId, roundId, winnerId },
    });

    // Update round slot
    await tx.tournamentRound.update({
      where: { id: roundId },
      data: {
        winnerId,
        playerAScore,
        playerBScore,
        status: "COMPLETED",
        completedAt: new Date(),
      },
    });

    // Mark loser as eliminated
    if (loserId) {
      await tx.tournamentPlayer.updateMany({
        where: { tournamentId, userId: loserId },
        data: { eliminated: true, eliminatedInRound: slot.roundNumber },
      });
    }

    // Increment tournament stateVersion
    await tx.tournament.update({
      where: { id: tournamentId },
      data: { stateVersion: { increment: 1 } },
    });
  });

  // Update tournament player live statistics & dynamic leaderboard standings
  const { TournamentLeaderboardService } = await import("./tournamentLeaderboardService");
  await TournamentLeaderboardService.updateOnMatchComplete({
    tournamentId,
    matchId,
    roundId,
    roundNumber: slot.roundNumber,
    winnerId,
    loserId,
    winnerScore,
    loserScore,
  }).catch((err) => {
    console.error(`[LEADERBOARD_UPDATE_FAILED] Tournament ${tournamentId} match ${matchId}:`, err);
  });

  // Fetch tournament info for notifications
  const tournamentInfo = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { title: true },
  });
  const totalRoundsAgg = await prisma.tournamentRound.aggregate({
    where: { tournamentId },
    _max: { roundNumber: true },
  });
  const totalRounds = totalRoundsAgg._max.roundNumber ?? 1;

  // Notify loser of elimination
  if (loserId) {
    const rankEstimate = totalRounds - slot.roundNumber + 2;
    await TournamentNotificationService.notifyEliminated({
      tournamentId,
      tournamentTitle: tournamentInfo?.title ?? "Tournament",
      loserId,
      roundNumber: slot.roundNumber,
      totalRounds,
      finalRank: rankEstimate,
      matchId,
    });
  }

  // Advance winner to next slot
  if (slot.nextSlotId) {
    await advanceToNextSlot(tournamentId, roundId, winnerId);
    const nextSlot = await prisma.tournamentRound.findUnique({
      where: { id: slot.nextSlotId },
      select: { roundNumber: true },
    });
    await TournamentNotificationService.notifyAdvanced({
      tournamentId,
      tournamentTitle: tournamentInfo?.title ?? "Tournament",
      winnerId,
      roundNumber: slot.roundNumber,
      totalRounds,
      nextRoundNumber: nextSlot?.roundNumber ?? null,
      nextSlotId: slot.nextSlotId,
      matchId,
    });
  }

  // Check if this round is complete and generate the next round if needed
  await checkRoundAndAdvance(tournamentId, slot.roundNumber);
}

// ---------------------------------------------------------------------------
// Advance winner to the next bracket slot
// ---------------------------------------------------------------------------

export async function advanceToNextSlot(
  tournamentId: string,
  completedRoundId: string,
  winnerId: string,
): Promise<void> {
  const completedSlot = await prisma.tournamentRound.findUnique({
    where: { id: completedRoundId },
  });
  if (!completedSlot?.nextSlotId) return;

  const nextSlot = await prisma.tournamentRound.findUnique({
    where: { id: completedSlot.nextSlotId },
  });
  if (!nextSlot) return;

  // Determine which seat to fill (A or B)
  // Even matchNumber feeds into playerA slot; odd into playerB
  const fillA = nextSlot.playerAId === null;
  const fillB = !fillA && nextSlot.playerBId === null;

  if (!fillA && !fillB) return; // Both already filled

  const newStatus =
    (fillA && nextSlot.playerBId !== null) || (fillB && nextSlot.playerAId !== null)
      ? "READY"
      : "PENDING";

  await prisma.tournamentRound.update({
    where: { id: nextSlot.id },
    data: {
      ...(fillA ? { playerAId: winnerId } : { playerBId: winnerId }),
      status: newStatus,
    },
  });

  // If the next slot is now READY, create the match immediately
  if (newStatus === "READY") {
    await TournamentMatchService.advanceAndCreateNextMatch(tournamentId, winnerId, completedRoundId);
  }
}

// ---------------------------------------------------------------------------
// Check if round is complete, advance tournament
// ---------------------------------------------------------------------------

export async function checkRoundAndAdvance(tournamentId: string, roundNumber: number): Promise<void> {
  const slots = await prisma.tournamentRound.findMany({
    where: { tournamentId, roundNumber },
  });

  const totalRounds = await prisma.tournamentRound.aggregate({
    where: { tournamentId },
    _max: { roundNumber: true },
  });

  const maxRound = totalRounds._max.roundNumber ?? 1;
  const allDone = slots.every((s) => s.status === "COMPLETED" || s.status === "BYE" || s.status === "CANCELLED");

  if (!allDone) return;

  if (roundNumber >= maxRound) {
    // Final round complete → tournament completed
    await finalizeTournament(tournamentId);
  }
  // Otherwise next round slots are already populated via advanceToNextSlot
}

// ---------------------------------------------------------------------------
// Finalize tournament after last round completes
// ---------------------------------------------------------------------------

export async function finalizeTournament(tournamentId: string): Promise<void> {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { players: true },
  });
  if (!tournament) return;
  const currentStatus = tournament.status as TournamentStatus;

  // Find the final round winner
  const maxRound = await prisma.tournamentRound.aggregate({
    where: { tournamentId },
    _max: { roundNumber: true },
  });
  const finalRound = maxRound._max.roundNumber;
  if (finalRound === null) return;

  const finalSlots = await prisma.tournamentRound.findMany({
    where: { tournamentId, roundNumber: finalRound },
  });

  // Final Match Protection: If any final round match is under active dispute or review, halt finalization
  const finalMatchIds = finalSlots.map((s) => s.matchId).filter(Boolean) as string[];
  if (finalMatchIds.length > 0) {
    const activeDispute = await prisma.tournamentDispute.findFirst({
      where: {
        matchId: { in: finalMatchIds },
        status: { in: ["OPEN", "UNDER_REVIEW"] },
      },
    });
    if (activeDispute) {
      console.warn(`[FINALIZE_TOURNAMENT_PAUSED] Tournament ${tournamentId} final match is under active dispute review (${activeDispute.disputeId}).`);
      return;
    }

    const underReviewSnapshot = await prisma.tournamentResultSnapshot.findFirst({
      where: {
        matchId: { in: finalMatchIds },
        reviewStatus: "RESULT_REVIEW_REQUIRED",
      },
    });
    if (underReviewSnapshot) {
      console.warn(`[FINALIZE_TOURNAMENT_PAUSED] Tournament ${tournamentId} final match result snapshot requires review.`);
      return;
    }
  }

  // Get final winner
  const champion = finalSlots.find((s) => s.winnerId !== null)?.winnerId ?? null;

  if (champion) {
    await prisma.tournamentPlayer.updateMany({
      where: { tournamentId, userId: champion },
      data: { finalRank: 1 },
    });

    // Set runner-up to rank 2
    const finalSlot = finalSlots.find((s) => s.winnerId !== null);
    if (finalSlot) {
      const runnerUpId = finalSlot.playerAId === champion ? finalSlot.playerBId : finalSlot.playerAId;
      if (runnerUpId) {
        await prisma.tournamentPlayer.updateMany({
          where: { tournamentId, userId: runnerUpId },
          data: { finalRank: 2 },
        });
        await TournamentNotificationService.notifyFinalRoundComplete({
          tournamentId,
          tournamentTitle: tournament.title,
          winnerId: champion,
          loserId: runnerUpId,
          matchId: finalSlot.matchId ?? "",
        });
      }
    }

    // Notify champion
    await TournamentNotificationService.notifyWinner({
      tournamentId,
      tournamentTitle: tournament.title,
      winnerId: champion,
    });
  }

  // Notify all non-champion participants that tournament completed
  await TournamentNotificationService.notifyCompleted({
    tournamentId,
    tournamentTitle: tournament.title,
  });

  // Freeze authoritative tournament leaderboard standings
  const { TournamentLeaderboardService } = await import("./tournamentLeaderboardService");
  await TournamentLeaderboardService.freezeFinalStandings(tournamentId).catch((err) => {
    console.error(`[FREEZE_LEADERBOARD_FAILED] Tournament ${tournamentId}:`, err);
  });

  // Transition to COMPLETED
  const latestTournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { status: true },
  });
  const latestStatus = (latestTournament?.status ?? currentStatus) as TournamentStatus;

  if (
    latestStatus !== "COMPLETED" &&
    latestStatus !== "SETTLING" &&
    latestStatus !== "SETTLED" &&
    canTransitionTournamentStatus(latestStatus, "COMPLETED")
  ) {
    await transitionTournamentStatus(tournamentId, "COMPLETED", null);
  }

  // Auto-settle
  await settleTournament(tournamentId);
}

// ---------------------------------------------------------------------------
// Prize settlement
// ---------------------------------------------------------------------------

export async function settleTournament(tournamentId: string, adminId?: string): Promise<void> {
  const { TournamentSettlementService } = await import("./tournamentSettlementService");
  await TournamentSettlementService.settleTournamentPrizes(tournamentId, { adminId });
}

// ---------------------------------------------------------------------------
// Cancel tournament with refunds
// ---------------------------------------------------------------------------

export async function cancelTournamentWithRefunds(
  tournamentId: string,
  reason = "MINIMUM_PLAYERS_NOT_REACHED",
  cancelledBy: string | null = null,
): Promise<void> {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      players: true,
      rounds: { where: { status: "IN_PROGRESS" } },
      _count: { select: { players: true } },
    },
  });
  if (!tournament) throw new AppError("NOT_FOUND", "Tournament not found", 404);

  const currentStatus = tournament.status as TournamentStatus;
  if (currentStatus === "CANCELLED") {
    return;
  }
  if (!canTransitionTournamentStatus(currentStatus, "CANCELLED")) {
    throw new AppError(
      "INVALID_ACTION",
      `Cannot cancel tournament in status ${currentStatus}`,
      409,
    );
  }

  // Active Tournament Protection: Once matches have started, standard pre-tournament cancellation is blocked
  if (currentStatus === "IN_PROGRESS" && tournament.rounds.length > 0) {
    throw new AppError(
      "INVALID_ACTION",
      "Active tournament has live matches in progress and cannot be cancelled through standard pre-tournament cancellation",
      409,
    );
  }

  // 1. Notify players of cancellation first
  await TournamentNotificationService.notifyCancelled({
    tournamentId,
    tournamentTitle: tournament.title,
    reason,
    entryFee: tournament.entryFee,
  });

  // 2. Perform authoritative idempotent refunds via RefundService
  const { RefundService } = await import("./refundService");
  const refundResult = await RefundService.refundCancelledTournament({
    tournamentId,
    reason,
    adminId: cancelledBy ?? undefined,
  });

  // Update status and record cancellation reason with metadata in rules
  const currentRules = (tournament.rules as Record<string, unknown>) ?? {};
  const updatedRules = {
    ...currentRules,
    cancellationReason: reason,
    cancelledAt: new Date().toISOString(),
    cancelledBy: cancelledBy ?? "SYSTEM",
    registeredAtCancellation: tournament._count.players,
    minPlayersRequired: tournament.minPlayers ?? 2,
  };

  await prisma.tournament.update({
    where: { id: tournamentId },
    data: {
      status: "CANCELLED",
      rules: updatedRules as any,
      stateVersion: { increment: 1 },
    },
  });


  // 3. Send individual refund confirmations ONLY for successful refunds
  for (const refund of refundResult.refunds) {
    if (refund.status === "REFUNDED" || refund.status === "ALREADY_REFUNDED") {
      await TournamentNotificationService.notifyRefunded({
        tournamentId,
        tournamentTitle: tournament.title,
        playerId: refund.userId,
        amount: refund.refundAmount,
        refundId: refund.transactionId,
      });
    }
  }

  audit({
    actorType: cancelledBy ? "user" : "system",
    actorId: cancelledBy ?? null,
    action: "tournament.cancelled",
    category: "game",
    targetType: "tournament",
    targetId: tournamentId,
    meta: {
      reason,
      registeredPlayers: tournament._count.players,
      minPlayers: tournament.minPlayers ?? 2,
      refundCount: refundResult.refunds.length,
    },
  });
}

// ---------------------------------------------------------------------------
// Start a tournament (full flow)
// ---------------------------------------------------------------------------

export async function startTournament(
  tournamentId: string,
  startedBy: string | null = null,
): Promise<void> {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { _count: { select: { players: true } } },
  });
  if (!tournament) throw new AppError("NOT_FOUND", "Tournament not found", 404);

  const playerCount = tournament._count.players;
  if (playerCount < (tournament.minPlayers ?? 2)) {
    throw new AppError(
      "INVALID_ACTION",
      `Not enough players to start (${playerCount}/${tournament.minPlayers ?? 2})`,
      400,
    );
  }

  const format = tournament.format as TournamentFormat;
  if (!isSupportedTournamentFormat(format)) {
    throw new AppError(
      "INVALID_ACTION",
      `Tournament format ${format} is not yet supported`,
      400,
    );
  }

  const currentStatus = tournament.status as TournamentStatus;

  // Transition to STARTING
  if (!canTransitionTournamentStatus(currentStatus, "STARTING")) {
    throw new AppError(
      "INVALID_ACTION",
      `Cannot start tournament from status ${currentStatus}`,
      409,
    );
  }
  await transitionTournamentStatus(tournamentId, "STARTING", startedBy);

  // Authoritative Prize Configuration Validation & Snapshotting
  const { TournamentSettlementService } = await import("./tournamentSettlementService");
  await TournamentSettlementService.validateAndSnapshotPrizeConfig(tournamentId);

  // Build bracket
  await buildSingleEliminationBracket(tournamentId);

  // Initialize all registered players for live tournament tracking
  await prisma.tournamentPlayer.updateMany({
    where: { tournamentId },
    data: {
      liveStatus: "WAITING",
      currentRound: 1,
      matchesPlayed: 0,
      wins: 0,
      losses: 0,
      points: 0,
    },
  });

  const { TournamentLeaderboardService } = await import("./tournamentLeaderboardService");
  await TournamentLeaderboardService.recalculateTournamentStandings(tournamentId).catch(() => undefined);

  // Create all immediately playable matches (Round 1)
  await TournamentMatchService.createReadyMatchesForTournament(tournamentId);

  // Transition to IN_PROGRESS
  await transitionTournamentStatus(tournamentId, "IN_PROGRESS", startedBy);

  // Notify all players tournament has started
  await TournamentNotificationService.notifyTournamentStarted({
    tournamentId,
    tournamentTitle: tournament.title,
  });

  audit({
    actorType: "user",
    actorId: startedBy,
    action: "tournament.started",
    category: "game",
    targetType: "tournament",
    targetId: tournamentId,
    meta: { playerCount },
  });
}

// ---------------------------------------------------------------------------
// Bracket query
// ---------------------------------------------------------------------------

export async function getTournamentBracket(tournamentId: string) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { format: true },
  });
  if (!tournament) throw new AppError("NOT_FOUND", "Tournament not found", 404);

  const rounds = await prisma.tournamentRound.findMany({
    where: { tournamentId },
    orderBy: [{ roundNumber: "asc" }, { matchNumber: "asc" }],
  });

  const totalRounds = rounds.length > 0
    ? Math.max(...rounds.map((r) => r.roundNumber))
    : 0;

  // Group by roundNumber
  const roundMap = new Map<number, typeof rounds>();
  for (const slot of rounds) {
    const existing = roundMap.get(slot.roundNumber) ?? [];
    existing.push(slot);
    roundMap.set(slot.roundNumber, existing);
  }

  return {
    tournamentId,
    format: tournament.format,
    totalRounds,
    rounds: [...roundMap.entries()].map(([roundNumber, slots]) => ({
      roundNumber,
      slots: slots.map((s) => ({
        id: s.id,
        roundNumber: s.roundNumber,
        matchNumber: s.matchNumber,
        status: s.status,
        isBye: s.isBye,
        playerAId: s.playerAId,
        playerBId: s.playerBId,
        winnerId: s.winnerId,
        matchId: s.matchId,
        playerAScore: s.playerAScore,
        playerBScore: s.playerBScore,
        nextSlotId: s.nextSlotId,
        scheduledAt: s.scheduledAt?.toISOString() ?? null,
        completedAt: s.completedAt?.toISOString() ?? null,
      })),
    })),
  };
}

// ---------------------------------------------------------------------------
// Player status query
// ---------------------------------------------------------------------------

export async function getPlayerTournamentStatus(tournamentId: string, userId: string) {
  const player = await prisma.tournamentPlayer.findUnique({
    where: { tournamentId_userId: { tournamentId, userId } },
  });

  if (!player) {
    return {
      isRegistered: false,
      seed: null,
      eliminated: false,
      eliminatedInRound: null,
      finalRank: null,
      currentRoundId: null,
      currentMatchId: null,
    };
  }

  // Find current active slot
  const activeSlot = await prisma.tournamentRound.findFirst({
    where: {
      tournamentId,
      status: { in: ["READY", "IN_PROGRESS"] },
      OR: [{ playerAId: userId }, { playerBId: userId }],
    },
    orderBy: { roundNumber: "asc" },
  });

  return {
    isRegistered: true,
    seed: player.seed,
    eliminated: player.eliminated,
    eliminatedInRound: player.eliminatedInRound,
    finalRank: player.finalRank,
    currentRoundId: activeSlot?.id ?? null,
    currentMatchId: activeSlot?.matchId ?? null,
  };
}

// ---------------------------------------------------------------------------
// Admin tournament overview & monitoring
// ---------------------------------------------------------------------------

export async function getAdminTournamentOverview(tournamentId: string) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      players: { select: { id: true, userId: true, eliminated: true, finalRank: true } },
      rounds: {
        select: {
          id: true,
          roundNumber: true,
          matchNumber: true,
          status: true,
          isBye: true,
          matchId: true,
          winnerId: true,
        },
      },
    },
  });
  if (!tournament) throw new AppError("NOT_FOUND", "Tournament not found", 404);

  const totalPlayers = tournament.players.length;
  const remainingPlayers = tournament.players.filter((p) => !p.eliminated).length;

  const totalRounds = tournament.rounds.length > 0
    ? Math.max(...tournament.rounds.map((r) => r.roundNumber))
    : 0;

  // Active round is the lowest round number with non-completed/non-bye matches
  const activeRound = tournament.rounds.find(
    (r) => r.status === "IN_PROGRESS" || r.status === "READY"
  )?.roundNumber ?? (tournament.status === "COMPLETED" ? totalRounds : 1);

  const completedMatches = tournament.rounds.filter(
    (r) => r.status === "COMPLETED" || r.status === "BYE"
  ).length;
  const activeMatches = tournament.rounds.filter(
    (r) => r.status === "IN_PROGRESS" || r.status === "READY"
  ).length;
  const waitingMatches = tournament.rounds.filter(
    (r) => r.status === "PENDING"
  ).length;

  return {
    tournamentId: tournament.id,
    title: tournament.title,
    gameId: tournament.gameId,
    status: tournament.status,
    currentRound: activeRound,
    totalRounds,
    totalPlayers,
    remainingPlayers,
    completedMatches,
    activeMatches,
    waitingMatches,
  };
}

// ---------------------------------------------------------------------------
// Stuck round recovery
// ---------------------------------------------------------------------------

export async function recoverStuckRounds(tournamentId?: string): Promise<number> {
  const whereTourn = tournamentId
    ? { id: tournamentId, status: { in: ["IN_PROGRESS", "STARTING"] as TournamentStatus[] } }
    : { status: { in: ["IN_PROGRESS", "STARTING"] as TournamentStatus[] } };

  const tournaments = await prisma.tournament.findMany({
    where: whereTourn,
    include: {
      rounds: {
        orderBy: { roundNumber: "asc" },
      },
    },
  });

  let recoveredCount = 0;

  for (const tourn of tournaments) {
    const roundNumbers = Array.from(new Set(tourn.rounds.map((r) => r.roundNumber))).sort((a, b) => a - b);
    const maxRound = roundNumbers.length > 0 ? Math.max(...roundNumbers) : 1;

    for (const rNum of roundNumbers) {
      const slotsInRound = tourn.rounds.filter((r) => r.roundNumber === rNum);
      const allDone = slotsInRound.every(
        (s) => s.status === "COMPLETED" || s.status === "BYE" || s.status === "CANCELLED"
      );

      if (allDone) {
        if (rNum >= maxRound) {
          if (tourn.status !== "COMPLETED") {
            await finalizeTournament(tourn.id);
            recoveredCount++;
          }
        } else {
          // Check if next round has ready slots that need matches created
          const nextSlots = tourn.rounds.filter((r) => r.roundNumber === rNum + 1 && r.status === "READY" && !r.matchId);
          for (const ns of nextSlots) {
            try {
              const mId = await TournamentMatchService.ensureTournamentRoundMatch(ns.id);
              if (mId) recoveredCount++;
            } catch (err) {
              console.error(`[STUCK ROUND RECOVERY] Failed to create match for slot ${ns.id}:`, err);
            }
          }
        }
      }
    }
  }

  return recoveredCount;
}

// ---------------------------------------------------------------------------
// Admin bracket details & match overview
// ---------------------------------------------------------------------------

export async function getAdminTournamentBracketDetails(tournamentId: string) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      players: {
        orderBy: { seed: "asc" },
        include: {
          user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        },
      },
      rounds: {
        orderBy: [{ roundNumber: "asc" }, { matchNumber: "asc" }],
      },
    },
  });
  if (!tournament) throw new AppError("NOT_FOUND", "Tournament not found", 404);

  const playerMap = new Map(tournament.players.map((p) => [p.userId, p]));

  return {
    tournamentId: tournament.id,
    title: tournament.title,
    gameId: tournament.gameId,
    status: tournament.status,
    seedMethod: tournament.seedMethod,
    totalPlayers: tournament.players.length,
    totalRounds: tournament.rounds.length > 0 ? Math.max(...tournament.rounds.map((r) => r.roundNumber)) : 0,
    rounds: Array.from(new Set(tournament.rounds.map((r) => r.roundNumber))).map((roundNumber) => {
      const slots = tournament.rounds.filter((r) => r.roundNumber === roundNumber);
      return {
        roundNumber,
        matches: slots.map((slot) => {
          const playerA = slot.playerAId ? playerMap.get(slot.playerAId) : null;
          const playerB = slot.playerBId ? playerMap.get(slot.playerBId) : null;
          return {
            id: slot.id,
            matchNumber: slot.matchNumber,
            status: slot.status,
            isBye: slot.isBye,
            matchId: slot.matchId,
            winnerId: slot.winnerId,
            playerA: playerA
              ? {
                  userId: playerA.userId,
                  username: playerA.user.username,
                  displayName: playerA.user.displayName,
                  seed: playerA.seed,
                  score: slot.playerAScore,
                }
              : null,
            playerB: playerB
              ? {
                  userId: playerB.userId,
                  username: playerB.user.username,
                  displayName: playerB.user.displayName,
                  seed: playerB.seed,
                  score: slot.playerBScore,
                }
              : null,
          };
        }),
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Player match view
// ---------------------------------------------------------------------------

export async function getPlayerMatchView(tournamentId: string, userId: string) {
  const [player, activeSlot] = await Promise.all([
    prisma.tournamentPlayer.findUnique({
      where: { tournamentId_userId: { tournamentId, userId } },
      include: {
        tournament: { select: { title: true, gameId: true, status: true } },
      },
    }),
    prisma.tournamentRound.findFirst({
      where: {
        tournamentId,
        status: { in: ["READY", "IN_PROGRESS"] },
        OR: [{ playerAId: userId }, { playerBId: userId }],
      },
      orderBy: { roundNumber: "asc" },
    }),
  ]);

  if (!player) {
    throw new AppError("NOT_FOUND", "Player not registered in this tournament", 404);
  }

  let opponent = null;
  if (activeSlot) {
    const oppId = activeSlot.playerAId === userId ? activeSlot.playerBId : activeSlot.playerAId;
    if (oppId) {
      const [oppUser, oppPlayer] = await Promise.all([
        prisma.user.findUnique({
          where: { id: oppId },
          select: { id: true, username: true, displayName: true, avatarUrl: true },
        }),
        prisma.tournamentPlayer.findUnique({
          where: { tournamentId_userId: { tournamentId, userId: oppId } },
          select: { seed: true },
        }),
      ]);
      if (oppUser) {
        opponent = {
          userId: oppUser.id,
          username: oppUser.username,
          displayName: oppUser.displayName,
          avatarUrl: oppUser.avatarUrl,
          seed: oppPlayer?.seed ?? null,
        };
      }
    }
  }

  return {
    tournamentId,
    tournamentTitle: player.tournament.title,
    gameId: player.tournament.gameId,
    mySeed: player.seed,
    isEliminated: player.eliminated,
    finalRank: player.finalRank,
    currentRound: activeSlot?.roundNumber ?? null,
    matchNumber: activeSlot?.matchNumber ?? null,
    matchId: activeSlot?.matchId ?? null,
    matchStatus: activeSlot ? activeSlot.status : player.eliminated ? "ELIMINATED" : "WAITING",
    opponent,
  };
}
