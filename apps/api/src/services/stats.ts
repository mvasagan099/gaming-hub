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

export const XP_WIN = 30;
export const XP_LOSS = 10;
export const XP_DRAW = 15;

const RATING_WIN = 25;
const RATING_LOSS = -20;
const RATING_DRAW = 2;

/** XP required per level (linear ramp). */
export function levelFromXp(xp: number): number {
  return Math.floor(xp / 100) + 1;
}

export interface MatchResultInput {
  userId: string;
  gameId: string;
  result: "win" | "loss" | "draw";
  score: number;
  /** When false, rating/leaderboard score are untouched (casual matches). */
  rated?: boolean;
}

/** Updates profile, per-game statistics and the per-game leaderboard row. */
export async function recordMatchResult(
  tx: Prisma.TransactionClient,
  input: MatchResultInput,
): Promise<{ xpGained: number; newLevel: number }> {
  const xpGained =
    input.result === "win" ? XP_WIN : input.result === "draw" ? XP_DRAW : XP_LOSS;
  const ratingDelta =
    input.rated === false ? 0 : input.result === "win" ? RATING_WIN : input.result === "draw" ? RATING_DRAW : RATING_LOSS;

  const profile = await tx.profile.findUnique({ where: { userId: input.userId } });
  if (!profile) {
    throw new AppError("NOT_FOUND", "Profile not found", 404);
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
      rating: 1000 + ratingDelta,
    },
    update: {
      gamesPlayed: { increment: 1 },
      wins: { increment: input.result === "win" ? 1 : 0 },
      losses: { increment: input.result === "loss" ? 1 : 0 },
      draws: { increment: input.result === "draw" ? 1 : 0 },
      bestScore: { set: bestScore },
      totalXp: { increment: xpGained },
      rating: { increment: ratingDelta },
    },
  });

  const gamesPlayed = await tx.playerStatistic.count({ where: { userId: input.userId } });

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

  return { xpGained, newLevel: updatedProfile.level };
}

