import { prisma } from "@gaming-hub/db";
import { AppError } from "@gaming-hub/shared";
import type { TournamentStatus, BracketSlotStatus } from "@gaming-hub/shared";

export interface PlayerMyTournamentsItem {
  tournamentId: string;
  title: string;
  gameId: string;
  status: TournamentStatus;
  format: string;
  entryFee: number;
  prizePool: number;
  grossPool: number;
  registeredPlayers: number;
  maxPlayers: number;
  minPlayers: number;
  currentRound: number;
  totalRounds: number;
  remainingPlayers: number;
  startTime: string;
  mySeed: number | null;
  myRegistrationSequence: number;
  myStatus:
    | "REGISTERED"
    | "WAITING"
    | "MATCH_READY"
    | "LIVE"
    | "ADVANCED"
    | "ELIMINATED"
    | "WINNER"
    | "COMPLETED";
  eliminated: boolean;
  eliminatedInRound: number | null;
  finalRank: number | null;
  prizeWon: number | null;
  myCurrentMatch: {
    matchId: string | null;
    slotId: string;
    roundNumber: number;
    matchNumber: number;
    status: BracketSlotStatus;
    opponent: {
      userId: string;
      username: string;
      displayName: string;
      avatarUrl: string | null;
      seed: number | null;
    } | null;
    remainingMs: number | null;
    matchDeadline: string | null;
    startedAt: string | null;
    myScore: number;
    opponentScore: number;
    resultReason: string | null;
  } | null;
  myResultSummary: string;
}

export interface PlayerTournamentDashboardData {
  tournament: {
    id: string;
    title: string;
    gameId: string;
    description: string;
    status: TournamentStatus;
    format: string;
    seedMethod: string;
    entryFee: number;
    prizePool: number;
    grossPool: number;
    minPlayers: number;
    maxPlayers: number;
    registeredPlayers: number;
    availableSlots: number;
    currentRound: number;
    totalRounds: number;
    remainingPlayers: number;
    startTime: string;
    stateVersion: number;
    rules: any;
    prizeDistribution: any;
  };
  player: {
    userId: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
    registeredAt: string;
    seed: number | null;
    registrationSequence: number;
    rating: number;
    status:
      | "REGISTERED"
      | "WAITING"
      | "MATCH_READY"
      | "LIVE"
      | "ADVANCED"
      | "ELIMINATED"
      | "WINNER"
      | "COMPLETED";
    eliminated: boolean;
    eliminatedInRound: number | null;
    finalRank: number | null;
    prizeWon: number | null;
  };
  myCurrentMatch: {
    slotId: string;
    matchId: string | null;
    roundNumber: number;
    matchNumber: number;
    status: "WAITING" | "READY" | "IN_PROGRESS" | "COMPLETED";
    opponent: {
      userId: string;
      username: string;
      displayName: string;
      avatarUrl: string | null;
      seed: number | null;
    } | null;
    myScore: number;
    opponentScore: number;
    startedAt: string | null;
    matchDeadline: string | null;
    remainingMs: number | null;
    isExpired: boolean;
    resultReason: string | null;
  } | null;
  myMatchHistory: {
    roundNumber: number;
    matchNumber: number;
    matchId: string | null;
    opponent: {
      userId: string;
      username: string;
      displayName: string;
      avatarUrl: string | null;
      seed: number | null;
    } | null;
    result: "WIN" | "LOSS" | "DRAW";
    myScore: number;
    opponentScore: number;
    durationSeconds: number;
    resultReason: string;
    replayAvailable: boolean;
  }[];
  stats: {
    matchesPlayed: number;
    wins: number;
    losses: number;
    currentRound: number;
    highestRound: number;
    timeLimitMatches: number;
    winRate: number;
  };
  roundProgress: {
    roundNumber: number;
    name: string;
    status: "COMPLETED" | "CURRENT" | "UPCOMING";
  }[];
  myPathSlotIds: string[];
}

function getRoundName(roundNumber: number, totalRounds: number): string {
  if (totalRounds <= 1) return "Final";
  if (roundNumber === totalRounds) return "Final";
  if (roundNumber === totalRounds - 1) return "Semi-Final";
  if (roundNumber === totalRounds - 2) return "Quarter-Final";
  return `Round ${roundNumber}`;
}

/**
 * Lists all tournaments for a player across all participation statuses
 */
