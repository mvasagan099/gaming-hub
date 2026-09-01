import { prisma } from "@gaming-hub/db";
import type { Prisma } from "@gaming-hub/db";
import { AppError, isGameId } from "@gaming-hub/shared";
import type { TournamentStatus, TournamentFormat } from "@gaming-hub/shared";
import { canTransitionTournamentStatus } from "@gaming-hub/shared";
import { applyTransaction } from "./wallet";
import { WalletTransactionService } from "./walletTransactionService";
import { IdempotencyService } from "./idempotencyService";
import { getCategorySettings } from "./settings";
import { audit } from "./audit";
import { AchievementService } from "./achievementService";
import { ReferralService } from "./referrals";
import { notifyUserSocket, broadcastAdminAnalytics } from "./socketBridge";
import { TournamentNotificationService } from "./tournamentNotificationService";
import { isFeatureEnabled } from "./featureFlags";
import { TournamentAnalyticsCache } from "./tournamentAnalyticsCache";

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

/** Entry fee for each canonical tier (must match TournamentTier seeds). */
const TIER_ENTRY_FEE: Record<string, number> = {
  mini: 5,
  basic: 10,
  standard: 25,
  premium: 50,
  pro: 100,
};

export async function listTournaments(
  page: number,
  pageSize: number,
  status?: TournamentStatus,
  gameId?: string,
  tier?: string,
) {
  const tierEntryFee = tier ? TIER_ENTRY_FEE[tier.toLowerCase()] : undefined;

  const where: Record<string, unknown> = {
    ...(status
      ? status === "UPCOMING"
        ? { status: { in: ["UPCOMING", "REGISTRATION_OPEN", "REGISTRATION_CLOSED", "STARTING"] } }
        : status === "LIVE"
        ? { status: { in: ["LIVE", "IN_PROGRESS", "STARTING"] } }
        : { status }
      : { status: { not: "CANCELLED" } }),
    ...(gameId ? { gameId } : {}),
    // Filter by exact entryFee for the requested tier.
    // This is more reliable than title-parsing and makes pagination accurate.
    ...(tierEntryFee !== undefined ? { entryFee: tierEntryFee } : {}),
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

export async function registerForTournament(userId: string, tournamentId: string, expectedFee?: number) {
  // 0. Pre-checks: user restrictions
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      deletedAt: true,
      penalties: {
        where: {
          status: "ACTIVE",
          type: { in: ["CHEATING", "ABUSE", "UNSPORTSMANLIKE_CONDUCT"] },
        },
      },
    },
  });
  if (!user) throw new AppError("NOT_FOUND", "User not found", 404);
  if (user.deletedAt || user.penalties.length > 0) {
    throw new AppError("ACCOUNT_RESTRICTED", "Your account is restricted from tournament registration", 403);
  }

  const existing = await prisma.tournamentPlayer.findUnique({
    where: { tournamentId_userId: { tournamentId, userId } },
  });
  if (existing) throw new AppError("TOURNAMENT_ALREADY_REGISTERED", "You are already registered", 400);

  await assertTournamentsEnabled();
  const tournamentSettings = await getCategorySettings("tournament");

  const idempotencyKey = IdempotencyService.tournamentEntryKey(tournamentId, userId);

  return IdempotencyService.executeOnce({
    key: idempotencyKey,
    operation: "TOURNAMENT_REGISTRATION",
    userId,
    referenceId: tournamentId,
    handler: async (tx) => {
      // 1. Acquire row-level lock on tournament to eliminate race conditions on capacity
      const lockedTournament = await tx.tournament.update({
        where: { id: tournamentId },
        data: { stateVersion: { increment: 1 } },
        select: {
          id: true,
          title: true,
          gameId: true,
          status: true,
          entryFee: true,
          prizePool: true,
          configSnapshot: true,
          maxPlayers: true,
          startTime: true,
          registrationStartsAt: true,
          registrationEndsAt: true,
          autoStartWhenFull: true,
        },
      });

      if (expectedFee !== undefined && expectedFee !== lockedTournament.entryFee) {
        throw new AppError(
          "ENTRY_FEE_CHANGED",
          `Tournament entry fee has changed from ${expectedFee} to ${lockedTournament.entryFee} coins. Please confirm.`,
          409,
        );
      }

      if (lockedTournament.status !== "UPCOMING" && lockedTournament.status !== "REGISTRATION_OPEN") {
        throw new AppError("TOURNAMENT_STARTED", "Tournament is not accepting registrations", 400);
      }

      // Check registration window
      const now = new Date();
      if (lockedTournament.registrationStartsAt && now < lockedTournament.registrationStartsAt) {
        throw new AppError("TOURNAMENT_REGISTRATION_NOT_OPEN", "Registration has not started yet", 400);
      }
      if (lockedTournament.registrationEndsAt && now > lockedTournament.registrationEndsAt) {
        throw new AppError("TOURNAMENT_REGISTRATION_CLOSED", "Registration has closed", 400);
      }

      // 2. Validate live tournament capacity inside transaction (race condition safe)
      const currentCount = await tx.tournamentPlayer.count({ where: { tournamentId } });
      if (currentCount >= lockedTournament.maxPlayers) {
        throw new AppError("TOURNAMENT_FULL", "Tournament is full", 409);
      }

      // 3. Validate user registration inside transaction
      const existingInTx = await tx.tournamentPlayer.findUnique({
        where: { tournamentId_userId: { tournamentId, userId } },
      });
      if (existingInTx) {
        throw new AppError("TOURNAMENT_ALREADY_REGISTERED", "You are already registered", 400);
      }

      // 4. Daily limits check
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);
      const registrationsToday = await tx.tournamentPlayer.count({
        where: { userId, registeredAt: { gte: todayStart } },
      });
      if (registrationsToday >= tournamentSettings.maxPerUserPerDay) {
        throw new AppError("TOURNAMENT_LOCKED", "You have reached your daily tournament registration limit", 400);
      }

      // 5. Atomically debit entry fee with balance guard
      if (lockedTournament.entryFee > 0) {
        const tierId = (lockedTournament.configSnapshot as any)?.tierId ?? null;
        await WalletTransactionService.createTournamentEntry(tx, {
          userId,
          tournamentId,
          tournamentTitle: lockedTournament.title,
          entryFee: lockedTournament.entryFee,
          tierId,
        });
      }

      // 6. Create registration record
      const createdPlayer = await tx.tournamentPlayer.create({
        data: {
          tournamentId,
          userId,
          registeredAt: new Date(),
          liveStatus: "REGISTERED",
        },
      });

      const newCount = currentCount + 1;
      // If capacity is reached, automatically close registration
      if (newCount >= lockedTournament.maxPlayers) {
        await tx.tournament.update({
          where: { id: tournamentId },
          data: { status: "REGISTRATION_CLOSED" },
        });
      }

      return {
        ok: true,
        registrationId: createdPlayer.id,
        tournamentId: lockedTournament.id,
        tournamentTitle: lockedTournament.title,
        tierId: (lockedTournament.configSnapshot as any)?.tierId ?? null,
        gameId: lockedTournament.gameId,
        entryFee: lockedTournament.entryFee,
        prizePool: lockedTournament.prizePool,
        status: "REGISTERED",
        registeredPlayers: newCount,
        maximumPlayers: lockedTournament.maxPlayers,
        registrationEndTime: lockedTournament.registrationEndsAt?.toISOString() ?? null,
        tournamentStartTime: lockedTournament.startTime.toISOString(),
        tournament: lockedTournament,
      };
    },
  }).then(async (res) => {
    if (res && res.tournament) {
      audit({
        actorType: "user",
        actorId: userId,
        action: "tournament.registered",
        category: "game",
        targetType: "tournament",
        targetId: res.tournament.id,
        meta: {
          userId,
          tournamentId: res.tournament.id,
          title: res.tournament.title,
          entryFee: res.tournament.entryFee,
          amount: res.tournament.entryFee,
          transactionId: `tournament-entry-${res.tournament.id}-${userId}`,
          timestamp: new Date().toISOString(),
        },
      });

      const updatedCount = await prisma.tournamentPlayer.count({ where: { tournamentId } });

      await TournamentNotificationService.notifyRegistration({
        tournamentId,
        playerId: userId,
        tournamentTitle: res.tournament.title,
        entryFee: res.tournament.entryFee,
        playerCount: updatedCount,
        maxPlayers: res.tournament.maxPlayers,
        startTime: new Date(res.tournament.startTime),
      });

      // Emit registration-updated and real-time count to all tournament subscribers
      await Promise.all([
        notifyUserSocket(userId, "tournament:player-registered", { tournamentId, seed: null }),
        notifyUserSocket(userId, "tournament:player-count-updated", {
          tournamentId,
          registeredPlayers: updatedCount,
          maxPlayers: res.tournament.maxPlayers,
        }),
      ]);

      void broadcastAdminAnalytics("admin:analytics:registration-updated", {
        tournamentId,
        userId,
        registeredPlayers: updatedCount,
        maxPlayers: res.tournament.maxPlayers,
        entryFee: res.tournament.entryFee,
        timestamp: new Date().toISOString(),
      });

      TournamentAnalyticsCache.invalidateRegistrations(tournamentId, userId);

      // Evaluate referral qualification (TOURNAMENT_JOIN)
      try {
        await ReferralService.evaluateQualification(userId, "TOURNAMENT_JOIN", { tournamentId });
      } catch {
        // Non-blocking side effect
      }
    }

    return res;
  });
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

  const idempotencyKey = IdempotencyService.tournamentRefundKey(tournamentId, userId);

  return IdempotencyService.executeOnce({
    key: idempotencyKey,
    operation: "TOURNAMENT_CANCEL_REGISTRATION",
    userId,
    referenceId: tournamentId,
    handler: async (tx) => {
      await tx.tournamentPlayer.delete({ where: { id: entry.id } });

      if (tournament.entryFee > 0) {
        const tournamentSettings = await getCategorySettings("tournament");
        if (tournamentSettings.refundOnCancel) {
          const debitTx = await tx.transaction.findFirst({
            where: {
              userId,
              referenceId: tournament.id,
              referenceType: "TOURNAMENT_ENTRY",
              type: "DEBIT",
            },
          });
          const originalTransactionId = debitTx?.id ?? `tournament-entry-${tournament.id}-${userId}`;
          await WalletTransactionService.createTournamentRefund(tx, {
            userId,
            tournamentId: tournament.id,
            tournamentTitle: tournament.title,
            refundAmount: tournament.entryFee,
            originalTransactionId,
            reason: "player_cancelled_registration",
          });
        }
      }

      // If tournament was full and closed due to capacity, reopen registration
      const remainingCount = await tx.tournamentPlayer.count({ where: { tournamentId } });
      const now = new Date();
      const isWithinWindow = (!tournament.registrationStartsAt || now >= tournament.registrationStartsAt) &&
                            (!tournament.registrationEndsAt || now <= tournament.registrationEndsAt);

      if (tournament.status === "REGISTRATION_CLOSED" && remainingCount < tournament.maxPlayers && isWithinWindow) {
        await tx.tournament.update({
          where: { id: tournamentId },
          data: { status: "REGISTRATION_OPEN" },
        });
      }

      return { ok: true, remainingCount };
    },
  }).then(async (res) => {
    audit({
      actorType: "user",
      actorId: userId,
      action: "tournament.registration.cancelled",
      category: "game",
      targetType: "tournament",
      targetId: tournamentId,
      meta: {
        userId,
        tournamentId,
        refundAmount: tournament.entryFee,
        originalTransactionId: `tournament-entry-${tournamentId}-${userId}`,
        refundTransactionId: `tournament-refund-${tournamentId}-${userId}`,
        timestamp: new Date().toISOString(),
      },
    });

    const updatedCount = await prisma.tournamentPlayer.count({ where: { tournamentId } });
    await Promise.all([
      notifyUserSocket(userId, "tournament:player-unregistered", { tournamentId }),
      notifyUserSocket(userId, "tournament:player-count-updated", {
        tournamentId,
        registeredPlayers: updatedCount,
        maxPlayers: tournament.maxPlayers,
      }),
    ]);

    void broadcastAdminAnalytics("admin:analytics:registration-updated", {
      tournamentId,
      userId,
      registeredPlayers: updatedCount,
      maxPlayers: tournament.maxPlayers,
      entryFee: tournament.entryFee,
      timestamp: new Date().toISOString(),
    });

    TournamentAnalyticsCache.invalidateRegistrations(tournamentId, userId);
    return res;
  });
}

