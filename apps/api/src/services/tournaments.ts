import { prisma } from "@gaming-hub/db";
import type { Prisma } from "@gaming-hub/db";
import { AppError, isGameId } from "@gaming-hub/shared";
import type { TournamentStatus, TournamentFormat } from "@gaming-hub/shared";
import { canTransitionTournamentStatus } from "@gaming-hub/shared";
import { applyTransaction } from "./wallet";
import { getCategorySettings } from "./settings";
import { isFeatureEnabled } from "./featureFlags";
import { audit } from "./audit";
import { checkAndUnlock } from "./achievements";
import { notifyUserSocket } from "./socketBridge";
import { TournamentNotificationService } from "./tournamentNotificationService";

export interface CreateTournamentInput {
  gameId: string;
  title: string;
  description?: string;
  format?: TournamentFormat;
  prizePool?: number;
  entryFee?: number;
  maxPlayers?: number;
  startTime: string;
  endTime?: string | null;
  bannerUrl?: string | null;
  rules?: Record<string, unknown>;
}

async function assertTournamentsEnabled(): Promise<void> {
  await isFeatureEnabled("content.tournaments").then((enabled) => {
    if (!enabled) throw new AppError("FEATURE_DISABLED", "Tournaments are disabled", 403);
  });
}

export async function listTournaments(page: number, pageSize: number, status?: TournamentStatus, gameId?: string) {
  const where: Record<string, unknown> = {
    ...(status ? { status } : { status: { in: ["UPCOMING", "LIVE"] } }),
    ...(gameId ? { gameId } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.tournament.findMany({
      where,
      orderBy: { startTime: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { _count: { select: { players: true } } },
    }),
    prisma.tournament.count({ where }),
  ]);

  return {
    items: items.map((t) => ({
      id: t.id,
      gameId: t.gameId as import("@gaming-hub/shared").GameId,
      title: t.title,
      description: t.description,
      format: t.format,
      prizePool: t.prizePool,
      entryFee: t.entryFee,
      minPlayers: t.minPlayers,
      maxPlayers: t.maxPlayers,
      grossPool: t.grossPool,
      registeredCount: t._count.players,
      startTime: t.startTime.toISOString(),
      registrationStartsAt: t.registrationStartsAt?.toISOString() ?? null,
      registrationEndsAt: t.registrationEndsAt?.toISOString() ?? null,
      status: t.status,
      autoStartWhenFull: t.autoStartWhenFull,
    })),
    total,
    page,
    pageSize,
  };
}

export async function getTournamentDetail(id: string, userId: string | null) {
  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: {
      players: {
        orderBy: { seed: "asc" },
        include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true, isOnline: true } } },
      },
    },
  });
  if (!tournament) throw new AppError("NOT_FOUND", "Tournament not found", 404);

  const myEntry = userId
    ? await prisma.tournamentPlayer.findUnique({
        where: { tournamentId_userId: { tournamentId: id, userId } },
      })
    : null;

  return {
    id: tournament.id,
    gameId: tournament.gameId as import("@gaming-hub/shared").GameId,
    title: tournament.title,
    description: tournament.description,
    format: tournament.format,
    prizePool: tournament.prizePool,
    entryFee: tournament.entryFee,
    minPlayers: tournament.minPlayers,
    maxPlayers: tournament.maxPlayers,
    startTime: tournament.startTime.toISOString(),
    endTime: tournament.endTime?.toISOString() ?? null,
    registrationStartsAt: tournament.registrationStartsAt?.toISOString() ?? null,
    registrationEndsAt: tournament.registrationEndsAt?.toISOString() ?? null,
    status: tournament.status,
    bannerUrl: tournament.bannerUrl,
    rules: tournament.rules,
    grossPool: tournament.grossPool,
    prizeDistribution: tournament.prizeDistribution,
    autoStartWhenFull: tournament.autoStartWhenFull,
    stateVersion: tournament.stateVersion,
    registered: Boolean(myEntry),
    players: tournament.players.map((p) => ({
      userId: p.userId,
      username: p.user.username,
      displayName: p.user.displayName,
      avatarUrl: p.user.avatarUrl,
      seed: p.seed,
      result: p.result,
    })),
  };
}

