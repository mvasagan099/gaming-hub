import { prisma } from "@gaming-hub/db";
import type { Achievement } from "@gaming-hub/shared";
import { applyTransaction } from "./wallet";

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
  | { rule: "level"; level: number }
  | { rule: "referrals"; count: number }
  | { rule: "friends"; count: number }
  | { rule: "wallet-balance"; min: number }
  | { rule: "tournament-wins"; count: number }
  | { rule: "referral-rewards"; count: number }
  | { rule: "xp"; count: number };

interface AchievementReward {
  reward?: { coins?: number; title?: string };
}

function rewardOf(condition: AchievementCondition): AchievementReward["reward"] {
  return (condition as AchievementCondition & AchievementReward).reward;
}

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
  referralCount?: number;
  referralRewards?: number;
  friendsCount?: number;
  tournamentWins?: number;
  walletBalance?: number;
}

export async function checkAndUnlock(userId: string, ctx: AchievementContext) {
  const [definitions, unlocked, statistics, profile, wallet] = await Promise.all([
    prisma.achievement.findMany(),
    prisma.userAchievement.findMany({ where: { userId }, select: { achievementId: true } }),
    prisma.playerStatistic.findMany({ where: { userId } }),
    prisma.profile.findUnique({ where: { userId } }),
    prisma.wallet.findUnique({ where: { userId } }),
  ]);

  const unlockedIds = new Set(unlocked.map((u) => u.achievementId));
  const statsByGame = new Map(statistics.map((s) => [s.gameId, s]));
  const totalGames = statistics.reduce((sum, s) => sum + s.gamesPlayed, 0);
  const totalWins = statistics.reduce((sum, s) => sum + s.wins, 0);

  const newlyUnlocked: {
    code: string;
    title: string;
    description: string;
    icon: string;
    xpReward: number;
    coinReward: number;
  }[] = [];

  const toUnlock: string[] = [];

  const env: ConditionEnv = {
    statsByGame,
    totalGames,
    totalWins,
    level: profile?.level ?? 1,
    xp: profile?.xp ?? 0,
    referrals: ctx.referralCount ?? 0,
    referralRewards: ctx.referralRewards ?? 0,
    friends: ctx.friendsCount ?? 0,
    tournamentWins: ctx.tournamentWins ?? 0,
    walletBalance: ctx.walletBalance ?? wallet?.balance ?? 0,
    ctx,
  };

  for (const def of definitions) {
    if (unlockedIds.has(def.id)) continue;
    const condition = (def.condition as unknown as AchievementCondition) ?? { rule: "level", level: 99 };
    if (evaluateCondition(condition, env)) {
      toUnlock.push(def.id);
      newlyUnlocked.push({
        code: def.code,
        title: def.title,
        description: def.description,
        icon: def.icon,
        xpReward: def.xpReward,
        coinReward: rewardOf(condition)?.coins ?? 0,
      });
    }
  }

  if (toUnlock.length > 0) {
    const xpTotal = newlyUnlocked.reduce((sum, a) => sum + a.xpReward, 0);
    const coinTotal = newlyUnlocked.reduce((sum, a) => sum + a.coinReward, 0);

    await prisma.$transaction(async (tx) => {
      for (const achievementId of toUnlock) {
        await tx.userAchievement.create({ data: { userId, achievementId } });
      }
      if (xpTotal > 0) {
        await tx.profile.update({
          where: { userId },
          data: { xp: { increment: xpTotal } },
        });
      }
      if (coinTotal > 0) {
        await applyTransaction(tx, userId, coinTotal, "REWARD_CREDIT", null, { via: "achievement" }, "REWARD");
      }
    });
  }

  return newlyUnlocked;
}

interface ConditionEnv {
  statsByGame: Map<string, { gamesPlayed: number; wins: number }>;
  totalGames: number;
  totalWins: number;
  level: number;
  xp: number;
  referrals: number;
  referralRewards: number;
  friends: number;
  tournamentWins: number;
  walletBalance: number;
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
    case "xp":
      return env.xp >= condition.count;
    case "referrals":
      return env.referrals >= condition.count;
    case "referral-rewards":
      return env.referralRewards >= condition.count;
    case "friends":
      return env.friends >= condition.count;
    case "tournament-wins":
      return env.tournamentWins >= condition.count;
    case "wallet-balance":
      return env.walletBalance >= condition.min;
  }
}