// ---------------------------------------------------------------------------
// Registration status & eligibility query
// ---------------------------------------------------------------------------

export async function getRegistrationInfo(tournamentId: string, userId: string | null) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      _count: { select: { players: true } },
    },
  });
  if (!tournament) throw new AppError("NOT_FOUND", "Tournament not found", 404);

  const registeredCount = tournament._count.players;
  const availableSlots = Math.max(0, tournament.maxPlayers - registeredCount);
  const now = new Date();

  let registrationState: "REGISTRATION_NOT_STARTED" | "REGISTRATION_OPEN" | "REGISTRATION_CLOSED" | "TOURNAMENT_FULL" | "TOURNAMENT_STARTED" | "COMPLETED" | "CANCELLED" = "REGISTRATION_OPEN";

  if (tournament.status === "CANCELLED") {
    registrationState = "CANCELLED";
  } else if (tournament.status === "COMPLETED" || tournament.status === "SETTLED") {
    registrationState = "COMPLETED";
  } else if (tournament.status === "IN_PROGRESS" || tournament.status === "STARTING") {
    registrationState = "TOURNAMENT_STARTED";
  } else if (tournament.registrationStartsAt && now < tournament.registrationStartsAt) {
    registrationState = "REGISTRATION_NOT_STARTED";
  } else if (tournament.registrationEndsAt && now > tournament.registrationEndsAt) {
    registrationState = "REGISTRATION_CLOSED";
  } else if (registeredCount >= tournament.maxPlayers) {
    registrationState = "TOURNAMENT_FULL";
  } else if (tournament.status === "REGISTRATION_CLOSED") {
    registrationState = "REGISTRATION_CLOSED";
  }

  let isRegistered = false;
  let userBalance = 0;
  let canRegister = false;
  let ineligibilityReason: string | undefined = undefined;
  let insufficientBalanceDetails: { required: number; available: number; shortage: number } | undefined = undefined;

  if (userId) {
    const [entry, userWallet, userRecord] = await Promise.all([
      prisma.tournamentPlayer.findUnique({
        where: { tournamentId_userId: { tournamentId, userId } },
      }),
      prisma.wallet.findUnique({
        where: { userId },
        select: { balance: true },
      }),
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          deletedAt: true,
          penalties: {
            where: {
              status: "ACTIVE",
              type: { in: ["CHEATING", "ABUSE", "UNSPORTSMANLIKE_CONDUCT"] },
            },
          },
        },
      }),
    ]);

    isRegistered = Boolean(entry);
    userBalance = userWallet?.balance ?? 0;

    if (isRegistered) {
      canRegister = false;
      ineligibilityReason = "Already registered";
    } else if (userRecord?.deletedAt || (userRecord?.penalties && userRecord.penalties.length > 0)) {
      canRegister = false;
      ineligibilityReason = "Account restricted";
    } else if (registrationState !== "REGISTRATION_OPEN") {
      canRegister = false;
      ineligibilityReason = registrationState;
    } else if (tournament.entryFee > 0 && userBalance < tournament.entryFee) {
      canRegister = false;
      ineligibilityReason = "Insufficient balance";
      insufficientBalanceDetails = {
        required: tournament.entryFee,
        available: userBalance,
        shortage: tournament.entryFee - userBalance,
      };
    } else {
      canRegister = true;
    }
  }

  const rules = (tournament.rules as Record<string, unknown>) ?? {};
  const cancellationReason =
    (rules.cancellationReason as string | undefined) ??
    (tournament.status === "CANCELLED" ? "MINIMUM_PLAYERS_NOT_REACHED" : undefined);

  return {
    tournamentId: tournament.id,
    title: tournament.title,
    gameId: tournament.gameId,
    entryFee: tournament.entryFee,
    prizePool: tournament.prizePool,
    minPlayers: tournament.minPlayers ?? 2,
    maxPlayers: tournament.maxPlayers,
    registeredPlayers: registeredCount,
    availableSlots,
    registrationStartsAt: tournament.registrationStartsAt?.toISOString() ?? null,
    registrationEndsAt: tournament.registrationEndsAt?.toISOString() ?? null,
    startTime: tournament.startTime.toISOString(),
    status: tournament.status,
    cancellationReason,
    cancellationDetails: tournament.status === "CANCELLED" ? {
      reason: cancellationReason,
      minPlayers: tournament.minPlayers ?? 2,
      registeredPlayers: (rules.registeredAtCancellation as number | undefined) ?? registeredCount,
      cancelledAt: (rules.cancelledAt as string | undefined) ?? null,
      cancelledBy: (rules.cancelledBy as string | undefined) ?? "SYSTEM",
    } : null,
    registrationState,
    isRegistered,
    userBalance,
    balanceAfterRegistration: Math.max(0, userBalance - tournament.entryFee),
    canRegister,
    ineligibilityReason,
    insufficientBalanceDetails,
  };
}


