import { prisma, Prisma, NotificationType } from "@gaming-hub/db";
import {
  AppError,
  type AchievementCategory,
  type AchievementConditionPayload,
  type AchievementDefinition,
  type UserAchievementItem,
  type AchievementProgress,
} from "@gaming-hub/shared";
import { NotificationService } from "./notificationService";
import { audit } from "./audit";

export interface AchievementContext {
  userId: string;
  matchResult?: { won: boolean; gameId: string; isDraw?: boolean };
  tournamentWins?: number;
  tournamentPodiums?: number;
  referralCount?: number;
  friendsCount?: number;
}

export class AchievementService {
  /**
   * Calculate consecutive win streak from finished matches.
   * - WIN advances streak
   * - LOSS breaks streak
   * - DRAW pauses streak
   * - CANCELLED / ABORTED matches are ignored
   */
  static async calculateWinStreak(userId: string, gameId?: string): Promise<number> {
    const where: Prisma.MatchPlayerWhereInput = {
      userId,
      match: {
        status: "FINISHED",
        ...(gameId ? { gameId } : {}),
      },
    };

    const matchPlayers = await prisma.matchPlayer.findMany({
      where,
      include: {
        match: {
          select: { id: true, status: true, endedAt: true, createdAt: true },
        },
      },
      orderBy: { match: { endedAt: "desc" } },
      take: 50,
    });

    let streak = 0;
    for (const mp of matchPlayers) {
      if (mp.result === "WIN") {
        streak++;
      } else if (mp.result === "LOSS") {
        break; // Loss breaks streak
      }
      // DRAW or PENDING does not break or increase streak
    }

    return streak;
  }

  /**
   * Server-side authoritative evaluation of achievements.
   * Evaluates all defined rules against current player statistics.
   * Safe, idempotent, retryable, and dispatches notifications on newly unlocked achievements.
   */
  static async evaluateAchievements(userId: string, ctx: AchievementContext = { userId }) {
    const [definitions, unlockedRows, statistics, profile, tournaments, currentStreak] =
      await Promise.all([
        prisma.achievement.findMany(),
        prisma.userAchievement.findMany({
          where: { userId },
          select: { achievementId: true },
        }),
        prisma.playerStatistic.findMany({ where: { userId } }),
        prisma.profile.findUnique({ where: { userId } }),
        prisma.tournamentPlayer.findMany({
          where: { userId },
          include: {
            tournament: {
              select: { status: true },
            },
          },
        }),
        this.calculateWinStreak(userId),
      ]);

    const unlockedIds = new Set(unlockedRows.map((u) => u.achievementId));
    const statsByGame = new Map(statistics.map((s) => [s.gameId, s]));
    const totalGames = statistics.reduce((sum, s) => sum + s.gamesPlayed, 0);
    const totalWins = statistics.reduce((sum, s) => sum + s.wins, 0);
    const tournamentWins = tournaments.filter((t) => t.finalRank === 1).length;
    const tournamentPodiums = tournaments.filter((t) => t.finalRank && t.finalRank <= 3).length;
    const tournamentJoined = tournaments.length;

    const newlyUnlocked: AchievementDefinition[] = [];

    for (const def of definitions) {
      if (unlockedIds.has(def.id)) continue;

      const condition = (def.condition as unknown as AchievementConditionPayload) ?? { rule: "games", count: 999 };
      let qualified = false;

      switch (condition.rule) {
        case "first-win":
          qualified = totalWins >= 1 || ctx.matchResult?.won === true;
          break;

        case "games":
          qualified = totalGames >= (condition.count ?? 1);
          break;

        case "wins":
          qualified = totalWins >= (condition.count ?? 1);
          break;

        case "streak":
          qualified = currentStreak >= (condition.count ?? 1);
          break;

        case "tournament-wins":
          qualified = tournamentWins >= (condition.count ?? 1);
          break;

        case "tournament-podium":
          qualified = tournamentPodiums >= (condition.count ?? 1);
          break;

        case "tournament-joined":
          qualified = tournamentJoined >= (condition.count ?? 1);
          break;

        case "game-win": {
          const gameId = condition.gameId || def.gameId;
          const stat = gameId ? statsByGame.get(gameId) : null;
          qualified = (stat?.wins ?? 0) >= 1 || (ctx.matchResult?.gameId === gameId && ctx.matchResult?.won === true);
          break;
        }

        case "game-games": {
          const gameId = condition.gameId || def.gameId;
          const stat = gameId ? statsByGame.get(gameId) : null;
          qualified = (stat?.gamesPlayed ?? 0) >= (condition.count ?? 1);
          break;
        }

        case "game-rating": {
          const gameId = condition.gameId || def.gameId;
          const stat = gameId ? statsByGame.get(gameId) : null;
          qualified = (stat?.rating ?? 1000) >= (condition.min ?? 1200);
          break;
        }

        case "level":
          qualified = (profile?.level ?? 1) >= (condition.level ?? 1);
          break;

        case "xp":
          qualified = (profile?.xp ?? 0) >= (condition.count ?? 1);
          break;
      }

      if (qualified) {
        newlyUnlocked.push({
          id: def.id,
          code: def.code,
          title: def.title,
          description: def.description,
          icon: def.icon,
          gameId: def.gameId as any,
          xpReward: def.xpReward,
          category: (condition.category ?? "GAMES") as AchievementCategory,
          condition,
        });
      }
    }

    if (newlyUnlocked.length > 0) {
      const xpTotal = newlyUnlocked.reduce((sum, a) => sum + a.xpReward, 0);

      let actualInserted = 0;

      // Idempotently create achievements in a transaction with atomic duplicate skipping
      await prisma.$transaction(async (tx) => {
        const toCreate = newlyUnlocked.map((ach) => ({
          userId,
          achievementId: ach.id,
        }));

        const result = await tx.userAchievement.createMany({
          data: toCreate,
          skipDuplicates: true,
        });
        actualInserted = result.count;

        if (actualInserted > 0 && xpTotal > 0) {
          await tx.profile.update({
            where: { userId },
            data: { xp: { increment: xpTotal } },
          });
        }
      });

      if (actualInserted === 0) {
        return [];
      }

      // Dispatch notifications (non-blocking)
      for (const ach of newlyUnlocked) {
        await NotificationService.createNotification({
          userId,
          type: NotificationType.ACHIEVEMENT,
          title: `🏆 Achievement Unlocked: ${ach.title}`,
          body: ach.description,
          referenceType: "ACHIEVEMENT",
          referenceId: ach.code,
          data: {
            achievementCode: ach.code,
            icon: ach.icon,
            xpReward: ach.xpReward,
          },
        }).catch((err) => {
          console.error("Failed to send achievement notification:", err);
        });
      }
    }

    return newlyUnlocked;
  }

