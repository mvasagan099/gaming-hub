import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@gaming-hub/db";
import { AdminFinanceService } from "../adminFinanceService";
import { WalletTransactionService } from "../walletTransactionService";

describe("Feature 20: Admin Financial Dashboard", () => {
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
  // 1. Complete Category Financial Summary
  // ---------------------------------------------------------------------------
  it("1. Financial summary: aggregates entry fees, winnings, prizes, refunds, bonuses, and adjustments", async () => {
    const userA = await createTestUser("u-fin-1-a", 1000);
    const userB = await createTestUser("u-fin-1-b", 1000);

    // 1. Entry fees (2x 100)
    await WalletTransactionService.createDebit(prisma, {
      userId: userA,
      amount: 100,
      referenceType: "MATCH_WAGER",
      referenceId: "match-fin-1",
    });
    await WalletTransactionService.createDebit(prisma, {
      userId: userB,
      amount: 100,
      referenceType: "MATCH_WAGER",
      referenceId: "match-fin-1",
    });

    // 2. Winning payout (180)
    await WalletTransactionService.createCredit(prisma, {
      userId: userA,
      amount: 180,
      referenceType: "MATCH_PAYOUT",
      referenceId: "match-fin-1",
    });

    // 3. Refund (50)
    await WalletTransactionService.createCredit(prisma, {
      userId: userB,
      amount: 50,
      referenceType: "WAGER_REFUND",
      referenceId: "match-fin-refund",
    });

    // 4. Bonus (25)
    await WalletTransactionService.createCredit(prisma, {
      userId: userA,
      amount: 25,
      referenceType: "BONUS",
      referenceId: "bonus-1",
    });

    // 5. Admin adjustment (+300)
    await WalletTransactionService.createAdminAdjustment(prisma, {
      userId: userA,
      amount: 300,
      reason: "Loyalty promo",
      adminId: "admin-1",
    });

    const summary = await AdminFinanceService.getFinancialSummary({ range: "all" });

    expect(summary.summary.totalEntryFees).toBeGreaterThanOrEqual(200);
    expect(summary.summary.totalWinnings).toBeGreaterThanOrEqual(180);
    expect(summary.summary.totalRefunds).toBeGreaterThanOrEqual(50);
    expect(summary.summary.totalBonuses).toBeGreaterThanOrEqual(25);
    expect(summary.summary.totalAdminAdjustments).toBeGreaterThanOrEqual(300);
    expect(summary.summary.totalCredits).toBeGreaterThanOrEqual(555); // 180 + 50 + 25 + 300
    expect(summary.summary.totalDebits).toBeGreaterThanOrEqual(200);
  });

  // ---------------------------------------------------------------------------
  // 2. Date Range Filtering
  // ---------------------------------------------------------------------------
  it("2. Date range filtering: parses date ranges cleanly without database errors", async () => {
    const todaySummary = await AdminFinanceService.getFinancialSummary({ range: "today" });
    expect(todaySummary.summary).toBeDefined();

    const sevenDaySummary = await AdminFinanceService.getFinancialSummary({ range: "7d" });
    expect(sevenDaySummary.summary).toBeDefined();

    const thirtyDaySummary = await AdminFinanceService.getFinancialSummary({ range: "30d" });
    expect(thirtyDaySummary.summary).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // 3. Game-Level Breakdown
  // ---------------------------------------------------------------------------
  it("3. Game breakdown: calculates accurate matches, entry fees, and payouts per game", async () => {
    const userA = await createTestUser("u-fin-3-a", 1000);
    const userB = await createTestUser("u-fin-3-b", 1000);
    const matchId = `match-fin-3-${Date.now()}`;
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

    const summary = await AdminFinanceService.getFinancialSummary({ range: "all" });
    const chess = summary.gameBreakdown.find((g) => g.gameId === "chess");

    expect(chess).toBeDefined();
    expect(chess!.matchCount).toBeGreaterThanOrEqual(1);
    expect(chess!.totalEntryFees).toBeGreaterThanOrEqual(200);
    expect(chess!.totalPayouts).toBeGreaterThanOrEqual(180);
  });

  // ---------------------------------------------------------------------------
  // 4. Tournament Breakdown
  // ---------------------------------------------------------------------------
  it("4. Tournament breakdown: aggregates tournaments created, completed, and prizes", async () => {
    const userA = await createTestUser("u-fin-4-a", 1000);
    const tournamentId = `tourn-fin-4-${Date.now()}`;
    createdTournamentIds.push(tournamentId);

    const tournament = await prisma.tournament.create({
      data: {
        id: tournamentId,
        title: "Finance Cup",
        description: "Tournament stats test",
        gameId: "chess",
        entryFee: 100,
        prizePool: 800,
        status: "COMPLETED",
        startTime: new Date(),
        endTime: new Date(),
      },
    });

    const playerA = await prisma.tournamentPlayer.create({
      data: { tournamentId: tournament.id, userId: userA, finalRank: 1 },
    });

    await prisma.tournamentPrize.create({
      data: { tournamentId: tournament.id, userId: userA, playerId: playerA.id, rank: 1, amount: 500 },
    });

    const summary = await AdminFinanceService.getFinancialSummary({ range: "all" });
    expect(summary.tournamentBreakdown.tournamentsCompleted).toBeGreaterThanOrEqual(1);
    expect(summary.tournamentBreakdown.totalPrizesDistributed).toBeGreaterThanOrEqual(500);
  });

  // ---------------------------------------------------------------------------
  // 5. Daily Trend Series
  // ---------------------------------------------------------------------------
  it("5. Daily trend series: produces 7 daily data points for charts", async () => {
    const summary = await AdminFinanceService.getFinancialSummary({ range: "7d" });
    expect(summary.dailyTrends).toHaveLength(7);
    expect(summary.dailyTrends[0]).toHaveProperty("date");
    expect(summary.dailyTrends[0]).toHaveProperty("entryFees");
    expect(summary.dailyTrends[0]).toHaveProperty("winnings");
    expect(summary.dailyTrends[0]).toHaveProperty("refunds");
  });

  // ---------------------------------------------------------------------------
  // 6. CSV Export
  // ---------------------------------------------------------------------------
  it("6. CSV export: generates structured CSV report with summary metrics", async () => {
    const csv = await AdminFinanceService.exportFinancialCsv({ range: "all" });
    expect(typeof csv).toBe("string");
    expect(csv).toContain("Metric,Value (Coins)");
    expect(csv).toContain("Total Entry Fees");
    expect(csv).toContain("Total Match Winnings");
    expect(csv).toContain("Game Name,Matches Played,Entry Fees,Payouts,Refunds");
  });
});
