import { prisma, Prisma } from "@gaming-hub/db";
import {
  AppError,
  clampPagination,
  type TournamentPlayerLiveStatus,
  type TournamentStandingsEntry,
  type TournamentRoundProgressItem,
  type TournamentLeaderboardResponse,
  type PlayerTournamentCareerStats,
  type GameTournamentRankingEntry,
} from "@gaming-hub/shared";
import { audit } from "./audit";

export interface UpdateOnMatchCompleteParams {
  tournamentId: string;
  matchId: string;
  roundId: string;
  roundNumber: number;
  winnerId: string;
  loserId?: string | null;
  winnerScore: number;
  loserScore: number;
}

export interface CorrectMatchAndRecalculateParams {
  tournamentId: string;
  matchId: string;
  adminId: string;
  reason: string;
  newWinnerId: string;
  newScores?: Record<string, number>;
}

export class TournamentLeaderboardService {
  /**
   * Process authoritative match completion for tournament player stats & leaderboard.
   * Executes idempotently: checks if result was already processed.
   */
  static async updateOnMatchComplete(
    params: UpdateOnMatchCompleteParams,
    client: Prisma.TransactionClient | typeof prisma = prisma,
  ): Promise<void> {
    const { tournamentId, matchId, roundNumber, winnerId, loserId, winnerScore, loserScore } = params;

    const tournament = await client.tournament.findUnique({
      where: { id: tournamentId },
      select: { id: true, gameId: true, status: true, title: true },
    });
    if (!tournament) return;

    // Check if tournament has already finished (frozen standings)
    if (
      tournament.status === "COMPLETED" ||
      tournament.status === "SETTLING" ||
      tournament.status === "SETTLED" ||
      tournament.status === "CANCELLED"
    ) {
      return;
    }

    // Match-level idempotency check: if match was already processed in idempotency table, skip
    const alreadyProcessed = await client.tournamentResultIdempotency.findUnique({
      where: { matchId },
    }).catch(() => null);

    if (alreadyProcessed) {
      return;
    }

    // 1. Update Winner TournamentPlayer record
    const winnerPlayer = await client.tournamentPlayer.findUnique({
      where: { tournamentId_userId: { tournamentId, userId: winnerId } },
    });

    if (winnerPlayer) {
      await client.tournamentPlayer.update({
        where: { id: winnerPlayer.id },
        data: {
          wins: { increment: 1 },
          matchesPlayed: { increment: 1 },
          points: { increment: 3 },
          scoreFor: { increment: winnerScore },
          scoreAgainst: { increment: loserScore },
          liveStatus: "ADVANCED",
          currentRound: Math.max(winnerPlayer.currentRound, roundNumber + 1),
        },
      });
    }

    // 2. Update Loser TournamentPlayer record
    if (loserId) {
      const loserPlayer = await client.tournamentPlayer.findUnique({
        where: { tournamentId_userId: { tournamentId, userId: loserId } },
      });

      if (loserPlayer) {
        await client.tournamentPlayer.update({
          where: { id: loserPlayer.id },
          data: {
            losses: { increment: 1 },
            matchesPlayed: { increment: 1 },
            scoreFor: { increment: loserScore },
            scoreAgainst: { increment: winnerScore },
            liveStatus: "ELIMINATED",
            eliminated: true,
            eliminatedInRound: roundNumber,
          },
        });
      }
    }

    // 3. Update game-specific stats in PlayerGameStats
    if (tournament.gameId) {
      await this.updatePlayerGameStats(winnerId, tournament.gameId, true, client).catch(() => undefined);
      if (loserId) {
        await this.updatePlayerGameStats(loserId, tournament.gameId, false, client).catch(() => undefined);
      }
    }

    // 4. Recalculate dynamic standings
    await this.recalculateTournamentStandings(tournamentId, client);
  }

