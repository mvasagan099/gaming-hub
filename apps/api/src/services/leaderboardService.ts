import { prisma, Prisma } from "@gaming-hub/db";
import {
  AppError,
  REGION_GROUPS,
  regionOf,
  type RankedLeaderboardEntry,
  type LeaderboardMetric,
  type RankedLeaderboardPage,
  type LeaderboardPeriod,
  type LeaderboardScope,
} from "@gaming-hub/shared";
import { audit } from "./audit";

export const XP_WIN = 30;
export const XP_LOSS = 10;
export const XP_DRAW = 15;

export const RATING_WIN = 25;
export const RATING_LOSS = -20;
export const RATING_DRAW = 2;

export function levelFromXp(xp: number): number {
  return Math.floor(xp / 100) + 1;
}

export interface PlayerRankUpdateInput {
  userId: string;
  gameId: string;
  result: "win" | "loss" | "draw";
  score: number;
  rated?: boolean;
}

export interface RankedLeaderboardFilters {
  scope: LeaderboardScope;
  gameId?: string | null;
  country?: string | null;
  region?: string | null;
  period: LeaderboardPeriod;
  metric: LeaderboardMetric;
  page: number;
  pageSize: number;
}

export interface MatchResultCorrectionInput {
  matchId: string;
  correctedWinnerIds: string[];
  isDraw?: boolean;
  adminId: string;
  reason: string;
}

interface MatchAgg {
  wins: number;
  matches: number;
  losses: number;
  draws: number;
  xpGained: number;
  fastestWinSec: number | null;
  maxStreak: number;
}

interface StatAgg {
  rating: number;
  ratingSum: number;
  wins: number;
  gamesPlayed: number;
  totalXp: number;
}

const ASCENDING_METRICS: ReadonlySet<LeaderboardMetric> = new Set(["fastestWin"]);
const GLOBAL_USER_CAP = 100_000;

export class LeaderboardService {
  /**
   * Calculate rating adjustment for a player's match outcome.
   * Rating is strictly server-authoritative and decoupled from wallet balance.
   */
  static calculateRatingDelta(result: "win" | "loss" | "draw", rated = true): number {
    if (!rated) return 0;
    if (result === "win") return RATING_WIN;
    if (result === "draw") return RATING_DRAW;
    return RATING_LOSS;
  }

  /**
   * Server-authoritative update of a player's statistics, ratings, and leaderboard standing upon match completion.
   * Executes safely within a database transaction.
   */
  static async updatePlayerRanking(
    tx: Prisma.TransactionClient,
    input: PlayerRankUpdateInput,
  ): Promise<{ xpGained: number; newLevel: number; newRating: number }> {
    const xpGained = input.result === "win" ? XP_WIN : input.result === "draw" ? XP_DRAW : XP_LOSS;
    const ratingDelta = this.calculateRatingDelta(input.result, input.rated !== false);

    const profile = await tx.profile.findUnique({ where: { userId: input.userId } });
    if (!profile) {
      throw new AppError("NOT_FOUND", `Profile not found for user ${input.userId}`, 404);
    }

    const updatedProfile = await tx.profile.update({
      where: { userId: input.userId },
      data: {
        xp: { increment: xpGained },
        level: levelFromXp(profile.xp + xpGained),
        wins: { increment: input.result === "win" ? 1 : 0 },
        losses: { increment: input.result === "loss" ? 1 : 0 },
        draws: { increment: input.result === "draw" ? 1 : 0 },
      },
    });

    const existingStat = await tx.playerStatistic.findUnique({
      where: { userId_gameId: { userId: input.userId, gameId: input.gameId } },
    });
    const bestScore = Math.max(existingStat?.bestScore ?? 0, input.score);
    const newRating = Math.max(100, (existingStat?.rating ?? 1000) + ratingDelta);

    const statistic = await tx.playerStatistic.upsert({
      where: { userId_gameId: { userId: input.userId, gameId: input.gameId } },
      create: {
        userId: input.userId,
        gameId: input.gameId,
        gamesPlayed: 1,
        wins: input.result === "win" ? 1 : 0,
        losses: input.result === "loss" ? 1 : 0,
        draws: input.result === "draw" ? 1 : 0,
        bestScore,
        totalXp: xpGained,
        rating: newRating,
      },
      update: {
        gamesPlayed: { increment: 1 },
        wins: { increment: input.result === "win" ? 1 : 0 },
        losses: { increment: input.result === "loss" ? 1 : 0 },
        draws: { increment: input.result === "draw" ? 1 : 0 },
        bestScore: { set: bestScore },
        totalXp: { increment: xpGained },
        rating: { set: newRating },
      },
    });

    // Update denormalized fast Leaderboard table
    await tx.leaderboard.upsert({
      where: { gameId_userId: { gameId: input.gameId, userId: input.userId } },
      create: {
        gameId: input.gameId,
        userId: input.userId,
        score: statistic.rating,
        wins: statistic.wins,
        gamesPlayed: statistic.gamesPlayed,
        winRate: statistic.gamesPlayed > 0 ? (statistic.wins / statistic.gamesPlayed) * 100 : 0,
      },
      update: {
        score: statistic.rating,
        wins: statistic.wins,
        gamesPlayed: statistic.gamesPlayed,
        winRate: statistic.gamesPlayed > 0 ? (statistic.wins / statistic.gamesPlayed) * 100 : 0,
      },
    });

    return {
      xpGained,
      newLevel: updatedProfile.level,
      newRating: statistic.rating,
    };
  }