export async function getLeaderboard(gameId: string, page: number, pageSize: number) {
  if (gameId === "overall") {
    const aggregated = await prisma.$queryRaw<
      {
        userId: string;
        totalScore: bigint;
        totalWins: bigint;
        totalGames: bigint;
      }[]
    >`
      SELECT "userId", SUM("rating") AS "totalScore", SUM("wins") AS "totalWins", SUM("gamesPlayed") AS "totalGames"
      FROM "PlayerStatistic"
      GROUP BY "userId"
      ORDER BY "totalScore" DESC
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
    `;

    const userIds = aggregated.map((r) => r.userId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      include: { profile: true },
    });
    const userById = new Map(users.map((u) => [u.id, u]));

    return aggregated.map((row, index) => {
      const user = userById.get(row.userId);
      return {
        rank: (page - 1) * pageSize + index + 1,
        userId: row.userId,
        username: user?.username ?? "unknown",
        displayName: user?.displayName ?? "unknown",
        avatarUrl: user?.avatarUrl ?? null,
        gameId: "overall",
        score: Number(row.totalScore),
        wins: Number(row.totalWins),
        gamesPlayed: Number(row.totalGames),
        winRate: Number(row.totalGames) > 0 ? (Number(row.totalWins) / Number(row.totalGames)) * 100 : 0,
      };
    });
  }

  const [rows, total] = await Promise.all([
    prisma.leaderboard.findMany({
      where: { gameId },
      orderBy: [{ score: "desc" }, { wins: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { user: { include: { profile: true } } },
    }),
    prisma.leaderboard.count({ where: { gameId } }),
  ]);

  return {
    items: rows.map((row, index) => ({
      rank: (page - 1) * pageSize + index + 1,
      userId: row.userId,
      username: row.user.username,
      displayName: row.user.displayName,
      avatarUrl: row.user.avatarUrl,
      gameId,
      score: row.score,
      wins: row.wins,
      gamesPlayed: row.gamesPlayed,
      winRate: row.winRate,
    })),
    total,
    page,
    pageSize,
  };
}

export async function getRankOfUser(gameId: string, userId: string): Promise<number | null> {
  if (gameId === "overall") {
    const rows = await prisma.$queryRaw<
      { userId: string; totalScore: bigint }[]
    >`
      SELECT "userId", SUM("rating") AS "totalScore"
      FROM "PlayerStatistic"
      GROUP BY "userId"
      ORDER BY "totalScore" DESC
    `;
    const index = rows.findIndex((r) => r.userId === userId);
    return index >= 0 ? index + 1 : null;
  }

  const rows = await prisma.leaderboard.findMany({
    where: { gameId },
    orderBy: [{ score: "desc" }, { wins: "desc" }],
    select: { userId: true },
  });
  const index = rows.findIndex((r) => r.userId === userId);
  return index >= 0 ? index + 1 : null;
}

// ---------------------------------------------------------------------------
// Ranked leaderboards (scopes, periods, metrics)
// ---------------------------------------------------------------------------

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

/** Metrics ranked in ascending order (fastest-win). Everything else descends. */
const ASCENDING_METRICS: ReadonlySet<LeaderboardMetric> = new Set(["fastestWin"]);

/** Hard cap on how many users a global board may consider at once. */
const GLOBAL_USER_CAP = 100_000;

export async function getRankedLeaderboard(
  filters: RankedLeaderboardFilters,
  viewerId: string,
): Promise<RankedLeaderboardPage> {
  const { scope, gameId, country, region, period, metric, page, pageSize } = filters;
  const isGameScope = scope === "game";
  const since = periodStartOf(period);
  const effectiveGameId = isGameScope ? (gameId ?? null) : null;

  const userIds = await resolveCandidateUserIds(scope, { gameId, country, region, viewerId });

  // Empty candidate set (e.g. tournament scope with no ended tournaments) is a
  // valid empty board - return early to avoid passing an empty list to
  // Prisma.join(), which throws.
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

  // All-time boards only need match rows for fastest-win/streak metrics.
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
    cumulativeStats(userIds, effectiveGameId),
    needMatchAggregates
      ? fetchMatchAggregates(userIds, effectiveGameId, since)
      : Promise.resolve(new Map<string, MatchAgg>()),
    scope === "tournament" ? fetchTournamentAggregates() : Promise.resolve(new Map<string, { wins: number; played: number }>()),
  ]);

  const entries = buildLeaderboardEntries(users, {
    statMap,
    matchMap,
    tournamentMap,
    isGameScope,
    scope,
    since,
    metric,
    gameId: effectiveGameId,
  });

  entries.sort(comparator(metric));

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

async function resolveCandidateUserIds(
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
        where: { tournament: { status: "ENDED" } },
        select: { userId: true },
      });
      return [...new Set(rows.map((r) => r.userId))];
    }
    default:
      return null;
  }
}

async function cumulativeStats(
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

async function fetchMatchAggregates(
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

async function fetchTournamentAggregates(): Promise<Map<string, { wins: number; played: number }>> {
  const map = new Map<string, { wins: number; played: number }>();

  const playedRows = await prisma.$queryRaw<{ userId: string; played: bigint }[]>`
    SELECT tp."userId", COUNT(*) AS played
    FROM "TournamentPlayer" tp
    JOIN "Tournament" t ON t.id = tp."tournamentId"
    WHERE t."status"::text = 'ENDED'
    GROUP BY tp."userId"
  `;
  for (const row of playedRows) {
    map.set(row.userId, { wins: 0, played: Number(row.played) });
  }

  const winRows = await prisma.$queryRaw<{ userId: string; wins: bigint }[]>`
    WITH ended AS (
      SELECT id FROM "Tournament" WHERE "status"::text = 'ENDED'
    ),
    finals AS (
      SELECT tr."tournamentId", MAX(tr."roundNumber") AS rn
      FROM "TournamentRound" tr
      JOIN ended e ON e.id = tr."tournamentId"
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

function buildLeaderboardEntries(
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

    const metricValue = resolveMetricValue(metric, {
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

    // fastestWin / streak boards only rank players that actually qualify.
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

function resolveMetricValue(
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
      return ctx.maxStreak > 0 ? ctx.maxStreak : null;
  }
}

function comparator(metric: LeaderboardMetric) {
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

function periodStartOf(period: LeaderboardPeriod): Date | null {
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
