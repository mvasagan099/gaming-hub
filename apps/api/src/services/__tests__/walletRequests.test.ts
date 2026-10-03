import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { prisma } from "@gaming-hub/db";
import { AppError } from "@gaming-hub/shared";
import { createTestUser } from "../../../test/helpers";
import { setSetting, resetSettingsCache } from "../settings";
import { socketBridge } from "../socketBridge";
import {
  approveWalletRequest,
  cancelWalletRequest,
  createDepositRequest,
  createWithdrawalRequest,
  getWalletRequest,
  listWalletRequests,
  rejectWalletRequest,
  requestWithdrawalOtp,
  setWalletFrozen,
  verifyWalletOtp,
} from "../walletRequests";
import { applyTransaction, getWallet } from "../wallet";
import { WalletTransactionService } from "../walletTransactionService";
import { CouponVaultService } from "../couponVaultService";
import * as EmailTransport from "../emailTransport";

async function fundMain(userId: string, amount = 2500) {
  let remaining = amount;
  let counter = 0;
  while (remaining > 0) {
    const chunk = Math.min(remaining, 1000);
    await prisma.$transaction((tx) =>
      WalletTransactionService.createCredit(tx, {
        userId,
        amount: chunk,
        referenceType: "ADMIN",
        referenceId: `test-funding-${userId}-${counter++}`,
        meta: { reason: "controlled test funding" },
      }),
    );
    remaining -= chunk;
  }
}

// Ledger-backed legacy approval fixture: current requests auto-transfer at creation.
async function reservedPending(userId: string, amount: number, fee = 0) {
  return prisma.$transaction(async tx => {
    const r = await tx.walletRequest.create({ data: { userId, amount, fee, kind: "WITHDRAWAL",
      status: "PENDING", method: "COUPONVAULT", adminNote: "WAITING_APPROVAL" } });
    await applyTransaction(tx, userId, -amount, "WITHDRAWAL", r.id, {}, "MAIN");
    if (fee) await applyTransaction(tx, userId, -fee, "WITHDRAWAL", r.id, { reason: "withdrawal fee" }, "MAIN");
    return r;
  });
}

async function expectAppError(
  promise: Promise<unknown>,
  code: string,
): Promise<AppError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(AppError);
  expect((error as AppError).code).toBe(code);
  return error as AppError;
}