export async function getPlayerTournamentsList(userId: string): Promise<PlayerMyTournamentsItem[]> {
  const registrations = await prisma.tournamentPlayer.findMany({
    where: { userId },
    include: {
      tournament: {
        include: {
          players: {
            orderBy: { registeredAt: "asc" },
            select: { userId: true, eliminated: true, finalRank: true, registeredAt: true },
          },
          rounds: {
            orderBy: [{ roundNumber: "asc" }, { matchNumber: "asc" }],
          },
          prizes: {
            where: { userId },
          },
        },
      },
    },
    orderBy: {
      registeredAt: "desc",
    },
  });

  const matchIds = registrations
    .flatMap((r) => r.tournament.rounds.map((slot) => slot.matchId))
    .filter((id): id is string => Boolean(id));

  const matches = matchIds.length > 0
    ? await prisma.match.findMany({
        where: { id: { in: matchIds } },
        select: {
          id: true,
          status: true,
          startedAt: true,
          endedAt: true,
          matchDeadline: true,
          resultReason: true,
          winnerIds: true,
        },
      })
    : [];
  const matchMap = new Map(matches.map((m) => [m.id, m]));

  // Get opponent user details
  const opponentUserIds = new Set<string>();
  for (const reg of registrations) {
    for (const slot of reg.tournament.rounds) {
      if (slot.playerAId === userId && slot.playerBId) opponentUserIds.add(slot.playerBId);
      if (slot.playerBId === userId && slot.playerAId) opponentUserIds.add(slot.playerAId);
    }
  }

  const oppUsers = opponentUserIds.size > 0
    ? await prisma.user.findMany({
        where: { id: { in: Array.from(opponentUserIds) } },
        select: { id: true, username: true, displayName: true, avatarUrl: true },
      })
    : [];
  const oppUserMap = new Map(oppUsers.map((u) => [u.id, u]));

  return registrations.map((reg) => {
    const t = reg.tournament;
    const allPlayers = t.players;
    const regSeq = allPlayers.findIndex((p) => p.userId === userId) + 1;
    const remainingPlayers = allPlayers.filter((p) => !p.eliminated).length;
    const totalRounds = t.rounds.length > 0 ? Math.max(...t.rounds.map((r) => r.roundNumber)) : 1;

    // Find current active round in tournament
    const liveRound = t.rounds.find((r) => r.status === "IN_PROGRESS" || r.status === "READY");
    const currentRound = liveRound ? liveRound.roundNumber : (t.status === "COMPLETED" || t.status === "SETTLED" ? totalRounds : 1);

    // Find player's active or latest match slot
    const mySlots = t.rounds.filter((r) => r.playerAId === userId || r.playerBId === userId);
    const activeSlot = mySlots.find((r) => r.status === "READY" || r.status === "IN_PROGRESS");
    const latestSlot = mySlots.length > 0 ? mySlots[mySlots.length - 1] : null;

    let myStatus: PlayerMyTournamentsItem["myStatus"] = "REGISTERED";
    let myResultSummary = "Registered";

    if (t.status === "DRAFT" || t.status === "REGISTRATION_OPEN" || t.status === "REGISTRATION_CLOSED") {
      myStatus = "REGISTERED";
      myResultSummary = `Registered (#${regSeq})`;
    } else if (t.status === "COMPLETED" || t.status === "SETTLED") {
      if (reg.finalRank === 1) {
        myStatus = "WINNER";
        myResultSummary = "🏆 Tournament Winner";
      } else if (reg.eliminated) {
        myStatus = "ELIMINATED";
        myResultSummary = `Eliminated in ${getRoundName(reg.eliminatedInRound ?? totalRounds, totalRounds)}`;
      } else {
        myStatus = "COMPLETED";
        myResultSummary = reg.finalRank ? `Finished #${reg.finalRank}` : "Completed";
      }
    } else if (reg.eliminated) {
      myStatus = "ELIMINATED";
      myResultSummary = `Eliminated in ${getRoundName(reg.eliminatedInRound ?? currentRound, totalRounds)}`;
    } else if (activeSlot) {
      if (activeSlot.status === "IN_PROGRESS") {
        myStatus = "LIVE";
        myResultSummary = "Match In Progress";
      } else {
        myStatus = "MATCH_READY";
        myResultSummary = "Match Ready — Join Now";
      }
    } else if (latestSlot && latestSlot.winnerId === userId && latestSlot.roundNumber < totalRounds) {
      myStatus = "ADVANCED";
      myResultSummary = `Advanced to ${getRoundName(latestSlot.roundNumber + 1, totalRounds)}`;
    } else {
      myStatus = "WAITING";
      myResultSummary = "Waiting for Next Round";
    }

    // Build myCurrentMatch
    let currentMatchObj: PlayerMyTournamentsItem["myCurrentMatch"] = null;
    const targetSlot = activeSlot || (latestSlot && latestSlot.status !== "COMPLETED" ? latestSlot : null);
    if (targetSlot) {
      const oppId = targetSlot.playerAId === userId ? targetSlot.playerBId : targetSlot.playerAId;
      const oppUser = oppId ? oppUserMap.get(oppId) : null;
      const oppPlayer = oppId ? allPlayers.find((p) => p.userId === oppId) : null;
      const linkedMatch = targetSlot.matchId ? matchMap.get(targetSlot.matchId) : null;

      const isPlayerA = targetSlot.playerAId === userId;
      const myScore = isPlayerA ? targetSlot.playerAScore : targetSlot.playerBScore;
      const oppScore = isPlayerA ? targetSlot.playerBScore : targetSlot.playerAScore;

      let remainingMs: number | null = null;
      if (linkedMatch?.matchDeadline) {
        remainingMs = Math.max(0, linkedMatch.matchDeadline.getTime() - Date.now());
      }

      currentMatchObj = {
        matchId: targetSlot.matchId,
        slotId: targetSlot.id,
        roundNumber: targetSlot.roundNumber,
        matchNumber: targetSlot.matchNumber,
        status: targetSlot.status,
        opponent: oppUser
          ? {
              userId: oppUser.id,
              username: oppUser.username,
              displayName: oppUser.displayName,
              avatarUrl: oppUser.avatarUrl,
              seed: oppPlayer ? (oppPlayer as any).seed ?? null : null,
            }
          : null,
        remainingMs,
        matchDeadline: linkedMatch?.matchDeadline?.toISOString() ?? null,
        startedAt: linkedMatch?.startedAt?.toISOString() ?? targetSlot.scheduledAt?.toISOString() ?? null,
        myScore,
        opponentScore: oppScore,
        resultReason: linkedMatch?.resultReason ?? null,
      };
    }

    const prizeWon = t.prizes.length > 0 ? t.prizes.reduce((sum, p) => sum + p.amount, 0) : null;

    return {
      tournamentId: t.id,
      title: t.title,
      gameId: t.gameId,
      status: t.status,
      format: t.format,
      entryFee: t.entryFee,
      prizePool: t.prizePool,
      grossPool: t.grossPool || t.prizePool,
      registeredPlayers: allPlayers.length,
      maxPlayers: t.maxPlayers,
      minPlayers: t.minPlayers,
      currentRound,
      totalRounds,
      remainingPlayers,
      startTime: t.startTime.toISOString(),
      mySeed: reg.seed,
      myRegistrationSequence: regSeq,
      myStatus,
      eliminated: reg.eliminated,
      eliminatedInRound: reg.eliminatedInRound,
      finalRank: reg.finalRank,
      prizeWon,
      myCurrentMatch: currentMatchObj,
      myResultSummary,
    };
  });
}

