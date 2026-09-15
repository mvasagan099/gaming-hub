import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../featureFlags", () => ({
  getFeatureFlags: vi.fn().mockResolvedValue({}),
  isFeatureEnabled: vi.fn().mockResolvedValue(true),
  assertFeatureEnabled: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../settings", () => ({
  getCategorySettings: vi.fn().mockResolvedValue({
    minWithdrawal: 50,
    maxWithdrawal: 100000,
    minDeposit: 10,
    maxDeposit: 100000,
    dailyWithdrawalLimit: 0,
    withdrawalFeePercent: 0,
    maxPendingWithdrawalRequests: 10,
    otpExpiryMinutes: 10,
    otpMaxAttempts: 5,
  }),
}));

import { CouponVaultService } from "../couponVaultService";
import { redeemCoupon, verifyCoupon } from "../coupons";
import { transferToCouponWallet } from "../wallet";
import { SettlementService } from "../settlementService";
import { socketBridge, resetSocketBridge } from "../socketBridge";
import { prisma } from "@gaming-hub/db";
import { AppError } from "@gaming-hub/shared";

describe("CouponVault Integration Unit Tests", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    resetSocketBridge();
    vi.restoreAllMocks();
    vi.spyOn(prisma.auditLog, "create").mockResolvedValue({} as any);
    vi.spyOn(prisma.siteSetting, "findMany").mockResolvedValue([]);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // ==========================================================================
  // 1. Coupon Verification Tests
  // ==========================================================================
  describe("1. Coupon Verification", () => {
    it("successfully verifies an active coupon with CouponVault", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          couponId: "cpn-uuid-101",
          amount: 500,
          currency: "INR",
          status: "ACTIVE",
        }),
      } as Response);

      const result = await CouponVaultService.verifyCoupon("FREE500", "user-123");

      expect(result.success).toBe(true);
      expect(result.couponId).toBe("cpn-uuid-101");
      expect(result.amount).toBe(500);
      expect(result.currency).toBe("INR");

      // Verify request payload and headers
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/coupons/verify"),
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            "x-api-key": expect.any(String),
          }),
          body: JSON.stringify({
            couponCode: "FREE500",
            userId: "user-123",
            gameId: "gaming-hub",
          }),
        }),
      );
    });

    it("throws 404 COUPON_INVALID when coupon does not exist", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({
          success: false,
          code: "INVALID_COUPON",
          message: "Coupon not found.",
        }),
      } as Response);

      await expect(CouponVaultService.verifyCoupon("DOESNOTEXIST", "user-123")).rejects.toThrow(
        AppError,
      );
    });

    it("throws COUPON_ALREADY_USED when coupon is already redeemed", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          success: false,
          code: "REDEEMED",
          message: "Coupon already redeemed.",
        }),
      } as Response);

      await expect(CouponVaultService.verifyCoupon("USED100", "user-123")).rejects.toThrow(
        "Coupon already redeemed.",
      );
    });

    it("throws COUPON_DISABLED when coupon is disabled", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          success: false,
          code: "DISABLED",
          message: "Coupon disabled.",
        }),
      } as Response);

      await expect(CouponVaultService.verifyCoupon("OFF100", "user-123")).rejects.toThrow(
        "Coupon disabled.",
      );
    });

    it("handles CouponVault network unavailability gracefully", async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error("Connection refused"));

      await expect(CouponVaultService.verifyCoupon("TEST50", "user-123")).rejects.toThrow(
        "Coupon verification service is temporarily unavailable. Please try again later.",
      );
    });
  });

  // ==========================================================================
  // 2. Coupon Redemption Tests
  // ==========================================================================
  describe("2. Coupon Redemption Client", () => {
    it("successfully calls CouponVault /coupons/redeem with proper payload", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      } as Response);

      const res = await CouponVaultService.redeemCoupon({
        couponId: "cpn-uuid-202",
        userId: "user-456",
        walletTransactionId: "CPN-cpn-uuid-202",
        ipAddress: "127.0.0.1",
        device: "Desktop Chrome",
      });

      expect(res.success).toBe(true);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/coupons/redeem"),
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            "x-api-key": expect.any(String),
          }),
          body: JSON.stringify({
            couponId: "cpn-uuid-202",
            userId: "user-456",
            gameId: "gaming-hub",
            walletTransactionId: "CPN-cpn-uuid-202",
            ipAddress: "127.0.0.1",
            device: "Desktop Chrome",
          }),
        }),
      );
    });

    it("handles 409 conflict if coupon is already used", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({
          success: false,
          code: "REDEEM_FAILED",
          message: "Coupon already redeemed",
        }),
      } as Response);

      await expect(
        CouponVaultService.redeemCoupon({
          couponId: "cpn-uuid-303",
          userId: "user-789",
          walletTransactionId: "CPN-cpn-uuid-303",
        }),
      ).rejects.toThrow("Coupon already redeemed");
    });
  });

  // ==========================================================================
  // 3. CouponVault Transfer / Withdrawal Client Tests
  // ==========================================================================
  describe("3. CouponVault Transfer Client", () => {
    it("successfully sends transfer request to CouponVault", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          message: "Transfer successful",
          data: { transferId: "trf-123" },
        }),
      } as Response);

      const result = await CouponVaultService.transferToCouponWallet({
        userId: "user-999",
        userEmail: "Player@example.com",
        amount: 250,
        transactionId: "TRF-user-999-1700000000",
      });

      expect(result.success).toBe(true);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/wallet/transfer"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            userId: "user-999",
            userEmail: "player@example.com", // normalized
            amount: 250,
            transactionId: "TRF-user-999-1700000000",
          }),
        }),
      );
    });

    it("treats 409 DUPLICATE_TRANSACTION as idempotent success", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({
          success: false,
          code: "DUPLICATE_TRANSACTION",
          message: "Transaction already processed.",
        }),
      } as Response);

      const result = await CouponVaultService.transferToCouponWallet({
        userId: "user-999",
        userEmail: "player@example.com",
        amount: 250,
        transactionId: "TRF-user-999-1700000000",
      });

      expect(result.success).toBe(true);
      expect(result.isDuplicate).toBe(true);
    });

    it("throws TRANSFER_FAILED on 400 error from CouponVault", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          success: false,
          code: "TRANSFER_FAILED",
          message: "User not found in Coupon platform for email: unknown@example.com",
        }),
      } as Response);

      await expect(
        CouponVaultService.transferToCouponWallet({
          userId: "user-999",
          userEmail: "unknown@example.com",
          amount: 250,
          transactionId: "TRF-user-999-1700000000",
        }),
      ).rejects.toThrow("User not found in Coupon platform");
    });
  });

  // ==========================================================================
  // 4. End-to-End Service Flow & Wallet Crediting Tests
  // ==========================================================================
  describe("4. Gaming Hub Coupon Redemption Workflow", () => {
    it("credits MAIN balance upon successful CouponVault redemption and emits wallet:updated", async () => {
      // Mock CouponVault verify response
      vi.spyOn(CouponVaultService, "verifyCoupon").mockResolvedValue({
        success: true,
        couponId: "cpn-vault-404",
        amount: 1000,
        currency: "INR",
        status: "ACTIVE",
      });

      // Mock CouponVault redeem response
      vi.spyOn(CouponVaultService, "redeemCoupon").mockResolvedValue({
        success: true,
      });

      // Mock DB methods for saga workflow
      vi.spyOn(prisma.couponRedemption, "findFirst").mockResolvedValue(null);
      vi.spyOn(prisma.couponRedemption, "findUnique").mockResolvedValue(null);
      vi.spyOn(prisma.couponRedemption, "create").mockResolvedValue({
        id: "saga-1",
        couponId: "cpn-vault-404",
        userId: "user-redeem-test",
        value: 1000,
        couponCodeHash: "hash-mega1000",
        externalTxId: "CPN-cpn-vault-404",
        sagaStatus: "PENDING",
        failureReason: null,
        externalConfirmedAt: null,
        completedAt: null,
        createdAt: new Date(),
      } as any);
      vi.spyOn(prisma.couponRedemption, "update").mockResolvedValue({} as any);
      vi.spyOn(prisma.coupon, "upsert").mockResolvedValue({ id: "cpn-vault-404" } as any);

      const mockTx = {
        coupon: {
          upsert: vi.fn().mockResolvedValue({ id: "cpn-vault-404" }),
        },
        couponRedemption: {
          create: vi.fn().mockResolvedValue({ id: "redemption-1", value: 1000 }),
          update: vi.fn().mockResolvedValue({ id: "redemption-1", sagaStatus: "COMPLETED" }),
        },
        wallet: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          findUniqueOrThrow: vi.fn().mockResolvedValue({
            userId: "user-redeem-test",
            balance: 3500, // 2500 initial + 1000
            bonusBalance: 0,
            lockedBalance: 0,
            rewardBalance: 0,
            cashbackBalance: 0,
          }),
        },
        profile: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        transaction: {
          create: vi.fn().mockResolvedValue({ id: "tx-redeem-1" }),
        },
      };

      vi.spyOn(prisma, "$transaction").mockImplementation(async (cb: any) => {
        return cb(mockTx);
      });

      vi.spyOn(prisma.wallet, "findUnique").mockResolvedValue({
        userId: "user-redeem-test",
        balance: 3500,
        bonusBalance: 0,
        lockedBalance: 0,
        rewardBalance: 0,
        cashbackBalance: 0,
        isFrozen: false,
        frozenAt: null,
        frozenReason: null,
        updatedAt: new Date(),
      });

      vi.spyOn(prisma.appNotification, "create").mockResolvedValue({} as any);

      const res = await redeemCoupon("user-redeem-test", "MEGA1000");

      expect(res.ok).toBe(true);
      expect(res.value).toBe(1000);
      expect(res.code).toBe("MEGA1000");

      // Verify CouponVault was called FIRST before local DB transaction
      expect(CouponVaultService.verifyCoupon).toHaveBeenCalledWith("MEGA1000", "user-redeem-test");
      expect(CouponVaultService.redeemCoupon).toHaveBeenCalled();

      // Verify wallet:updated socket event was emitted
      expect(socketBridge.calls.some((c) => c.event === "wallet:updated" && c.payload.amount === 1000)).toBe(true);
    });

    it("prevents double-crediting if coupon was already redeemed locally", async () => {
      vi.spyOn(CouponVaultService, "verifyCoupon").mockResolvedValue({
        success: true,
        couponId: "cpn-vault-dup",
        amount: 500,
        currency: "INR",
        status: "ACTIVE",
      });

      // Mock local DB returning an already COMPLETED saga row via couponCodeHash lookup
      vi.spyOn(prisma.couponRedemption, "findFirst").mockResolvedValue({
        id: "existing-redemption-id",
        couponId: "cpn-vault-dup",
        userId: "user-dup-test",
        value: 500,
        createdAt: new Date(),
        couponCodeHash: "hash-of-dup500",
        externalTxId: "CPN-cpn-vault-dup",
        sagaStatus: "COMPLETED",
        failureReason: null,
        externalConfirmedAt: null,
        completedAt: new Date(),
      });

      const redeemSpy = vi.spyOn(CouponVaultService, "redeemCoupon");

      // The saga returns idempotently for COMPLETED sagas
      const result = await redeemCoupon("user-dup-test", "DUP500");
      expect(result.ok).toBe(true);
      expect(result.message).toContain("already redeemed");

      // CouponVault redeem should NOT be called for COMPLETED sagas
      expect(redeemSpy).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // 5. Explicit Withdrawal & Refund Safety Tests
  // ==========================================================================
  describe("5. Withdrawal & Refund Lifecycle", () => {
    it("rejects withdrawal if amount is below minimum (< 50)", async () => {
      await expect(transferToCouponWallet("user-test", 20)).rejects.toThrow(
        "Minimum transfer amount is 50 coins",
      );
    });

    it("rejects withdrawal if balance is insufficient", async () => {
      vi.spyOn(prisma.user, "findUnique").mockResolvedValue({
        id: "user-poor",
        email: "poor@example.com",
        username: "poor",
      } as any);

      vi.spyOn(prisma.wallet, "findUnique").mockResolvedValue({
        userId: "user-poor",
        balance: 30, // less than requested
        bonusBalance: 0,
        lockedBalance: 0,
        rewardBalance: 0,
        cashbackBalance: 0,
        isFrozen: false,
        frozenAt: null,
        frozenReason: null,
        updatedAt: new Date(),
      });

      await expect(transferToCouponWallet("user-poor", 100)).rejects.toThrow(
        "Insufficient balance for transfer",
      );
    });

    it("deducts balance, transfers to CouponVault, and marks COMPLETED on success", async () => {
      vi.spyOn(prisma.user, "findUnique").mockResolvedValue({
        id: "user-rich",
        email: "rich@example.com",
        username: "rich",
      } as any);

      vi.spyOn(prisma.wallet, "findUnique").mockResolvedValue({
        userId: "user-rich",
        balance: 1000,
        bonusBalance: 0,
        lockedBalance: 0,
        rewardBalance: 0,
        cashbackBalance: 0,
        isFrozen: false,
        frozenAt: null,
        frozenReason: null,
        updatedAt: new Date(),
      });

      const mockTx = {
        wallet: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          findUniqueOrThrow: vi.fn().mockResolvedValue({
            userId: "user-rich",
            balance: 500, // 1000 - 500
            bonusBalance: 0,
            lockedBalance: 0,
            rewardBalance: 0,
            cashbackBalance: 0,
          }),
        },
        profile: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        transaction: {
          create: vi.fn().mockResolvedValue({ id: "tx-withdraw-1" }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        walletRequest: {
          create: vi.fn().mockResolvedValue({ id: "req-1" }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      };

      vi.spyOn(prisma, "$transaction").mockImplementation(async (cb: any) => {
        return cb(mockTx);
      });

      vi.spyOn(CouponVaultService, "transferToCouponWallet").mockResolvedValue({
        success: true,
        message: "Transfer successful",
      });

      vi.spyOn(prisma.appNotification, "create").mockResolvedValue({} as any);

      const result = await transferToCouponWallet("user-rich", 500);

      expect(result.ok).toBe(true);
      expect(result.transferredAmount).toBe(500);
      expect(result.newBalance).toBe(500);
      expect(result.transactionId).toMatch(/^TRF-user-ric-/);

      // Verify CouponVault received the transfer
      expect(CouponVaultService.transferToCouponWallet).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user-rich",
          userEmail: "rich@example.com",
          amount: 500,
          transactionId: result.transactionId,
        }),
      );

      // Verify socket updated
      expect(socketBridge.calls.some((c) => c.event === "wallet:updated" && c.payload.amount === 500)).toBe(true);
    });

    it("automatically refunds Gaming Hub balance if CouponVault transfer returns confirmed failure", async () => {
      vi.spyOn(prisma.user, "findUnique").mockResolvedValue({
        id: "user-fail",
        email: "fail@example.com",
        username: "fail",
      } as any);

      vi.spyOn(prisma.wallet, "findUnique").mockResolvedValue({
        userId: "user-fail",
        balance: 1000,
        bonusBalance: 0,
        lockedBalance: 0,
        rewardBalance: 0,
        cashbackBalance: 0,
        isFrozen: false,
        frozenAt: null,
        frozenReason: null,
        updatedAt: new Date(),
      });

      const applyTxCalls: any[] = [];
      const mockTx = {
        wallet: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          findUniqueOrThrow: vi.fn().mockImplementation(() => {
            return {
              userId: "user-fail",
              balance: 1000,
              bonusBalance: 0,
              lockedBalance: 0,
              rewardBalance: 0,
              cashbackBalance: 0,
            };
          }),
        },
        profile: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        transaction: {
          create: vi.fn().mockImplementation((data: any) => {
            applyTxCalls.push(data);
            return { id: "tx-id" };
          }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        walletRequest: {
          create: vi.fn().mockResolvedValue({ id: "req-fail" }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      };

      vi.spyOn(prisma, "$transaction").mockImplementation(async (cb: any) => {
        return cb(mockTx);
      });

      // Simulate CouponVault returning confirmed failure (e.g. user not found on Coupon platform)
      vi.spyOn(CouponVaultService, "transferToCouponWallet").mockRejectedValue(
        new AppError("TRANSFER_FAILED", "User not found in Coupon platform", 400),
      );

      await expect(transferToCouponWallet("user-fail", 400)).rejects.toThrow(
        "User not found in Coupon platform",
      );

      // Verify that a reversal transaction was executed to refund the balance
      const reversalTx = applyTxCalls.find((t) => t.data.referenceType === "REVERSAL");
      expect(reversalTx).toBeDefined();
      expect(reversalTx.data.amount).toBe(400);
      expect(reversalTx.data.type).toBe("CREDIT");
    });
  });

  // ==========================================================================
  // 6. Game Economy Isolation (Critical Business Requirement)
  // ==========================================================================
  describe("6. Game Economy Isolation", () => {
    it("guarantees game match settlements NEVER automatically transfer winnings to CouponVault", async () => {
      const transferSpy = vi.spyOn(CouponVaultService, "transferToCouponWallet");

      // Verify calculateReward only calculates numbers and never transfers
      const rewardResult = SettlementService.calculateReward(
        { entryFee: 100, prizeMode: "WINNER_PERCENTAGE", winnerPercentage: 90 } as any,
        2,
        ["winner-1"],
      );

      expect(rewardResult.winnerPayout).toBe(180);
      expect(rewardResult.totalPot).toBe(200);

      // Verify CouponVault was NEVER called
      expect(transferSpy).not.toHaveBeenCalled();
    });
  });
});
