import { prisma } from "@gaming-hub/db";
import { GAME_DEFINITIONS, type GameId } from "@gaming-hub/shared";
import { AppError } from "@gaming-hub/shared";

export interface GameStatsFilter {
  dateFrom?: Date | string;
  dateTo?: Date | string;
  sortBy?: "matches" | "players" | "entryVolume" | "prizeVolume" | "refundVolume" | string;
}

export class AdminGameStatsService {
  /**
   * 1. Overview Statistics for All Games on the Platform
   */
  static async getGamesOverviewStatistics(filter: GameStatsFilter) {
    const createdAt: { gte?: Date; lte?: Date } = {};
    if (filter.dateFrom) createdAt.gte = new Date(filter.dateFrom);
    if (filter.dateTo) createdAt.lte = new Date(filter.dateTo);

    const matchWhere: Record<string, unknown> = {};
    if (Object.keys(createdAt).length > 0) matchWhere.createdAt = createdAt;

    // Fetch all matches for the period
    const [matches, activeMatchesGroup] = await Promise.all([
      prisma.match.findMany({
        where: matchWhere,
        select: {
          id: true,
          gameId: true,
          status: true,
          stake: true,
          startedAt: true,
          endedAt: true,
          players: {
            select: { userId: true, result: true },
          },
        },
      }),
      prisma.match.groupBy({
        by: ["gameId"],
        where: { status: "ACTIVE" },
        _count: { id: true },
      }),
    ]);

    const activeCountMap = new Map(activeMatchesGroup.map((g) => [g.gameId, g._count.id]));

    // Aggregation buckets per game
    const gameStatsMap = new Map<
      string,
      {
        gameId: string;
        name: string;
        category: string;
        totalMatches: number;
        completedMatches: number;
        activeMatches: number;
        abortedMatches: number;
        uniquePlayers: Set<string>;
        totalPlayerEntries: number;
        entryFeeVolume: number;
        prizeVolume: number;
        refundVolume: number;
        completionRate: number;
      }
    >();

    for (const def of GAME_DEFINITIONS) {
      gameStatsMap.set(def.id, {
        gameId: def.id,
        name: def.name,
        category: def.category,
        totalMatches: 0,
        completedMatches: 0,
        activeMatches: activeCountMap.get(def.id) ?? 0,
        abortedMatches: 0,
        uniquePlayers: new Set<string>(),
        totalPlayerEntries: 0,
        entryFeeVolume: 0,
        prizeVolume: 0,
        refundVolume: 0,
        completionRate: 0,
      });
    }

    for (const m of matches) {
      const def = GAME_DEFINITIONS.find((g) => g.id === m.gameId);
      const stats = gameStatsMap.get(m.gameId) ?? {
        gameId: m.gameId,
        name: def?.name ?? m.gameId,
        category: def?.category ?? "Other",
        totalMatches: 0,
        completedMatches: 0,
        activeMatches: activeCountMap.get(m.gameId) ?? 0,
        abortedMatches: 0,
        uniquePlayers: new Set<string>(),
        totalPlayerEntries: 0,
        entryFeeVolume: 0,
        prizeVolume: 0,
        refundVolume: 0,
        completionRate: 0,
      };

      stats.totalMatches += 1;
      const playerCount = m.players.length;
      stats.totalPlayerEntries += playerCount;

      for (const p of m.players) {
        stats.uniquePlayers.add(p.userId);
      }

      const matchFeeSum = m.stake * playerCount;
      stats.entryFeeVolume += matchFeeSum;

      if (m.status === "FINISHED") {
        stats.completedMatches += 1;
        stats.prizeVolume += Math.floor(matchFeeSum * 0.9);
      } else if (m.status === "ABORTED") {
        stats.abortedMatches += 1;
        stats.refundVolume += matchFeeSum;
      }

      gameStatsMap.set(m.gameId, stats);
    }

    // Format output and compute completion rates
    const items = Array.from(gameStatsMap.values()).map((s) => {
      const startedMatches = s.completedMatches + s.abortedMatches;
      const completionRate = startedMatches > 0 ? (s.completedMatches / startedMatches) * 100 : 100;

      return {
        gameId: s.gameId,
        name: s.name,
        category: s.category,
        totalMatches: s.totalMatches,
        completedMatches: s.completedMatches,
        activeMatches: s.activeMatches,
        abortedMatches: s.abortedMatches,
        uniquePlayersCount: s.uniquePlayers.size,
        totalPlayerEntries: s.totalPlayerEntries,
        entryFeeVolume: s.entryFeeVolume,
        prizeVolume: s.prizeVolume,
        refundVolume: s.refundVolume,
        completionRate: Math.round(completionRate * 10) / 10,
      };
    });

    // Multi-column sorting
    switch (filter.sortBy) {
      case "players":
        items.sort((a, b) => b.uniquePlayersCount - a.uniquePlayersCount);
        break;
      case "entryVolume":
        items.sort((a, b) => b.entryFeeVolume - a.entryFeeVolume);
        break;
      case "prizeVolume":
        items.sort((a, b) => b.prizeVolume - a.prizeVolume);
        break;
      case "refundVolume":
        items.sort((a, b) => b.refundVolume - a.refundVolume);
        break;
      case "matches":
      default:
        items.sort((a, b) => b.totalMatches - a.totalMatches);
        break;
    }

    return {
      games: items,
      totalGames: items.length,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * 2. Deep-Dive Analytics for a Single Game
   */
  static async getGameDetailStatistics(gameId: string, filter: GameStatsFilter) {
    const def = GAME_DEFINITIONS.find((g) => g.id === gameId);
    if (!def) {
      throw new AppError("NOT_FOUND", `Unknown game ID: ${gameId}`, 404);
    }

    const createdAt: { gte?: Date; lte?: Date } = {};
    if (filter.dateFrom) createdAt.gte = new Date(filter.dateFrom);
    if (filter.dateTo) createdAt.lte = new Date(filter.dateTo);

    const matchWhere: Record<string, unknown> = { gameId };
    if (Object.keys(createdAt).length > 0) matchWhere.createdAt = createdAt;

    const [matches, activeCount, tournamentsCount] = await Promise.all([
      prisma.match.findMany({
        where: matchWhere,
        orderBy: { createdAt: "desc" },
        include: {
          players: { include: { user: { select: { username: true, displayName: true } } } },
        },
      }),
      prisma.match.count({
        where: { gameId, status: "ACTIVE" },
      }),
      prisma.tournament.count({
        where: { gameId },
      }),
    ]);

    let completedMatches = 0;
    let abortedMatches = 0;
    let entryFeeVolume = 0;
    let prizeVolume = 0;
    let refundVolume = 0;

    const playerMatchesCount = new Map<string, number>();
    const playerWinsCount = new Map<string, number>();
    let totalWins = 0;
    let totalLosses = 0;
    let totalDraws = 0;

    for (const m of matches) {
      const matchFeeSum = m.stake * m.players.length;
      entryFeeVolume += matchFeeSum;

      if (m.status === "FINISHED") {
        completedMatches += 1;
        prizeVolume += Math.floor(matchFeeSum * 0.9);
      } else if (m.status === "ABORTED") {
        abortedMatches += 1;
        refundVolume += matchFeeSum;
      }

      for (const p of m.players) {
        playerMatchesCount.set(p.userId, (playerMatchesCount.get(p.userId) ?? 0) + 1);
        if (p.result === "WIN") {
          totalWins += 1;
          playerWinsCount.set(p.userId, (playerWinsCount.get(p.userId) ?? 0) + 1);
        } else if (p.result === "LOSS") {
          totalLosses += 1;
        } else if (p.result === "DRAW") {
          totalDraws += 1;
        }
      }
    }

    const uniquePlayers = playerMatchesCount.size;
    const repeatPlayers = Array.from(playerMatchesCount.values()).filter((c) => c > 1).length;
    const avgMatchesPerPlayer = uniquePlayers > 0 ? matches.length / uniquePlayers : 0;
    const startedMatches = completedMatches + abortedMatches;
    const completionRate = startedMatches > 0 ? (completedMatches / startedMatches) * 100 : 100;

    // Daily trend buckets
    const now = new Date();
    const trendMap = new Map<string, { date: string; matches: number; players: Set<string>; volume: number }>();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setUTCDate(d.getUTCDate() - i);
      const dateKey = d.toISOString().slice(0, 10);
      trendMap.set(dateKey, { date: dateKey, matches: 0, players: new Set<string>(), volume: 0 });
    }

    for (const m of matches) {
      const dateKey = m.createdAt.toISOString().slice(0, 10);
      const bucket = trendMap.get(dateKey);
      if (bucket) {
        bucket.matches += 1;
        bucket.volume += m.stake * m.players.length;
        for (const p of m.players) {
          bucket.players.add(p.userId);
        }
      }
    }

    const dailyTrends = Array.from(trendMap.values()).map((b) => ({
      date: b.date,
      matches: b.matches,
      uniquePlayers: b.players.size,
      volume: b.volume,
    }));

    return {
      gameId: def.id,
      name: def.name,
      category: def.category,
      mode: def.mode,
      minPlayers: def.minPlayers,
      maxPlayers: def.maxPlayers,
      overview: {
        totalMatches: matches.length,
        completedMatches,
        activeMatches: activeCount,
        abortedMatches,
        completionRate: Math.round(completionRate * 10) / 10,
        entryFeeVolume,
        prizeVolume,
        refundVolume,
        tournamentsHosted: tournamentsCount,
      },
      playerAnalytics: {
        uniquePlayers,
        repeatPlayers,
        repeatPlayerRate: uniquePlayers > 0 ? Math.round((repeatPlayers / uniquePlayers) * 100) : 0,
        avgMatchesPerPlayer: Math.round(avgMatchesPerPlayer * 10) / 10,
      },
      resultsDistribution: {
        totalWins,
        totalLosses,
        totalDraws,
        totalAborted: abortedMatches,
      },
      dailyTrends,
    };
  }
}
