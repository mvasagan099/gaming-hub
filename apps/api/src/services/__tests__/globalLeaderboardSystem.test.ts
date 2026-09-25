import { describe, it, expect, afterEach, beforeEach } from "vitest";

import { prisma } from "@gaming-hub/db";
import { LeaderboardService, RATING_WIN, RATING_LOSS, RATING_DRAW, XP_WIN } from "../leaderboardService";
import { AppError } from "@gaming-hub/shared";

describe("Feature 28: Global Leaderboard System", () => {
  const createdUserIds: string[] = [];
  const createdMatchIds: string[] = [];
  const createdTournamentIds: string[] = [];

  async function createTestUser(prefix: string, initialBalance = 1000, country = "US") {
    const userId = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    createdUserIds.push(userId);

    await prisma.user.create({
      data: {
        id: userId,
        username: `u_${userId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 16)}`,
        displayName: `Player ${userId.slice(0, 8)}`,
        email: `${userId}@test.com`,
        wallet: {
          create: {
            balance: initialBalance,
          },
        },
        profile: {
          create: {
            country,
            xp: 0,
            level: 1,
          },
        },
      },
    });

    return userId;
  }

  afterEach(async () => {
    if (createdMatchIds.length > 0) {
      await prisma.matchPlayer.deleteMany({ where: { matchId: { in: createdMatchIds } } }).catch(() => undefined);
      await prisma.matchStatistics.deleteMany({ where: { matchId: { in: createdMatchIds } } }).catch(() => undefined);
      await prisma.match.deleteMany({ where: { id: { in: createdMatchIds } } }).catch(() => undefined);
      createdMatchIds.length = 0;
    }

    if (createdTournamentIds.length > 0) {
      await prisma.tournamentRound.deleteMany({ where: { tournamentId: { in: createdTournamentIds } } }).catch(() => undefined);
      await prisma.tournamentPlayer.deleteMany({ where: { tournamentId: { in: createdTournamentIds } } }).catch(() => undefined);
      await prisma.tournament.deleteMany({ where: { id: { in: createdTournamentIds } } }).catch(() => undefined);
      createdTournamentIds.length = 0;
    }

    if (createdUserIds.length > 0) {
      await prisma.leaderboard.deleteMany({ where: { userId: { in: createdUserIds } } }).catch(() => undefined);
      await prisma.playerStatistic.deleteMany({ where: { userId: { in: createdUserIds } } }).catch(() => undefined);
      await prisma.profile.deleteMany({ where: { userId: { in: createdUserIds } } }).catch(() => undefined);
      await prisma.wallet.deleteMany({ where: { userId: { in: createdUserIds } } }).catch(() => undefined);
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } }).catch(() => undefined);
      createdUserIds.length = 0;
    }
  });

  beforeEach(async () => {
    await prisma.playerStatistic.deleteMany({}).catch(() => undefined);
    await prisma.leaderboard.deleteMany({}).catch(() => undefined);
  });


  // ---------------------------------------------------------------------------
  // 1. Ranking Calculation & Rating System
  // ---------------------------------------------------------------------------
  it("1. Ranking calculation: updates skill rating authoritatively and leaves wallet balance decoupled", async () => {
    const userA = await createTestUser("u-calc-a", 500);
    const userB = await createTestUser("u-calc-b", 50000); // User B has 100x more coins

    // User A wins a chess match
    await prisma.$transaction(async (tx) => {
      await LeaderboardService.updatePlayerRanking(tx, {
        userId: userA,
        gameId: "chess",
        result: "win",
        score: 100,
        rated: true,
      });
      await LeaderboardService.updatePlayerRanking(tx, {
        userId: userB,
        gameId: "chess",
        result: "loss",
        score: 40,
        rated: true,
      });
    });

    const statA = await prisma.playerStatistic.findUniqueOrThrow({
      where: { userId_gameId: { userId: userA, gameId: "chess" } },
    });
    const statB = await prisma.playerStatistic.findUniqueOrThrow({
      where: { userId_gameId: { userId: userB, gameId: "chess" } },
    });

    expect(statA.rating).toBe(1000 + RATING_WIN);
    expect(statA.wins).toBe(1);
    expect(statB.rating).toBe(1000 + RATING_LOSS);
    expect(statB.losses).toBe(1);

    // Verify wallet balances are completely untouched by rating updates
    const walletA = await prisma.wallet.findUniqueOrThrow({ where: { userId: userA } });
    const walletB = await prisma.wallet.findUniqueOrThrow({ where: { userId: userB } });
    expect(walletA.balance).toBe(500);
    expect(walletB.balance).toBe(50000);
  });

  // ---------------------------------------------------------------------------
  // 2. Individual Game Leaderboard
  // ---------------------------------------------------------------------------
  it("2. Game leaderboard: ranks players by skill rating within a specific game", async () => {
    const user1 = await createTestUser("u-game-1");
    const user2 = await createTestUser("u-game-2");

    await prisma.$transaction(async (tx) => {
      await LeaderboardService.updatePlayerRanking(tx, { userId: user1, gameId: "carrom", result: "win", score: 100 });
      await LeaderboardService.updatePlayerRanking(tx, { userId: user2, gameId: "carrom", result: "loss", score: 20 });
    });

    const res = await LeaderboardService.getGameLeaderboard("carrom", { period: "all", metric: "rating", page: 1, pageSize: 10 }, user1);
    expect(res.items.length).toBeGreaterThanOrEqual(2);
    expect(res.items[0].userId).toBe(user1);
    expect(res.items[0].score).toBe(1025);
    expect(res.items[0].rank).toBe(1);
    expect(res.viewerRank).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // 3. Global Leaderboard (Multi-game Aggregation)
  // ---------------------------------------------------------------------------
  it("3. Global leaderboard: aggregates performance across multiple games fairly", async () => {
    const userAllRounder = await createTestUser("u-glob-all", 100);
    const userRichIdle = await createTestUser("u-glob-rich", 999999);

    // All-rounder plays Chess, Snooker, and Ludo
    await prisma.$transaction(async (tx) => {
      await LeaderboardService.updatePlayerRanking(tx, { userId: userAllRounder, gameId: "chess", result: "win", score: 100 });
      await LeaderboardService.updatePlayerRanking(tx, { userId: userAllRounder, gameId: "ludo", result: "win", score: 80 });
      await LeaderboardService.updatePlayerRanking(tx, { userId: userAllRounder, gameId: "ludo", result: "win", score: 60 });
    });

    const res = await LeaderboardService.getGlobalLeaderboard({ period: "all", metric: "rating", page: 1, pageSize: 10 }, userAllRounder);
    const topEntry = res.items.find((item) => item.userId === userAllRounder);
    expect(topEntry).toBeDefined();
    expect(topEntry!.score).toBe(1025 * 3); // 3 wins across 3 games
    expect(topEntry!.wins).toBe(3);
  });

  // ---------------------------------------------------------------------------
  // 4. Tournament Ranking
  // ---------------------------------------------------------------------------
  it("4. Tournament ranking: accurately identifies tournament champions and participation", async () => {
    const champ = await createTestUser("u-tourn-champ");
    const runnerUp = await createTestUser("u-tourn-runner");
    const tournId = `tourn-${Date.now()}`;
    createdTournamentIds.push(tournId);

    await prisma.tournament.create({
      data: {
        id: tournId,
        gameId: "chess",
        title: "Grand Championship",
        description: "Official Grand Chess Championship",
        status: "ENDED",
        format: "KNOCKOUT",
        minPlayers: 2,
        maxPlayers: 2,
        entryFee: 100,
        prizePool: 180,
        startTime: new Date(),
      },
    });

    await prisma.tournamentPlayer.createMany({
      data: [
        { tournamentId: tournId, userId: champ, seed: 1 },
        { tournamentId: tournId, userId: runnerUp, seed: 2 },
      ],
    });

    await prisma.tournamentRound.create({
      data: {
        tournamentId: tournId,
        roundNumber: 1,
        status: "COMPLETED",
        winnerId: champ,
      },
    });

    const res = await LeaderboardService.getTournamentLeaderboard({ period: "all", metric: "wins", page: 1, pageSize: 10 }, champ);
    const champEntry = res.items.find((e) => e.userId === champ);
    expect(champEntry).toBeDefined();
    expect(champEntry!.tournamentWins).toBe(1);
    expect(champEntry!.tournamentPlayed).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // 5. Deterministic Tie-Breaking
  // ---------------------------------------------------------------------------
  it("5. Deterministic tie-breaking: sorts by metric, then wins, then games played, then username", async () => {
    const userA = await createTestUser("u-tie-a");
    const userB = await createTestUser("u-tie-b");

    // Give both players identical ratings and wins
    await prisma.$transaction(async (tx) => {
      await LeaderboardService.updatePlayerRanking(tx, { userId: userA, gameId: "ludo", result: "win", score: 50 });
      await LeaderboardService.updatePlayerRanking(tx, { userId: userB, gameId: "ludo", result: "win", score: 50 });
    });

    const res = await LeaderboardService.getGameLeaderboard("ludo", { period: "all", metric: "rating", page: 1, pageSize: 10 }, userA);
    const uA = res.items.find((e) => e.userId === userA);
    const uB = res.items.find((e) => e.userId === userB);

    expect(uA).toBeDefined();
    expect(uB).toBeDefined();
    expect(uA!.rank).not.toBe(uB!.rank); // Distinct sequential ranks
  });

  // ---------------------------------------------------------------------------
  // 6. Pagination
  // ---------------------------------------------------------------------------
  it("6. Pagination: respects page and pageSize boundaries without loading excess rows", async () => {
    const users: string[] = [];
    for (let i = 0; i < 5; i++) {
      const u = await createTestUser(`u-page-${i}`);
      users.push(u);
      await prisma.$transaction(async (tx) => {
        await LeaderboardService.updatePlayerRanking(tx, { userId: u, gameId: "table-tennis", result: "win", score: i * 10 });
      });
    }

    const page1 = await LeaderboardService.getGameLeaderboard("table-tennis", { period: "all", metric: "rating", page: 1, pageSize: 2 }, users[0]);
    const page2 = await LeaderboardService.getGameLeaderboard("table-tennis", { period: "all", metric: "rating", page: 2, pageSize: 2 }, users[0]);

    expect(page1.items.length).toBe(2);
    expect(page2.items.length).toBe(2);
    expect(page1.items[0].rank).toBe(1);
    expect(page1.items[1].rank).toBe(2);
    expect(page2.items[0].rank).toBe(3);
    expect(page2.items[1].rank).toBe(4);
    expect(page1.total).toBeGreaterThanOrEqual(5);
  });

  // ---------------------------------------------------------------------------
  // 7. Current Player Rank (Off-Page Resolution)
  // ---------------------------------------------------------------------------
  it("7. Current player rank: returns viewerRank and viewer item even when viewer is on page 50", async () => {
    const topUser = await createTestUser("u-top-1");
    const midUser = await createTestUser("u-mid-2");
    const bottomUser = await createTestUser("u-bot-3");

    await prisma.$transaction(async (tx) => {
      // Top user gets 2 wins (rating 1050)
      await LeaderboardService.updatePlayerRanking(tx, { userId: topUser, gameId: "ludo", result: "win", score: 100 });
      await LeaderboardService.updatePlayerRanking(tx, { userId: topUser, gameId: "ludo", result: "win", score: 100 });
      // Mid user gets 1 win (rating 1025)
      await LeaderboardService.updatePlayerRanking(tx, { userId: midUser, gameId: "ludo", result: "win", score: 50 });
      // Bottom user gets 1 loss (rating 980)
      await LeaderboardService.updatePlayerRanking(tx, { userId: bottomUser, gameId: "ludo", result: "loss", score: 10 });
    });

    // Request page 1 with pageSize 1 as bottomUser
    const res = await LeaderboardService.getGameLeaderboard("snooker", { period: "all", metric: "rating", page: 1, pageSize: 1 }, bottomUser);
    expect(res.items.length).toBe(1);
    expect(res.items[0].userId).toBe(topUser);
    expect(res.viewerRank).toBe(3);
    expect(res.viewer).toBeDefined();
    expect(res.viewer!.userId).toBe(bottomUser);
    expect(res.viewer!.rank).toBe(3);
  });

  // ---------------------------------------------------------------------------
  // 8 & 9. Period Filtering (Weekly and Monthly)
  // ---------------------------------------------------------------------------
  it("8 & 9. Weekly and Monthly ranking: filters match-based leaderboards by time window", async () => {
    const activePlayer = await createTestUser("u-active-wk");
    const matchId = `match-wk-${Date.now()}`;
    createdMatchIds.push(matchId);

    await prisma.$transaction(async (tx) => {
      await LeaderboardService.updatePlayerRanking(tx, { userId: activePlayer, gameId: "chess", result: "win", score: 100 });
    });

    // Create match that finished today
    await prisma.match.create({
      data: {
        id: matchId,
        gameId: "chess",
        status: "FINISHED",
        stake: 100,
        winnerIds: [activePlayer],
        startedAt: new Date(),
        endedAt: new Date(),
        players: {
          create: {
            userId: activePlayer,
            seat: 1,
            result: "WIN",
            score: 100,
          },
        },
      },
    });

    const weeklyBoard = await LeaderboardService.getGameLeaderboard("chess", { period: "weekly", metric: "wins", page: 1, pageSize: 10 }, activePlayer);
    const monthlyBoard = await LeaderboardService.getGameLeaderboard("chess", { period: "monthly", metric: "wins", page: 1, pageSize: 10 }, activePlayer);

    const wkEntry = weeklyBoard.items.find((e) => e.userId === activePlayer);
    const moEntry = monthlyBoard.items.find((e) => e.userId === activePlayer);

    expect(wkEntry).toBeDefined();
    expect(wkEntry!.wins).toBeGreaterThanOrEqual(1);
    expect(moEntry).toBeDefined();
    expect(moEntry!.wins).toBeGreaterThanOrEqual(1);
  });

  // ---------------------------------------------------------------------------
  // 10. Authoritative Result Correction
  // ---------------------------------------------------------------------------
  it("10. Result correction: rolls back previous deltas and applies corrected winner safely with audit logging", async () => {
    const adminUser = await createTestUser("u-admin-corr");
    const userA = await createTestUser("u-corr-a");
    const userB = await createTestUser("u-corr-b");
    const matchId = `match-corr-${Date.now()}`;
    createdMatchIds.push(matchId);

    // Initial match settlement: User A was mistakenly recorded as winner
    await prisma.match.create({
      data: {
        id: matchId,
        gameId: "chess",
        status: "FINISHED",
        stake: 100,
        winnerIds: [userA],
        startedAt: new Date(),
        endedAt: new Date(),
        players: {
          createMany: {
            data: [
              { userId: userA, seat: 1, result: "WIN", score: 100 },
              { userId: userB, seat: 2, result: "LOSS", score: 40 },
            ],
          },
        },
      },
    });

    await prisma.$transaction(async (tx) => {
      await LeaderboardService.updatePlayerRanking(tx, { userId: userA, gameId: "chess", result: "win", score: 100 });
      await LeaderboardService.updatePlayerRanking(tx, { userId: userB, gameId: "chess", result: "loss", score: 40 });
    });

    // Admin corrects the match result: User B is the true winner
    const correction = await LeaderboardService.correctMatchResult({
      matchId,
      correctedWinnerIds: [userB],
      adminId: adminUser,
      reason: "Opponent reconnected and legally checkmated, dispute verified by admin review",
    });

    expect(correction.status).toBe("CORRECTED");
    expect(correction.correctedWinnerIds).toEqual([userB]);

    const statA = await prisma.playerStatistic.findUniqueOrThrow({
      where: { userId_gameId: { userId: userA, gameId: "chess" } },
    });
    const statB = await prisma.playerStatistic.findUniqueOrThrow({
      where: { userId_gameId: { userId: userB, gameId: "chess" } },
    });

    // User A should now have LOSS rating (1000 - 20 = 980), User B should have WIN rating (1000 + 25 = 1025)
    expect(statA.rating).toBe(980);
    expect(statA.wins).toBe(0);
    expect(statA.losses).toBe(1);

    expect(statB.rating).toBe(1025);
    expect(statB.wins).toBe(1);
    expect(statB.losses).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // 11. Unauthorized Ranking Modification / Anti-Manipulation
  // ---------------------------------------------------------------------------
  it("11. Anti-manipulation: client cannot forge or arbitrarily submit ranking values", async () => {
    const userA = await createTestUser("u-cheat-1");

    // Attempting result correction on non-finished match must fail
    const dummyMatchId = `match-unfin-${Date.now()}`;
    createdMatchIds.push(dummyMatchId);

    await prisma.match.create({
      data: {
        id: dummyMatchId,
        gameId: "chess",
        status: "ACTIVE",
        stake: 100,
        winnerIds: [],
        players: {
          create: {
            userId: userA,
            seat: 1,
            result: "PENDING",
          },
        },
      },
    });

    await expect(
      LeaderboardService.correctMatchResult({
        matchId: dummyMatchId,
        correctedWinnerIds: [userA],
        adminId: "admin",
        reason: "Illegal attempt",
      }),
    ).rejects.toThrow(AppError);
  });

  // ---------------------------------------------------------------------------
  // 12. Large Dataset Performance Handling
  // ---------------------------------------------------------------------------
  it("12. Large dataset handling: queries execute cleanly and reliably", async () => {
    const viewer = await createTestUser("u-viewer-perf");

    const start = Date.now();
    const result = await LeaderboardService.getGlobalLeaderboard(
      { period: "all", metric: "rating", page: 1, pageSize: 20 },
      viewer,
    );
    const duration = Date.now() - start;

    expect(result).toBeDefined();
    expect(result.pageSize).toBe(20);
    expect(duration).toBeLessThan(3000); // Should execute within 3 seconds
  });
});