export async function registerForTournament(userId: string, tournamentId: string) {
  await assertTournamentsEnabled();
  const tournamentSettings = await getCategorySettings("tournament");
  const wallet = await prisma.wallet.findUnique({ where: { userId }, select: { balance: true } });
  if (!wallet) throw new AppError("NOT_FOUND", "Wallet not found", 404);

  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { _count: { select: { players: true } } },
  });
  if (!tournament) throw new AppError("NOT_FOUND", "Tournament not found", 404);
  // Accept registrations when status is UPCOMING (legacy) or REGISTRATION_OPEN
  if (tournament.status !== "UPCOMING" && tournament.status !== "REGISTRATION_OPEN") {
    throw new AppError("TOURNAMENT_STARTED", "Tournament is not accepting registrations", 400);
  }
  if (tournament._count.players >= tournament.maxPlayers) throw new AppError("TOURNAMENT_FULL", "Tournament is full", 400);

  // Check registration window
  const now = new Date();
  if (tournament.registrationStartsAt && now < tournament.registrationStartsAt) {
    throw new AppError("TOURNAMENT_REGISTRATION_NOT_OPEN", "Registration has not started yet", 400);
  }
  if (tournament.registrationEndsAt && now > tournament.registrationEndsAt) {
    throw new AppError("TOURNAMENT_REGISTRATION_CLOSED", "Registration has closed", 400);
  }

  const existing = await prisma.tournamentPlayer.findUnique({
    where: { tournamentId_userId: { tournamentId, userId } },
  });
  if (existing) throw new AppError("TOURNAMENT_ALREADY_REGISTERED", "You are already registered", 400);

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const registrationsToday = await prisma.tournamentPlayer.count({
    where: { userId, registeredAt: { gte: todayStart } },
  });
  if (registrationsToday >= tournamentSettings.maxPerUserPerDay) {
    throw new AppError("TOURNAMENT_LOCKED", "You have reached your daily tournament registration limit", 400);
  }

  await prisma.$transaction(async (tx) => {
    // 1. Validate live tournament capacity inside transaction to eliminate race conditions
    const currentCount = await tx.tournamentPlayer.count({ where: { tournamentId } });
    if (currentCount >= tournament.maxPlayers) {
      throw new AppError("TOURNAMENT_FULL", "Tournament is full", 400);
    }

    // 2. Validate user registration inside transaction
    const existingInTx = await tx.tournamentPlayer.findUnique({
      where: { tournamentId_userId: { tournamentId, userId } },
    });
    if (existingInTx) {
      throw new AppError("TOURNAMENT_ALREADY_REGISTERED", "You are already registered", 400);
    }

    // 3. Atomically debit entry fee with balance guard
    if (tournament.entryFee > 0) {
      const transactionId = `tournament-entry-${tournament.id}-${userId}`;
      await applyTransaction(tx, userId, -tournament.entryFee, "TOURNAMENT_ENTRY", tournament.id, {
        transactionId,
        tournamentTitle: tournament.title,
        entryFee: tournament.entryFee,
        status: "COMPLETED",
      });
    }

    // 4. Create registration record
    await tx.tournamentPlayer.create({ data: { tournamentId, userId } });
  });

  audit({
    actorType: "user",
    actorId: userId,
    action: "tournament.registered",
    category: "game",
    targetType: "tournament",
    targetId: tournament.id,
    meta: { title: tournament.title, entryFee: tournament.entryFee },
  });

  const updatedCount = await prisma.tournamentPlayer.count({ where: { tournamentId } });

  await TournamentNotificationService.notifyRegistration({
    tournamentId,
    playerId: userId,
    tournamentTitle: tournament.title,
    entryFee: tournament.entryFee,
    playerCount: updatedCount,
    maxPlayers: tournament.maxPlayers,
    startTime: tournament.startTime,
  });

  // Emit registration-updated to all tournament subscribers
  await notifyUserSocket(userId, "tournament:player-registered", { tournamentId, seed: null });

  return { ok: true };
}