/**
 * Get detailed dashboard for a specific tournament for the current player
 */
export async function getPlayerTournamentDashboard(
  tournamentId: string,
  userId: string,
): Promise<PlayerTournamentDashboardData> {
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
      prizes: {
        where: { userId },
      },
    },
  });

  if (!tournament) {
    throw new AppError("NOT_FOUND", "Tournament not found", 404);
  }

  const regIndex = tournament.players.findIndex((p) => p.userId === userId);
  const myPlayer = regIndex !== -1 ? tournament.players[regIndex] : null;

  if (!myPlayer) {
    throw new AppError("FORBIDDEN", "You are not registered in this tournament", 403);
  }

  const allPlayers = tournament.players;
  const playerMap = new Map(allPlayers.map((p) => [p.userId, p]));
  const totalRounds = tournament.rounds.length > 0 ? Math.max(...tournament.rounds.map((r) => r.roundNumber)) : 1;
  const remainingPlayers = allPlayers.filter((p) => !p.eliminated).length;

  // Active round in tournament
  const activeRoundSlot = tournament.rounds.find((r) => r.status === "IN_PROGRESS" || r.status === "READY");
  const currentRoundNumber = activeRoundSlot ? activeRoundSlot.roundNumber : (tournament.status === "COMPLETED" || tournament.status === "SETTLED" ? totalRounds : 1);

  // Fetch match details
  const matchIds = tournament.rounds
    .map((r) => r.matchId)
    .filter((id): id is string => Boolean(id));

  const matches = matchIds.length > 0
    ? await prisma.match.findMany({
        where: { id: { in: matchIds } },
        select: {
          id: true,
          status: true,
          startedAt: true,
          endedAt: true,
          matchDeadline: true,
          resultReason: true,
          winnerIds: true,
        },
      })
    : [];
  const matchMap = new Map(matches.map((m) => [m.id, m]));

  // Find all slots where current player participated
  const mySlots = tournament.rounds.filter(
    (r) => r.playerAId === userId || r.playerBId === userId,
  );

  const activeSlot = mySlots.find((r) => r.status === "READY" || r.status === "IN_PROGRESS");
  const completedSlots = mySlots.filter((r) => r.status === "COMPLETED");
  const latestSlot = mySlots.length > 0 ? mySlots[mySlots.length - 1] : null;

  // Calculate my status
  let myStatus: PlayerTournamentDashboardData["player"]["status"] = "REGISTERED";
  if (tournament.status === "DRAFT" || tournament.status === "REGISTRATION_OPEN" || tournament.status === "REGISTRATION_CLOSED") {
    myStatus = "REGISTERED";
  } else if (tournament.status === "COMPLETED" || tournament.status === "SETTLED") {
    if (myPlayer.finalRank === 1) {
      myStatus = "WINNER";
    } else if (myPlayer.eliminated) {
      myStatus = "ELIMINATED";
    } else {
      myStatus = "COMPLETED";
    }
  } else if (myPlayer.eliminated) {
    myStatus = "ELIMINATED";
  } else if (activeSlot) {
    myStatus = activeSlot.status === "IN_PROGRESS" ? "LIVE" : "MATCH_READY";
  } else if (latestSlot && latestSlot.winnerId === userId && latestSlot.roundNumber < totalRounds) {
    myStatus = "ADVANCED";
  } else {
    myStatus = "WAITING";
  }

  // Calculate user rating
  const gs = myPlayer.user.gameStats?.find((g) => g.gameId === tournament.gameId);
  const rating = gs ? 1200 + (gs.wins * 25) - (gs.losses * 15) : 1200;

  // Build myCurrentMatch object
  let currentMatch: PlayerTournamentDashboardData["myCurrentMatch"] = null;
  const focusSlot = activeSlot || (myStatus === "ADVANCED" ? null : (latestSlot && latestSlot.status !== "COMPLETED" ? latestSlot : null));

  if (focusSlot) {
    const oppId = focusSlot.playerAId === userId ? focusSlot.playerBId : focusSlot.playerAId;
    const oppPlayer = oppId ? playerMap.get(oppId) : null;
    const linkedMatch = focusSlot.matchId ? matchMap.get(focusSlot.matchId) : null;

    const isPlayerA = focusSlot.playerAId === userId;
    const myScore = isPlayerA ? focusSlot.playerAScore : focusSlot.playerBScore;
    const oppScore = isPlayerA ? focusSlot.playerBScore : focusSlot.playerAScore;

    let remainingMs: number | null = null;
    let isExpired = false;
    if (linkedMatch?.matchDeadline) {
      remainingMs = Math.max(0, linkedMatch.matchDeadline.getTime() - Date.now());
      isExpired = remainingMs === 0;
    }

    currentMatch = {
      slotId: focusSlot.id,
      matchId: focusSlot.matchId,
      roundNumber: focusSlot.roundNumber,
      matchNumber: focusSlot.matchNumber,
      status: focusSlot.status === "IN_PROGRESS" ? "IN_PROGRESS" : focusSlot.status === "READY" ? "READY" : focusSlot.status === "COMPLETED" ? "COMPLETED" : "WAITING",
      opponent: oppPlayer
        ? {
            userId: oppPlayer.userId,
            username: oppPlayer.user.username,
            displayName: oppPlayer.user.displayName,
            avatarUrl: oppPlayer.user.avatarUrl,
            seed: oppPlayer.seed,
          }
        : null,
      myScore,
      opponentScore: oppScore,
      startedAt: linkedMatch?.startedAt?.toISOString() ?? focusSlot.scheduledAt?.toISOString() ?? null,
      matchDeadline: linkedMatch?.matchDeadline?.toISOString() ?? null,
      remainingMs,
      isExpired,
      resultReason: linkedMatch?.resultReason ?? null,
    };
  }

  // Build myMatchHistory
  const myMatchHistory: PlayerTournamentDashboardData["myMatchHistory"] = completedSlots.map((slot) => {
    const oppId = slot.playerAId === userId ? slot.playerBId : slot.playerAId;
    const oppPlayer = oppId ? playerMap.get(oppId) : null;
    const isPlayerA = slot.playerAId === userId;
    const myScore = isPlayerA ? slot.playerAScore : slot.playerBScore;
    const oppScore = isPlayerA ? slot.playerBScore : slot.playerAScore;
    const linkedMatch = slot.matchId ? matchMap.get(slot.matchId) : null;

    let result: "WIN" | "LOSS" | "DRAW" = "DRAW";
    if (slot.winnerId === userId) {
      result = "WIN";
    } else if (slot.winnerId && slot.winnerId !== userId) {
      result = "LOSS";
    }

    let durationSeconds = 0;
    if (linkedMatch?.startedAt && linkedMatch?.endedAt) {
      durationSeconds = Math.max(0, Math.floor((linkedMatch.endedAt.getTime() - linkedMatch.startedAt.getTime()) / 1000));
    }

    return {
      roundNumber: slot.roundNumber,
      matchNumber: slot.matchNumber,
      matchId: slot.matchId,
      opponent: oppPlayer
        ? {
            userId: oppPlayer.userId,
            username: oppPlayer.user.username,
            displayName: oppPlayer.user.displayName,
            avatarUrl: oppPlayer.user.avatarUrl,
            seed: oppPlayer.seed,
          }
        : null,
      result,
      myScore,
      opponentScore: oppScore,
      durationSeconds,
      resultReason: linkedMatch?.resultReason ?? "NORMAL",
      replayAvailable: Boolean(slot.matchId),
    };
  });

  // Calculate player statistics
  const wins = myMatchHistory.filter((m) => m.result === "WIN").length;
  const losses = myMatchHistory.filter((m) => m.result === "LOSS").length;
  const matchesPlayed = myMatchHistory.length + (activeSlot ? 1 : 0);
  const highestRound = mySlots.length > 0 ? Math.max(...mySlots.map((s) => s.roundNumber)) : 1;
  const timeLimitMatches = myMatchHistory.filter((m) => m.resultReason.toUpperCase().includes("TIME")).length;
  const winRate = myMatchHistory.length > 0 ? Math.round((wins / myMatchHistory.length) * 100) : 0;

  // Build round progress stepper
  const roundProgress: PlayerTournamentDashboardData["roundProgress"] = Array.from(
    { length: totalRounds },
    (_, i) => {
      const rNum = i + 1;
      let status: "COMPLETED" | "CURRENT" | "UPCOMING" = "UPCOMING";
      if (rNum < currentRoundNumber) {
        status = "COMPLETED";
      } else if (rNum === currentRoundNumber) {
        status = tournament.status === "COMPLETED" || tournament.status === "SETTLED" ? "COMPLETED" : "CURRENT";
      } else {
        status = "UPCOMING";
      }
      return {
        roundNumber: rNum,
        name: getRoundName(rNum, totalRounds),
        status,
      };
    },
  );

  // Collect player bracket path slot IDs for visual bracket highlighting
  const myPathSlotIds = mySlots.map((s) => s.id);

  const prizeWon = tournament.prizes.length > 0
    ? tournament.prizes.reduce((sum, p) => sum + p.amount, 0)
    : null;

  return {
    tournament: {
      id: tournament.id,
      title: tournament.title,
      gameId: tournament.gameId,
      description: tournament.description,
      status: tournament.status,
      format: tournament.format,
      seedMethod: tournament.seedMethod,
      entryFee: tournament.entryFee,
      prizePool: tournament.prizePool,
      grossPool: tournament.grossPool || tournament.prizePool,
      minPlayers: tournament.minPlayers,
      maxPlayers: tournament.maxPlayers,
      registeredPlayers: allPlayers.length,
      availableSlots: Math.max(0, tournament.maxPlayers - allPlayers.length),
      currentRound: currentRoundNumber,
      totalRounds,
      remainingPlayers,
      startTime: tournament.startTime.toISOString(),
      stateVersion: tournament.stateVersion,
      rules: tournament.rules,
      prizeDistribution: tournament.prizeDistribution,
    },
    player: {
      userId: myPlayer.userId,
      username: myPlayer.user.username,
      displayName: myPlayer.user.displayName,
      avatarUrl: myPlayer.user.avatarUrl,
      registeredAt: myPlayer.registeredAt.toISOString(),
      seed: myPlayer.seed,
      registrationSequence: regIndex + 1,
      rating,
      status: myStatus,
      eliminated: myPlayer.eliminated,
      eliminatedInRound: myPlayer.eliminatedInRound,
      finalRank: myPlayer.finalRank,
      prizeWon,
    },
    myCurrentMatch: currentMatch,
    myMatchHistory,
    stats: {
      matchesPlayed,
      wins,
      losses,
      currentRound: currentRoundNumber,
      highestRound,
      timeLimitMatches,
      winRate,
    },
    roundProgress,
    myPathSlotIds,
  };
}
