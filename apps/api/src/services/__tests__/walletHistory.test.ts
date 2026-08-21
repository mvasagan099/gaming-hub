import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@gaming-hub/db";
import { WalletHistoryService } from "../walletHistoryService";
import { WalletTransactionService } from "../walletTransactionService";

describe("Feature 13: Complete User Wallet History", () => {
  const createdUserIds: string[] = [];

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
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      }).catch(() => undefined);
      createdUserIds.length = 0;
    }
  });

  // ---------------------------------------------------------------------------
  // 1. Chronological History & Balance Reconciliation
  // ---------------------------------------------------------------------------
  it("1. User wallet history: returns chronological movements with balanceBefore and balanceAfter", async () => {
    const userA = await createTestUser("u-wh-1-a", 1000);

    // Sequence of operations
    await WalletTransactionService.createDebit(prisma, {
      userId: userA,
      amount: 100,
      referenceType: "MATCH_WAGER",
      referenceId: "match-1",
      meta: { gameId: "chess" },
    });
    await WalletTransactionService.createCredit(prisma, {
      userId: userA,
      amount: 180,
      referenceType: "MATCH_PAYOUT",
      referenceId: "match-1",
      meta: { gameId: "chess" },
    });
    await WalletTransactionService.createDebit(prisma, {
      userId: userA,
      amount: 200,
      referenceType: "TOURNAMENT_ENTRY",
      referenceId: "tourn-1",
      meta: { tournamentId: "tourn-1" },
    });
    await WalletTransactionService.createCredit(prisma, {
      userId: userA,
      amount: 200,
      referenceType: "WAGER_REFUND",
      referenceId: "tourn-1",
      meta: { reason: "cancelled" },
    });

    const history = await WalletHistoryService.listUserWalletHistory({ userId: userA });
    expect(history.total).toBe(4);
    expect(history.items).toHaveLength(4);

    // Newest first
    expect(history.items[0].referenceType).toBe("WAGER_REFUND");
    expect(history.items[0].direction).toBe("CREDIT");
    expect(history.items[0].balanceAfter).toBe(1080);

    expect(history.items[1].referenceType).toBe("TOURNAMENT_ENTRY");
    expect(history.items[1].direction).toBe("DEBIT");
    expect(history.items[1].balanceAfter).toBe(880);

    expect(history.items[2].referenceType).toBe("MATCH_PAYOUT");
    expect(history.items[2].direction).toBe("CREDIT");
    expect(history.items[2].balanceAfter).toBe(1080);

    expect(history.items[3].referenceType).toBe("MATCH_WAGER");
    expect(history.items[3].direction).toBe("DEBIT");
    expect(history.items[3].balanceAfter).toBe(900);
  });

  // ---------------------------------------------------------------------------
  // 2. User Privacy & Cross-User Isolation
  // ---------------------------------------------------------------------------
  it("2. User isolation: user cannot see another user's transactions or query their details", async () => {
    const userA = await createTestUser("u-wh-2-a", 1000);
    const userB = await createTestUser("u-wh-2-b", 1000);

    await WalletTransactionService.createDebit(prisma, {
      userId: userA,
      amount: 100,
      referenceType: "MATCH_WAGER",
      referenceId: "m-a",
      meta: { gameId: "chess" },
    });
    await WalletTransactionService.createDebit(prisma, {
      userId: userB,
      amount: 50,
      referenceType: "MATCH_WAGER",
      referenceId: "m-b",
      meta: { gameId: "carrom" },
    });

    const historyA = await WalletHistoryService.listUserWalletHistory({ userId: userA });
    expect(historyA.total).toBe(1);
    expect(historyA.items[0].userId).toBe(userA);

    const txAId = historyA.items[0].id;

    // userB attempts to query userA's transaction details -> rejected with 404
    await expect(
      WalletHistoryService.getTransactionDetails(userB, txAId)
    ).rejects.toThrow(/NOT_FOUND|Transaction not found/i);
  });

  // ---------------------------------------------------------------------------
  // 3. Category & Direction Filtering
  // ---------------------------------------------------------------------------
  it("3. Filtering: filters by categories (ENTRY_FEES, WINNINGS, REFUNDS) and direction", async () => {
    const userA = await createTestUser("u-wh-3-a", 1000);

    await WalletTransactionService.createDebit(prisma, {
      userId: userA,
      amount: 100,
      referenceType: "MATCH_WAGER",
      referenceId: "m-1",
      meta: { gameId: "ludo" },
    });
    await WalletTransactionService.createCredit(prisma, {
      userId: userA,
      amount: 180,
      referenceType: "MATCH_PAYOUT",
      referenceId: "m-1",
      meta: { gameId: "ludo" },
    });
    await WalletTransactionService.createCredit(prisma, {
      userId: userA,
      amount: 100,
      referenceType: "WAGER_REFUND",
      referenceId: "m-2",
      meta: { reason: "aborted" },
    });

    const entryFees = await WalletHistoryService.listUserWalletHistory({ userId: userA, category: "ENTRY_FEES" });
    expect(entryFees.total).toBe(1);
    expect(entryFees.items[0].referenceType).toBe("MATCH_WAGER");

    const winnings = await WalletHistoryService.listUserWalletHistory({ userId: userA, category: "WINNINGS" });
    expect(winnings.total).toBe(1);
    expect(winnings.items[0].referenceType).toBe("MATCH_PAYOUT");

    const refunds = await WalletHistoryService.listUserWalletHistory({ userId: userA, category: "REFUNDS" });
    expect(refunds.total).toBe(1);
    expect(refunds.items[0].referenceType).toBe("WAGER_REFUND");

    const debits = await WalletHistoryService.listUserWalletHistory({ userId: userA, direction: "DEBIT" });
    expect(debits.total).toBe(1);

    const credits = await WalletHistoryService.listUserWalletHistory({ userId: userA, direction: "CREDIT" });
    expect(credits.total).toBe(2);
  });

  // ---------------------------------------------------------------------------
  // 4. Pagination & Sorting
  // ---------------------------------------------------------------------------
  it("4. Pagination and sorting: respects page limits and sorts by amount and date", async () => {
    const userA = await createTestUser("u-wh-4-a", 1000);

    await WalletTransactionService.createDebit(prisma, { userId: userA, amount: 50, referenceType: "MATCH_WAGER", referenceId: "m-1" });
    await WalletTransactionService.createDebit(prisma, { userId: userA, amount: 200, referenceType: "MATCH_WAGER", referenceId: "m-2" });
    await WalletTransactionService.createDebit(prisma, { userId: userA, amount: 100, referenceType: "MATCH_WAGER", referenceId: "m-3" });

    // Pagination
    const page1 = await WalletHistoryService.listUserWalletHistory({ userId: userA, page: 1, pageSize: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.total).toBe(3);
    expect(page1.totalPages).toBe(2);

    // Sorting by amount desc
    const sortedByAmt = await WalletHistoryService.listUserWalletHistory({ userId: userA, sortBy: "amount", sortOrder: "desc" });
    expect(sortedByAmt.items[0].amount).toBe(200);
    expect(sortedByAmt.items[1].amount).toBe(100);
    expect(sortedByAmt.items[2].amount).toBe(50);
  });

  // ---------------------------------------------------------------------------
  // 5. Authoritative Wallet Summary
  // ---------------------------------------------------------------------------
  it("5. Authoritative summary: calculates live balance and turnover totals from database records", async () => {
    const userA = await createTestUser("u-wh-5-a", 1000);

    await WalletTransactionService.createDebit(prisma, { userId: userA, amount: 100, referenceType: "MATCH_WAGER", referenceId: "m-1" });
    await WalletTransactionService.createCredit(prisma, { userId: userA, amount: 180, referenceType: "MATCH_PAYOUT", referenceId: "m-1" });

    const summary = await WalletHistoryService.getUserWalletSummary(userA);
    expect(summary.balance).toBe(1080);
    expect(summary.totalDebits).toBe(100);
    expect(summary.totalCredits).toBe(180);
    expect(summary.totalEntryFees).toBe(100);
    expect(summary.totalWinnings).toBe(180);
    expect(summary.transactionCount).toBe(2);
  });

  // ---------------------------------------------------------------------------
  // 6. Empty State Handling
  // ---------------------------------------------------------------------------
  it("6. Empty state: new user with 0 transactions returns empty items array cleanly", async () => {
    const userA = await createTestUser("u-wh-6-a", 1000);

    const history = await WalletHistoryService.listUserWalletHistory({ userId: userA });
    expect(history.items).toEqual([]);
    expect(history.total).toBe(0);
    expect(history.totalPages).toBe(0);
  });
});
