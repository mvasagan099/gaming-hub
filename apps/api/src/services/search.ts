import { prisma } from "@gaming-hub/db";
import { GAME_DEFINITIONS } from "@gaming-hub/shared";
import type {
  SearchType,
  SearchResults,
  GameSearchResult,
  EventSearchResult,
  AchievementSearchResult,
  TournamentSummary,
  PublicUserSummary,
  GameId,
} from "@gaming-hub/shared";
import { getCategorySettings } from "./settings";
import { isFeatureEnabled } from "./featureFlags";
import { RateLimitService } from "./rateLimitService";
import { AppError } from "@gaming-hub/shared";

import { PlayerProfileService } from "./playerProfileService";
import { isUserOnline } from "./users";

export interface SearchInput {
  query: string;
  type?: SearchType;
  page?: number;
  limit?: number;
}

export class SearchService {
  /**
   * 1. Search Games from local definitions & dynamic configuration
   */
  static async searchGames(query: string, limit = 20): Promise<GameSearchResult[]> {
    const q = query.trim().toLowerCase();
    if (!q || q.length < 2) return [];

    const matched = GAME_DEFINITIONS.filter((g) => {
      const nameMatch = g.name.toLowerCase().includes(q);
      const descMatch = g.description.toLowerCase().includes(q);
      const catMatch = g.category.toLowerCase().includes(q);
      const tagMatch = (g as any).tags?.some((t: string) => t.toLowerCase().includes(q)) ?? false;
      return nameMatch || descMatch || catMatch || tagMatch;
    });

    return matched.slice(0, limit).map((g) => ({
      gameId: g.id as GameId,
      name: g.name,
      description: g.description,
      icon: g.icon,
      playersOnline: 0,
    }));
  }

  /**
   * 2. Search Public Players with strict privacy & security
   */
  static async searchPlayers(
    query: string,
    limit = 20,
    requestingUserId?: string,
    isAdmin = false
  ): Promise<PublicUserSummary[]> {
    const q = query.trim().replace(/^@+/, "");
    if (!q) return [];

    const users = await prisma.user.findMany({
      where: {
        deletedAt: null,
        ...(requestingUserId && !isAdmin ? { id: { not: requestingUserId } } : {}),
        OR: [
          { username: { contains: q, mode: "insensitive" } },
          { displayName: { contains: q, mode: "insensitive" } },
          { id: q },
        ],
      },
      take: limit,
      include: {
        profile: true,
      },
    });

    return Promise.all(users.map(async (u) => {
      const isOwner = requestingUserId === u.id;
      const isPrivate =
        (await PlayerProfileService.getProfilePrivacy(u.id) ||
          Boolean((u.profile as any)?.isPrivate)) &&
        !isOwner &&
        !isAdmin;

      return {
        id: u.id,
        username: u.username,
        displayName: u.displayName,
        avatarUrl: u.avatarUrl,
        isOnline: isUserOnline(u),
        level: u.profile?.level ?? 1,
        xp: u.profile?.xp ?? 0,
        wins: isPrivate ? 0 : u.profile?.wins ?? 0,
        losses: isPrivate ? 0 : u.profile?.losses ?? 0,
        draws: isPrivate ? 0 : u.profile?.draws ?? 0,
        globalRating: (u.profile as any)?.globalRating ?? 1200,
        createdAt: u.createdAt.toISOString(),
      };
    }));
  }

  /**
   * 3. Search Tournaments respecting visibility rules
   */
  static async searchTournaments(
    query: string,
    limit = 20,
    requestingUserId?: string,
    isAdmin = false
  ): Promise<TournamentSummary[]> {
    const q = query.trim();
    if (!q || q.length < 2) return [];

    const where: any = {
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
        { gameId: { contains: q, mode: "insensitive" } },
      ],
    };

    if (!isAdmin) {
      where.status = {
        in: [
          "UPCOMING",
          "LIVE",
          "REGISTRATION_OPEN",
          "REGISTRATION_CLOSED",
          "STARTING",
          "IN_PROGRESS",
          "COMPLETED",
          "SETTLED",
        ],
      };
    }

    const rows = await prisma.tournament.findMany({
      where,
      orderBy: { startTime: "asc" },
      take: limit,
      include: {
        _count: { select: { players: true } },
      },
    });

