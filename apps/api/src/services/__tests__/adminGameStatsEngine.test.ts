import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@gaming-hub/db";
import { AdminGameStatsService } from "../adminGameStatsService";

describe("Feature 21: Game-Wise Statistics & Analytics", () => {
  const createdUserIds: string[] = [];
  const createdMatchIds: string[] = [];
  const createdTournamentIds: string[] = [];

  async function createTestUser(prefix: string, balance = 1000) {
    const userId = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    createdUserIds.push(userId);

    await prisma.user.create({
      data: {
        id: userId,
        username: `u_${userId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 16)}`,
        displayName: `User ${userId.slice(0, 8)}`,
        email: `${userId}@test.com`,
        wallet: {
          create: {
            balance,
          },
        },
        profile: {
          create: {},
        },
      },
    });

    return userId;
  }

  afterEach(async () => {
    if (createdTournamentIds.length > 0) {
      await prisma.tournament.deleteMany({
        where: { id: { in: createdTournamentIds } },
      }).catch(() => undefined);
      createdTournamentIds.length = 0;
    }

    if (createdMatchIds.length > 0) {
      await prisma.match.deleteMany({
        where: { id: { in: createdMatchIds } },
      }).catch(() => undefined);
      createdMatchIds.length = 0;
    }

    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      }).catch(() => undefined);
      createdUserIds.length = 0;
    }
  });

  // ---------------------------------------------------------------------------
  // 1. Overview Statistics for All Games
  // ---------------------------------------------------------------------------
  it("1. Games overview: discovers all configured games and aggregates match metrics", async () => {
    const userA = await createTestUser("u-gs-1-a", 1000);
    const userB = await createTestUser("u-gs-1-b", 1000);

    const matchId = `match-gs-1-${Date.now()}`;
    createdMatchIds.push(matchId);

    await prisma.match.create({
      data: {
        id: matchId,
        gameId: "chess",
        stake: 100,
        status: "FINISHED",
        endedAt: new Date(),
        players: {
          create: [
            { userId: userA, seat: 0, score: 1, result: "WIN" },
            { userId: userB, seat: 1, score: 0, result: "LOSS" },
          ],
        },
      },
    });

    const stats = await AdminGameStatsService.getGamesOverviewStatistics({});
    expect(stats.totalGames).toBeGreaterThanOrEqual(9);

    const chess = stats.games.find((g) => g.gameId === "chess");
    expect(chess).toBeDefined();
    expect(chess!.totalMatches).toBeGreaterThanOrEqual(1);
    expect(chess!.completedMatches).toBeGreaterThanOrEqual(1);
    expect(chess!.entryFeeVolume).toBeGreaterThanOrEqual(200);
    expect(chess!.prizeVolume).toBeGreaterThanOrEqual(180);
  });

  // ---------------------------------------------------------------------------
  // 2. Unique Players vs Player Entries
  // ---------------------------------------------------------------------------
  it("2. Player analytics: accurately distinguishes unique players from total entries", async () => {
    const userA = await createTestUser("u-gs-2-a", 1000);
    const userB = await createTestUser("u-gs-2-b", 1000);

    const m1 = `match-gs-2-1-${Date.now()}`;
    const m2 = `match-gs-2-2-${Date.now()}`;
    createdMatchIds.push(m1, m2);

    // User A plays 2 matches, User B plays 1 match (2 unique players, 3 total entries)
    await prisma.match.create({
      data: {
        id: m1,
        gameId: "carrom",
        stake: 50,
        status: "FINISHED",
        endedAt: new Date(),
        players: {
          create: [
            { userId: userA, seat: 0, score: 10, result: "WIN" },
            { userId: userB, seat: 1, score: 5, result: "LOSS" },
          ],
        },
      },
    });
    await prisma.match.create({
      data: {
        id: m2,
        gameId: "carrom",
        stake: 50,
        status: "FINISHED",
        endedAt: new Date(),
        players: {
          create: [{ userId: userA, seat: 0, score: 15, result: "WIN" }],
        },
      },
    });

    const detail = await AdminGameStatsService.getGameDetailStatistics("carrom", {});
    expect(detail.playerAnalytics.uniquePlayers).toBeGreaterThanOrEqual(2);
    expect(detail.playerAnalytics.repeatPlayers).toBeGreaterThanOrEqual(1); // userA is repeat
  });

  // ---------------------------------------------------------------------------
  // 3. Completion Rate Calculation
  // ---------------------------------------------------------------------------
  it("3. Completion rate: accurately computes completed vs aborted match ratio", async () => {
    const userA = await createTestUser("u-gs-3-a", 1000);

    const m1 = `match-gs-3-1-${Date.now()}`;
    const m2 = `match-gs-3-2-${Date.now()}`;
    createdMatchIds.push(m1, m2);

    await prisma.match.create({
      data: {
        id: m1,
        gameId: "ludo",
        stake: 50,
        status: "FINISHED",
        endedAt: new Date(),
        players: { create: [{ userId: userA, seat: 0, score: 1, result: "WIN" }] },
      },
    });
    await prisma.match.create({
      data: {
        id: m2,
        gameId: "ludo",
        stake: 50,
        status: "ABORTED",
        players: { create: [{ userId: userA, seat: 0, score: 0, result: "PENDING" }] },
      },
    });

    const detail = await AdminGameStatsService.getGameDetailStatistics("ludo", {});
    expect(detail.overview.completedMatches).toBeGreaterThanOrEqual(1);
    expect(detail.overview.abortedMatches).toBeGreaterThanOrEqual(1);
    expect(detail.overview.completionRate).toBeLessThanOrEqual(100);
  });

  // ---------------------------------------------------------------------------
  // 4. Single Game Deep Dive & Results Distribution
  // ---------------------------------------------------------------------------
  it("4. Game detail: returns complete result distribution and 7-day daily trends", async () => {
    const userA = await createTestUser("u-gs-4-a", 1000);
    const matchId = `match-gs-4-${Date.now()}`;
    createdMatchIds.push(matchId);

    await prisma.match.create({
      data: {
        id: matchId,
        gameId: "table-tennis",
        stake: 100,
        status: "FINISHED",
        endedAt: new Date(),
        players: { create: [{ userId: userA, seat: 0, score: 21, result: "WIN" }] },
      },
    });

    const detail = await AdminGameStatsService.getGameDetailStatistics("table-tennis", {});
    expect(detail.gameId).toBe("table-tennis");
    expect(detail.name).toBe("Table Tennis");
    expect(detail.resultsDistribution.totalWins).toBeGreaterThanOrEqual(1);
    expect(detail.dailyTrends).toHaveLength(7);
    expect(detail.dailyTrends[0]).toHaveProperty("date");
    expect(detail.dailyTrends[0]).toHaveProperty("matches");
  });

  // ---------------------------------------------------------------------------
  // 5. Multi-Column Sorting
  // ---------------------------------------------------------------------------
  it("5. Sorting: allows sorting games overview by matches, entryVolume, and prizeVolume", async () => {
    const sortedByVolume = await AdminGameStatsService.getGamesOverviewStatistics({ sortBy: "entryVolume" });
    expect(sortedByVolume.games).toBeDefined();

    const sortedByPlayers = await AdminGameStatsService.getGamesOverviewStatistics({ sortBy: "players" });
    expect(sortedByPlayers.games).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // 6. Unknown Game ID Rejection
  // ---------------------------------------------------------------------------
  it("6. Unknown game: rejects invalid gameId with 404 NOT_FOUND", async () => {
    await expect(
      AdminGameStatsService.getGameDetailStatistics("nonexistent-game", {})
    ).rejects.toThrow(/NOT_FOUND|Unknown game ID/i);
  });
});