  /**
   * Helper to update game-specific stats in PlayerGameStats
   */
  private static async updatePlayerGameStats(
    userId: string,
    gameId: string,
    isWin: boolean,
    client: Prisma.TransactionClient | typeof prisma = prisma,
  ): Promise<void> {
    const existing = await client.playerGameStats.findUnique({
      where: { userId_gameId: { userId, gameId } },
    });

    if (!existing) {
      await client.playerGameStats.create({
        data: {
          userId,
          gameId,
          totalMatches: 1,
          rankedMatches: 1,
          wins: isWin ? 1 : 0,
          losses: isWin ? 0 : 1,
          winRate: isWin ? 100 : 0,
          currentWinStreak: isWin ? 1 : 0,
          longestWinStreak: isWin ? 1 : 0,
          currentLossStreak: isWin ? 0 : 1,
          longestLossStreak: isWin ? 0 : 1,
          lastMatchAt: new Date(),
        },
      });
    } else {
      const totalMatches = existing.totalMatches + 1;
      const wins = existing.wins + (isWin ? 1 : 0);
      const losses = existing.losses + (isWin ? 0 : 1);
      const winRate = Number(((wins / totalMatches) * 100).toFixed(2));
      const currentWinStreak = isWin ? existing.currentWinStreak + 1 : 0;
      const longestWinStreak = Math.max(existing.longestWinStreak, currentWinStreak);
      const currentLossStreak = !isWin ? existing.currentLossStreak + 1 : 0;
      const longestLossStreak = Math.max(existing.longestLossStreak, currentLossStreak);

      await client.playerGameStats.update({
        where: { id: existing.id },
        data: {
          totalMatches,
          rankedMatches: existing.rankedMatches + 1,
          wins,
          losses,
          winRate,
          currentWinStreak,
          longestWinStreak,
          currentLossStreak,
          longestLossStreak,
          lastMatchAt: new Date(),
        },
      });
    }
  }

  /**
   * Authoritatively computes rank positions (1..N) based on tournament progression,
   * rounds reached, points, score differential, and seed.
   */
  static async recalculateTournamentStandings(
    tournamentId: string,
    client: Prisma.TransactionClient | typeof prisma = prisma,
  ): Promise<void> {
    const players = await client.tournamentPlayer.findMany({
      where: { tournamentId },
    });
    if (players.length === 0) return;

    // Find the final round slots
    const maxRoundAgg = await client.tournamentRound.aggregate({
      where: { tournamentId },
      _max: { roundNumber: true },
    });
    const maxRound = maxRoundAgg._max.roundNumber ?? 1;

    const finalSlot = await client.tournamentRound.findFirst({
      where: { tournamentId, roundNumber: maxRound },
    });

    const isFinalCompleted = finalSlot?.status === "COMPLETED" && finalSlot.winnerId;

    // Sort players according to authoritative single-elimination tournament rules:
    // 1. If final is completed: champion is #1, final runner-up is #2
    // 2. Non-eliminated / advancing players (by current round desc, points desc, score diff desc, seed asc)
    // 3. Eliminated players (by eliminatedInRound desc, points desc, score diff desc, seed asc)
    const sorted = [...players].sort((a, b) => {
      if (isFinalCompleted) {
        if (a.userId === finalSlot.winnerId) return -1;
        if (b.userId === finalSlot.winnerId) return 1;

        const runnerUpId = finalSlot.playerAId === finalSlot.winnerId ? finalSlot.playerBId : finalSlot.playerAId;
        if (runnerUpId) {
          if (a.userId === runnerUpId) return -1;
          if (b.userId === runnerUpId) return 1;
        }
      }

      // Active vs Eliminated
      if (!a.eliminated && b.eliminated) return -1;
      if (a.eliminated && !b.eliminated) return 1;

      // If both active: sort by currentRound desc, then points desc, scoreDiff desc, seed asc
      if (!a.eliminated && !b.eliminated) {
        if (b.currentRound !== a.currentRound) return b.currentRound - a.currentRound;
        if (b.points !== a.points) return b.points - a.points;
        const diffA = a.scoreFor - a.scoreAgainst;
        const diffB = b.scoreFor - b.scoreAgainst;
        if (diffB !== diffA) return diffB - diffA;
        return (a.seed ?? 9999) - (b.seed ?? 9999);
      }

      // If both eliminated: sort by eliminatedInRound desc, points desc, scoreDiff desc, seed asc
      const roundA = a.eliminatedInRound ?? 0;
      const roundB = b.eliminatedInRound ?? 0;
      if (roundB !== roundA) return roundB - roundA;

      if (b.points !== a.points) return b.points - a.points;
      const diffA = a.scoreFor - a.scoreAgainst;
      const diffB = b.scoreFor - b.scoreAgainst;
      if (diffB !== diffA) return diffB - diffA;
      return (a.seed ?? 9999) - (b.seed ?? 9999);
    });

    // Update result rank for all players
    for (let i = 0; i < sorted.length; i++) {
      const p = sorted[i];
      const rank = i + 1;
      await client.tournamentPlayer.update({
        where: { id: p.id },
        data: { result: rank },
      });
    }
  }