  /**
   * Unlock a specific achievement directly (e.g. manual admin grant or specific trigger).
   */
  static async unlockAchievement(userId: string, achievementId: string) {
    const achievement = await prisma.achievement.findUnique({ where: { id: achievementId } });
    if (!achievement) {
      throw new AppError("NOT_FOUND", "Achievement not found", 404);
    }

    const created = await prisma.userAchievement.upsert({
      where: {
        userId_achievementId: {
          userId,
          achievementId,
        },
      },
      create: { userId, achievementId },
      update: {},
    });

    if (achievement.xpReward > 0) {
      await prisma.profile.update({
        where: { userId },
        data: { xp: { increment: achievement.xpReward } },
      });
    }

    await NotificationService.createNotification({
      userId,
      type: NotificationType.ACHIEVEMENT,
      title: `🏆 Achievement Unlocked: ${achievement.title}`,
      body: achievement.description,
      referenceType: "ACHIEVEMENT",
      referenceId: achievement.code,
      data: {
        achievementCode: achievement.code,
        icon: achievement.icon,
        xpReward: achievement.xpReward,
      },
    }).catch(() => undefined);

    return created;
  }

  /**
   * Get all achievements with real-time numerical progress for any user.
   */
  static async getPlayerAchievements(userId: string): Promise<UserAchievementItem[]> {
    const [definitions, unlockedRows, statistics, profile, tournaments, currentStreak] =
      await Promise.all([
        prisma.achievement.findMany({ orderBy: { xpReward: "desc" } }),
        prisma.userAchievement.findMany({
          where: { userId },
          include: { achievement: true },
        }),
        prisma.playerStatistic.findMany({ where: { userId } }),
        prisma.profile.findUnique({ where: { userId } }),
        prisma.tournamentPlayer.findMany({ where: { userId } }),
        this.calculateWinStreak(userId),
      ]);

    const unlockedMap = new Map(
      unlockedRows.map((u) => [u.achievementId, u.unlockedAt.toISOString()]),
    );

    const statsByGame = new Map(statistics.map((s) => [s.gameId, s]));
    const totalGames = statistics.reduce((sum, s) => sum + s.gamesPlayed, 0);
    const totalWins = statistics.reduce((sum, s) => sum + s.wins, 0);
    const tournamentWins = tournaments.filter((t) => t.finalRank === 1).length;
    const tournamentPodiums = tournaments.filter((t) => t.finalRank && t.finalRank <= 3).length;
    const tournamentJoined = tournaments.length;

    return definitions.map((def) => {
      const condition = (def.condition as unknown as AchievementConditionPayload) ?? { rule: "games", count: 1 };
      const isUnlocked = unlockedMap.has(def.id);
      const unlockedAt = unlockedMap.get(def.id) ?? null;

      let current = 0;
      let target = 1;

      switch (condition.rule) {
        case "first-win":
          target = 1;
          current = totalWins >= 1 ? 1 : 0;
          break;

        case "games":
          target = condition.count ?? 100;
          current = Math.min(totalGames, target);
          break;

        case "wins":
          target = condition.count ?? 50;
          current = Math.min(totalWins, target);
          break;

        case "streak":
          target = condition.count ?? 5;
          current = Math.min(currentStreak, target);
          break;

        case "tournament-wins":
          target = condition.count ?? 1;
          current = Math.min(tournamentWins, target);
          break;

        case "tournament-podium":
          target = condition.count ?? 3;
          current = Math.min(tournamentPodiums, target);
          break;

        case "tournament-joined":
          target = condition.count ?? 5;
          current = Math.min(tournamentJoined, target);
          break;

        case "game-games": {
          const gameId = condition.gameId || def.gameId;
          const stat = gameId ? statsByGame.get(gameId) : null;
          target = condition.count ?? 10;
          current = Math.min(stat?.gamesPlayed ?? 0, target);
          break;
        }

        case "game-win": {
          const gameId = condition.gameId || def.gameId;
          const stat = gameId ? statsByGame.get(gameId) : null;
          target = 1;
          current = (stat?.wins ?? 0) >= 1 ? 1 : 0;
          break;
        }

        case "game-rating": {
          const gameId = condition.gameId || def.gameId;
          const stat = gameId ? statsByGame.get(gameId) : null;
          target = condition.min ?? 1500;
          current = Math.min(stat?.rating ?? 1000, target);
          break;
        }

        case "level":
          target = condition.level ?? 5;
          current = Math.min(profile?.level ?? 1, target);
          break;

        case "xp":
          target = condition.count ?? 500;
          current = Math.min(profile?.xp ?? 0, target);
          break;
      }

      if (isUnlocked) {
        current = target;
      }

      const percentage = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 100;

      return {
        code: def.code,
        title: def.title,
        description: def.description,
        icon: def.icon,
        category: (condition.category ?? "GAMES") as AchievementCategory,
        gameId: def.gameId,
        xpReward: def.xpReward,
        unlocked: isUnlocked,
        unlockedAt,
        progress: {
          current,
          target,
          percentage,
        },
      };
    });
  }

