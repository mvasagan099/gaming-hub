import { describe, expect, it } from "vitest";
import { prisma } from "@gaming-hub/db";
import { AppError } from "@gaming-hub/shared";
import { createTestUser } from "../../../test/helpers";
import { setSetting } from "../settings";
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
import { getWallet } from "../wallet";

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
  describe("OTP", () => {
    it("issues a code and returns it as debugCode outside production", async () => {
      const user = await createTestUser();
      const otp = await requestWithdrawalOtp(user.id);

      expect(otp.ok).toBe(true);
      expect(otp.debugCode).toMatch(/^\d{6}$/);
      expect(new Date(otp.expiresAt).getTime()).toBeGreaterThan(Date.now());

      // Stored hashed, never in plaintext.
      const stored = await prisma.walletOtp.findFirst({ where: { userId: user.id } });
      expect(stored).not.toBeNull();
      expect(stored!.codeHash).not.toContain(otp.debugCode!);
    });

    it("verifies the correct code and consumes it (single use)", async () => {
      const user = await createTestUser();
      const { debugCode } = await requestWithdrawalOtp(user.id);

      await verifyWalletOtp(user.id, debugCode!);

      // Second use of the same code fails.
      await expectAppError(verifyWalletOtp(user.id, debugCode!), "OTP_REQUIRED");
    });

    it("rejects a wrong code and increments the attempt counter", async () => {
      const user = await createTestUser();
      const { debugCode } = await requestWithdrawalOtp(user.id);

      await expectAppError(verifyWalletOtp(user.id, "000000"), "OTP_INVALID");

      const stored = await prisma.walletOtp.findFirst({ where: { userId: user.id } });
      expect(stored!.attempts).toBe(1);

      await verifyWalletOtp(user.id, debugCode!);
    });

    it("exhausting attempts locks the code", async () => {
      const user = await createTestUser();
      await setSetting("wallet.otpMaxAttempts", 2, null);
      await requestWithdrawalOtp(user.id);

      await expectAppError(verifyWalletOtp(user.id, "000001"), "OTP_INVALID");
      await expectAppError(verifyWalletOtp(user.id, "000002"), "OTP_INVALID");
      await expectAppError(verifyWalletOtp(user.id, "000003"), "OTP_TOO_MANY_ATTEMPTS");
    });

    it("rejects an expired code", async () => {
      const user = await createTestUser();
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
    it("creates a PENDING deposit request", async () => {
      const user = await createTestUser();
      const request = await createDepositRequest(user.id, 500, "MANUAL");

      expect(request.kind).toBe("DEPOSIT");
      expect(request.amount).toBe(500);
      expect(request.status).toBe("PENDING");
      expect(request.method).toBe("MANUAL");

      const wallet = await getWallet(user.id);
      expect(wallet.balance).toBe(2500); // untouched until approved
    });

    it("rejects deposits outside configured limits", async () => {
      const user = await createTestUser();
      await setSetting("wallet.minDeposit", 100, null);
      await setSetting("wallet.maxDeposit", 1000, null);

      await expectAppError(createDepositRequest(user.id, 50), "WALLET_LIMIT_EXCEEDED");
      await expectAppError(createDepositRequest(user.id, 1001), "WALLET_LIMIT_EXCEEDED");
      await expect(createDepositRequest(user.id, 500)).resolves.toBeTruthy();
    });
  });

  describe("withdrawals", () => {
    it("creates a PENDING withdrawal request when the OTP is valid", async () => {
      const user = await createTestUser();
      const { debugCode } = await requestWithdrawalOtp(user.id);

      const request = await createWithdrawalRequest(user.id, 100, debugCode!);

      expect(request.kind).toBe("WITHDRAWAL");
      expect(request.amount).toBe(100);
      expect(request.status).toBe("PENDING");
    });

    it("requires a valid OTP", async () => {
      const user = await createTestUser();
      await expectAppError(createWithdrawalRequest(user.id, 100, "123456"), "OTP_REQUIRED");
    });

    it("rejects withdrawals beyond the balance", async () => {
      const user = await createTestUser();
      const { debugCode } = await requestWithdrawalOtp(user.id);
      await expectAppError(createWithdrawalRequest(user.id, 3000, debugCode!), "INSUFFICIENT_BALANCE");
    });

    it("enforces the daily withdrawal limit", async () => {
      const user = await createTestUser();
      await setSetting("wallet.dailyWithdrawalLimit", 300, null);

      const { debugCode } = await requestWithdrawalOtp(user.id);
      await createWithdrawalRequest(user.id, 200, debugCode!);

      const second = await requestWithdrawalOtp(user.id);
      await expectAppError(
        createWithdrawalRequest(user.id, 101, second.debugCode!),
        "DAILY_WITHDRAWAL_LIMIT_EXCEEDED",
      );
    });

    it("caps concurrent pending withdrawal requests", async () => {
      const user = await createTestUser();
      await setSetting("wallet.maxPendingWithdrawalRequests", 2, null);

      for (let i = 0; i < 2; i++) {
        const { debugCode } = await requestWithdrawalOtp(user.id);
        await createWithdrawalRequest(user.id, 100, debugCode!);
      }

      const third = await requestWithdrawalOtp(user.id);
      await expectAppError(
        createWithdrawalRequest(user.id, 100, third.debugCode!),
        "WALLET_LIMIT_EXCEEDED",
      );
    });

    it("computes a withdrawal fee when configured", async () => {
      const user = await createTestUser();
      await setSetting("wallet.withdrawalFeePercent", 5, null);

      const { debugCode } = await requestWithdrawalOtp(user.id);
      const request = await createWithdrawalRequest(user.id, 1000, debugCode!);
      expect(request.fee).toBe(50);
    });
  });

  describe("admin approval", () => {
    it("approving a deposit credits MAIN atomically and syncs via socket", async () => {
      const user = await createTestUser();
      const admin = await createTestUser({ role: "ADMIN" });
      const request = await createDepositRequest(user.id, 1000);

      const approved = await approveWalletRequest(admin.id, request.id);

      expect(approved.status).toBe("APPROVED");
      expect(approved.adminId).toBe(admin.id);

      const wallet = await getWallet(user.id);
      expect(wallet.balance).toBe(3500);

      const txs = await prisma.transaction.findMany({
        where: { userId: user.id, referenceType: "DEPOSIT", referenceId: request.id },
      });
      expect(txs).toHaveLength(1);
      expect(txs[0].type).toBe("CREDIT");
      expect(txs[0].amount).toBe(1000);
      expect(txs[0].balanceAfter).toBe(3500);

      const notification = await prisma.appNotification.findFirst({
        where: { userId: user.id, type: "WALLET" },
      });
      expect(notification).not.toBeNull();

      const sync = socketBridge.calls.find((c) => c.userId === user.id && c.event === "wallet:updated");
      expect(sync).toBeTruthy();
      expect(sync!.payload.event).toBe("deposit-approved");
      expect(sync!.payload.balance).toBe(3500);
    });

    it("approving a withdrawal debits MAIN and the fee", async () => {
      const user = await createTestUser();
      const admin = await createTestUser({ role: "ADMIN" });
      await setSetting("wallet.withdrawalFeePercent", 5, null);

      const { debugCode } = await requestWithdrawalOtp(user.id);
      const request = await createWithdrawalRequest(user.id, 1000, debugCode!);

      await approveWalletRequest(admin.id, request.id);

      const wallet = await getWallet(user.id);
      expect(wallet.balance).toBe(2500 - 1000 - 50);

      const txs = await prisma.transaction.findMany({
        where: { userId: user.id, referenceType: "WITHDRAWAL", referenceId: request.id },
      });
      expect(txs).toHaveLength(2);
      expect(txs.reduce((sum, t) => sum + t.amount, 0)).toBe(1050);
    });

    it("rejects when the balance no longer covers the withdrawal", async () => {
      const user = await createTestUser();
      const admin = await createTestUser({ role: "ADMIN" });

      const { debugCode } = await requestWithdrawalOtp(user.id);
      const request = await createWithdrawalRequest(user.id, 2400, debugCode!);

      // Balance drops below 2400 before the admin decides.
      await prisma.wallet.update({
        where: { userId: user.id },
        data: { balance: { decrement: 200 } },
      });

      await expectAppError(approveWalletRequest(admin.id, request.id), "INSUFFICIENT_BALANCE");

      const pending = await getWalletRequest(request.id);
      expect(pending.status).toBe("PENDING");
      const wallet = await getWallet(user.id);
      expect(wallet.balance).toBe(2300); // no partial debit
    });

    it("approving an already-decided request fails and credits nothing twice", async () => {
      const user = await createTestUser();
      const admin = await createTestUser({ role: "ADMIN" });
      const request = await createDepositRequest(user.id, 500);

      await approveWalletRequest(admin.id, request.id);
      await expectAppError(approveWalletRequest(admin.id, request.id), "WALLET_REQUEST_ALREADY_DECIDED");

      const wallet = await getWallet(user.id);
      expect(wallet.balance).toBe(3000);
    });

    it("two concurrent approvals credit the balance exactly once", async () => {
      const user = await createTestUser();
      const admin = await createTestUser({ role: "ADMIN" });
      const request = await createDepositRequest(user.id, 1000);

      const [a, b] = await Promise.allSettled([
        approveWalletRequest(admin.id, request.id),
        approveWalletRequest(admin.id, request.id),
      ]);

      const fulfilled = [a, b].filter((r) => r.status === "fulfilled");
      const rejected = [a, b].filter((r) => r.status === "rejected");
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(AppError);

      const wallet = await getWallet(user.id);
      expect(wallet.balance).toBe(3500);
    });

    it("rejecting a request leaves the balance untouched", async () => {
      const user = await createTestUser();
      const admin = await createTestUser({ role: "ADMIN" });
      const request = await createDepositRequest(user.id, 500);

      const rejected = await rejectWalletRequest(admin.id, request.id, "not eligible");

      expect(rejected.status).toBe("REJECTED");
      expect(rejected.adminNote).toBe("not eligible");

      const wallet = await getWallet(user.id);
      expect(wallet.balance).toBe(2500);

      const sync = socketBridge.calls.find((c) => c.payload.event === "deposit-rejected");
      expect(sync).toBeTruthy();
    });
  });

  describe("cancel", () => {
    it("lets the owner cancel a pending request but not a decided one", async () => {
      const user = await createTestUser();
      const request = await createDepositRequest(user.id, 500);

      await cancelWalletRequest(user.id, request.id);
      expect((await getWalletRequest(request.id)).status).toBe("CANCELLED");

      await expectAppError(cancelWalletRequest(user.id, request.id), "WALLET_REQUEST_ALREADY_DECIDED");
    });

    it("does not allow cancelling another user's request", async () => {
      const user = await createTestUser();
      const other = await createTestUser();
      const request = await createDepositRequest(other.id, 500);

      await expectAppError(cancelWalletRequest(user.id, request.id), "WALLET_REQUEST_NOT_FOUND");
    });
  });

  describe("freeze", () => {
    it("blocks deposit, withdrawal, and OTP issuance", async () => {
      const user = await createTestUser();
      const admin = await createTestUser({ role: "ADMIN" });

      await setWalletFrozen(admin.id, user.id, true, "fraud review");

      await expectAppError(createDepositRequest(user.id, 500), "WALLET_FROZEN");
      await expectAppError(requestWithdrawalOtp(user.id), "WALLET_FROZEN");

      const wallet = await getWallet(user.id);
      expect(wallet.isFrozen).toBe(true);
      expect(wallet.frozenReason).toBe("fraud review");

      await setWalletFrozen(admin.id, user.id, false);
      expect((await getWallet(user.id)).isFrozen).toBe(false);
      await expect(createDepositRequest(user.id, 500)).resolves.toBeTruthy();
    });
  });

  describe("listing", () => {
    it("lists and filters requests by kind and status", async () => {
      const user = await createTestUser();
      await createDepositRequest(user.id, 500);
      await createDepositRequest(user.id, 300);

      const all = await listWalletRequests({ userId: user.id }, 1, 10);
      expect(all.total).toBe(2);

      const deposits = await listWalletRequests({ userId: user.id, kind: "DEPOSIT" }, 1, 10);
      expect(deposits.total).toBe(2);

      const pending = await listWalletRequests({ userId: user.id, status: "PENDING" }, 1, 10);
      expect(pending.total).toBe(2);

      const approved = await listWalletRequests({ userId: user.id, status: "APPROVED" }, 1, 10);
      expect(approved.total).toBe(0);
    });
  });
});
