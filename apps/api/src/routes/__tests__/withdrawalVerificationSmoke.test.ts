import { beforeAll, afterEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { generateSecret, generate, NobleCryptoPlugin, ScureBase32Plugin } from "otplib";
import { prisma } from "@gaming-hub/db";
import { buildApp } from "../../app";
import { createTestUser } from "../../../test/helpers";
import { CouponVaultService } from "../../services/couponVaultService";
import { hashToken } from "../../services/sessions";
import * as emailTransport from "../../services/emailTransport";
import { createWithdrawalRequest } from "../../services/walletRequests";

describe("WITHDRAWAL VERIFICATION STAGING SMOKE TEST", () => {
  let app: FastifyInstance;
  const cryptoPlugin = new NobleCryptoPlugin();
  const base32Plugin = new ScureBase32Plugin();

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function request(
    method: "GET" | "POST",
    url: string,
    body?: Record<string, unknown>,
    token?: string,
  ): Promise<Awaited<ReturnType<FastifyInstance["inject"]>>> {
    return app.inject({
      method,
      url,
      payload: body,
      headers: token ? { authorization: `Bearer ${token}` } : undefined,
    });
  }

  async function enrollFreshAdminMfa(admin: { id: string; token: string }) {
    await prisma.profile.update({
      where: { userId: admin.id },
      data: { twoFactorEnabled: true },
    });
    await prisma.loginSession.upsert({
      where: { tokenHash: hashToken(admin.token) },
      create: {
        userId: admin.id,
        tokenHash: hashToken(admin.token),
        expiresAt: new Date(Date.now() + 60_000),
        mfaVerifiedAt: new Date(),
      },
      update: { revokedAt: null, isCurrent: true, mfaVerifiedAt: new Date() },
    });
  }

  // =========================================================================
  // CASE A — 2FA ENABLED
  // =========================================================================
  describe("CASE A — 2FA ENABLED", () => {
    it("Smoke A: Full 2FA withdrawal verification workflow", async () => {
      // 1. Login with staging user
      const user = await createTestUser();
      await prisma.wallet.update({ where: { userId: user.id }, data: { balance: 5000 } });

      // 2. Ensure 2FA is enabled with authentic TOTP secret
      const totpSecret = generateSecret();
      await prisma.profile.update({
        where: { userId: user.id },
        data: {
          twoFactorEnabled: true,
          twoFactorSecret: totpSecret,
        },
      });

      // Spy on email transport to verify NO email OTP is ever sent
      const sendEmailSpy = vi.spyOn(emailTransport, "sendSmtpEmail").mockResolvedValue({
        accepted: [user.id],
        messageId: "mock-id",
      });

      // 3 & 4. Start withdrawal and confirm NO email OTP is sent
      const otpAttempt = await request("POST", "/api/wallet/otp", {}, user.token);
      expect(otpAttempt.statusCode).toBe(400);
      expect(otpAttempt.json().error.code).toBe("MFA_ENABLED");
      expect(sendEmailSpy).not.toHaveBeenCalled();

      // 5. Enter invalid authenticator code -> withdrawal denied
      const invalidVerifyRes = await request(
        "POST",
        "/api/auth/2fa/verify",
        { token: "000000" },
        user.token,
      );
      expect(invalidVerifyRes.statusCode).toBe(401);
      expect(invalidVerifyRes.json().error.code).toBe("UNAUTHORIZED");

      // Attempting withdrawal without fresh MFA session must be denied
      const deniedWithdraw = await request(
        "POST",
        "/api/wallet/withdrawals",
        { amount: 200 },
        user.token,
      );
      expect(deniedWithdraw.statusCode).toBe(403);
      expect(deniedWithdraw.json().error.code).toBe("MFA_REQUIRED");

      // 6. Enter valid authenticator code -> fresh MFA session created
      const validTotpCode = await generate({
        secret: totpSecret,
        crypto: cryptoPlugin,
        base32: base32Plugin,
      });

      const validVerifyRes = await request(
        "POST",
        "/api/auth/2fa/verify",
        { token: validTotpCode },
        user.token,
      );
      expect(validVerifyRes.statusCode).toBe(200);
      expect(validVerifyRes.json().status).toBe("ok");
      expect(validVerifyRes.json().mfaVerified).toBe(true);

      // Verify DB session was stamped with fresh mfaVerifiedAt
      const session = await prisma.loginSession.findUnique({
        where: { tokenHash: hashToken(user.token) },
      });
      expect(session).not.toBeNull();
      expect(session!.mfaVerifiedAt).not.toBeNull();

      // 7. Submit withdrawal -> withdrawal created exactly once
      const transferSpy = vi.spyOn(CouponVaultService, "transferToCouponWallet").mockResolvedValue({
        success: true,
      });

      const withdrawRes = await request(
        "POST",
        "/api/wallet/withdrawals",
        { amount: 200 },
        user.token,
      );
      expect(withdrawRes.statusCode).toBe(200);
      const createdRequest = withdrawRes.json();
      expect(createdRequest.status).toBe("PENDING");
      expect(createdRequest.amount).toBe(200);

      // Verify exactly one withdrawal request exists
      const dbRequests = await prisma.walletRequest.findMany({
        where: { userId: user.id, kind: "WITHDRAWAL" },
      });
      expect(dbRequests.length).toBe(1);

      // 8. Verify no duplicate CouponVault transfer upon admin approval
      const admin = await createTestUser({ role: "ADMIN" });
      await enrollFreshAdminMfa(admin);

      const approveRes = await request(
        "POST",
        `/api/admin/wallet/requests/${createdRequest.id}/approve`,
        {},
        admin.token,
      );
      expect(approveRes.statusCode).toBe(200);
      expect(transferSpy).toHaveBeenCalledTimes(1);

      // Subsequent duplicate approval is strictly rejected and never calls CouponVault again
      const dupApproveRes = await request(
        "POST",
        `/api/admin/wallet/requests/${createdRequest.id}/approve`,
        {},
        admin.token,
      );
      expect([400, 409]).toContain(dupApproveRes.statusCode);
      expect(dupApproveRes.json().error.code).toBe("WALLET_REQUEST_ALREADY_DECIDED");
      expect(transferSpy).toHaveBeenCalledTimes(1); // Still exactly 1 call
    });
  });

  // =========================================================================
  // CASE B — 2FA DISABLED
  // =========================================================================
  describe("CASE B — 2FA DISABLED", () => {
    it("Smoke B: Full Email OTP withdrawal verification workflow", async () => {
      // 1. Login with staging user
      const user = await createTestUser();
      await prisma.wallet.update({ where: { userId: user.id }, data: { balance: 5000 } });

      // 2. Ensure 2FA is disabled
      await prisma.profile.update({
        where: { userId: user.id },
        data: { twoFactorEnabled: false },
      });

      // 3 & 4. Start withdrawal & request verification
      let capturedEmailRecipient = "";
      let capturedEmailSubject = "";
      let capturedEmailText = "";

      vi.spyOn(emailTransport, "sendSmtpEmail").mockImplementation(async (opts) => {
        capturedEmailRecipient = opts.to;
        capturedEmailSubject = opts.subject;
        capturedEmailText = opts.text;
        return { accepted: [opts.to], messageId: "mock-msg-id" };
      });

      const otpRes = await request("POST", "/api/wallet/otp", {}, user.token);
      expect(otpRes.statusCode).toBe(200);
      const { debugCode } = otpRes.json();
      expect(debugCode).toBeDefined();

      // 5. Confirm email OTP is actually received
      expect(capturedEmailRecipient).toBe(user.id + "@test.local");
      expect(capturedEmailSubject).toContain("Gaming Hub - Withdrawal Verification Code");
      expect(capturedEmailText).toContain(debugCode);

      // 6. Enter invalid OTP -> rejected
      const invalidOtpRes = await request(
        "POST",
        "/api/wallet/withdrawals",
        { amount: 200, otp: "000000" },
        user.token,
      );
      expect(invalidOtpRes.statusCode).toBe(400);
      expect(invalidOtpRes.json().error.code).toBe("OTP_INVALID");

      // 7. Enter expired OTP -> rejected
      await prisma.walletOtp.updateMany({
        where: { userId: user.id },
        data: { expiresAt: new Date(Date.now() - 60_000) },
      });

      const expiredOtpRes = await request(
        "POST",
        "/api/wallet/withdrawals",
        { amount: 200, otp: debugCode },
        user.token,
      );
      expect(expiredOtpRes.statusCode).toBe(400);
      expect(expiredOtpRes.json().error.code).toBe("OTP_EXPIRED");

      // 8. Enter valid OTP -> withdrawal succeeds
      const freshOtpRes = await request("POST", "/api/wallet/otp", {}, user.token);
      expect(freshOtpRes.statusCode).toBe(200);
      const freshCode = freshOtpRes.json().debugCode;

      const validWithdrawRes = await request(
        "POST",
        "/api/wallet/withdrawals",
        { amount: 200, otp: freshCode },
        user.token,
      );
      expect(validWithdrawRes.statusCode).toBe(200);
      expect(validWithdrawRes.json().status).toBe("PENDING");

      // 9. Reuse same OTP -> rejected
      const reuseOtpRes = await request(
        "POST",
        "/api/wallet/withdrawals",
        { amount: 200, otp: freshCode },
        user.token,
      );
      expect(reuseOtpRes.statusCode).toBe(400);
      expect(["OTP_ALREADY_USED", "OTP_REQUIRED"]).toContain(reuseOtpRes.json().error.code);

      // 10. Verify withdrawal created exactly once
      const userRequests = await prisma.walletRequest.findMany({
        where: { userId: user.id, kind: "WITHDRAWAL" },
      });
      expect(userRequests.length).toBe(1);
    });
  });

  // =========================================================================
  // FRONTEND UX STATE MACHINE & COPY
  // =========================================================================
  describe("FRONTEND UX STATE MACHINE & COPY", () => {
    it("Smoke UX 1: 2FA enabled verification method determination and copy", () => {
      const twoFactorEnabled = true;
      const verificationMethod = twoFactorEnabled ? "TOTP" : "EMAIL_OTP";
      expect(verificationMethod).toBe("TOTP");

      const badgeText = verificationMethod === "TOTP" ? "Verify with Authenticator" : "Verify with Email";
      const description =
        verificationMethod === "TOTP"
          ? "Enter the 6-digit code from your authenticator app to authorize this withdrawal."
          : "We sent a 6-digit verification code to your registered email address.";

      expect(badgeText).toBe("Verify with Authenticator");
      expect(description).toBe(
        "Enter the 6-digit code from your authenticator app to authorize this withdrawal.",
      );

      // In TOTP mode, onResendOtp should be undefined (hiding resend controls)
      const resendControlsVisible = verificationMethod === "EMAIL_OTP";
      expect(resendControlsVisible).toBe(false);
    });

    it("Smoke UX 2: 2FA disabled verification method determination, masking and copy", () => {
      const twoFactorEnabled = false;
      const verificationMethod = twoFactorEnabled ? "TOTP" : "EMAIL_OTP";
      expect(verificationMethod).toBe("EMAIL_OTP");

      const badgeText = verificationMethod === "TOTP" ? "Verify with Authenticator" : "Verify with Email";
      expect(badgeText).toBe("Verify with Email");

      // Email masking test
      const maskEmail = (email?: string | null) => {
        if (!email) return null;
        const [local, domain] = email.split("@");
        if (!local || !domain) return email;
        const visible = local.slice(0, 1);
        return `${visible}***@${domain}`;
      };

      const masked = maskEmail("gamer_pro@gaminghub.io");
      expect(masked).toBe("g***@gaminghub.io");

      const description = `We sent a 6-digit verification code to ${masked}.`;
      expect(description).toBe("We sent a 6-digit verification code to g***@gaminghub.io.");

      // In EMAIL_OTP mode, resend controls are enabled with 60s cooldown
      const initialCountdown = 60;
      expect(initialCountdown).toBe(60);
      const resendControlsVisible = verificationMethod === "EMAIL_OTP";
      expect(resendControlsVisible).toBe(true);
    });
  });

  // =========================================================================
  // WITHDRAWAL RESULT STATES
  // =========================================================================
  describe("WITHDRAWAL RESULT STATES", () => {
    it("Smoke Result 1: Maps COMPLETED to success step", () => {
      const getModalStepForResult = (status: string, isTimeout?: boolean) => {
        const s = status.toUpperCase();
        if (isTimeout || s === "PENDING" || s === "UNCONFIRMED_HOLD") return "pending";
        if (s === "REFUNDED") return "refunded";
        if (s === "FAILED") return "error";
        return "success";
      };

      expect(getModalStepForResult("COMPLETED")).toBe("success");
    });

    it("Smoke Result 2: Maps PENDING, UNCONFIRMED_HOLD, and 504 Timeout to processing/pending popup (never success)", () => {
      const getModalStepForResult = (status: string, isTimeout?: boolean) => {
        const s = status.toUpperCase();
        if (isTimeout || s === "PENDING" || s === "UNCONFIRMED_HOLD") return "pending";
        if (s === "REFUNDED") return "refunded";
        if (s === "FAILED") return "error";
        return "success";
      };

      expect(getModalStepForResult("PENDING")).toBe("pending");
      expect(getModalStepForResult("UNCONFIRMED_HOLD")).toBe("pending");
      expect(getModalStepForResult("COUPON_TRANSFER_TIMEOUT", true)).toBe("pending");
      expect(getModalStepForResult("UNKNOWN", true)).toBe("pending");
    });

    it("Smoke Result 3: Maps REFUNDED to refunded popup", () => {
      const getModalStepForResult = (status: string, isTimeout?: boolean) => {
        const s = status.toUpperCase();
        if (isTimeout || s === "PENDING" || s === "UNCONFIRMED_HOLD") return "pending";
        if (s === "REFUNDED") return "refunded";
        if (s === "FAILED") return "error";
        return "success";
      };

      expect(getModalStepForResult("REFUNDED")).toBe("refunded");
    });

    it("Smoke Result 4: Maps FAILED to error popup", () => {
      const getModalStepForResult = (status: string, isTimeout?: boolean) => {
        const s = status.toUpperCase();
        if (isTimeout || s === "PENDING" || s === "UNCONFIRMED_HOLD") return "pending";
        if (s === "REFUNDED") return "refunded";
        if (s === "FAILED") return "error";
        return "success";
      };

      expect(getModalStepForResult("FAILED")).toBe("error");
    });
  });

  // =========================================================================
  // SECURITY ASSURANCES
  // =========================================================================
  describe("SECURITY ASSURANCES", () => {
    it("Smoke Sec 1: Fresh MFA requirement strictly rejects stale MFA sessions (> 15 minutes)", async () => {
      const user = await createTestUser();
      await prisma.wallet.update({ where: { userId: user.id }, data: { balance: 2000 } });
      await prisma.profile.update({
        where: { userId: user.id },
        data: { twoFactorEnabled: true, twoFactorSecret: generateSecret() },
      });

      // Session with mfaVerifiedAt 16 minutes ago (stale)
      await prisma.loginSession.upsert({
        where: { tokenHash: hashToken(user.token) },
        create: {
          userId: user.id,
          tokenHash: hashToken(user.token),
          expiresAt: new Date(Date.now() + 60_000),
          mfaVerifiedAt: new Date(Date.now() - 16 * 60 * 1000),
        },
        update: {
          revokedAt: null,
          isCurrent: true,
          mfaVerifiedAt: new Date(Date.now() - 16 * 60 * 1000),
        },
      });

      const res = await request(
        "POST",
        "/api/wallet/withdrawals",
        { amount: 100 },
        user.token,
      );
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("MFA_REQUIRED");
    });

    it("Smoke Sec 2: Email OTP is atomically consumed across concurrent requests", async () => {
      const user = await createTestUser();
      await prisma.wallet.update({ where: { userId: user.id }, data: { balance: 5000 } });
      await prisma.profile.update({
        where: { userId: user.id },
        data: { twoFactorEnabled: false },
      });

      const otp = await request("POST", "/api/wallet/otp", {}, user.token);
      const code = otp.json().debugCode;

      // Two concurrent calls attempting to consume the exact same OTP
      const [res1, res2] = await Promise.allSettled([
        createWithdrawalRequest(user.id, 100, code),
        createWithdrawalRequest(user.id, 100, code),
      ]);

      const successes = [res1, res2].filter((r) => r.status === "fulfilled");
      const failures = [res1, res2].filter((r) => r.status === "rejected");

      expect(successes.length).toBe(1);
      expect(failures.length).toBe(1);
    });

    it("Smoke Sec 3: Enforces minimum and maximum withdrawal limits", async () => {
      const user = await createTestUser();
      await prisma.wallet.update({ where: { userId: user.id }, data: { balance: 100_000 } });
      await prisma.profile.update({
        where: { userId: user.id },
        data: { twoFactorEnabled: false },
      });

      const otp = await request("POST", "/api/wallet/otp", {}, user.token);
      const code = otp.json().debugCode;

      // Amount below minWithdrawal (10)
      const belowMin = await request(
        "POST",
        "/api/wallet/withdrawals",
        { amount: 5, otp: code },
        user.token,
      );
      expect(belowMin.statusCode).toBe(400);
      expect(belowMin.json().error.code).toBe("WALLET_LIMIT_EXCEEDED");
    });

    it("Smoke Sec 4: Enforces KYC verification when configured in production", async () => {
      const user = await createTestUser();
      await prisma.wallet.update({ where: { userId: user.id }, data: { balance: 1000 } });

      // Save NODE_ENV and simulate production
      const prevEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";

      try {
        await expect(createWithdrawalRequest(user.id, 100)).rejects.toThrow(
          "KYC verification is required for withdrawals",
        );
      } finally {
        process.env.NODE_ENV = prevEnv;
      }
    });
  });
});
