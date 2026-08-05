import { prisma } from "@gaming-hub/db";
import type { Prisma } from "@gaming-hub/db";
import { AppError } from "@gaming-hub/shared";

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
}

/** Updates profile, per-game statistics and the per-game leaderboard row. */
export async function recordMatchResult(
  tx: Prisma.TransactionClient,
  input: MatchResultInput,
): Promise<{ xpGained: number; newLevel: number }> {
  const xpGained =
    input.result === "win" ? XP_WIN : input.result === "draw" ? XP_DRAW : XP_LOSS;
  const ratingDelta =
    input.result === "win" ? RATING_WIN : input.result === "draw" ? RATING_DRAW : RATING_LOSS;

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