describe("walletRequests", () => {
  beforeEach(() => {
    vi.spyOn(CouponVaultService, "transferToCouponWallet").mockResolvedValue({ success: true } as any);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await prisma.siteSetting.deleteMany({ where: { category: "wallet" } });
    resetSettingsCache();
  });

  describe("OTP", () => {
    it("issues a code and returns it as debugCode outside production", async () => {
      const user = await createTestUser();
      await fundMain(user.id);
      const sendEmail = vi.spyOn(EmailTransport, "sendEmail").mockResolvedValue({
        accepted: [`${user.id}@test.local`],
        messageId: "test-withdrawal-otp",
      });
      const otp = await requestWithdrawalOtp(user.id);

      expect(otp.ok).toBe(true);
      expect(otp.debugCode).toMatch(/^\d{6}$/);
      expect(new Date(otp.expiresAt).getTime()).toBeGreaterThan(Date.now());

      // Stored hashed, never in plaintext.
      const stored = await prisma.walletOtp.findFirst({ where: { userId: user.id } });
      expect(stored).not.toBeNull();
      expect(stored!.codeHash).not.toContain(otp.debugCode!);
      expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
        to: `${user.id}@test.local`,
        subject: expect.stringContaining("Withdrawal Verification Code"),
      }));
      sendEmail.mockRestore();
    });

    it("atomically consumes one code across concurrent verification attempts", async () => {
      const user = await createTestUser();
      await fundMain(user.id);
      const { debugCode } = await requestWithdrawalOtp(user.id);

      const attempts = await Promise.allSettled([
        verifyWalletOtp(user.id, debugCode!),
        verifyWalletOtp(user.id, debugCode!),
      ]);
      expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
      const rejected = attempts.find((attempt) => attempt.status === "rejected") as PromiseRejectedResult;
      expect(rejected.reason).toBeInstanceOf(AppError);
      expect(["OTP_ALREADY_USED", "OTP_REQUIRED"]).toContain(rejected.reason.code);
    });

    it("rejects a wrong code and increments the attempt counter", async () => {
      const user = await createTestUser();
      await fundMain(user.id);
      const { debugCode } = await requestWithdrawalOtp(user.id);

      await expectAppError(verifyWalletOtp(user.id, "000000"), "OTP_INVALID");

      const stored = await prisma.walletOtp.findFirst({ where: { userId: user.id } });
      expect(stored!.attempts).toBe(1);

      await verifyWalletOtp(user.id, debugCode!);
    });

    it("exhausting attempts locks the code", async () => {
      const user = await createTestUser();
      await fundMain(user.id);
      await setSetting("wallet.otpMaxAttempts", 2, null);
      await requestWithdrawalOtp(user.id);

      await expectAppError(verifyWalletOtp(user.id, "000001"), "OTP_INVALID");
      await expectAppError(verifyWalletOtp(user.id, "000002"), "OTP_INVALID");
      await expectAppError(verifyWalletOtp(user.id, "000003"), "OTP_TOO_MANY_ATTEMPTS");
    });

    it("rejects an expired code", async () => {
      const user = await createTestUser();
      await fundMain(user.id);
      await setSetting("wallet.otpExpiryMinutes", 1, null);

      const { debugCode } = await requestWithdrawalOtp(user.id);
      // Simulate expiry by rewriting the row.
      await prisma.walletOtp.updateMany({
        where: { userId: user.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      await expectAppError(verifyWalletOtp(user.id, debugCode!), "OTP_EXPIRED");
    });
  });

  describe("deposits", () => {
    it("decommissions direct deposit requests and returns DEPOSITS_DISABLED", async () => {
      const user = await createTestUser();
      await fundMain(user.id);
      await expectAppError(createDepositRequest(user.id, 500, "MANUAL"), "DEPOSITS_DISABLED");
      await expectAppError(createDepositRequest(user.id, 50), "DEPOSITS_DISABLED");
      await expectAppError(createDepositRequest(user.id, 1001), "DEPOSITS_DISABLED");
    });
  });

  describe("withdrawals", () => {
    it("completes an auto-transfer withdrawal when the OTP is valid", async () => {
      const user = await createTestUser();
      await fundMain(user.id);
      const { debugCode } = await requestWithdrawalOtp(user.id);

      const request = await createWithdrawalRequest(user.id, 100, debugCode!);

      expect(request.kind).toBe("WITHDRAWAL");
      expect(request.amount).toBe(100);
      expect(request.status).toBe("APPROVED");
    });

    it("requires a valid OTP", async () => {
      const user = await createTestUser();
      await fundMain(user.id);
      await expectAppError(createWithdrawalRequest(user.id, 100, "123456"), "OTP_REQUIRED");
    });

    it("rejects withdrawals beyond the balance", async () => {
      const user = await createTestUser();
      const { debugCode } = await requestWithdrawalOtp(user.id);
      await expectAppError(createWithdrawalRequest(user.id, 3000, debugCode!), "INSUFFICIENT_BALANCE");
    });

    it("enforces the daily withdrawal limit", async () => {
      const user = await createTestUser();
      await fundMain(user.id);
      await setSetting("wallet.dailyWithdrawalLimit", 300, null);

      const { debugCode } = await requestWithdrawalOtp(user.id);
      await createWithdrawalRequest(user.id, 200, debugCode!);

      const second = await requestWithdrawalOtp(user.id);
      await expectAppError(
        createWithdrawalRequest(user.id, 101, second.debugCode!),
        "DAILY_WITHDRAWAL_LIMIT_EXCEEDED",
      );
      await setSetting("wallet.dailyWithdrawalLimit", 0, null);
    });

    it("caps concurrent pending withdrawal requests", async () => {
      const user = await createTestUser();
      await fundMain(user.id);
      await setSetting("wallet.maxPendingWithdrawalRequests", 2, null);

      vi.mocked(CouponVaultService.transferToCouponWallet).mockRejectedValue(Object.assign(new Error("timeout"), { isTimeout: true }));
      for (let i = 0; i < 2; i++) {
        const { debugCode } = await requestWithdrawalOtp(user.id);
        await expectAppError(createWithdrawalRequest(user.id, 100, debugCode!), "COUPON_TRANSFER_TIMEOUT");
      }

      const third = await requestWithdrawalOtp(user.id);
      await expectAppError(
        createWithdrawalRequest(user.id, 100, third.debugCode!),
        "WALLET_LIMIT_EXCEEDED",
      );
      await setSetting("wallet.maxPendingWithdrawalRequests", 5, null);
    });

    it("computes a withdrawal fee when configured", async () => {
      const user = await createTestUser();
      await fundMain(user.id);
      await setSetting("wallet.withdrawalFeePercent", 5, null);

      const { debugCode } = await requestWithdrawalOtp(user.id);
      const request = await createWithdrawalRequest(user.id, 1000, debugCode!);
      expect(request.fee).toBe(50);
      await setSetting("wallet.withdrawalFeePercent", 0, null);
    });
  });

  describe("admin approval", () => {
    it("rejects direct deposit creation with DEPOSITS_DISABLED", async () => {
      const user = await createTestUser();
      await expectAppError(createDepositRequest(user.id, 1000), "DEPOSITS_DISABLED");
    });

    it("approving a withdrawal debits MAIN, fee, and completes via CouponVault", async () => {
      const user = await createTestUser();
      await fundMain(user.id);
      const admin = await createTestUser({ role: "ADMIN" });
      await setSetting("wallet.withdrawalFeePercent", 5, null);
      vi.spyOn(CouponVaultService, "transferToCouponWallet").mockResolvedValue({ success: true } as any);

      const { debugCode } = await requestWithdrawalOtp(user.id);
      const request = await reservedPending(user.id, 1000, 50);

      const approved = await approveWalletRequest(admin.id, request.id);
      expect(approved.status).toBe("APPROVED");
      expect(approved.adminNote).toBe("COMPLETED");

      const wallet = await getWallet(user.id);
      expect(wallet.balance).toBe(2500 - 1000 - 50);

      const txs = await prisma.transaction.findMany({
        where: { userId: user.id, referenceType: "WITHDRAWAL", referenceId: request.id },
      });
      expect(txs).toHaveLength(2);
      expect(txs.reduce((sum, t) => sum + t.amount, 0)).toBe(1050);
      await setSetting("wallet.withdrawalFeePercent", 0, null);
    });

    it("sets UNCONFIRMED_HOLD on CouponVault transfer timeout and leaves status PENDING", async () => {
      const user = await createTestUser();
      await fundMain(user.id);
      const admin = await createTestUser({ role: "ADMIN" });

      const timeoutError = new AppError("COUPON_TRANSFER_TIMEOUT", "Timeout", 504);
      (timeoutError as any).isTimeout = true;
      vi.spyOn(CouponVaultService, "transferToCouponWallet").mockRejectedValue(timeoutError);

      const { debugCode } = await requestWithdrawalOtp(user.id);
      const request = await reservedPending(user.id, 500);

      await approveWalletRequest(admin.id, request.id);

      const hold = await getWalletRequest(request.id);
      expect(hold.status).toBe("PENDING");
      expect(hold.adminNote).toBe("UNCONFIRMED_HOLD");
    });

    it("approval does not debit again when funds are already reserved", async () => {
      const user = await createTestUser();
      await fundMain(user.id);
      const admin = await createTestUser({ role: "ADMIN" });

      const { debugCode } = await requestWithdrawalOtp(user.id);
      const request = await reservedPending(user.id, 2400);

      await prisma.$transaction(tx => applyTransaction(tx, user.id, -50, "MATCH_WAGER", "separate-game", {}, "MAIN"));
      await approveWalletRequest(admin.id, request.id);
      expect((await getWalletRequest(request.id)).status).toBe("APPROVED");
      expect((await getWallet(user.id)).balance).toBe(50); // no second debit

    });

    it("approving an already-decided request fails and debits nothing twice", async () => {
      const user = await createTestUser();
      await fundMain(user.id);
      const admin = await createTestUser({ role: "ADMIN" });
      vi.spyOn(CouponVaultService, "transferToCouponWallet").mockResolvedValue({ success: true } as any);

      const { debugCode } = await requestWithdrawalOtp(user.id);
      const request = await reservedPending(user.id, 500);

      await approveWalletRequest(admin.id, request.id);
      await expectAppError(approveWalletRequest(admin.id, request.id), "WALLET_REQUEST_ALREADY_DECIDED");

      const wallet = await getWallet(user.id);
      expect(wallet.balance).toBe(2000);
    });

    it("rejecting a reserved request restores its balance once", async () => {
      const user = await createTestUser();
      await fundMain(user.id);
      const admin = await createTestUser({ role: "ADMIN" });

      const { debugCode } = await requestWithdrawalOtp(user.id);
      const request = await reservedPending(user.id, 500);

      const rejected = await rejectWalletRequest(admin.id, request.id, "not eligible");

      expect(rejected.status).toBe("REJECTED");
      expect(rejected.adminNote).toBe("not eligible");

      const wallet = await getWallet(user.id);
      expect(wallet.balance).toBe(2500);
    });
  });

  describe("cancel", () => {
    it("lets the owner cancel a pending request but not a decided one", async () => {
      const user = await createTestUser();
      await fundMain(user.id);
      const { debugCode } = await requestWithdrawalOtp(user.id);
      const request = await reservedPending(user.id, 500);

      await cancelWalletRequest(user.id, request.id);
      expect((await getWalletRequest(request.id)).status).toBe("CANCELLED");

      await expectAppError(cancelWalletRequest(user.id, request.id), "WALLET_REQUEST_ALREADY_DECIDED");
    });

    it("does not allow cancelling another user's request", async () => {
      const user = await createTestUser();
      const other = await createTestUser();
      await fundMain(other.id);
      const { debugCode } = await requestWithdrawalOtp(other.id);
      const request = await reservedPending(other.id, 500);

      await expectAppError(cancelWalletRequest(user.id, request.id), "WALLET_REQUEST_NOT_FOUND");
    });
  });

  describe("freeze", () => {
    it("blocks deposit, withdrawal, and OTP issuance", async () => {
      const user = await createTestUser();
      await fundMain(user.id);
      const admin = await createTestUser({ role: "ADMIN" });

      await setWalletFrozen(admin.id, user.id, true, "fraud review");

      await expectAppError(createDepositRequest(user.id, 500), "DEPOSITS_DISABLED");
      await expectAppError(requestWithdrawalOtp(user.id), "WALLET_FROZEN");

      const wallet = await getWallet(user.id);
      expect(wallet.isFrozen).toBe(true);
      expect(wallet.frozenReason).toBe("fraud review");

      await setWalletFrozen(admin.id, user.id, false);
      expect((await getWallet(user.id)).isFrozen).toBe(false);
      const { debugCode } = await requestWithdrawalOtp(user.id);
      expect(debugCode).toBeTruthy();
    });
  });

  describe("listing", () => {
    it("lists and filters requests by kind and status", async () => {
      const user = await createTestUser();
      await fundMain(user.id);

      const otp1 = await requestWithdrawalOtp(user.id);
      await createWithdrawalRequest(user.id, 500, otp1.debugCode!);

      const all = await listWalletRequests({ userId: user.id }, 1, 10);
      expect(all.total).toBe(1);

      const withdrawals = await listWalletRequests({ userId: user.id, kind: "WITHDRAWAL" }, 1, 10);
      expect(withdrawals.total).toBe(1);

      const pending = await listWalletRequests({ userId: user.id, status: "PENDING" }, 1, 10);
      expect(pending.total).toBe(0);

      const approved = await listWalletRequests({ userId: user.id, status: "APPROVED" }, 1, 10);
      expect(approved.total).toBe(1);
    });
  });
});
