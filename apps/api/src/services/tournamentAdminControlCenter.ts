import { prisma } from "@gaming-hub/db";
import { AppError, type TournamentStatus } from "@gaming-hub/shared";
import { audit } from "./audit";
import { processMatchResult } from "./tournamentEngine";

export interface ControlCenterMatch {
  slotId: string;
  roundNumber: number;
  matchNumber: number;
  status: string;
  isBye: boolean;
  playerA: {
    id: string;
    username: string;
    displayName: string;
    seed: number | null;
    score: number;
  } | null;
  playerB: {
    id: string;
    username: string;
    displayName: string;
    seed: number | null;
    score: number;
  } | null;
  winnerId: string | null;
  matchId: string | null;
  startedAt: string | null;
  matchDeadline: string | null;
  remainingMs: number | null;
  isExpired: boolean;
  isStuck: boolean;
  resultReason: string | null;
  stateVersion: number;
}

export interface ControlCenterPlayer {
  registrationSequence: number;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  registeredAt: string;
  seed: number | null;
  rating: number;
  eliminated: boolean;
  eliminatedInRound: number | null;
  finalRank: number | null;
  currentRound: number;
  status: "ACTIVE" | "ELIMINATED" | "CHAMPION" | "WAITING";
}

export interface TournamentControlCenterData {
  tournament: {
    id: string;
    gameId: string;
    title: string;
    description: string;
    status: TournamentStatus;
    format: string;
    seedMethod: string;
    entryFee: number;
    prizePool: number;
    grossPool: number;
    minPlayers: number;
    maxPlayers: number;
    startTime: string;
    registrationStartsAt: string | null;
    registrationEndsAt: string | null;
    endTime: string | null;
    settledAt: string | null;
    stateVersion: number;
    rules: unknown;
  };
  summary: {
    maxPlayers: number;
    registeredPlayers: number;
    availableSlots: number;
    minPlayers: number;
    currentRound: number;
    totalRounds: number;
    remainingPlayers: number;
    eliminatedPlayers: number;
    activeMatches: number;
    completedMatches: number;
    waitingMatches: number;
    expiredMatches: number;
    stuckMatches: number;
    byeMatches: number;
    timeLimitMatches: number;
    healthStatus: "HEALTHY" | "RECOVERY_NEEDED" | "CRITICAL";
  };
  matches: ControlCenterMatch[];
  players: ControlCenterPlayer[];
  notifications: {
    totalSent: number;
    totalPending: number;
    totalFailed: number;
    recent: {
      eventType: string;
      playerId: string;
      referenceId: string | null;
      sentAt: string;
    }[];
  };
  timeLimitMetrics: {
    gameId: string;
    normalCompletionCount: number;
    timeLimitCount: number;
    timeLimitPercentage: number;
  };
  auditLogs: {
    id: string;
    action: string;
    actorType: string;
    actorId: string | null;
    meta: unknown;
    createdAt: string;
  }[];
}

