import { prisma, Prisma } from "@gaming-hub/db";
import {
  AppError,
  GAME_DEFINITIONS,
  type DetailedPublicProfile,
  type PublicGameStatistic,
  type PublicTournamentStatistic,
  type RecentMatchItem,
  type RecentTournamentItem,
  type GameId,
} from "@gaming-hub/shared";
import { getPrivacySettings, updatePrivacySettings, canViewProfile } from "./privacyService";

export class PlayerProfileService {
  /**
   * Get detailed public profile for any player with authoritative statistics and strict privacy enforcement.
   * Never leaks email, phone, wallet balances, payment transactions, or security credentials.
   */
  static async getPublicProfile(
    userId: string,
    viewerId?: string,
    isAdmin = false,
  ): Promise<DetailedPublicProfile> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        userAchievements: {
          include: { achievement: true },
          orderBy: { unlockedAt: "desc" },
        },
      },
    });

    if (!user) {
      throw new AppError("NOT_FOUND", "Player not found", 404);
    }

    const isOwner = viewerId === userId;
    const privacy = await getPrivacySettings(userId);
    const allowed =
      isOwner ||
      isAdmin ||
      (viewerId
        ? await canViewProfile(viewerId, userId)
        : privacy.profileVisibility === "EVERYONE");
    const isPrivate = privacy.profileVisibility !== "EVERYONE";

    const gameDefMap = new Map(GAME_DEFINITIONS.map((g) => [g.id, g]));

    // If private profile / viewer not allowed, return masked profile
    if (!allowed) {
      return {
        userId: user.id,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        bio: user.profile?.bio ?? null,
        country: user.profile?.country ?? null,
        level: user.profile?.level ?? 1,
        xp: user.profile?.xp ?? 0,
        joinedAt: user.createdAt.toISOString(),
        isOnline: user.isOnline,
        lastSeenAt: user.lastSeenAt?.toISOString() ?? null,
        isPrivate: true,
        gamesPlayed: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        winRate: 0,
        globalRating: 0,
        gameStats: [],
        tournamentStats: {
          tournamentsJoined: 0,
          tournamentsCompleted: 0,
          wins: 0,
          podiums: 0,
          bestRank: null,
          totalMatches: 0,
        },
        recentMatches: [],
        recentTournaments: [],
        achievements: {
          unlockedCount: 0,
          totalCount: 0,
          recent: [],
        },
      };
    }

    // 1. Per-game Statistics & Ratings
    const [rawStats, recentMatchPlayers, rawTournaments, totalAchievementsCount] = await Promise.all([
      prisma.playerStatistic.findMany({
        where: { userId },
        orderBy: { rating: "desc" },
      }),
      prisma.matchPlayer.findMany({
        where: {
          userId,
          match: { status: "FINISHED" },
        },
        include: {
          match: {
            include: {
              players: {
                include: {
                  user: {
                    select: { id: true, username: true, displayName: true, avatarUrl: true },
                  },
                },
              },
            },
          },
        },
        orderBy: { match: { endedAt: "desc" } },
        take: 10,
      }),
      prisma.tournamentPlayer.findMany({
        where: { userId },
        include: {
          tournament: {
            select: { id: true, title: true, gameId: true, status: true, endTime: true, createdAt: true },
          },
        },
        orderBy: { registeredAt: "desc" },
        take: 10,
      }),
      prisma.achievement.count().catch(() => 0),
    ]);

    const gameStats: PublicGameStatistic[] = rawStats.map((st) => {
      const gDef = gameDefMap.get(st.gameId as GameId);
      const totalEligible = st.wins + st.losses + st.draws;
      const winRate = totalEligible > 0 ? (st.wins / totalEligible) * 100 : 0;

      return {
        gameId: st.gameId,
        gameName: gDef?.name ?? st.gameId,
        icon: gDef?.icon ?? "🎮",
        gamesPlayed: st.gamesPlayed,
        wins: st.wins,
        losses: st.losses,
        draws: st.draws,
        winRate: Math.round(winRate * 10) / 10,
        rating: st.rating,
        bestScore: st.bestScore,
        rank: null,
      };
    });

    // 2. Global performance aggregates
    const profileWins = user.profile?.wins ?? 0;
    const profileLosses = user.profile?.losses ?? 0;
    const profileDraws = user.profile?.draws ?? 0;
    const totalGames = profileWins + profileLosses + profileDraws;
    const overallWinRate = totalGames > 0 ? (profileWins / totalGames) * 100 : 0;
    const globalRating = rawStats.reduce((sum, s) => sum + s.rating, 0);

    // 3. Tournament Performance
    const tournamentsJoined = rawTournaments.length;
    const completedTournaments = rawTournaments.filter((t) => t.tournament.status === "ENDED" || t.tournament.status === "COMPLETED");
    const tournamentWins = rawTournaments.filter((t) => t.finalRank === 1).length;
    const podiums = rawTournaments.filter((t) => t.finalRank && t.finalRank <= 3).length;
    const bestRank = rawTournaments.reduce<number | null>((min, t) => {
      if (!t.finalRank) return min;
      return min === null ? t.finalRank : Math.min(min, t.finalRank);
    }, null);

    const tournamentStats: PublicTournamentStatistic = {
      tournamentsJoined,
      tournamentsCompleted: completedTournaments.length,
      wins: tournamentWins,
      podiums,
      bestRank,
      totalMatches: completedTournaments.length,
    };

    // 4. Recent Matches (with Opponent info)
    const recentMatches: RecentMatchItem[] = recentMatchPlayers.map((mp) => {
      const m = mp.match;
      const gDef = gameDefMap.get(m.gameId as GameId);
      const opponentPlayer = m.players.find((p) => p.userId !== userId);
      const oppUser = opponentPlayer?.user;

      let result: "WIN" | "LOSS" | "DRAW" = "DRAW";
      if (mp.result === "WIN") result = "WIN";
      else if (mp.result === "LOSS") result = "LOSS";

      return {
        matchId: m.id,
        gameId: m.gameId,
        gameName: gDef?.name ?? m.gameId,
        icon: gDef?.icon ?? "🎮",
        result,
        score: mp.score,
        opponent: oppUser
          ? {
              userId: oppUser.id,
              username: oppUser.username,
              displayName: oppUser.displayName,
              avatarUrl: oppUser.avatarUrl,
            }
          : null,
        endedAt: m.endedAt?.toISOString() ?? m.createdAt.toISOString(),
      };
    });

    // 5. Recent Tournaments
    const recentTournaments: RecentTournamentItem[] = rawTournaments.slice(0, 5).map((tp) => {
      const t = tp.tournament;
      const gDef = gameDefMap.get(t.gameId as GameId);

      return {
        tournamentId: t.id,
        title: t.title,
        gameId: t.gameId,
        gameName: gDef?.name ?? t.gameId,
        icon: gDef?.icon ?? "🏆",
        rank: tp.finalRank ?? null,
        eliminated: tp.eliminated,
        endedAt: t.endTime?.toISOString() ?? t.createdAt.toISOString(),
      };
    });

    // 6. Achievements
    const unlockedAchievements = user.userAchievements.map((ua) => ({
      code: ua.achievement.code,
      title: ua.achievement.title,
      description: ua.achievement.description,
      icon: ua.achievement.icon,
      unlockedAt: ua.unlockedAt.toISOString(),
    }));

    const maskStats = !isOwner && !isAdmin && !privacy.showStats;

    return {
      userId: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      bio: user.profile?.bio ?? null,
      country: user.profile?.country ?? null,
      level: user.profile?.level ?? 1,
      xp: user.profile?.xp ?? 0,
      joinedAt: user.createdAt.toISOString(),
      isOnline: user.isOnline,
      lastSeenAt: user.lastSeenAt?.toISOString() ?? null,
      isPrivate,
      gamesPlayed: maskStats ? 0 : totalGames,
      wins: maskStats ? 0 : profileWins,
      losses: maskStats ? 0 : profileLosses,
      draws: maskStats ? 0 : profileDraws,
      winRate: maskStats ? 0 : Math.round(overallWinRate * 10) / 10,
      globalRating: maskStats ? 0 : globalRating,
      gameStats: maskStats ? [] : gameStats,
      tournamentStats: maskStats
        ? {
            tournamentsJoined: 0,
            tournamentsCompleted: 0,
            wins: 0,
            podiums: 0,
            bestRank: null,
            totalMatches: 0,
          }
        : tournamentStats,
      recentMatches: maskStats ? [] : recentMatches,
      recentTournaments: maskStats ? [] : recentTournaments,
      achievements: {
        unlockedCount: unlockedAchievements.length,
        totalCount: totalAchievementsCount,
        recent: unlockedAchievements.slice(0, 8),
      },
    };
  }

  /**
   * Get full authenticated private user data for the currently logged-in player.
   */
  static async getMyProfile(userId: string) {
    const [publicData, wallet, profile] = await Promise.all([
      this.getPublicProfile(userId, userId, true),
      prisma.wallet.findUnique({ where: { userId } }),
      prisma.profile.findUnique({ where: { userId } }),
    ]);

    let phone = profile?.phone ?? null;
    let dateOfBirth = profile?.dateOfBirth?.toISOString() ?? null;
    let streetAddress = profile?.streetAddress ?? null;
    let city = profile?.city ?? null;
    let state = profile?.state ?? null;
    let postcode = profile?.postcode ?? null;

    if (!streetAddress || !city || !postcode) {
      const kyc = await prisma.kycRequest.findUnique({
        where: { userId },
        select: {
          streetAddress: true,
          city: true,
          state: true,
          postalCode: true,
          dateOfBirth: true,
          mobileNumber: true,
        },
      });
      if (kyc && (kyc.streetAddress || kyc.city)) {
        streetAddress = streetAddress || kyc.streetAddress;
        city = city || kyc.city;
        state = state || kyc.state;
        postcode = postcode || kyc.postalCode;
        if (!phone && kyc.mobileNumber) phone = kyc.mobileNumber;
        if (!dateOfBirth && kyc.dateOfBirth) dateOfBirth = kyc.dateOfBirth.toISOString();
      }
    }

    return {
      ...publicData,
      phone,
      dateOfBirth,
      streetAddress,
      city,
      state,
      postcode,
      wallet: wallet
        ? {
            balance: wallet.balance,
            bonusBalance: wallet.bonusBalance,
            lockedBalance: wallet.lockedBalance,
          }
        : null,
    };
  }

  /**
   * Search players by username or display name with pagination and privacy compliance.
   */
  static async searchPlayers(query: string, page = 1, pageSize = 10, viewerId?: string) {
    const q = query.trim();
    if (!q) return { items: [], total: 0, page, pageSize };

    const where: Prisma.UserWhereInput = {
      OR: [
        { id: { equals: q } },
        { username: { contains: q, mode: "insensitive" } },
        { displayName: { contains: q, mode: "insensitive" } },
      ],
      deletedAt: null,
    };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        take: pageSize,
        skip: (page - 1) * pageSize,
        select: { id: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.user.count({ where }),
    ]);

    const items = await Promise.all(
      users.map((u) => this.getPublicProfile(u.id, viewerId)),
    );

    return {
      items,
      total,
      page,
      pageSize,
    };
  }

  /**
   * Update profile privacy setting.
   */
  static async setProfilePrivacy(userId: string, isPrivate: boolean): Promise<boolean> {
    await updatePrivacySettings(userId, { profileVisibility: isPrivate ? "NOBODY" : "EVERYONE" });
    return isPrivate;
  }

  static async getProfilePrivacy(userId: string): Promise<boolean> {
    const settings = await getPrivacySettings(userId);
    return settings.profileVisibility === "NOBODY";
  }
}
