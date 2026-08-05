import { prisma } from "@gaming-hub/db";
import type { Achievement } from "@gaming-hub/shared";

/**
 * Data-driven achievement evaluation. Each seeded definition carries a
 * `condition` JSON payload interpreted here. Conditions never trust client
 * input — they are computed from server-owned statistics after each match.
 */
type AchievementCondition =
  | { rule: "first-win" }
  | { rule: "wins"; count: number }
  | { rule: "games"; count: number }
  | { rule: "game-win"; gameId: string }
  | { rule: "game-games"; gameId: string; count: number }
  | { rule: "level"; level: number };

export async function listAchievementDefinitions(): Promise<Achievement[]> {
  const rows = await prisma.achievement.findMany({ orderBy: { xpReward: "desc" } });
  return rows.map((a) => ({
    code: a.code,
    title: a.title,
    description: a.description,
    icon: a.icon,
    gameId: a.gameId as Achievement["gameId"],
    xpReward: a.xpReward,
  }));
}

export async function getMyAchievements(userId: string) {
  const rows = await prisma.userAchievement.findMany({
    where: { userId },
    include: { achievement: true },
    orderBy: { unlockedAt: "asc" },
  });
  return rows.map((r) => ({
    code: r.achievement.code,
    title: r.achievement.title,
    description: r.achievement.description,
    icon: r.achievement.icon,
    xpReward: r.achievement.xpReward,
    unlockedAt: r.unlockedAt.toISOString(),
  }));
}

export interface AchievementContext {
  userId: string;
  matchResult?: { won: boolean; gameId: string };
}

export async function checkAndUnlock(userId: string, ctx: AchievementContext) {
  const [definitions, unlocked, statistics, profile] = await Promise.all([
    prisma.achievement.findMany(),
    prisma.userAchievement.findMany({ where: { userId }, select: { achievementId: true } }),
    prisma.playerStatistic.findMany({ where: { userId } }),
    prisma.profile.findUnique({ where: { userId } }),
  ]);

  const unlockedIds = new Set(unlocked.map((u) => u.achievementId));
  const statsByGame = new Map(statistics.map((s) => [s.gameId, s]));
  const totalGames = statistics.reduce((sum, s) => sum + s.gamesPlayed, 0);
  const totalWins = statistics.reduce((sum, s) => sum + s.wins, 0);

  const newlyUnlocked: { code: string; title: string; description: string; icon: string; xpReward: number }[] = [];

  const toUnlock: string[] = [];

  for (const def of definitions) {
    if (unlockedIds.has(def.id)) continue;
    const condition = (def.condition as unknown as AchievementCondition) ?? { rule: "level", level: 99 };
    if (evaluateCondition(condition, { statsByGame, totalGames, totalWins, level: profile?.level ?? 1, ctx })) {
      toUnlock.push(def.id);
      newlyUnlocked.push({
        code: def.code,
        title: def.title,
        description: def.description,
        icon: def.icon,
        xpReward: def.xpReward,
      });
    }
  }

  if (toUnlock.length > 0) {
    await prisma.$transaction([
      ...toUnlock.map((achievementId) =>
        prisma.userAchievement.create({ data: { userId, achievementId } }),
      ),
      prisma.profile.update({
        where: { userId },
        data: { xp: { increment: newlyUnlocked.reduce((sum, a) => sum + a.xpReward, 0) } },
      }),
    ]);
  }

  return newlyUnlocked;
}

interface ConditionEnv {
  statsByGame: Map<string, { gamesPlayed: number; wins: number }>;
  totalGames: number;
  totalWins: number;
  level: number;
  ctx: AchievementContext;
}

function evaluateCondition(condition: AchievementCondition, env: ConditionEnv): boolean {
  switch (condition.rule) {
    case "first-win":
      return env.ctx.matchResult?.won === true && env.totalWins === 1;
    case "wins":
      return env.totalWins >= condition.count;
    case "games":
      return env.totalGames >= condition.count;
    case "game-win": {
      const stat = env.statsByGame.get(condition.gameId);
      return (stat?.wins ?? 0) >= 1;
    }
    case "game-games": {
      const stat = env.statsByGame.get(condition.gameId);
      return (stat?.gamesPlayed ?? 0) >= condition.count;
    }
    case "level":
      return env.level >= condition.level;
  }
}
