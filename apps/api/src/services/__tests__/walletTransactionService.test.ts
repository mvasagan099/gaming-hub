import { describe, expect, it, beforeEach } from "vitest";
import { prisma } from "@gaming-hub/db";
import { AppError } from "@gaming-hub/shared";
import { WalletTransactionService } from "../walletTransactionService";
import { getWallet } from "../wallet";

describe("Feature 1: Central Wallet Transaction Ledger", () => {
  const user1 = "test-ledger-user-1";
  const user2 = "test-ledger-user-2";
  const adminUser = "test-ledger-admin";

  beforeEach(async () => {
    for (const u of [user1, user2, adminUser]) {
      await prisma.user.upsert({
        where: { id: u },
        create: {
          id: u,
          email: `${u}@test.local`,
          username: u,
          displayName: `User ${u}`,
        },
        update: {},
      });

      await prisma.profile.upsert({
        where: { userId: u },
        create: {
          userId: u,
          coins: 1000,
        },
        update: {
          coins: 1000,
        },
      });

      await prisma.wallet.upsert({
        where: { userId: u },
        create: {
          userId: u,
          balance: 1000,
        },
        update: {
          balance: 1000,
          isFrozen: false,
        },
      });
    }

    await prisma.transaction.deleteMany({
      where: { userId: { in: [user1, user2, adminUser] } },
    });
  });

  // ---------------------------------------------------------------------------
  // 1 & 2. Basic Debit & Credit with Balance Snapshots
  // ---------------------------------------------------------------------------
  it("1. createDebit accurately debits balance and records immutable balanceBefore & balanceAfter", async () => {
    const updated = await prisma.$transaction(async (tx) => {
      return WalletTransactionService.createDebit(tx, {
        userId: user1,
        amount: 250,
        referenceType: "MATCH_WAGER",
        referenceId: "match-101",
        meta: { gameId: "carrom" },
      });
    });

    expect(updated.balance).toBe(750);

    const history = await WalletTransactionService.listUserTransactions(user1, {}, 1, 10);
    expect(history.items).toHaveLength(1);
    const item = history.items[0];

    expect(item.userId).toBe(user1);
    expect(item.type).toBe("DEBIT");
    expect(item.direction).toBe("DEBIT");
    expect(item.amount).toBe(250);
    expect(item.balanceBefore).toBe(1000);
    expect(item.balanceAfter).toBe(750);
    expect(item.referenceType).toBe("MATCH_WAGER");
    expect(item.referenceId).toBe("match-101");
  });

  it("2. createCredit accurately credits balance and records immutable balanceBefore & balanceAfter", async () => {
    const updated = await prisma.$transaction(async (tx) => {
      return WalletTransactionService.createCredit(tx, {
        userId: user1,
        amount: 450,
        referenceType: "MATCH_PAYOUT",
        referenceId: "match-101",
        meta: { gameId: "carrom" },
      });
    });

    expect(updated.balance).toBe(1450);

    const history = await WalletTransactionService.listUserTransactions(user1, {}, 1, 10);
    expect(history.items).toHaveLength(1);
    const item = history.items[0];

    expect(item.userId).toBe(user1);
    expect(item.type).toBe("CREDIT");
    expect(item.direction).toBe("CREDIT");
    expect(item.amount).toBe(450);
    expect(item.balanceBefore).toBe(1000);
    expect(item.balanceAfter).toBe(1450);
    expect(item.referenceType).toBe("MATCH_PAYOUT");
    expect(item.referenceId).toBe("match-101");
  });

  // ---------------------------------------------------------------------------
  // 3. Insufficient Balance Guard
  // ---------------------------------------------------------------------------
  it("3. createDebit throws INSUFFICIENT_BALANCE and does not create transaction when funds are inadequate", async () => {
    await prisma.wallet.update({
      where: { userId: user1 },
      data: { balance: 80 },
    });

    await expect(
      prisma.$transaction(async (tx) => {
        return WalletTransactionService.createDebit(tx, {
          userId: user1,
          amount: 100,
          referenceType: "MATCH_WAGER",
          referenceId: "match-failed",
        });
      }),
    ).rejects.toThrow("Insufficient balance");

    const wallet = await getWallet(user1);
    expect(wallet.balance).toBe(80);

    const history = await WalletTransactionService.listUserTransactions(user1, {}, 1, 10);
    expect(history.items).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // 4, 5, 6. Game Match Helpers (Entry, Prize, Refund)
  // ---------------------------------------------------------------------------
  it("4. createGameEntry, createGamePrize, and createGameRefund record complete audit trail", async () => {
    const matchId = "match-full-cycle-123";

    // 1. Entry Fee
    await prisma.$transaction(async (tx) => {
      await WalletTransactionService.createGameEntry(tx, {
        userId: user1,
        matchId,
        gameId: "table-tennis",
        entryFee: 100,
      });
    });

    // 2. Prize
    await prisma.$transaction(async (tx) => {
      await WalletTransactionService.createGamePrize(tx, {
        userId: user1,
        matchId,
        gameId: "table-tennis",
        prizeAmount: 180,
      });
    });

    // 3. Refund for another match
    await prisma.$transaction(async (tx) => {
      await WalletTransactionService.createGameRefund(tx, {
        userId: user1,
        matchId: "match-draw-456",
        gameId: "table-tennis",
        refundAmount: 100,
        reason: "draw",
      });
    });

    const history = await WalletTransactionService.listUserTransactions(user1, {}, 1, 10);
    expect(history.items).toHaveLength(3);

    // Sorted descending by createdAt
    const refundTx = history.items[0];
    const prizeTx = history.items[1];
    const entryTx = history.items[2];

    expect(entryTx.referenceType).toBe("MATCH_WAGER");
    expect(entryTx.type).toBe("DEBIT");
    expect(entryTx.amount).toBe(100);
    expect(entryTx.balanceBefore).toBe(1000);
    expect(entryTx.balanceAfter).toBe(900);

    expect(prizeTx.referenceType).toBe("MATCH_PAYOUT");
    expect(prizeTx.type).toBe("CREDIT");
    expect(prizeTx.amount).toBe(180);
    expect(prizeTx.balanceBefore).toBe(900);
    expect(prizeTx.balanceAfter).toBe(1080);

    expect(refundTx.referenceType).toBe("WAGER_REFUND");
    expect(refundTx.type).toBe("CREDIT");
    expect(refundTx.amount).toBe(100);
    expect(refundTx.balanceBefore).toBe(1080);
    expect(refundTx.balanceAfter).toBe(1180);

    const finalWallet = await getWallet(user1);
    expect(finalWallet.balance).toBe(1180);
  });

  // ---------------------------------------------------------------------------
  // 7, 8, 9. Tournament Helpers (Entry, Prize, Refund)
  // ---------------------------------------------------------------------------
  it("7. Tournament transaction helpers record structured metadata and references", async () => {
    const tournamentId = "tourney-master-cup";

    // Tournament Entry
    await prisma.$transaction(async (tx) => {
      await WalletTransactionService.createTournamentEntry(tx, {
        userId: user1,
        tournamentId,
        tournamentTitle: "Master Cup",
        entryFee: 200,
      });
    });

    // Tournament Prize (Rank #1)
    await prisma.$transaction(async (tx) => {
      await WalletTransactionService.createTournamentPrize(tx, {
        userId: user1,
        tournamentId,
        tournamentTitle: "Master Cup",
        prizeAmount: 500,
        rank: 1,
      });
    });

    const history = await WalletTransactionService.listUserTransactions(user1, {}, 1, 10);
    expect(history.items).toHaveLength(2);

    const prizeTx = history.items[0];
    const entryTx = history.items[1];

    expect(entryTx.referenceType).toBe("TOURNAMENT_ENTRY");
    expect(entryTx.amount).toBe(200);
    expect(entryTx.balanceAfter).toBe(800);

    expect(prizeTx.referenceType).toBe("TOURNAMENT_PRIZE");
    expect(prizeTx.amount).toBe(500);
    expect(prizeTx.balanceAfter).toBe(1300);
  });

  // ---------------------------------------------------------------------------
  // 10. Admin Manual Adjustments
  // ---------------------------------------------------------------------------
  it("10. createAdminAdjustment records ADMIN type with auditor ID and reason", async () => {
    await prisma.$transaction(async (tx) => {
      await WalletTransactionService.createAdminAdjustment(tx, {
        userId: user1,
        amount: 300,
        reason: "Promotional loyalty reward",
        adminId: adminUser,
      });
    });

    const history = await WalletTransactionService.listUserTransactions(user1, {}, 1, 10);
    expect(history.items).toHaveLength(1);
    const tx = history.items[0];

    expect(tx.referenceType).toBe("ADMIN");
    expect(tx.amount).toBe(300);
    expect(tx.balanceBefore).toBe(1000);
    expect(tx.balanceAfter).toBe(1300);
    expect(tx.meta.reason).toBe("Promotional loyalty reward");
    expect(tx.meta.adjustedBy).toBe(adminUser);
  });

  // ---------------------------------------------------------------------------
  // 11 & 12. User Privacy & Filtering
  // ---------------------------------------------------------------------------
  it("11. listUserTransactions enforces user boundaries and never exposes another user's records", async () => {
    // Record tx for User 1
    await prisma.$transaction(async (tx) => {
      await WalletTransactionService.createDebit(tx, {
        userId: user1,
        amount: 100,
        referenceType: "MATCH_WAGER",
        referenceId: "match-u1",
      });
    });

    // Record tx for User 2
    await prisma.$transaction(async (tx) => {
      await WalletTransactionService.createDebit(tx, {
        userId: user2,
        amount: 150,
        referenceType: "MATCH_WAGER",
        referenceId: "match-u2",
      });
    });

    const u1History = await WalletTransactionService.listUserTransactions(user1, {}, 1, 10);
    const u2History = await WalletTransactionService.listUserTransactions(user2, {}, 1, 10);

    expect(u1History.items).toHaveLength(1);
    expect(u1History.items[0].userId).toBe(user1);
    expect(u1History.items[0].amount).toBe(100);

    expect(u2History.items).toHaveLength(1);
    expect(u2History.items[0].userId).toBe(user2);
    expect(u2History.items[0].amount).toBe(150);
  });

  // ---------------------------------------------------------------------------
  // 13. Admin Ledger Search & Filtering
  // ---------------------------------------------------------------------------
  it("13. adminListTransactions allows filtering across all users by referenceId and referenceType", async () => {
    await prisma.$transaction(async (tx) => {
      await WalletTransactionService.createDebit(tx, {
        userId: user1,
        amount: 100,
        referenceType: "MATCH_WAGER",
        referenceId: "match-global-search-999",
      });
      await WalletTransactionService.createDebit(tx, {
        userId: user2,
        amount: 100,
        referenceType: "MATCH_WAGER",
        referenceId: "match-global-search-999",
      });
    });

    const adminQuery = await WalletTransactionService.adminListTransactions(
      { referenceId: "match-global-search-999" },
      1,
      10,
    );

    expect(adminQuery.items).toHaveLength(2);
    expect(adminQuery.total).toBe(2);
    const userIds = adminQuery.items.map((i) => i.userId).sort();
    expect(userIds).toEqual([user1, user2].sort());
  });

  // ---------------------------------------------------------------------------
  // 14. Multi-step Financial Chain Reconciliation
  // ---------------------------------------------------------------------------
  it("14. Reconciles multi-step balance chain mathematically: balanceBefore - debit + credit = balanceAfter", async () => {
    let currentExpected = 1000;

    const steps: { amount: number; isDebit: boolean; ref: string }[] = [
      { amount: 100, isDebit: true, ref: "step-1" },
      { amount: 180, isDebit: false, ref: "step-2" },
      { amount: 50, isDebit: true, ref: "step-3" },
      { amount: 200, isDebit: false, ref: "step-4" },
      { amount: 300, isDebit: true, ref: "step-5" },
    ];

    for (const step of steps) {
      await prisma.$transaction(async (tx) => {
        if (step.isDebit) {
          await WalletTransactionService.createDebit(tx, {
            userId: user1,
            amount: step.amount,
            referenceType: "MATCH_WAGER",
            referenceId: step.ref,
          });
          currentExpected -= step.amount;
        } else {
          await WalletTransactionService.createCredit(tx, {
            userId: user1,
            amount: step.amount,
            referenceType: "MATCH_PAYOUT",
            referenceId: step.ref,
          });
          currentExpected += step.amount;
        }
      });
    }

    const wallet = await getWallet(user1);
    expect(wallet.balance).toBe(currentExpected);

    const history = await WalletTransactionService.listUserTransactions(user1, {}, 1, 20);
    expect(history.items).toHaveLength(5);

    // Verify every single record's balanceBefore and balanceAfter integrity
    for (const record of history.items) {
      if (record.direction === "DEBIT") {
        expect(record.balanceBefore - record.amount).toBe(record.balanceAfter);
      } else {
        expect(record.balanceBefore + record.amount).toBe(record.balanceAfter);
      }
    }
  });
});