export async function cancelRegistration(userId: string, tournamentId: string) {
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) throw new AppError("NOT_FOUND", "Tournament not found", 404);
  const acceptedStatuses = ["UPCOMING", "REGISTRATION_OPEN", "REGISTRATION_CLOSED"];
  if (!acceptedStatuses.includes(tournament.status)) {
    throw new AppError("TOURNAMENT_STARTED", "Cannot cancel after the tournament starts", 400);
  }

  const entry = await prisma.tournamentPlayer.findUnique({
    where: { tournamentId_userId: { tournamentId, userId } },
  });
  if (!entry) throw new AppError("NOT_FOUND", "Registration not found", 404);

  await prisma.$transaction(async (tx) => {
    await tx.tournamentPlayer.delete({ where: { id: entry.id } });
    if (tournament.entryFee > 0) {
      const tournamentSettings = await getCategorySettings("tournament");
      if (tournamentSettings.refundOnCancel) {
        const transactionId = `tournament-cancel-refund-${tournament.id}-${userId}`;
        await applyTransaction(tx, userId, tournament.entryFee, "TOURNAMENT_ENTRY", tournament.id, {
          transactionId,
          refund: true,
          reason: "player_cancelled_registration",
          status: "REFUNDED",
        });
      }
    }
  });

  // Emit registration-updated
  const updatedCount = await prisma.tournamentPlayer.count({ where: { tournamentId } });
  await notifyUserSocket(userId, "tournament:player-unregistered", { tournamentId });

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Admin management
// ---------------------------------------------------------------------------

export async function createTournament(input: CreateTournamentInput, createdBy: string | null) {
  if (!isGameId(input.gameId)) throw new AppError("VALIDATION_ERROR", "Unknown game", 422);
  const startTime = new Date(input.startTime);
  if (Number.isNaN(startTime.getTime())) throw new AppError("VALIDATION_ERROR", "Invalid start time", 422);

  const tournament = await prisma.tournament.create({
    data: {
      gameId: input.gameId,
      title: input.title,
      description: input.description ?? "",
      format: (input.format ?? "SINGLE_ELIMINATION") as TournamentFormat,
      prizePool: input.prizePool ?? 0,
      entryFee: input.entryFee ?? 0,
      maxPlayers: input.maxPlayers ?? 16,
      startTime,
      endTime: input.endTime ? new Date(input.endTime) : null,
      bannerUrl: input.bannerUrl ?? null,
      rules: (input.rules ?? {}) as Prisma.InputJsonValue,
      createdBy,
      status: "DRAFT",
    },
  });

  audit({
    actorType: "user",
    actorId: createdBy,
    action: "admin.tournament.created",
    category: "admin",
    targetType: "tournament",
    targetId: tournament.id,
    meta: { title: tournament.title },
  });
  return tournament;
}

export async function updateTournament(id: string, input: Partial<CreateTournamentInput>, updatedBy: string | null) {
  const existing = await prisma.tournament.findUnique({ where: { id } });
  if (!existing) throw new AppError("NOT_FOUND", "Tournament not found", 404);

  const data: Record<string, unknown> = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.description !== undefined) data.description = input.description;
  if (input.format !== undefined) data.format = input.format;
  if (input.prizePool !== undefined) data.prizePool = input.prizePool;
  if (input.entryFee !== undefined) data.entryFee = input.entryFee;
  if (input.maxPlayers !== undefined) data.maxPlayers = input.maxPlayers;
  if (input.startTime !== undefined) data.startTime = new Date(input.startTime);
  if (input.endTime !== undefined) data.endTime = input.endTime ? new Date(input.endTime) : null;
  if (input.bannerUrl !== undefined) data.bannerUrl = input.bannerUrl ?? null;
  if (input.rules !== undefined) data.rules = input.rules;

  const tournament = await prisma.tournament.update({ where: { id }, data });
  audit({
    actorType: "user",
    actorId: updatedBy,
    action: "admin.tournament.updated",
    category: "admin",
    targetType: "tournament",
    targetId: id,
    meta: { title: tournament.title },
  });
  return tournament;
}

