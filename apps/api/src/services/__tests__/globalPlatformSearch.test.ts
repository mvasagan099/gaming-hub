import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { prisma, TournamentStatus, AnnouncementType } from "@gaming-hub/db";
import { SearchService } from "../search";
import { PlayerProfileService } from "../playerProfileService";
import { RateLimitService } from "../rateLimitService";
import { AppError } from "@gaming-hub/shared";

describe("Feature 33: Global Platform Search", () => {
  const createdUserIds: string[] = [];
  const createdTournamentIds: string[] = [];
  const createdAnnouncementIds: string[] = [];
  const createdAchievementCodes: string[] = [];

  async function createTestUser(prefix: string, isPrivate = false, balance = 1000) {
    const suffix = Math.random().toString(36).slice(2, 7);
    const userId = `${prefix}-${Date.now()}-${suffix}`;
    createdUserIds.push(userId);

    await prisma.user.create({
      data: {
        id: userId,
        username: `u_${prefix.replace(/[^a-zA-Z0-9]/g, "")}_${suffix}`.slice(0, 24),
        displayName: `Player ${prefix}`,
        email: `${userId}@private-test.com`,
        wallet: {
          create: {
            balance,
            bonusBalance: 0,
          },
        },
        profile: {
          create: {
            xp: 250,
            level: 3,
            wins: 15,
            losses: 5,
            draws: 2,
          },
        },
      },
    });

    if (isPrivate) {
      PlayerProfileService.setProfilePrivacy(userId, true);
    }

    return userId;
  }

  afterEach(async () => {
    if (createdAnnouncementIds.length > 0) {
      await prisma.announcement.deleteMany({ where: { id: { in: createdAnnouncementIds } } }).catch(() => undefined);
      createdAnnouncementIds.length = 0;
    }

    if (createdAchievementCodes.length > 0) {
      await prisma.userAchievement.deleteMany({
        where: { achievement: { code: { in: createdAchievementCodes } } },
      }).catch(() => undefined);
      await prisma.achievement.deleteMany({
        where: { code: { in: createdAchievementCodes } },
      }).catch(() => undefined);
      createdAchievementCodes.length = 0;
    }

    if (createdTournamentIds.length > 0) {
      await prisma.tournamentPlayer.deleteMany({
        where: { tournamentId: { in: createdTournamentIds } },
      }).catch(() => undefined);
      await prisma.tournament.deleteMany({
        where: { id: { in: createdTournamentIds } },
      }).catch(() => undefined);
      createdTournamentIds.length = 0;
    }

    if (createdUserIds.length > 0) {
      await prisma.searchHistory.deleteMany({ where: { userId: { in: createdUserIds } } }).catch(() => undefined);
      await prisma.profile.deleteMany({ where: { userId: { in: createdUserIds } } }).catch(() => undefined);
      await prisma.wallet.deleteMany({ where: { userId: { in: createdUserIds } } }).catch(() => undefined);
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } }).catch(() => undefined);
      createdUserIds.length = 0;
    }
  });

  // ---------------------------------------------------------------------------
  // 1. Game Search
  // ---------------------------------------------------------------------------
  it("1. Game search: searches games by name, description, and category/tags", async () => {
    const chessResults = await SearchService.searchGames("chess");
    expect(chessResults.length).toBeGreaterThanOrEqual(1);
    expect(chessResults[0].gameId).toBe("chess");
    expect(chessResults[0].name.toLowerCase()).toContain("chess");

    const boardResults = await SearchService.searchGames("board");
    expect(boardResults.length).toBeGreaterThanOrEqual(1);
  });

  // ---------------------------------------------------------------------------
  // 2. Player Search
  // ---------------------------------------------------------------------------
  it("2. Player search: searches players by username or displayName", async () => {
    const userId = await createTestUser("searchplayer");
    const user = await prisma.user.findUnique({ where: { id: userId } });

    const results = await SearchService.searchPlayers(user!.username);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some((u) => u.id === userId)).toBe(true);

    const byDisplay = await SearchService.searchPlayers("Player searchplayer");
    expect(byDisplay.some((u) => u.id === userId)).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // 3. Tournament Search
  // ---------------------------------------------------------------------------
  it("3. Tournament search: searches tournaments by title, description, and game", async () => {
    const tId = `t-search-${Date.now()}`;
    createdTournamentIds.push(tId);

    await prisma.tournament.create({
      data: {
        id: tId,
        gameId: "chess",
        title: "Grandmaster Chess Open 2026",
        description: "Official summer chess tournament",
        format: "KNOCKOUT",
        status: TournamentStatus.UPCOMING,
        prizePool: 5000,
        entryFee: 100,
        maxPlayers: 16,
        startTime: new Date(Date.now() + 86400000),
      },
    });

    const results = await SearchService.searchTournaments("Grandmaster");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some((t) => t.id === tId)).toBe(true);
    expect(results[0].title).toContain("Grandmaster");
  });

  // ---------------------------------------------------------------------------
  // 4. Event Search
  // ---------------------------------------------------------------------------
  it("4. Event search: searches active and scheduled public events", async () => {
    const annId = `ann-search-${Date.now()}`;
    createdAnnouncementIds.push(annId);

    await prisma.announcement.create({
      data: {
        id: annId,
        title: "Weekend Double XP Fest",
        body: "Earn 2x XP in all multiplayer game matches this weekend!",
        type: AnnouncementType.PROMOTION,
        startsAt: new Date(Date.now() - 3600000),
        expiresAt: new Date(Date.now() + 86400000),
      },
    });

    const results = await SearchService.searchEvents("Double XP");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some((e) => e.id === annId)).toBe(true);
    expect(results[0].status).toBe("ACTIVE");
  });

  // ---------------------------------------------------------------------------
  // 5. Achievement Search
  // ---------------------------------------------------------------------------
  it("5. Achievement search: searches achievements by title, description, and code", async () => {
    const code = `ACH_SRCH_${Date.now()}`;
    createdAchievementCodes.push(code);

    await prisma.achievement.create({
      data: {
        code,
        title: "Master Strategist",
        description: "Win 5 consecutive chess tournament matches",
        gameId: "chess",
        icon: "♟️",
        xpReward: 300,
      },
    });

    const results = await SearchService.searchAchievements("Strategist");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some((a) => a.code === code)).toBe(true);
    expect(results[0].xpReward).toBe(300);
  });

  // ---------------------------------------------------------------------------
  // 6. Empty Query Handling
  // ---------------------------------------------------------------------------
  it("6. Empty query: returns empty search results immediately without DB hit", async () => {
    const emptyResult = await SearchService.globalSearch(undefined, { query: "" });
    expect(emptyResult.total).toBe(0);
    expect(emptyResult.games).toEqual([]);
    expect(emptyResult.players).toEqual([]);
    expect(emptyResult.tournaments).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // 7. Short Query Handling (< 2 characters)
  // ---------------------------------------------------------------------------
  it("7. Short query: returns empty search results when query is less than 2 characters", async () => {
    const singleCharResult = await SearchService.globalSearch(undefined, { query: "a" });
    expect(singleCharResult.total).toBe(0);
    expect(singleCharResult.hasMore).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // 8. Pagination & Limit Handling
  // ---------------------------------------------------------------------------
  it("8. Pagination: respects limit and returns proper pagination metadata", async () => {
    const res = await SearchService.globalSearch(undefined, {
      query: "chess",
      limit: 2,
    });
    expect(res.pageSize).toBe(2);
    expect(res.page).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // 9. Authorization & Data Isolation
  // ---------------------------------------------------------------------------
  it("9. Authorization: ensures unauthenticated searches return only public metadata", async () => {
    const res = await SearchService.globalSearch(undefined, { query: "chess" });
    expect(res.tickets).toEqual([]); // Guest cannot see tickets
    expect(res.coupons).toEqual([]); // Guest cannot see coupons
  });

  // ---------------------------------------------------------------------------
  // 10. Private Profile Protection
  // ---------------------------------------------------------------------------
  it("10. Private profile: masks sensitive match stats and never leaks email or wallet", async () => {
    const privateUserId = await createTestUser("privatesearch", true, 99999);
    const viewerId = await createTestUser("viewersearch");
    const privateUser = await prisma.user.findUnique({ where: { id: privateUserId } });

    const results = await SearchService.searchPlayers(privateUser!.username, 10, viewerId);
    const target = results.find((u) => u.id === privateUserId);

    expect(target).toBeDefined();
    expect(target!.wins).toBe(0); // Masked
    expect(target!.losses).toBe(0); // Masked
    expect((target as any).email).toBeUndefined(); // Never leaked
    expect((target as any).wallet).toBeUndefined(); // Never leaked
    expect((target as any).balance).toBeUndefined(); // Never leaked
  });

  // ---------------------------------------------------------------------------
  // 11. Private Tournament Protection
  // ---------------------------------------------------------------------------
  it("11. Private tournament: excludes draft/private tournaments from regular player search", async () => {
    const regularUserId = await createTestUser("regularsearch");
    const draftId = `t-draft-${Date.now()}`;
    createdTournamentIds.push(draftId);

    await prisma.tournament.create({
      data: {
        id: draftId,
        gameId: "chess",
        title: "Secret Unannounced Invitational",
        description: "Draft tournament for internal testing",
        format: "KNOCKOUT",
        status: TournamentStatus.DRAFT,
        prizePool: 10000,
        entryFee: 0,
        maxPlayers: 8,
        startTime: new Date(Date.now() + 86400000),
      },
    });

    // Regular player search
    const regularResults = await SearchService.searchTournaments("Secret Unannounced", 10, regularUserId, false);
    expect(regularResults.some((t) => t.id === draftId)).toBe(false);

    // Admin search
    const adminResults = await SearchService.searchTournaments("Secret Unannounced", 10, regularUserId, true);
    expect(adminResults.some((t) => t.id === draftId)).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // 12. Search Injection Attempts
  // ---------------------------------------------------------------------------
  it("12. Search injection: handles SQL and special characters safely without errors", async () => {
    const injectionQueries = [
      "' OR 1=1 --",
      `" OR "a"="a`,
      "%; DROP TABLE users; --",
      "<script>alert(1)</script>",
      "\\x00",
      "\\\\",
    ];

    for (const query of injectionQueries) {
      const res = await SearchService.globalSearch(undefined, { query });
      expect(res).toBeDefined();
      expect(typeof res.total).toBe("number");
    }
  });

  // ---------------------------------------------------------------------------
  // 13. Rate Limiting
  // ---------------------------------------------------------------------------
  it("13. Rate limiting: throttles high-frequency search requests", async () => {
    const userId = await createTestUser("rl-search-user");

    // Max allowed requests in RateLimitService for SEARCH is 40
    for (let i = 0; i < 40; i++) {
      RateLimitService.checkRateLimit(userId, "SEARCH");
    }

    // 41st request must trigger 429
    await expect(
      SearchService.globalSearch(userId, { query: "chess" })
    ).rejects.toThrowError(/Too many search requests/i);
  });

  // ---------------------------------------------------------------------------
  // 14. Large Dataset & Aggregated Multi-Entity Search
  // ---------------------------------------------------------------------------
  it("14. Aggregated search: searches across multiple entity categories simultaneously", async () => {
    const userId = await createTestUser("multiaggsearch");

    const res = await SearchService.globalSearch(userId, {
      query: "chess",
      type: "GLOBAL",
    });

    expect(res).toBeDefined();
    expect(res.games.length).toBeGreaterThanOrEqual(1);
    expect(res.total).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(res.players)).toBe(true);
    expect(Array.isArray(res.tournaments)).toBe(true);
    expect(Array.isArray(res.events)).toBe(true);
    expect(Array.isArray(res.achievements)).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // 15. Search Suggestions & History Clearing
  // ---------------------------------------------------------------------------
  it("15. Suggestions & history: logs search history and supports clear history", async () => {
    const userId = await createTestUser("hist-search-user");

    // Perform searches
    await SearchService.globalSearch(userId, { query: "cricket championship" });
    await SearchService.globalSearch(userId, { query: "carrom master" });

    const suggestions = await SearchService.getSearchSuggestions(userId, "crick");
    expect(suggestions.length).toBeGreaterThanOrEqual(1);
    expect(suggestions[0].query).toContain("cricket");

    // Clear history
    await SearchService.clearSearchHistory(userId);

    const clearedSuggestions = await SearchService.getSearchSuggestions(userId, "crick");
    expect(clearedSuggestions.length).toBe(0);
  });
});