export async function getTournamentControlCenterData(tournamentId: string): Promise<TournamentControlCenterData> {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      players: {
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
              gameStats: true,
            },
          },
        },
        orderBy: { registeredAt: "asc" },
      },
      rounds: {
        orderBy: [{ roundNumber: "asc" }, { matchNumber: "asc" }],
      },
    },
  });

  if (!tournament) {
    throw new AppError("NOT_FOUND", "Tournament not found", 404);
  }

  const now = Date.now();

  // Fetch all matches referenced in tournament rounds
  const matchIds = tournament.rounds.map((r) => r.matchId).filter((id): id is string => Boolean(id));
  const matchesMap = new Map<string, any>();
  if (matchIds.length > 0) {
    const rawMatches = await prisma.match.findMany({
      where: { id: { in: matchIds } },
    });
    for (const m of rawMatches) {
      matchesMap.set(m.id, m);
    }
  }

  // Build match list
  let activeMatchesCount = 0;
  let completedMatchesCount = 0;
  let waitingMatchesCount = 0;
  let expiredMatchesCount = 0;
  let stuckMatchesCount = 0;
  let byeMatchesCount = 0;
  let timeLimitMatchesCount = 0;

  const playerLookup = new Map<string, any>();
  for (const p of tournament.players) {
    playerLookup.set(p.userId, p);
  }

  const totalRounds = tournament.rounds.length > 0 ? Math.max(...tournament.rounds.map((r) => r.roundNumber)) : 1;
  const currentRound = tournament.rounds.find((r) => r.status === "IN_PROGRESS")?.roundNumber
    ?? tournament.rounds.find((r) => r.status === "READY")?.roundNumber
    ?? totalRounds;

  const formattedMatches: ControlCenterMatch[] = tournament.rounds.map((r) => {
    const pA = r.playerAId ? playerLookup.get(r.playerAId) : null;
    const pB = r.playerBId ? playerLookup.get(r.playerBId) : null;
    const linkedMatch = r.matchId ? matchesMap.get(r.matchId) : null;

    if (r.isBye) byeMatchesCount++;
    if (r.status === "COMPLETED") completedMatchesCount++;
    if (r.status === "IN_PROGRESS") activeMatchesCount++;
    if (r.status === "PENDING" || r.status === "READY") waitingMatchesCount++;

    let remainingMs: number | null = null;
    let isExpired = false;
    let isStuck = false;

    if (linkedMatch?.startedAt) {
      const deadline = linkedMatch.matchDeadline?.getTime()
        ?? (linkedMatch.startedAt.getTime() + 600_000);
      remainingMs = Math.max(0, deadline - now);
      if (now >= deadline && linkedMatch.status !== "FINISHED") {
        isExpired = true;
        expiredMatchesCount++;
        isStuck = true;
        stuckMatchesCount++;
      }
    } else if (r.status === "IN_PROGRESS" && r.scheduledAt) {
      const deadline = r.scheduledAt.getTime() + 600_000;
      remainingMs = Math.max(0, deadline - now);
      if (now >= deadline) {
        isExpired = true;
        expiredMatchesCount++;
        isStuck = true;
        stuckMatchesCount++;
      }
    }

    if (linkedMatch?.resultReason === "MATCH_TIME_EXPIRED" || linkedMatch?.resultReason === "TIME_LIMIT") {
      timeLimitMatchesCount++;
    }

    return {
      slotId: r.id,
      roundNumber: r.roundNumber,
      matchNumber: r.matchNumber,
      status: r.status,
      isBye: r.isBye,
      playerA: pA
        ? {
            id: pA.userId,
            username: pA.user.username,
            displayName: pA.user.displayName,
            seed: pA.seed,
            score: r.playerAScore,
          }
        : null,
      playerB: pB
        ? {
            id: pB.userId,
            username: pB.user.username,
            displayName: pB.user.displayName,
            seed: pB.seed,
            score: r.playerBScore,
          }
        : null,
      winnerId: r.winnerId,
      matchId: r.matchId,
      startedAt: linkedMatch?.startedAt?.toISOString() ?? r.scheduledAt?.toISOString() ?? null,
      matchDeadline: linkedMatch?.matchDeadline?.toISOString() ?? null,
      remainingMs,
      isExpired,
      isStuck,
      resultReason: linkedMatch?.resultReason ?? null,
      stateVersion: tournament.stateVersion,
    };
  });

  // Build authoritative players list with registration sequence #1, #2, ...
  const formattedPlayers: ControlCenterPlayer[] = tournament.players.map((p, idx) => {
    const gs = p.user.gameStats?.find((g) => g.gameId === tournament.gameId);
    const userRating = gs ? 1200 + (gs.wins * 25) - (gs.losses * 15) : 1200;
    let status: "ACTIVE" | "ELIMINATED" | "CHAMPION" | "WAITING" = "ACTIVE";
    if (p.eliminated) {
      status = "ELIMINATED";
    } else if (tournament.status === "COMPLETED" && p.finalRank === 1) {
      status = "CHAMPION";
    } else if (tournament.status === "DRAFT" || tournament.status === "REGISTRATION_OPEN") {
      status = "WAITING";
    }

    return {
      registrationSequence: idx + 1,
      userId: p.userId,
      username: p.user.username,
      displayName: p.user.displayName,
      avatarUrl: p.user.avatarUrl,
      registeredAt: p.registeredAt.toISOString(),
      seed: p.seed,
      rating: userRating,
      eliminated: p.eliminated,
      eliminatedInRound: p.eliminatedInRound,
      finalRank: p.finalRank,
      currentRound,
      status,
    };
  });

  // Fetch notification delivery monitor items
  const notificationRows = await prisma.tournamentNotificationIdempotency.findMany({
    where: { tournamentId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const recentNotifications = notificationRows.map((n) => ({
    eventType: n.eventType,
    playerId: n.playerId,
    referenceId: n.referenceId,
    sentAt: n.createdAt.toISOString(),
  }));

  // Fetch audit logs
  const auditRows = await prisma.auditLog.findMany({
    where: {
      OR: [
        { targetId: tournamentId },
        { meta: { path: ["tournamentId"], equals: tournamentId } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const formattedAuditLogs = auditRows.map((a) => ({
    id: a.id,
    action: a.action,
    actorType: a.actorType,
    actorId: a.actorId,
    meta: a.meta,
    createdAt: a.createdAt.toISOString(),
  }));

  // Calculate game time limit metrics
  const normalCount = completedMatchesCount - timeLimitMatchesCount;
  const timeLimitPct = completedMatchesCount > 0 ? Math.round((timeLimitMatchesCount / completedMatchesCount) * 100) : 0;

  const remainingPlayers = formattedPlayers.filter((p) => !p.eliminated).length;
  const eliminatedPlayers = formattedPlayers.filter((p) => p.eliminated).length;

  const healthStatus = stuckMatchesCount > 0 ? "RECOVERY_NEEDED" : "HEALTHY";

  return {
    tournament: {
      id: tournament.id,
      gameId: tournament.gameId,
      title: tournament.title,
      description: tournament.description,
      status: tournament.status,
      format: tournament.format,
      seedMethod: tournament.seedMethod,
      entryFee: tournament.entryFee,
      prizePool: tournament.prizePool,
      grossPool: tournament.grossPool,
      minPlayers: tournament.minPlayers,
      maxPlayers: tournament.maxPlayers,
      startTime: tournament.startTime.toISOString(),
      registrationStartsAt: tournament.registrationStartsAt?.toISOString() ?? null,
      registrationEndsAt: tournament.registrationEndsAt?.toISOString() ?? null,
      endTime: tournament.endTime?.toISOString() ?? null,
      settledAt: tournament.settledAt?.toISOString() ?? null,
      stateVersion: tournament.stateVersion,
      rules: tournament.rules,
    },
    summary: {
      maxPlayers: tournament.maxPlayers,
      registeredPlayers: tournament.players.length,
      availableSlots: Math.max(0, tournament.maxPlayers - tournament.players.length),
      minPlayers: tournament.minPlayers,
      currentRound,
      totalRounds,
      remainingPlayers,
      eliminatedPlayers,
      activeMatches: activeMatchesCount,
      completedMatches: completedMatchesCount,
      waitingMatches: waitingMatchesCount,
      expiredMatches: expiredMatchesCount,
      stuckMatches: stuckMatchesCount,
      byeMatches: byeMatchesCount,
      timeLimitMatches: timeLimitMatchesCount,
      healthStatus,
    },
    matches: formattedMatches,
    players: formattedPlayers,
    notifications: {
      totalSent: notificationRows.length,
      totalPending: 0,
      totalFailed: 0,
      recent: recentNotifications,
    },
    timeLimitMetrics: {
      gameId: tournament.gameId,
      normalCompletionCount: Math.max(0, normalCount),
      timeLimitCount: timeLimitMatchesCount,
      timeLimitPercentage: timeLimitPct,
    },
    auditLogs: formattedAuditLogs,
  };
}

export async function overrideTournamentMatchResult(params: {
  tournamentId: string;
  slotId: string;
  winnerId: string;
  reason: string;
  adminId: string;
}): Promise<void> {
  const { tournamentId, slotId, winnerId, reason, adminId } = params;

  if (!reason || reason.trim().length < 5) {
    throw new AppError("VALIDATION_ERROR", "A valid reason of at least 5 characters is required for result override", 400);
  }

  const slot = await prisma.tournamentRound.findUnique({
    where: { id: slotId },
  });

  if (!slot || slot.tournamentId !== tournamentId) {
    throw new AppError("NOT_FOUND", "Tournament slot not found", 404);
  }

  if (slot.playerAId !== winnerId && slot.playerBId !== winnerId) {
    throw new AppError("INVALID_ACTION", "Winner must be one of the assigned players in this slot", 400);
  }

  const loserId = slot.playerAId === winnerId ? slot.playerBId : slot.playerAId;

  // Mark match finished if exists
  if (slot.matchId) {
    await prisma.match.update({
      where: { id: slot.matchId },
      data: {
        status: "FINISHED",
        endedAt: new Date(),
        winnerIds: [winnerId],
        resultReason: `ADMIN_OVERRIDE: ${reason}`,
      },
    }).catch(() => undefined);
  }

  const prevWinner = slot.winnerId;

  // Execute standard idempotent advancement
  await processMatchResult({
    matchId: slot.matchId ?? `override_${slot.tournamentId}_${slot.id}_${Date.now()}`,
    tournamentId,
    roundId: slot.id,
    winnerId,
    loserId: loserId ?? undefined,
  });

  // Record audited event
  audit({
    actorType: "user",
    actorId: adminId,
    action: "tournament.admin_result_override",
    category: "admin",
    targetType: "tournament",
    targetId: tournamentId,
    meta: {
      slotId,
      matchId: slot.matchId,
      previousWinnerId: prevWinner,
      winnerId,
      loserId,
      reason,
    },
  });
}
