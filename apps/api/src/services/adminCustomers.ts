import { prisma } from "@gaming-hub/db";
import type { LoginSession, UserAchievement } from "@gaming-hub/shared";
import { AppError } from "@gaming-hub/shared";

/**
 * CRM 360 customer view: aggregates every touchpoint we track for one user so
 * agents can support, risk-assess, and market to them from a single pane.
 */
export async function getAdminCustomerDetail(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      profile: true,
      wallet: true,
    },
  });
  if (!user) {
    throw new AppError("NOT_FOUND", "User not found", 404);
  }

  const [statistics, transactions, tickets, referrals, sessions, matches, achievements] =
    await Promise.all([
      prisma.playerStatistic.findMany({
        where: { userId },
        orderBy: { gamesPlayed: "desc" },
        take: 50,
      }),
      prisma.transaction.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 25,
      }),
      prisma.supportTicket.findMany({
        where: { userId },
        orderBy: { updatedAt: "desc" },
        take: 10,
      }),
      prisma.referral.findMany({
        where: { referrerId: userId },
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { referredUser: true },
      }),
      prisma.loginSession.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      prisma.matchPlayer.findMany({
        where: { userId },
        orderBy: { match: { createdAt: "desc" } },
        take: 10,
        include: { match: true },
      }),
      prisma.userAchievement.findMany({
        where: { userId },
        include: { achievement: true },
        orderBy: { unlockedAt: "desc" },
        take: 20,
      }),
    ]);

  return {
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      email: user.email,
      avatarUrl: user.avatarUrl,
      role: user.role,
      isOnline: user.isOnline,
      lastSeenAt: user.lastSeenAt ? user.lastSeenAt.toISOString() : null,
      createdAt: user.createdAt.toISOString(),
    },
    profile: user.profile
      ? {
          bio: user.profile.bio,
          country: user.profile.country,
          phone: user.profile.phone,
          currency: user.profile.currency,
          coins: user.profile.coins,
          gems: user.profile.gems,
          xp: user.profile.xp,
          level: user.profile.level,
          wins: user.profile.wins,
          losses: user.profile.losses,
          draws: user.profile.draws,
          referredBy: user.profile.referredBy,
        }
      : null,
    wallet: user.wallet
      ? {
          balance: user.wallet.balance,
          bonusBalance: user.wallet.bonusBalance,
          lockedBalance: user.wallet.lockedBalance,
          rewardBalance: user.wallet.rewardBalance,
          cashbackBalance: user.wallet.cashbackBalance,
        }
      : null,
    statistics: statistics.map((s) => ({
      id: s.userId,
      gameId: s.gameId,
      gamesPlayed: s.gamesPlayed,
      wins: s.wins,
      losses: s.losses,
      draws: s.draws,
      bestScore: s.bestScore,
      totalXp: s.totalXp,
      rating: s.rating,
    })),
    transactions: transactions.map((t) => ({
      id: t.id,
      type: t.type,
      amount: t.amount,
      balanceAfter: t.balanceAfter,
      walletType: t.walletType,
      referenceType: t.referenceType,
      createdAt: t.createdAt.toISOString(),
    })),
    tickets: tickets.map((t) => ({
      id: t.id,
      subject: t.subject,
      category: t.category,
      status: t.status as "OPEN" | "PENDING" | "RESOLVED" | "CLOSED",
      priority: t.priority as "LOW" | "MEDIUM" | "HIGH" | "URGENT",
      createdAt: t.createdAt.toISOString(),
    })),
    referrals: referrals.map((r) => ({
      id: r.id,
      code: r.code,
      status: r.status as "PENDING" | "COMPLETED" | "REWARDED",
      commission: r.commission,
      createdAt: r.createdAt.toISOString(),
      referredUser: {
        id: r.referredUser.id,
        username: r.referredUser.username,
        displayName: r.referredUser.displayName,
        avatarUrl: r.referredUser.avatarUrl,
        isOnline: r.referredUser.isOnline,
      },
    })),
    sessions: sessions.map(
      (s): LoginSession => ({
        id: s.id,
        ip: s.ip,
        userAgent: s.userAgent,
        deviceName: s.deviceName,
        isCurrent: s.isCurrent,
        createdAt: s.createdAt.toISOString(),
        expiresAt: s.expiresAt.toISOString(),
        revokedAt: s.revokedAt ? s.revokedAt.toISOString() : null,
      }),
    ),
    matches: matches.map((mp) => ({
      id: mp.matchId,
      gameId: mp.match.gameId,
      status: mp.match.status,
      stake: mp.match.stake,
      createdAt: mp.match.createdAt.toISOString(),
      result: mp.result,
      score: mp.score,
    })),
    achievements: achievements.map(
      (a): UserAchievement => ({
        code: a.achievement.code,
        title: a.achievement.title,
        description: a.achievement.description,
        icon: a.achievement.icon,
        xpReward: a.achievement.xpReward,
        unlockedAt: a.unlockedAt.toISOString(),
      }),
    ),
  };
}
