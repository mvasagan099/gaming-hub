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
import { applyTransaction } from "./wallet";
import { audit } from "./audit";
import { TournamentMatchService } from "./tournamentMatchService";
import { TournamentNotificationService } from "./tournamentNotificationService";

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

async function seedPlayers(tournamentId: string): Promise<string[]> {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { seedMethod: true },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;

  const seedMethod = tournament?.seedMethod ?? "RANDOM";

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

  if (seedMethod === "RATING") {
    seeded = players.sort((a, b) => {
      const ratingA = a.user.competitiveRanks[0]?.rating ?? 1000;
      const ratingB = b.user.competitiveRanks[0]?.rating ?? 1000;
      return ratingB - ratingA; // descending
    });
  } else {
    // RANDOM — Fisher-Yates shuffle
    seeded = [...players];
    for (let i = seeded.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [seeded[i], seeded[j]] = [seeded[j], seeded[i]];
    }
  }

  // Assign seeds
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

async function processAllByeSlots(tournamentId: string): Promise<void> {
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

async function advanceToNextSlot(
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

async function checkRoundAndAdvance(tournamentId: string, roundNumber: number): Promise<void> {
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

async function finalizeTournament(tournamentId: string): Promise<void> {
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

  // Transition to COMPLETED
  if (canTransitionTournamentStatus(currentStatus, "COMPLETED")) {
    await transitionTournamentStatus(tournamentId, "COMPLETED", null);
  }

  // Auto-settle
  await settleTournament(tournamentId);
}

// ---------------------------------------------------------------------------
// Prize settlement
// ---------------------------------------------------------------------------

export async function settleTournament(tournamentId: string): Promise<void> {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { players: true, prizes: true },
  });
  if (!tournament) throw new AppError("NOT_FOUND", "Tournament not found", 404);

  // Idempotency: already settled
  if (tournament.settledAt) return;

  const currentStatus = tournament.status as TournamentStatus;

  if (canTransitionTournamentStatus(currentStatus, "SETTLING")) {
    await transitionTournamentStatus(tournamentId, "SETTLING", null);
  }

  const distribution = (tournament.prizeDistribution as unknown as PrizeDistributionEntry[]).length > 0
    ? (tournament.prizeDistribution as unknown as PrizeDistributionEntry[])
    : defaultPrizeDistribution(tournament.format as TournamentFormat);

  const grossPool = tournament.grossPool > 0 ? tournament.grossPool : tournament.prizePool;
  const prizes = calculatePrizes(grossPool, distribution);

  // Get ranked players
  const rankedPlayers = tournament.players
    .filter((p) => p.finalRank !== null)
    .sort((a, b) => (a.finalRank ?? 999) - (b.finalRank ?? 999));

  const paidOut: { userId: string; rank: number; amount: number }[] = [];

  await prisma.$transaction(async (tx) => {
    for (const prize of prizes) {
      const player = rankedPlayers.find((p) => p.finalRank === prize.rank);
      if (!player || prize.amount <= 0) continue;

      // Check if already paid (idempotency)
      const alreadyPaid = tournament.prizes.find(
        (pr) => pr.userId === player.userId && pr.status === "PAID",
      );
      if (alreadyPaid) continue;

      const transactionId = `tournament-prize-${tournamentId}-${player.userId}-${prize.rank}`;
      await applyTransaction(
        tx,
        player.userId,
        prize.amount,
        "TOURNAMENT_PRIZE",
        tournamentId,
        { transactionId, rank: prize.rank, tournamentTitle: tournament.title, status: "COMPLETED" },
      );

      await tx.tournamentPrize.upsert({
        where: { tournamentId_userId: { tournamentId, userId: player.userId } },
        create: {
          tournamentId,
          userId: player.userId,
          playerId: player.id,
          rank: prize.rank,
          amount: prize.amount,
          status: "PAID",
          paidAt: new Date(),
        },
        update: {
          amount: prize.amount,
          status: "PAID",
          paidAt: new Date(),
        },
      });

      paidOut.push({ userId: player.userId, rank: prize.rank, amount: prize.amount });
    }

    await tx.tournament.update({
      where: { id: tournamentId },
      data: { settledAt: new Date(), stateVersion: { increment: 1 } },
    });
  });

  await transitionTournamentStatus(tournamentId, "SETTLED", null);

  // Send prize-credited notifications after wallet commit succeeds
  for (const p of paidOut) {
    await TournamentNotificationService.notifyPrizeCredited({
      tournamentId,
      tournamentTitle: tournament.title,
      playerId: p.userId,
      rank: p.rank,
      amount: p.amount,
    });
  }
}

// ---------------------------------------------------------------------------
// Cancel tournament with refunds
// ---------------------------------------------------------------------------

export async function cancelTournamentWithRefunds(
  tournamentId: string,
  reason = "Tournament cancelled",
  cancelledBy: string | null = null,
): Promise<void> {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { players: true },
  });
  if (!tournament) throw new AppError("NOT_FOUND", "Tournament not found", 404);

  const currentStatus = tournament.status as TournamentStatus;
  if (!canTransitionTournamentStatus(currentStatus, "CANCELLED")) {
    throw new AppError(
      "INVALID_ACTION",
      `Cannot cancel tournament in status ${currentStatus}`,
      409,
    );
  }

  await prisma.$transaction(async (tx) => {
    // Refund entry fees if tournament was paid
    if (tournament.entryFee > 0) {
      for (const player of tournament.players) {
        const transactionId = `tournament-cancel-refund-${tournamentId}-${player.userId}`;
        await applyTransaction(
          tx,
          player.userId,
          tournament.entryFee,
          "TOURNAMENT_ENTRY",
          tournamentId,
          { transactionId, refund: true, reason, status: "REFUNDED" },
        );
      }
    }

    await tx.tournament.update({
      where: { id: tournamentId },
      data: { status: "CANCELLED", stateVersion: { increment: 1 } },
    });
  });

  // Notify all players of cancellation
  await TournamentNotificationService.notifyCancelled({
    tournamentId,
    tournamentTitle: tournament.title,
    reason,
  });

  // Send individual refund notifications after wallet commit
  if (tournament.entryFee > 0) {
    for (const player of tournament.players) {
      await TournamentNotificationService.notifyRefunded({
        tournamentId,
        tournamentTitle: tournament.title,
        playerId: player.userId,
        amount: tournament.entryFee,
      });
    }
  }

  audit({
    actorType: "user",
    actorId: cancelledBy,
    action: "tournament.cancelled",
    category: "game",
    targetType: "tournament",
    targetId: tournamentId,
    meta: { reason },
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

// Build bracket
  await buildSingleEliminationBracket(tournamentId);

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