    return rows.map((t) => ({
      id: t.id,
      gameId: t.gameId as GameId,
      title: t.title,
      description: t.description,
      format: t.format,
      prizePool: t.prizePool,
      entryFee: t.entryFee,
      minPlayers: t.minPlayers ?? 2,
      maxPlayers: t.maxPlayers,
      registeredCount: t._count.players,
      grossPool: t.grossPool ?? 0,
      startTime: t.startTime.toISOString(),
      registrationStartsAt: t.registrationStartsAt ? t.registrationStartsAt.toISOString() : null,
      registrationEndsAt: t.registrationEndsAt ? t.registrationEndsAt.toISOString() : null,
      status: t.status,
      autoStartWhenFull: t.autoStartWhenFull ?? false,
    }));
  }

  /**
   * 4. Search Active & Scheduled Public Events / Announcements
   */
  static async searchEvents(query: string, limit = 20): Promise<EventSearchResult[]> {
    const q = query.trim();
    if (!q || q.length < 2) return [];

    const now = new Date();
    const rows = await prisma.announcement.findMany({
      where: {
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { body: { contains: q, mode: "insensitive" } },
        ],
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return rows.map((a) => {
      let status: "UPCOMING" | "ACTIVE" | "ENDED" = "ACTIVE";
      if (a.startsAt && a.startsAt > now) status = "UPCOMING";
      else if (a.expiresAt && a.expiresAt < now) status = "ENDED";

      return {
        id: a.id,
        title: a.title,
        description: a.body,
        type: a.type,
        status,
        startsAt: a.startsAt?.toISOString() ?? null,
        expiresAt: a.expiresAt?.toISOString() ?? null,
        imageUrl: a.imageUrl,
      };
    });
  }

  /**
   * 5. Search Public Achievements
   */
  static async searchAchievements(
    query: string,
    limit = 20,
    requestingUserId?: string
  ): Promise<AchievementSearchResult[]> {
    const q = query.trim();
    if (!q || q.length < 2) return [];

    const rows = await prisma.achievement.findMany({
      where: {
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
          { code: { contains: q, mode: "insensitive" } },
          { gameId: { contains: q, mode: "insensitive" } },
        ],
      },
      take: limit,
      orderBy: { xpReward: "desc" },
    });

    let unlockedAchievementIds = new Set<string>();
    if (requestingUserId) {
      const userAchs = await prisma.userAchievement.findMany({
        where: { userId: requestingUserId },
        select: { achievementId: true },
      });
      unlockedAchievementIds = new Set(userAchs.map((a) => a.achievementId));
    }

    return rows.map((a) => ({
      id: a.id,
      code: a.code,
      title: a.title,
      description: a.description,
      category: a.gameId ? a.gameId.toUpperCase() : "GENERAL",
      rarity:
        a.xpReward >= 500
          ? "LEGENDARY"
          : a.xpReward >= 250
          ? "EPIC"
          : a.xpReward >= 100
          ? "RARE"
          : "COMMON",
      icon: a.icon,
      xpReward: a.xpReward,
      unlocked: unlockedAchievementIds.has(a.id),
    }));
  }

  /**
   * 6. Central Global Search Operation
   */
  static async globalSearch(
    userId?: string,
    input: SearchInput = { query: "" },
    isAdmin = false
  ): Promise<SearchResults> {
    const searchSettings = await getCategorySettings("search");
    if (!searchSettings.enabled) {
      return {
        users: [],
        players: [],
        games: [],
        tournaments: [],
        events: [],
        achievements: [],
        tickets: [],
        coupons: [],
        total: 0,
        page: 1,
        pageSize: 20,
        hasMore: false,
      };
    }

    const q = (input.query || "").trim().replace(/^@+/, "");
    const page = Math.max(1, input.page ?? 1);
    const limit = Math.min(
      searchSettings.maxResults,
      Math.max(1, input.limit ?? 20)
    );
    const type: SearchType = input.type ?? "GLOBAL";
    const isUserOnly = type === "PLAYERS" || type === "USERS";

    // Sub-2 character queries return immediately without DB hit unless searching users/players
    if (!q || (!isUserOnly && q.length < 2)) {
      return {
        users: [],
        players: [],
        games: [],
        tournaments: [],
        events: [],
        achievements: [],
        tickets: [],
        coupons: [],
        total: 0,
        page,
        pageSize: limit,
        hasMore: false,
      };
    }

    // Rate Limit enforcement (Feature 25)
    const rateLimitKey = userId || "anonymous";
    const rateLimit = await RateLimitService.checkSharedRateLimit(rateLimitKey, "SEARCH");
    if (!rateLimit.allowed) {
      throw new AppError(
        "RATE_LIMITED",
        `Too many search requests. Please wait ${rateLimit.retryAfterSeconds}s before searching again.`,
        429,
        { retryAfter: rateLimit.retryAfterSeconds }
      );
    }

    const wants = (t: SearchType) =>
      type === "GLOBAL" || type === "ALL" || type === t;

    const [
      games,
      players,
      tournaments,
      events,
      achievements,
      tickets,
      coupons,
    ] = await Promise.all([
      wants("GAMES")
        ? this.searchGames(q, limit)
        : Promise.resolve([]),
      (wants("PLAYERS") || wants("USERS")) && searchSettings.userSearchEnabled
        ? this.searchPlayers(q, limit, userId, isAdmin)
        : Promise.resolve([]),
      wants("TOURNAMENTS") && searchSettings.tournamentSearchEnabled
        ? this.searchTournaments(q, limit, userId, isAdmin)
        : Promise.resolve([]),
      wants("EVENTS") && (searchSettings as any).eventSearchEnabled !== false
        ? this.searchEvents(q, limit)
        : Promise.resolve([]),
      wants("ACHIEVEMENTS") && (searchSettings as any).achievementSearchEnabled !== false
        ? this.searchAchievements(q, limit, userId)
        : Promise.resolve([]),
      wants("TICKETS") && searchSettings.ticketSearchEnabled && userId
        ? prisma.supportTicket.findMany({
            where: {
              userId,
              OR: [
                { subject: { contains: q, mode: "insensitive" } },
                { category: { contains: q, mode: "insensitive" } },
              ],
            },
            orderBy: { updatedAt: "desc" },
            take: limit,
            select: {
              id: true,
              subject: true,
              category: true,
              status: true,
              priority: true,
              createdAt: true,
            },
          })
        : Promise.resolve([]),
      wants("COUPONS") && searchSettings.couponSearchEnabled && userId
        ? prisma.couponRedemption.findMany({
            where: {
              userId,
              coupon: {
                OR: [
                  { code: { contains: q, mode: "insensitive" } },
                  { title: { contains: q, mode: "insensitive" } },
                ],
              },
            },
            include: { coupon: true },
            orderBy: { createdAt: "desc" },
            take: limit,
          })
        : Promise.resolve([]),
    ]);

    // Save safe search history if enabled
    if (searchSettings.saveHistory && userId && q.length >= 2) {
      await prisma.searchHistory.create({
        data: {
          userId,
          query: q.slice(0, 100),
          type: type === "ALL" ? "GLOBAL" : type,
        },
      }).catch(() => undefined);
    }

    const formattedTickets = tickets.map((t: any) => ({
      id: t.id,
      subject: t.subject,
      category: t.category,
      status: t.status,
      priority: t.priority,
      createdAt: t.createdAt.toISOString(),
    }));

    const formattedCoupons = coupons.map((c: any) => ({
      id: c.id,
      code: c.coupon.code,
      title: c.coupon.title,
      value: c.value,
      createdAt: c.createdAt.toISOString(),
    }));

    const total =
      games.length +
      players.length +
      tournaments.length +
      events.length +
      achievements.length +
      formattedTickets.length +
      formattedCoupons.length;

    return {
      users: players,
      players,
      games,
      tournaments,
      events,
      achievements,
      tickets: formattedTickets,
      coupons: formattedCoupons,
      total,
      page,
      pageSize: limit,
      hasMore: total >= limit,
    };
  }

  /**
   * 7. Search Suggestions from History
   */
  static async getSearchSuggestions(userId: string, prefix: string, limit = 8) {
    const q = prefix.trim();
    if (!q) return [];

    const history = await prisma.searchHistory.findMany({
      where: { userId, query: { startsWith: q, mode: "insensitive" } },
      orderBy: { createdAt: "desc" },
      take: limit,
      distinct: ["query"],
    });

    return history.map((h) => ({ query: h.query, type: h.type as SearchType }));
  }

  /**
   * 8. Clear Search History
   */
  static async clearSearchHistory(userId: string) {
    await prisma.searchHistory.deleteMany({ where: { userId } });
    return { ok: true };
  }
}

// Named function exports for backwards compatibility
export const globalSearch = (userId: string, input: SearchInput, isAdmin?: boolean) =>
  SearchService.globalSearch(userId, input, isAdmin);

export const searchGames = (query: string, limit?: number) =>
  SearchService.searchGames(query, limit);

export const searchPlayers = (query: string, limit?: number, requestingUserId?: string, isAdmin?: boolean) =>
  SearchService.searchPlayers(query, limit, requestingUserId, isAdmin);

export const searchTournaments = (query: string, limit?: number, requestingUserId?: string, isAdmin?: boolean) =>
  SearchService.searchTournaments(query, limit, requestingUserId, isAdmin);

export const searchEvents = (query: string, limit?: number) =>
  SearchService.searchEvents(query, limit);

export const searchAchievements = (query: string, limit?: number, requestingUserId?: string) =>
  SearchService.searchAchievements(query, limit, requestingUserId);

export const getSearchSuggestions = (userId: string, prefix: string, limit?: number) =>
  SearchService.getSearchSuggestions(userId, prefix, limit);

export const clearSearchHistory = (userId: string) =>
  SearchService.clearSearchHistory(userId);