  /**
   * Primary dispatcher for fetching paginated ranked leaderboards across any scope, period, and metric.
   */
  static async getLeaderboard(
    filters: RankedLeaderboardFilters,
    viewerId: string,
  ): Promise<RankedLeaderboardPage> {
    const { scope, gameId, country, region, period, metric, page, pageSize } = filters;
    const isGameScope = scope === "game";
    const since = this.periodStartOf(period);
    const effectiveGameId = isGameScope ? (gameId ?? null) : null;

    const userIds = await this.resolveCandidateUserIds(scope, { gameId, country, region, viewerId });

    if (userIds !== null && userIds.length === 0) {
      return {
        items: [],
        total: 0,
        page,
        pageSize,
        scope,
        period,
        metric,
        viewerRank: null,
        viewer: null,
      };
    }

    const needMatchAggregates = since !== null || metric === "fastestWin" || metric === "streak";

    const [users, statMap, matchMap, tournamentMap] = await Promise.all([
      prisma.user.findMany({
        where: userIds ? { id: { in: userIds } } : undefined,
        take: userIds ? undefined : GLOBAL_USER_CAP,
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
          profile: {
            select: { country: true, level: true, xp: true, wins: true, losses: true, draws: true },
          },
          wallet: { select: { balance: true } },
        },
      }),
      this.cumulativeStats(userIds, effectiveGameId),
      needMatchAggregates
        ? this.fetchMatchAggregates(userIds, effectiveGameId, since)
        : Promise.resolve(new Map<string, MatchAgg>()),
      scope === "tournament"
        ? this.fetchTournamentAggregates()
        : Promise.resolve(new Map<string, { wins: number; played: number }>()),
    ]);

    const entries = this.buildLeaderboardEntries(users, {
      statMap,
      matchMap,
      tournamentMap,
      isGameScope,
      scope,
      since,
      metric,
      gameId: effectiveGameId,
    });

    entries.sort(this.comparator(metric));

    const total = entries.length;
    const start = (page - 1) * pageSize;
    const items = entries.slice(start, start + pageSize).map((e, i) => ({ ...e, rank: start + i + 1 }));

    const viewerIndex = entries.findIndex((e) => e.userId === viewerId);
    const viewer = viewerIndex >= 0 ? { ...entries[viewerIndex], rank: viewerIndex + 1 } : null;
    const inItems = items.some((e) => e.userId === viewerId);