export async function setTournamentStatus(id: string, status: TournamentStatus, updatedBy: string | null) {
  const existing = await prisma.tournament.findUnique({ where: { id } });
  if (!existing) throw new AppError("NOT_FOUND", "Tournament not found", 404);

  // Validate transition
  if (!canTransitionTournamentStatus(existing.status as TournamentStatus, status)) {
    throw new AppError(
      "INVALID_ACTION",
      `Cannot transition tournament from ${existing.status} to ${status}`,
      409,
    );
  }

  const tournament = await prisma.tournament.update({
    where: { id },
    data: { status, stateVersion: { increment: 1 } },
  });
  audit({
    actorType: "user",
    actorId: updatedBy,
    action: "admin.tournament.status.changed",
    category: "admin",
    targetType: "tournament",
    targetId: id,
    meta: { status },
  });

  if (status === "ENDED") {
    // Evaluate tournament-wins achievements for players who won the final round.
    const [maxRound] = await Promise.all([
      prisma.tournamentRound.aggregate({
        where: { tournamentId: id },
        _max: { roundNumber: true },
      }),
    ]);
    const finalRound = maxRound._max.roundNumber;
    if (finalRound !== null) {
      const finalRoundWins = await prisma.tournamentRound.findMany({
        where: { tournamentId: id, roundNumber: finalRound, winnerId: { not: null } },
        select: { winnerId: true },
      });
      const winners = [...new Set(finalRoundWins.map((r) => r.winnerId).filter((w): w is string => Boolean(w)))];
      if (winners.length > 0) {
        await Promise.all(
          winners.map(async (userId) => {
            const wins = await countTournamentWins(userId);
            await checkAndUnlock(userId, { userId, tournamentWins: wins });
          }),
        );
      }
    }
  }

  return tournament;
}

async function countTournamentWins(userId: string): Promise<number> {
  const endedTournaments = await prisma.tournament.findMany({
    where: { status: "ENDED" },
    select: { id: true },
  });
  let wins = 0;
  for (const t of endedTournaments) {
    const maxRound = await prisma.tournamentRound.aggregate({
      where: { tournamentId: t.id },
      _max: { roundNumber: true },
    });
    if (maxRound._max.roundNumber === null) continue;
    const won = await prisma.tournamentRound.findFirst({
      where: { tournamentId: t.id, roundNumber: maxRound._max.roundNumber, winnerId: userId },
      select: { id: true },
    });
    if (won) wins += 1;
  }
  return wins;
}

export async function deleteTournament(id: string, deletedBy: string | null) {
  const existing = await prisma.tournament.findUnique({ where: { id } });
  if (!existing) throw new AppError("NOT_FOUND", "Tournament not found", 404);
  await prisma.tournament.delete({ where: { id } });
  audit({
    actorType: "user",
    actorId: deletedBy,
    action: "admin.tournament.deleted",
    category: "admin",
    targetType: "tournament",
    targetId: id,
    meta: { title: existing.title },
  });
  return { ok: true };
}

export async function adminListTournaments(page: number, pageSize: number, status?: TournamentStatus) {
  const where = status ? { status } : {};
  const [items, total] = await Promise.all([
    prisma.tournament.findMany({
      where,
      orderBy: { startTime: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { _count: { select: { players: true } } },
    }),
    prisma.tournament.count({ where }),
  ]);
  return { items, total, page, pageSize };
}
