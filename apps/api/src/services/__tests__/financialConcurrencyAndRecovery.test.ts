import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@gaming-hub/db";
import { AppError } from "@gaming-hub/shared";
import { redeemCoupon } from "../coupons";
import { transferToCouponWallet, reconcileUnconfirmedTransfer } from "../wallet";
import { CouponVaultService } from "../couponVaultService";

describe("Real PostgreSQL Financial Concurrency & Crash Recovery", () => {
  const userA = "test-user-concurrency-a";
  const userB = "test-user-concurrency-b";

  beforeEach(async () => {
    // Setup test users & clean initial balances
    await prisma.user.upsert({
      where: { id: userA },
      update: {},
      create: {
        id: userA,
        username: "concurrency_a",
        displayName: "Concurrency A",
        email: "concurrency_a@test.com",
      },
    });
    await prisma.profile.upsert({
      where: { userId: userA },
      update: { coins: 0 },
      create: { userId: userA, coins: 0 },
    });
    await prisma.wallet.upsert({
      where: { userId: userA },
      update: { balance: 500, bonusBalance: 0, lockedBalance: 0 },
      create: { userId: userA, balance: 500, bonusBalance: 0, lockedBalance: 0 },
    });

    await prisma.user.upsert({
      where: { id: userB },
      update: {},
      create: {
        id: userB,
        username: "concurrency_b",
        displayName: "Concurrency B",
        email: "concurrency_b@test.com",
      },
    });
    await prisma.profile.upsert({
      where: { userId: userB },
      update: { coins: 0 },
      create: { userId: userB, coins: 0 },
    });
    await prisma.wallet.upsert({
      where: { userId: userB },
      update: { balance: 500, bonusBalance: 0, lockedBalance: 0 },
      create: { userId: userB, balance: 500, bonusBalance: 0, lockedBalance: 0 },
    });
  });

  // =========================================================================
  // Requirement 3: Cross-User Coupon Concurrency
  // =========================================================================
  it("Requirement 3: Two users attempting the same coupon code simultaneously results in exactly one credit", async () => {
    const couponCode = `RACE-${Date.now()}`;
    const couponId = `cpn-${Date.now()}`;

    // Mock CouponVault verify & redeem
    vi.spyOn(CouponVaultService, "verifyCoupon").mockResolvedValue({
      success: true,
      couponId,
      amount: 100,
      currency: "INR",
      status: "ACTIVE",
    });

    let redeemCalls = 0;
    vi.spyOn(CouponVaultService, "redeemCoupon").mockImplementation(async () => {
      redeemCalls++;
      // Simulate minor network latency
      await new Promise((r) => setTimeout(r, 20));
      return { success: true };
    });

    // Run User A and User B concurrently
    const [resA, resB] = await Promise.allSettled([
      redeemCoupon(userA, couponCode),
      redeemCoupon(userB, couponCode),
    ]);

    const successes = [resA, resB].filter((r) => r.status === "fulfilled");
    const rejections = [resA, resB].filter((r) => r.status === "rejected");

    expect(successes.length).toBe(1);
    expect(rejections.length).toBe(1);

    // Exactly one call to CouponVault
    expect(redeemCalls).toBe(1);

    // Verify wallet balances in real DB: exactly one user was credited 100
    const walletA = await prisma.wallet.findUniqueOrThrow({ where: { userId: userA } });
    const walletB = await prisma.wallet.findUniqueOrThrow({ where: { userId: userB } });

    const totalBalance = walletA.balance + walletB.balance;
    expect(totalBalance).toBe(1100); // Initial 500 + 500 + 100 = 1100

    // Verify exactly one CouponRedemption row exists in DB
    const redemptions = await prisma.couponRedemption.findMany({
      where: { couponId },
    });
    expect(redemptions.length).toBe(1);
    expect(redemptions[0].sagaStatus).toBe("COMPLETED");
  });

  // =========================================================================
  // Requirement 4: Crash-Safe Coupon Recovery
  // =========================================================================
  it("Requirement 4: Recovers from local DB failure after EXTERNAL_CONFIRMED without re-calling CouponVault", async () => {
    const couponCode = `CRASH-${Date.now()}`;
    const couponId = `cpn-crash-${Date.now()}`;

    vi.spyOn(CouponVaultService, "verifyCoupon").mockResolvedValue({
      success: true,
      couponId,
      amount: 200,
      currency: "INR",
      status: "ACTIVE",
    });

    let vaultRedeemCalls = 0;
    vi.spyOn(CouponVaultService, "redeemCoupon").mockImplementation(async () => {
      vaultRedeemCalls++;
      return { success: true };
    });

    // Step 1: Simulate crash right after EXTERNAL_CONFIRMED
    // Create the saga row pre-stamped as EXTERNAL_CONFIRMED (as would happen if server died before wallet credit)
    const crypto = await import("node:crypto");
    const codeHash = crypto.createHash("sha256").update(couponCode.toUpperCase()).digest("hex");

    await prisma.coupon.upsert({
      where: { code: couponCode },
      update: {},
      create: {
        id: couponId,
        code: couponCode,
        title: "Crash Recovery Test",
        discountType: "FIXED",
        discountValue: 200,
        maxUses: 1,
        usedCount: 0,
        validFrom: new Date(Date.now() - 3600000),
        validUntil: new Date(Date.now() + 86400000),
        status: "ACTIVE",
      },
    });

    await prisma.couponRedemption.create({
      data: {
        couponId,
        userId: userA,
        value: 200,
        couponCodeHash: codeHash,
        externalTxId: `CPN-${couponId}`,
        sagaStatus: "EXTERNAL_CONFIRMED",
        externalConfirmedAt: new Date(),
      },
    });

    const initialBalance = (await prisma.wallet.findUniqueOrThrow({ where: { userId: userA } })).balance;

    // Step 2: Worker restart / user retry
    const res = await redeemCoupon(userA, couponCode);

    expect(res.ok).toBe(true);
    expect(res.value).toBe(200);

    // CRITICAL: CouponVault must NOT be called again because it was already EXTERNAL_CONFIRMED!
    expect(vaultRedeemCalls).toBe(0);

    // Step 3: Verify local credit occurred exactly once
    const finalWallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: userA } });
    expect(finalWallet.balance).toBe(initialBalance + 200);

    // Step 4: Verify saga status is now COMPLETED
    const finalSaga = await prisma.couponRedemption.findUniqueOrThrow({
      where: { couponCodeHash: codeHash },
    });
    expect(finalSaga.sagaStatus).toBe("COMPLETED");
    expect(finalSaga.completedAt).not.toBeNull();
  });

  // =========================================================================
  // Requirement 5: Withdrawal Concurrency & Reconciliation
  // =========================================================================
  describe("Requirement 5: Withdrawal Concurrency & Stale Claim Recovery", () => {
    it("prevents double-spend under simultaneous withdrawals exceeding balance", async () => {
      // userA has balance 500. Two concurrent withdrawals of 400 each.
      vi.spyOn(CouponVaultService, "transferToCouponWallet").mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 25));
        return { success: true, processed: true, transactionId: "tx-test" };
      });

      const [res1, res2] = await Promise.allSettled([
        transferToCouponWallet(userA, 400),
        transferToCouponWallet(userA, 400),
      ]);

      const fulfilled = [res1, res2].filter((r) => r.status === "fulfilled");
      const rejected = [res1, res2].filter((r) => r.status === "rejected");

      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);

      // Verify final balance is 100 (500 - 400), NOT negative or double-deducted
      const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: userA } });
      expect(wallet.balance).toBe(100);
    });

    it("prevents duplicate action when two reconciliation workers race on the same record", async () => {
      const txId = `TRF-reconcile-race-${Date.now()}`;

      await prisma.walletRequest.create({
        data: {
          userId: userA,
          kind: "WITHDRAWAL",
          amount: 100,
          fee: 0,
          status: "PENDING",
          method: "COUPONVAULT",
          note: txId,
          externalTransferId: txId,
          adminNote: "UNCONFIRMED_HOLD",
        },
      });

      let checkCalls = 0;
      vi.spyOn(CouponVaultService, "checkTransferStatus").mockImplementation(async () => {
        checkCalls++;
        await new Promise((r) => setTimeout(r, 30));
        return { success: true, processed: true, status: "SUCCESS" };
      });

      // Two reconciliation workers run concurrently for the same transactionId
      const [worker1, worker2] = await Promise.all([
        reconcileUnconfirmedTransfer(txId),
        reconcileUnconfirmedTransfer(txId),
      ]);

      // Both complete safely without error
      expect(worker1.reconciled || worker2.reconciled).toBe(true);

      // Exactly ONE final approved record in DB
      const req = await prisma.walletRequest.findFirstOrThrow({
        where: { externalTransferId: txId },
      });
      expect(req.status).toBe("APPROVED");
      expect(req.adminNote).toBe("RECONCILED_SUCCESS");
    });

    it("recovers stale PROCESSING state after simulated worker crash", async () => {
      const txId = `TRF-stale-crash-${Date.now()}`;

      // Simulate a worker that set PROCESSING and died 5 minutes ago
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      await prisma.walletRequest.create({
        data: {
          userId: userA,
          kind: "WITHDRAWAL",
          amount: 100,
          fee: 0,
          status: "PENDING",
          method: "COUPONVAULT",
          note: txId,
          externalTransferId: txId,
          adminNote: "PROCESSING",
          processingStartedAt: fiveMinutesAgo,
        },
      });

      vi.spyOn(CouponVaultService, "checkTransferStatus").mockResolvedValue({
        success: true,
        processed: true,
        status: "SUCCESS",
      });

      // New worker runs reconciliation
      const result = await reconcileUnconfirmedTransfer(txId);

      expect(result.reconciled).toBe(true);
      expect(result.resolution).toBe("COMPLETED");

      const req = await prisma.walletRequest.findFirstOrThrow({
        where: { externalTransferId: txId },
      });
      expect(req.status).toBe("APPROVED");
    });

    it("maintains UNCONFIRMED_HOLD and never blindly refunds when external service is unreachable", async () => {
      const txId = `TRF-unreachable-${Date.now()}`;

      await prisma.walletRequest.create({
        data: {
          userId: userA,
          kind: "WITHDRAWAL",
          amount: 100,
          fee: 0,
          status: "PENDING",
          method: "COUPONVAULT",
          note: txId,
          externalTransferId: txId,
          adminNote: "UNCONFIRMED_HOLD",
        },
      });

      vi.spyOn(CouponVaultService, "checkTransferStatus").mockRejectedValue(
        new Error("Connection refused (503 Service Unavailable)")
      );

      const balanceBefore = (await prisma.wallet.findUniqueOrThrow({ where: { userId: userA } })).balance;

      const result = await reconcileUnconfirmedTransfer(txId);

      expect(result.reconciled).toBe(false);
      expect(result.resolution).toBe("HELD");

      // Balance was NOT refunded!
      const balanceAfter = (await prisma.wallet.findUniqueOrThrow({ where: { userId: userA } })).balance;
      expect(balanceAfter).toBe(balanceBefore);

      // Record remains in UNCONFIRMED_HOLD for retry
      const req = await prisma.walletRequest.findFirstOrThrow({
        where: { externalTransferId: txId },
      });
      expect(req.status).toBe("PENDING");
      expect(req.adminNote).toBe("UNCONFIRMED_HOLD");
    });
  });
});