    return {
      items,
      total,
      page,
      pageSize,
      scope,
      period,
      metric,
      viewerRank: viewer?.rank ?? null,
      viewer: viewer && !inItems ? viewer : null,
    };
  }

  /**
   * Convenience method to get global player leaderboard.
   */
  static async getGlobalLeaderboard(
    filters: Omit<RankedLeaderboardFilters, "scope" | "gameId">,
    viewerId: string,
  ): Promise<RankedLeaderboardPage> {
    return this.getLeaderboard({ ...filters, scope: "global", gameId: null }, viewerId);
  }

  /**
   * Convenience method to get individual game leaderboard.
   */
  static async getGameLeaderboard(
    gameId: string,
    filters: Omit<RankedLeaderboardFilters, "scope" | "gameId">,
    viewerId: string,
  ): Promise<RankedLeaderboardPage> {
    return this.getLeaderboard({ ...filters, scope: "game", gameId }, viewerId);
  }

  /**
   * Convenience method to get tournament leaderboard.
   */
  static async getTournamentLeaderboard(
    filters: Omit<RankedLeaderboardFilters, "scope" | "gameId">,
    viewerId: string,
  ): Promise<RankedLeaderboardPage> {
    return this.getLeaderboard({ ...filters, scope: "tournament", gameId: null }, viewerId);
  }

  /**
   * Fetch player's current rank position and rating summary across all game disciplines.
   */
  static async getUserRankSummary(userId: string) {
    const [globalRank, stats, user] = await Promise.all([
      this.getGlobalLeaderboard({ period: "all", metric: "rating", page: 1, pageSize: 1 }, userId),
      prisma.playerStatistic.findMany({
        where: { userId },
        orderBy: { rating: "desc" },
      }),
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, username: true, displayName: true, avatarUrl: true },
      }),
    ]);

    if (!user) {
      throw new AppError("NOT_FOUND", "User not found", 404);
    }

    const gameRanks = await Promise.all(
      stats.map(async (st) => {
        const gameBoard = await this.getGameLeaderboard(
          st.gameId,
          { period: "all", metric: "rating", page: 1, pageSize: 1 },
          userId,
        );
        return {
          gameId: st.gameId,
          rating: st.rating,
          wins: st.wins,
          gamesPlayed: st.gamesPlayed,
          rank: gameBoard.viewerRank,
        };
      }),
    );

    return {
      userId: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      globalRank: globalRank.viewerRank,
      globalRating: stats.reduce((acc, s) => acc + s.rating, 0),
      games: gameRanks,
    };
  }

  /**
   * Authoritative match result correction.
   * Safely rolls back old rating and stats deltas, applies corrected result, updates leaderboard, and creates audit log.
   */
  static async correctMatchResult(input: MatchResultCorrectionInput) {
    const { matchId, correctedWinnerIds, isDraw = false, adminId, reason } = input;

    return prisma.$transaction(async (tx) => {
      const match = await tx.match.findUnique({
        where: { id: matchId },
        include: { players: true },
      });

      if (!match) {
        throw new AppError("NOT_FOUND", "Match not found", 404);
      }

      if (match.status !== "FINISHED") {
        throw new AppError("INVALID_ACTION", "Only finished matches can have results corrected", 400);
      }

      const winnerSet = new Set(correctedWinnerIds);
      const previousWinnerIds = (match.winnerIds as string[]) || [];

      // 1. Revert previous match effects on PlayerStatistic and Profile
      for (const player of match.players) {
        const oldResult = player.result; // WIN, LOSS, DRAW, PENDING
        if (oldResult && oldResult !== "PENDING") {
          const oldRatingDelta = oldResult === "WIN" ? RATING_WIN : oldResult === "DRAW" ? RATING_DRAW : RATING_LOSS;
          const oldXp = oldResult === "WIN" ? XP_WIN : oldResult === "DRAW" ? XP_DRAW : XP_LOSS;

          await tx.playerStatistic.updateMany({
            where: { userId: player.userId, gameId: match.gameId },
            data: {
              rating: { decrement: oldRatingDelta },
              wins: { decrement: oldResult === "WIN" ? 1 : 0 },
              losses: { decrement: oldResult === "LOSS" ? 1 : 0 },
              draws: { decrement: oldResult === "DRAW" ? 1 : 0 },
              gamesPlayed: { decrement: 1 },
              totalXp: { decrement: oldXp },
            },
          });

          await tx.profile.updateMany({
            where: { userId: player.userId },
            data: {
              xp: { decrement: oldXp },
              wins: { decrement: oldResult === "WIN" ? 1 : 0 },
              losses: { decrement: oldResult === "LOSS" ? 1 : 0 },
              draws: { decrement: oldResult === "DRAW" ? 1 : 0 },
            },
          });
        }
      }

      // 2. Apply new corrected results and ratings
      for (const player of match.players) {
        let newResult: "win" | "loss" | "draw";
        if (isDraw || (correctedWinnerIds.length === 0 && !winnerSet.has(player.userId))) {
          newResult = isDraw ? "draw" : "loss";
        } else if (winnerSet.has(player.userId)) {
          newResult = "win";
        } else {
          newResult = "loss";
        }

        await tx.matchPlayer.update({
          where: { id: player.id },
          data: { result: newResult.toUpperCase() as "WIN" | "LOSS" | "DRAW" },
        });

        await this.updatePlayerRanking(tx, {
          userId: player.userId,
          gameId: match.gameId,
          result: newResult,
          score: player.score ?? 0,
          rated: true,
        });
      }

      // 3. Update Match record
      await tx.match.update({
        where: { id: matchId },
        data: {
          winnerIds: Array.from(winnerSet),
        },
      });

      // 4. Audit Log
      audit({
        actorType: "user",
        actorId: adminId,
        action: "leaderboard.match_result.corrected",
        category: "admin",
        targetType: "match",
        targetId: matchId,
        meta: {
          previousWinnerIds,
          correctedWinnerIds: Array.from(winnerSet),
          isDraw,
          reason,
        },
      });

      return {
        matchId,
        status: "CORRECTED",
        correctedWinnerIds: Array.from(winnerSet),
        isDraw,
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Internal Helpers
  // ---------------------------------------------------------------------------

  private static async resolveCandidateUserIds(
    scope: LeaderboardScope,
    opts: { gameId?: string | null; country?: string | null; region?: string | null; viewerId: string },
  ): Promise<string[] | null> {
    switch (scope) {
      case "game": {
        const rows = await prisma.playerStatistic.findMany({
          where: { gameId: opts.gameId ?? "" },
          select: { userId: true },
        });
        return rows.map((r) => r.userId);
      }
      case "country": {
        const rows = await prisma.profile.findMany({
          where: { country: opts.country ?? "" },
          select: { userId: true },
        });
        return rows.map((r) => r.userId);
      }
      case "region": {
        const codes = opts.region ? REGION_GROUPS[opts.region] ?? [] : [];
        if (codes.length === 0) return [];
        const rows = await prisma.profile.findMany({
          where: { country: { in: codes } },
          select: { userId: true },
        });
        return rows.map((r) => r.userId);
      }
      case "friends": {
        const rows = await prisma.friend.findMany({
          where: {
            status: "ACCEPTED",
            OR: [{ requesterId: opts.viewerId }, { addresseeId: opts.viewerId }],
          },
          select: { requesterId: true, addresseeId: true },
        });
        const set = new Set<string>([opts.viewerId]);
        for (const row of rows) {
          set.add(row.requesterId);
          set.add(row.addresseeId);
        }
        return [...set];
      }
      case "tournament": {
        const rows = await prisma.tournamentPlayer.findMany({
          select: { userId: true },
        });
        const ids = [...new Set(rows.map((r) => r.userId))];
        return ids.length > 0 ? ids : null;
      }
      default:
        return null;
    }
  }

  private static async cumulativeStats(
    userIds: string[] | null,
    gameId: string | null,
  ): Promise<Map<string, StatAgg>> {
    const map = new Map<string, StatAgg>();
    const where = userIds ? { userId: { in: userIds } } : undefined;

    if (gameId) {
      const rows = await prisma.playerStatistic.findMany({ where: { ...where, gameId } });
      for (const row of rows) {
        map.set(row.userId, {
          rating: row.rating,
          ratingSum: row.rating,
          wins: row.wins,
          gamesPlayed: row.gamesPlayed,
          totalXp: row.totalXp,
        });
      }
      return map;
    }

    const rows = await prisma.playerStatistic.groupBy({
      by: ["userId"],
      where,
      _sum: { rating: true, wins: true, gamesPlayed: true, totalXp: true },
    });
    for (const row of rows) {
      map.set(row.userId, {
        rating: row._sum.rating ?? 0,
        ratingSum: row._sum.rating ?? 0,
        wins: row._sum.wins ?? 0,
        gamesPlayed: row._sum.gamesPlayed ?? 0,
        totalXp: row._sum.totalXp ?? 0,
      });
    }
    return map;
  }

  private static async fetchMatchAggregates(
    userIds: string[] | null,
    gameId: string | null,
    since: Date | null,
  ): Promise<Map<string, MatchAgg>> {
    const filters: Prisma.Sql[] = [Prisma.sql`m."status"::text = 'FINISHED'`];
    if (since) filters.push(Prisma.sql`m."endedAt" >= ${since}`);
    if (gameId) filters.push(Prisma.sql`m."gameId" = ${gameId}`);
    if (userIds && userIds.length > 0) filters.push(Prisma.sql`mp."userId" IN (${Prisma.join(userIds)})`);

    const [rows, streakRows] = await Promise.all([
      prisma.$queryRaw<
        { userId: string; wins: bigint; matches: bigint; losses: bigint; draws: bigint; xpGained: bigint; fastestWinSec: number | null }[]
      >(Prisma.sql`
        SELECT
          mp."userId",
          COUNT(*) FILTER (WHERE mp."result"::text = 'WIN') AS wins,
          COUNT(*) AS matches,
          COUNT(*) FILTER (WHERE mp."result"::text = 'LOSS') AS losses,
          COUNT(*) FILTER (WHERE mp."result"::text = 'DRAW') AS draws,
          COALESCE(
            SUM(CASE WHEN mp."result"::text = 'WIN' THEN 30 WHEN mp."result"::text = 'DRAW' THEN 15 ELSE 10 END),
            0
          ) AS "xpGained",
          MIN(
            CASE
              WHEN mp."result"::text = 'WIN' AND m."startedAt" IS NOT NULL AND m."endedAt" IS NOT NULL
              THEN EXTRACT(EPOCH FROM (m."endedAt" - m."startedAt"))
            END
          ) AS "fastestWinSec"
        FROM "MatchPlayer" mp
        JOIN "Match" m ON m.id = mp."matchId"
        WHERE ${Prisma.join(filters, " AND ")}
        GROUP BY mp."userId"
      `),
      prisma.$queryRaw<{ userId: string; maxStreak: bigint }[]>(Prisma.sql`
        WITH runs AS (
          SELECT
            mp."userId",
            mp."result",
            SUM(CASE WHEN mp."result"::text = 'WIN' THEN 0 ELSE 1 END)
              OVER (PARTITION BY mp."userId" ORDER BY m."endedAt", m.id) AS grp
          FROM "MatchPlayer" mp
          JOIN "Match" m ON m.id = mp."matchId"
          WHERE ${Prisma.join(filters, " AND ")}
        ),
        streaks AS (
          SELECT "userId", "result", grp, COUNT(*) AS streak
          FROM runs
          GROUP BY "userId", "result", grp
        )
        SELECT "userId", MAX(streak) AS "maxStreak"
        FROM streaks
        WHERE "result"::text = 'WIN'
        GROUP BY "userId"
      `),
    ]);

    const map = new Map<string, MatchAgg>();
    for (const row of rows) {
      map.set(row.userId, {
        wins: Number(row.wins),
        matches: Number(row.matches),
        losses: Number(row.losses),
        draws: Number(row.draws),
        xpGained: Number(row.xpGained),
        fastestWinSec: row.fastestWinSec == null ? null : Math.round(Number(row.fastestWinSec)),
        maxStreak: 0,
      });
    }
    for (const row of streakRows) {
      const agg = map.get(row.userId);
      if (agg) agg.maxStreak = Number(row.maxStreak);
    }
    return map;
  }

  private static async fetchTournamentAggregates(): Promise<Map<string, { wins: number; played: number }>> {
    const map = new Map<string, { wins: number; played: number }>();

    const playedRows = await prisma.$queryRaw<{ userId: string; played: bigint }[]>`
      SELECT tp."userId", COUNT(*) AS played
      FROM "TournamentPlayer" tp
      JOIN "Tournament" t ON t.id = tp."tournamentId"
      WHERE t."status"::text IN ('ENDED', 'COMPLETED', 'SETTLED', 'SETTLING', 'IN_PROGRESS', 'STARTING', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED')
      GROUP BY tp."userId"
    `;
    for (const row of playedRows) {
      map.set(row.userId, { wins: 0, played: Number(row.played) });
    }

    const winRows = await prisma.$queryRaw<{ userId: string; wins: bigint }[]>`
      WITH completed_tournaments AS (
        SELECT id FROM "Tournament" WHERE "status"::text IN ('ENDED', 'COMPLETED', 'SETTLED', 'SETTLING')
      ),
      finals AS (
        SELECT tr."tournamentId", MAX(tr."roundNumber") AS rn
        FROM "TournamentRound" tr
        JOIN completed_tournaments e ON e.id = tr."tournamentId"
        WHERE tr."winnerId" IS NOT NULL
        GROUP BY tr."tournamentId"
      )
      SELECT tr."winnerId" AS "userId", COUNT(*) AS wins
      FROM "TournamentRound" tr
      JOIN finals f ON f."tournamentId" = tr."tournamentId" AND f.rn = tr."roundNumber"
      WHERE tr."winnerId" IS NOT NULL
      GROUP BY tr."winnerId"
    `;
    for (const row of winRows) {
      const cur = map.get(row.userId) ?? { wins: 0, played: 0 };
      cur.wins = Number(row.wins);
      map.set(row.userId, cur);
    }
    return map;
  }

  private static buildLeaderboardEntries(
    users: Array<{
      id: string;
      username: string;
      displayName: string;
      avatarUrl: string | null;
      profile: { country: string | null; level: number; xp: number; wins: number; losses: number; draws: number } | null;
      wallet: { balance: number } | null;
    }>,
    ctx: {
      statMap: Map<string, StatAgg>;
      matchMap: Map<string, MatchAgg>;
      tournamentMap: Map<string, { wins: number; played: number }>;
      isGameScope: boolean;
      scope: LeaderboardScope;
      since: Date | null;
      metric: LeaderboardMetric;
      gameId: string | null;
    },
  ): RankedLeaderboardEntry[] {
    const { statMap, matchMap, tournamentMap, isGameScope, scope, since, metric, gameId } = ctx;
    const entries: RankedLeaderboardEntry[] = [];

    for (const user of users) {
      const profile = user.profile;
      const stat = statMap.get(user.id);
      const match = matchMap.get(user.id);
      const tournament = tournamentMap.get(user.id);

      const winsAll = isGameScope ? stat?.wins ?? 0 : profile?.wins ?? 0;
      const matchesAll = isGameScope
        ? stat?.gamesPlayed ?? 0
        : (profile?.wins ?? 0) + (profile?.losses ?? 0) + (profile?.draws ?? 0);
      const lossesAll = profile?.losses ?? 0;
      const drawsAll = profile?.draws ?? 0;
      const xpAll = isGameScope ? stat?.totalXp ?? 0 : profile?.xp ?? 0;
      const ratingAll = isGameScope ? stat?.rating ?? 0 : stat?.ratingSum ?? 0;

      const wins = since ? match?.wins ?? 0 : winsAll;
      const matches = since ? match?.matches ?? 0 : matchesAll;
      const losses = since ? match?.losses ?? 0 : lossesAll;
      const draws = since ? match?.draws ?? 0 : drawsAll;
      const xp = since ? match?.xpGained ?? 0 : xpAll;
      const winRate = matches > 0 ? (wins / matches) * 100 : 0;
      const coins = user.wallet?.balance ?? 0;

      const tournamentWins = tournament?.wins ?? 0;
      const tournamentPlayed = tournament?.played ?? 0;

      const metricValue = this.resolveMetricValue(metric, {
        since,
        scope,
        wins,
        matches,
        winRate,
        xp,
        coins,
        ratingAll,
        fastestWinSec: match?.fastestWinSec ?? null,
        maxStreak: match?.maxStreak ?? 0,
        tournamentWins,
        tournamentPlayed,
      });

      if (metricValue === null) continue;

      entries.push({
        rank: 0,
        userId: user.id,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        country: profile?.country ?? null,
        region: profile?.country ? regionOf(profile.country) : null,
        level: profile?.level ?? 1,
        gameId: isGameScope ? gameId : null,
        metric,
        metricValue,
        score: ratingAll,
        wins,
        matches,
        losses,
        draws,
        winRate,
        xp,
        coins,
        fastestWinSec: match?.fastestWinSec ?? null,
        maxStreak: match?.maxStreak ?? 0,
        tournamentWins,
        tournamentPlayed,
      });
    }

    return entries;
  }

  private static resolveMetricValue(
    metric: LeaderboardMetric,
    ctx: {
      since: Date | null;
      scope: LeaderboardScope;
      wins: number;
      matches: number;
      winRate: number;
      xp: number;
      coins: number;
      ratingAll: number;
      fastestWinSec: number | null;
      maxStreak: number;
      tournamentWins: number;
      tournamentPlayed: number;
    },
  ): number | null {
    switch (metric) {
      case "rating":
        if (ctx.since) return ctx.wins;
        if (ctx.scope === "tournament") return ctx.tournamentWins;
        return ctx.ratingAll;
      case "wins":
        return ctx.scope === "tournament" ? ctx.tournamentWins : ctx.wins;
      case "matches":
        return ctx.scope === "tournament" ? ctx.tournamentPlayed : ctx.matches;
      case "winRate":
        if (ctx.scope === "tournament") {
          return ctx.tournamentPlayed > 0 ? (ctx.tournamentWins / ctx.tournamentPlayed) * 100 : 0;
        }
        return ctx.winRate;
      case "xp":
        return ctx.xp;
      case "coins":
        return ctx.coins;
      case "fastestWin":
        return ctx.fastestWinSec;
      case "streak":
        return ctx.maxStreak ?? 0;
    }
  }

  /**
   * Deterministic tie-breaking comparator:
   * 1. Primary metric value
   * 2. Wins count
   * 3. Matches played / Win rate
   * 4. Overall score
   * 5. Username (alphabetical stable fallback)
   */
  private static comparator(metric: LeaderboardMetric) {
    const ascending = ASCENDING_METRICS.has(metric);
    return (a: RankedLeaderboardEntry, b: RankedLeaderboardEntry): number => {
      const diff = a.metricValue - b.metricValue;
      const primary = ascending ? diff : -diff;
      return (
        primary ||
        b.wins - a.wins ||
        b.matches - a.matches ||
        b.score - a.score ||
        a.username.localeCompare(b.username)
      );
    };
  }

  private static periodStartOf(period: LeaderboardPeriod): Date | null {
    if (period === "all") return null;
    const now = new Date();
    const start = new Date(now);
    if (period === "daily") {
      start.setHours(0, 0, 0, 0);
    } else if (period === "weekly") {
      const daysSinceMonday = (now.getDay() + 6) % 7;
      start.setDate(now.getDate() - daysSinceMonday);
      start.setHours(0, 0, 0, 0);
    } else if (period === "monthly") {
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
    } else if (period === "yearly") {
      start.setMonth(0, 1);
      start.setHours(0, 0, 0, 0);
    }
    return start;
  }
}