  /**
   * Permanently freezes final standings upon tournament completion.
   */
  static async freezeFinalStandings(
    tournamentId: string,
    client: Prisma.TransactionClient | typeof prisma = prisma,
  ): Promise<void> {
    const maxRoundAgg = await client.tournamentRound.aggregate({
      where: { tournamentId },
      _max: { roundNumber: true },
    });
    const maxRound = maxRoundAgg._max.roundNumber ?? 1;

    const finalSlot = await client.tournamentRound.findFirst({
      where: { tournamentId, roundNumber: maxRound },
    });

    await this.recalculateTournamentStandings(tournamentId, client);

    const players = await client.tournamentPlayer.findMany({
      where: { tournamentId },
      orderBy: { result: "asc" },
    });

    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      const rank = p.result ?? i + 1;
      const isChampion = isFinalCompletedWinner(p.userId, finalSlot);
      const liveStatus: TournamentPlayerLiveStatus = isChampion ? "CHAMPION" : "ELIMINATED";

      await client.tournamentPlayer.update({
        where: { id: p.id },
        data: {
          finalRank: rank,
          liveStatus,
        },
      });
    }

    function isFinalCompletedWinner(userId: string, slot: any): boolean {
      return slot?.status === "COMPLETED" && slot?.winnerId === userId;
    }
  }

  /**
   * Retrieves paginated tournament leaderboard with filters, round progress, and viewer's rank.
   */
  static async getTournamentLeaderboard(
    tournamentId: string,
    params: {
      page?: number;
      pageSize?: number;
      search?: string;
      status?: string;
      roundNumber?: number;
      viewerId?: string;
    },
  ): Promise<TournamentLeaderboardResponse> {
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        rounds: {
          orderBy: { roundNumber: "asc" },
        },
        prizes: true,
      },
    });

    if (!tournament) {
      throw new AppError("NOT_FOUND", `Tournament ${tournamentId} not found`, 404);
    }

    const { page, pageSize } = clampPagination(params.page, params.pageSize);

    // Build Round Progress
    const totalRounds = tournament.rounds.reduce((max, r) => Math.max(max, r.roundNumber), 1);
    const roundsMap = new Map<number, typeof tournament.rounds>();
    for (const r of tournament.rounds) {
      const existing = roundsMap.get(r.roundNumber) || [];
      existing.push(r);
      roundsMap.set(r.roundNumber, existing);
    }

    const roundProgress: TournamentRoundProgressItem[] = [];
    for (let r = 1; r <= totalRounds; r++) {
      const slots = roundsMap.get(r) || [];
      const isCompleted = slots.length > 0 && slots.every((s) => s.status === "COMPLETED" || s.status === "BYE" || s.status === "CANCELLED");
      const isStarted = slots.some((s) => s.status === "IN_PROGRESS" || s.status === "READY" || s.status === "COMPLETED");

      let name = `Round ${r}`;
      if (r === totalRounds) name = "Finals";
      else if (r === totalRounds - 1) name = "Semi-Finals";
      else if (r === totalRounds - 2) name = "Quarter-Finals";

      const playerCount = slots.length * 2;

      roundProgress.push({
        roundNumber: r,
        name,
        playerCount,
        status: isCompleted ? "COMPLETED" : isStarted ? "IN_PROGRESS" : "UPCOMING",
      });
    }

    // Determine current round
    const activeRound = roundProgress.find((rp) => rp.status === "IN_PROGRESS")?.roundNumber ?? (
      tournament.status === "COMPLETED" || tournament.status === "SETTLED" ? totalRounds : 1
    );

    // Fetch all players for this tournament
    const allPlayers = await prisma.tournamentPlayer.findMany({
      where: { tournamentId },
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
      orderBy: [
        { finalRank: "asc" },
        { result: "asc" },
        { points: "desc" },
        { wins: "desc" },
      ],
    });

    const prizeMap = new Map<string, { amount: number; status: string }>();
    for (const p of tournament.prizes) {
      if (p.userId) {
        prizeMap.set(p.userId, { amount: p.amount, status: p.status });
      }
    }

    // Compute standings list with ranks
    const allStandings: TournamentStandingsEntry[] = allPlayers.map((p, idx) => {
      const calculatedRank = p.finalRank ?? p.result ?? (idx + 1);
      const prize = prizeMap.get(p.userId);
      const status = (p.liveStatus as TournamentPlayerLiveStatus) || (p.eliminated ? "ELIMINATED" : "WAITING");

      return {
        rank: calculatedRank,
        userId: p.userId,
        playerId: p.id,
        username: p.user?.username ?? "Unknown",
        displayName: p.user?.displayName ?? p.user?.username ?? "Unknown",
        avatarUrl: p.user?.avatarUrl ?? null,
        matchesPlayed: p.matchesPlayed,
        wins: p.wins,
        losses: p.losses,
        points: p.points,
        scoreFor: p.scoreFor,
        scoreAgainst: p.scoreAgainst,
        scoreDiff: p.scoreFor - p.scoreAgainst,
        status,
        currentRound: p.currentRound,
        eliminatedInRound: p.eliminatedInRound,
        finalRank: p.finalRank,
        prizeAmount: prize?.amount,
        prizeStatus: prize?.status,
        seed: p.seed,
      };
    });

    // Viewer's Rank
    let myRank: TournamentLeaderboardResponse["myRank"] = null;
    if (params.viewerId) {
      const myStanding = allStandings.find((s) => s.userId === params.viewerId);
      if (myStanding) {
        myRank = {
          rank: myStanding.rank,
          wins: myStanding.wins,
          losses: myStanding.losses,
          points: myStanding.points,
          status: myStanding.status,
          currentRound: myStanding.currentRound,
        };
      }
    }

    // Apply search filter
    let filteredStandings = allStandings;
    if (params.search && params.search.trim()) {
      const q = params.search.trim().toLowerCase();
      filteredStandings = filteredStandings.filter(
        (s) =>
          s.username.toLowerCase().includes(q) ||
          s.displayName.toLowerCase().includes(q),
      );
    }

    // Apply status filter
    if (params.status && params.status !== "ALL") {
      filteredStandings = filteredStandings.filter((s) => s.status === params.status);
    }

    // Apply round filter
    if (params.roundNumber && params.roundNumber > 0) {
      filteredStandings = filteredStandings.filter(
        (s) => s.currentRound === params.roundNumber || s.eliminatedInRound === params.roundNumber,
      );
    }

    const total = filteredStandings.length;
    const startIndex = (page - 1) * pageSize;
    const paginatedStandings = filteredStandings.slice(startIndex, startIndex + pageSize);

    return {
      tournamentId: tournament.id,
      tournamentTitle: tournament.title,
      gameId: tournament.gameId,
      status: tournament.status,
      totalPlayers: allPlayers.length,
      currentRound: activeRound,
      totalRounds,
      roundProgress,
      myRank,
      page,
      pageSize,
      total,
      standings: paginatedStandings,
    };
  }

  /**
   * Retrieves player's complete career tournament profile statistics.
   */
  static async getPlayerCareerStats(userId: string): Promise<PlayerTournamentCareerStats> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, displayName: true, avatarUrl: true },
    });

    if (!user) {
      throw new AppError("NOT_FOUND", `User ${userId} not found`, 404);
    }

    // Completed tournaments the player participated in
    const participations = await prisma.tournamentPlayer.findMany({
      where: {
        userId,
        tournament: {
          status: { in: ["COMPLETED", "SETTLING", "SETTLED"] },
        },
      },
      include: {
        tournament: {
          select: { id: true, gameId: true },
        },
        prizes: true,
      },
    });

    const tournamentAppearances = participations.length;
    let tournamentWins = 0;
    let finalsReached = 0;
    let topThreeFinishes = 0;
    let totalMatchesPlayed = 0;
    let totalMatchesWon = 0;
    let totalPrizesWon = 0;
    let bestRank: number | null = null;

    const gameStatsMap = new Map<string, { wins: number; appearances: number; prizes: number }>();

    for (const p of participations) {
      const rank = p.finalRank ?? p.result;
      if (rank === 1) tournamentWins++;
      if (rank && rank <= 2) finalsReached++;
      if (rank && rank <= 3) topThreeFinishes++;

      if (rank) {
        if (bestRank === null || rank < bestRank) {
          bestRank = rank;
        }
      }

      totalMatchesPlayed += p.matchesPlayed;
      totalMatchesWon += p.wins;

      for (const prize of p.prizes) {
        if (prize.status === "COMPLETED" || prize.status === "PAID") {
          totalPrizesWon += prize.amount;
        }
      }

      const gid = p.tournament.gameId;
      const gEntry = gameStatsMap.get(gid) || { wins: 0, appearances: 0, prizes: 0 };
      gEntry.appearances++;
      if (rank === 1) gEntry.wins++;
      for (const prize of p.prizes) {
        if (prize.status === "COMPLETED" || prize.status === "PAID") {
          gEntry.prizes += prize.amount;
        }
      }
      gameStatsMap.set(gid, gEntry);
    }

    const winRate = tournamentAppearances > 0
      ? Number(((tournamentWins / tournamentAppearances) * 100).toFixed(2))
      : 0;

    const gameBreakdown = Array.from(gameStatsMap.entries()).map(([gameId, stat]) => ({
      gameId,
      tournamentWins: stat.wins,
      tournamentAppearances: stat.appearances,
      winRate: stat.appearances > 0 ? Number(((stat.wins / stat.appearances) * 100).toFixed(2)) : 0,
      totalPrizesWon: stat.prizes,
    }));

    return {
      userId: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      tournamentWins,
      tournamentAppearances,
      finalsReached,
      topThreeFinishes,
      winRate,
      totalMatchesPlayed,
      totalMatchesWon,
      totalPrizesWon,
      bestRank,
      gameBreakdown,
    };
  }

  /**
   * Retrieves game-specific tournament rankings across any of the 10 games.
   */
  static async getGameTournamentRankings(
    gameId: string,
    params: { page?: number; pageSize?: number; viewerId?: string },
  ): Promise<{ page: number; pageSize: number; total: number; items: GameTournamentRankingEntry[] }> {
    const { page, pageSize } = clampPagination(params.page, params.pageSize);

    // Group completed tournament wins & stats for this game
    const participations = await prisma.tournamentPlayer.findMany({
      where: {
        tournament: {
          gameId,
          status: { in: ["COMPLETED", "SETTLING", "SETTLED"] },
        },
      },
      include: {
        user: {
          select: { id: true, username: true, displayName: true, avatarUrl: true },
        },
        prizes: true,
      },
    });

    const userAggMap = new Map<string, {
      user: { id: string; username: string; displayName: string; avatarUrl: string | null };
      tournamentsWon: number;
      tournamentsPlayed: number;
      totalPrizesWon: number;
      totalMatchesWon: number;
      totalMatchesPlayed: number;
    }>();

    for (const p of participations) {
      if (!p.user) continue;
      const uid = p.userId;
      const agg = userAggMap.get(uid) || {
        user: p.user,
        tournamentsWon: 0,
        tournamentsPlayed: 0,
        totalPrizesWon: 0,
        totalMatchesWon: 0,
        totalMatchesPlayed: 0,
      };

      agg.tournamentsPlayed++;
      if (p.finalRank === 1 || p.result === 1) {
        agg.tournamentsWon++;
      }
      agg.totalMatchesPlayed += p.matchesPlayed;
      agg.totalMatchesWon += p.wins;

      for (const pr of p.prizes) {
        if (pr.status === "COMPLETED" || pr.status === "PAID") {
          agg.totalPrizesWon += pr.amount;
        }
      }

      userAggMap.set(uid, agg);
    }

    const sortedList = Array.from(userAggMap.values())
      .map((entry) => ({
        ...entry,
        winRate: entry.tournamentsPlayed > 0
          ? Number(((entry.tournamentsWon / entry.tournamentsPlayed) * 100).toFixed(2))
          : 0,
      }))
      .sort((a, b) => {
        if (b.tournamentsWon !== a.tournamentsWon) return b.tournamentsWon - a.tournamentsWon;
        if (b.totalPrizesWon !== a.totalPrizesWon) return b.totalPrizesWon - a.totalPrizesWon;
        return b.totalMatchesWon - a.totalMatchesWon;
      });

    const total = sortedList.length;
    const startIndex = (page - 1) * pageSize;
    const paginated = sortedList.slice(startIndex, startIndex + pageSize);

    const items: GameTournamentRankingEntry[] = paginated.map((entry, idx) => ({
      rank: startIndex + idx + 1,
      userId: entry.user.id,
      username: entry.user.username,
      displayName: entry.user.displayName,
      avatarUrl: entry.user.avatarUrl,
      gameId,
      tournamentsWon: entry.tournamentsWon,
      tournamentsPlayed: entry.tournamentsPlayed,
      winRate: entry.winRate,
      totalPrizesWon: entry.totalPrizesWon,
      totalMatchesWon: entry.totalMatchesWon,
      totalMatchesPlayed: entry.totalMatchesPlayed,
    }));

    return {
      page,
      pageSize,
      total,
      items,
    };
  }

  /**
   * Corrects a match result through administrative review and authoritatively recalculates standings.
   */
  static async correctMatchAndRecalculate(
    params: CorrectMatchAndRecalculateParams,
  ): Promise<{ ok: boolean; message: string }> {
    const { tournamentId, matchId, adminId, reason, newWinnerId, newScores } = params;

    const roundSlot = await prisma.tournamentRound.findFirst({
      where: { tournamentId, matchId },
    });

    if (!roundSlot) {
      throw new AppError("NOT_FOUND", `Match slot not found for matchId ${matchId}`, 404);
    }

    const oldWinnerId = roundSlot.winnerId;

    await prisma.$transaction(async (tx) => {
      // 1. Update round slot with new winner and scores
      const playerAScore = roundSlot.playerAId === newWinnerId ? (newScores?.[newWinnerId] ?? 1) : 0;
      const playerBScore = roundSlot.playerBId === newWinnerId ? (newScores?.[newWinnerId] ?? 1) : 0;

      await tx.tournamentRound.update({
        where: { id: roundSlot.id },
        data: {
          winnerId: newWinnerId,
          playerAScore,
          playerBScore,
          status: "COMPLETED",
        },
      });

      // 2. Adjust winner player record
      await tx.tournamentPlayer.updateMany({
        where: { tournamentId, userId: newWinnerId },
        data: {
          eliminated: false,
          eliminatedInRound: null,
          liveStatus: "ADVANCED",
        },
      });

      // 3. Adjust old winner (now loser)
      if (oldWinnerId && oldWinnerId !== newWinnerId) {
        await tx.tournamentPlayer.updateMany({
          where: { tournamentId, userId: oldWinnerId },
          data: {
            eliminated: true,
            eliminatedInRound: roundSlot.roundNumber,
            liveStatus: "ELIMINATED",
          },
        });
      }

      // 4. Audit Log
      audit({
        actorType: "user",
        actorId: adminId,
        action: "tournament.leaderboard.match_corrected",
        category: "admin",
        targetType: "tournament_round",
        targetId: roundSlot.id,
        meta: {
          tournamentId,
          matchId,
          oldWinnerId,
          newWinnerId,
          reason,
        },
      });

      // 5. Recalculate standings
      await TournamentLeaderboardService.recalculateTournamentStandings(tournamentId, tx);
    });

    return {
      ok: true,
      message: `Match ${matchId} corrected and leaderboard standings recalculated.`,
    };
  }
}