// ---------------------------------------------------------------------------
// Admin registration summary
// ---------------------------------------------------------------------------

export async function getAdminTournamentRegistrationSummary(tournamentId: string) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      players: {
        orderBy: { registeredAt: "asc" },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
            },
          },
        },
      },
    },
  });
  if (!tournament) throw new AppError("NOT_FOUND", "Tournament not found", 404);

  const registeredCount = tournament.players.length;
  const availableSlots = Math.max(0, tournament.maxPlayers - registeredCount);

  return {
    tournamentId: tournament.id,
    title: tournament.title,
    gameId: tournament.gameId,
    maxPlayers: tournament.maxPlayers,
    registeredPlayers: registeredCount,
    availableSlots,
    registrationStatus: tournament.status,
    registrationStartsAt: tournament.registrationStartsAt?.toISOString() ?? null,
    registrationEndsAt: tournament.registrationEndsAt?.toISOString() ?? null,
    startTime: tournament.startTime.toISOString(),
    players: tournament.players.map((p, idx) => ({
      sequence: idx + 1,
      userId: p.userId,
      username: p.user.username,
      displayName: p.user.displayName,
      avatarUrl: p.user.avatarUrl,
      registeredAt: p.registeredAt.toISOString(),
      seed: p.seed,
      eliminated: p.eliminated,
      finalRank: p.finalRank,
    })),
  };
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
  TournamentAnalyticsCache.invalidateTournaments(tournament.id, tournament.gameId);
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
  TournamentAnalyticsCache.invalidateTournaments(id, tournament.gameId);
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
  TournamentAnalyticsCache.invalidateTournaments(id, tournament.gameId);

  if (status === "CANCELLED") {
    const { RefundService } = await import("./refundService");
    await RefundService.refundCancelledTournament({
      tournamentId: id,
      adminId: updatedBy ?? undefined,
    });
  }

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
            await AchievementService.evaluateAchievements(userId, { userId, tournamentWins: wins });
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
