import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@gaming-hub/db";
import { AdminWalletService } from "../adminWalletService";
import { WalletSyncService, type WalletSyncPayload } from "../walletSyncService";

describe("Feature 19: Admin Wallet & Coin Management", () => {
  const createdUserIds: string[] = [];

  async function createTestUser(prefix: string, balance = 1000, role = "USER") {
    const userId = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    createdUserIds.push(userId);

    await prisma.user.create({
      data: {
        id: userId,
        username: `u_${userId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 16)}`,
        displayName: `User ${userId.slice(0, 8)}`,
        email: `${userId}@test.com`,
        role: role as any,
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

  async function getWallet(userId: string) {
    return prisma.wallet.findUniqueOrThrow({ where: { userId } });
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
  // 1. Authorized Admin View
  // ---------------------------------------------------------------------------
  it("1. Admin wallet view: returns authoritative balance, totals, and recent transactions", async () => {
    const adminId = await createTestUser("u-adm-1-a", 0, "ADMIN");
    const targetUserId = await createTestUser("u-adm-1-b", 1250);

    const details = await AdminWalletService.getUserWalletDetails(targetUserId);
    expect(details.user.id).toBe(targetUserId);
    expect(details.wallet.balance).toBe(1250);
    expect(details.stats.transactionCount).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // 2. Manual Credit Adjustment
  // ---------------------------------------------------------------------------
  it("2. Manual credit: credits wallet atomically, creates ADMIN transaction, and triggers live sync", async () => {
    const adminId = await createTestUser("u-adm-2-a", 0, "ADMIN");
    const targetUserId = await createTestUser("u-adm-2-b", 1000);

    const syncEvents: WalletSyncPayload[] = [];
    const unsubscribe = WalletSyncService.registerSyncListener((payload) => {
      if (payload.userId === targetUserId) syncEvents.push(payload);
    });

    const res = await AdminWalletService.adjustWallet({
      adminId,
      targetUserId,
      amount: 500,
      reason: "Promotional compensation for server downtime",
      idempotencyKey: "downtime-compensation",
    });

    unsubscribe();

    expect(res.ok).toBe(true);
    expect(res.balanceBefore).toBe(1000);
    expect(res.balanceAfter).toBe(1500);
    expect(res.direction).toBe("CREDIT");
    expect((await getWallet(targetUserId)).balance).toBe(1500);

    // Verify transaction row
    const tx = await prisma.transaction.findFirst({
      where: { userId: targetUserId, referenceType: "ADMIN" },
    });
    expect(tx).not.toBeNull();
    expect(tx?.amount).toBe(500);
    expect(tx?.balanceAfter).toBe(1500);

    // Live sync event
    expect(syncEvents.length).toBeGreaterThanOrEqual(1);
    expect(syncEvents[syncEvents.length - 1].balance).toBe(1500);
  });

  // ---------------------------------------------------------------------------
  // 3. Manual Debit Adjustment
  // ---------------------------------------------------------------------------
  it("3. Manual debit: debits wallet atomically with reason and admin ID", async () => {
    const adminId = await createTestUser("u-adm-3-a", 0, "ADMIN");
    const targetUserId = await createTestUser("u-adm-3-b", 1000);

    const res = await AdminWalletService.adjustWallet({
      adminId,
      targetUserId,
      amount: -300,
      reason: "Adjustment for duplicate reward claim",
      idempotencyKey: "duplicate-reward-correction",
    });

    expect(res.ok).toBe(true);
    expect(res.balanceBefore).toBe(1000);
    expect(res.balanceAfter).toBe(700);
    expect(res.direction).toBe("DEBIT");
    expect((await getWallet(targetUserId)).balance).toBe(700);
  });

  // ---------------------------------------------------------------------------
  // 4. Insufficient Balance Guard on Debit (No Negative Balances)
  // ---------------------------------------------------------------------------
  it("4. Insufficient balance guard: debit exceeding balance is rejected without negative balances", async () => {
    const adminId = await createTestUser("u-adm-4-a", 0, "ADMIN");
    const targetUserId = await createTestUser("u-adm-4-b", 200);

    await expect(
      AdminWalletService.adjustWallet({
        adminId,
        targetUserId,
        amount: -500,
        reason: "Excessive debit attempt",
        idempotencyKey: "excessive-debit",
      })
    ).rejects.toThrow(/INSUFFICIENT_BALANCE|Cannot debit/i);

    expect((await getWallet(targetUserId)).balance).toBe(200);
  });

  // ---------------------------------------------------------------------------
  // 5. Validation: Missing Reason & Zero Amount
  // ---------------------------------------------------------------------------
  it("5. Validation: rejects empty reason and zero amount", async () => {
    const adminId = await createTestUser("u-adm-5-a", 0, "ADMIN");
    const targetUserId = await createTestUser("u-adm-5-b", 1000);

    // Empty reason
    await expect(
      AdminWalletService.adjustWallet({
        adminId,
        targetUserId,
        amount: 100,
        reason: "",
      })
    ).rejects.toThrow(/VALIDATION_ERROR|reason/i);

    // Zero amount
    await expect(
      AdminWalletService.adjustWallet({
        adminId,
        targetUserId,
        amount: 0,
        reason: "Valid reason text",
      })
    ).rejects.toThrow(/VALIDATION_ERROR|amount/i);
  });

  // ---------------------------------------------------------------------------
  // 6. Duplicate Adjustment Idempotency
  // ---------------------------------------------------------------------------
  it("6. Idempotency: repeated submissions with same idempotencyKey execute exactly once", async () => {
    const adminId = await createTestUser("u-adm-6-a", 0, "ADMIN");
    const targetUserId = await createTestUser("u-adm-6-b", 1000);
    const key = `idem-adm-${Date.now()}`;

    const [res1, res2] = await Promise.allSettled([
      AdminWalletService.adjustWallet({ adminId, targetUserId, amount: 200, reason: "Bonus 1", idempotencyKey: key }),
      AdminWalletService.adjustWallet({ adminId, targetUserId, amount: 200, reason: "Bonus 1", idempotencyKey: key }),
    ]);

    expect((res1.status === "fulfilled" && res1.value.ok) || (res2.status === "fulfilled" && res2.value.ok)).toBe(true);
    expect((await getWallet(targetUserId)).balance).toBe(1200); // exactly one 200 credit
  });

  // ---------------------------------------------------------------------------
  // 7. Platform-Wide Transaction Search
  // ---------------------------------------------------------------------------
  it("7. Transaction search: searches transactions platform-wide with user and type filters", async () => {
    const adminId = await createTestUser("u-adm-7-a", 0, "ADMIN");
    const targetUserId = await createTestUser("u-adm-7-b", 1000);

    await AdminWalletService.adjustWallet({
      adminId,
      targetUserId,
      amount: 150,
      reason: "Searchable adjustment",
      idempotencyKey: "search-fixture",
    });

    const search = await AdminWalletService.searchAllTransactions({
      userId: targetUserId,
      type: "CREDIT",
    });

    expect(search.total).toBeGreaterThanOrEqual(1);
    expect(search.items[0].userId).toBe(targetUserId);
    expect(search.items[0].amount).toBe(150);
  });
});