  /**
   * Admin manual unlock with required audit logging.
   */
  static async adminManualUnlock(
    userId: string,
    achievementId: string,
    adminId: string,
    reason: string,
  ) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new AppError("NOT_FOUND", "User not found", 404);
    }

    const achievement = await prisma.achievement.findUnique({ where: { id: achievementId } });
    if (!achievement) {
      throw new AppError("NOT_FOUND", "Achievement not found", 404);
    }

    const record = await this.unlockAchievement(userId, achievementId);

    // Record audit log entry
    audit({
      actorType: "user",
      actorId: adminId,
      action: "achievement.manual_unlock",
      category: "admin",
      targetType: "User",
      targetId: userId,
      meta: {
        achievementCode: achievement.code,
        achievementTitle: achievement.title,
        reason,
      },
    });

    return record;
  }

  /**
   * Admin: List all achievements with unlock stats.
   */
  static async listAdminAchievements() {
    const [achievements, unlockCounts] = await Promise.all([
      prisma.achievement.findMany({ orderBy: { code: "asc" } }),
      prisma.userAchievement.groupBy({
        by: ["achievementId"],
        _count: { userId: true },
      }),
    ]);

    const countMap = new Map(unlockCounts.map((c) => [c.achievementId, c._count.userId]));

    return achievements.map((a) => ({
      ...a,
      unlockedCount: countMap.get(a.id) ?? 0,
    }));
  }

  /**
   * Admin: Create new achievement.
   */
  static async createAchievement(data: {
    code: string;
    title: string;
    description: string;
    icon: string;
    gameId?: string | null;
    xpReward: number;
    condition: object;
  }) {
    const existing = await prisma.achievement.findUnique({ where: { code: data.code } });
    if (existing) {
      throw new AppError("VALIDATION_ERROR", "Achievement with this code already exists", 409);
    }

    return prisma.achievement.create({
      data: {
        code: data.code,
        title: data.title,
        description: data.description,
        icon: data.icon,
        gameId: data.gameId ?? null,
        xpReward: data.xpReward,
        condition: data.condition as Prisma.InputJsonValue,
      },
    });
  }

  /**
   * Admin: Update achievement definition.
   */
  static async updateAchievement(
    id: string,
    data: {
      title?: string;
      description?: string;
      icon?: string;
      gameId?: string | null;
      xpReward?: number;
      condition?: object;
    },
  ) {
    const existing = await prisma.achievement.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError("NOT_FOUND", "Achievement not found", 404);
    }

    return prisma.achievement.update({
      where: { id },
      data: {
        title: data.title,
        description: data.description,
        icon: data.icon,
        gameId: data.gameId === undefined ? undefined : data.gameId,
        xpReward: data.xpReward,
        condition: data.condition ? (data.condition as Prisma.InputJsonValue) : undefined,
      },
    });
  }
}
