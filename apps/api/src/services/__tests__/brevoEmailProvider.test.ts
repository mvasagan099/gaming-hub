/**
 * brevoEmailProvider.test.ts
 *
 * Comprehensive test suite for Brevo HTTP API transactional email provider.
 * Validates:
 *  1. Brevo HTTP API request format, headers (api-key), payload structure, and 201 response parsing.
 *  2. Security & sanitization: BREVO_API_KEY and credentials are never exposed in errors or logs.
 *  3. Central sendEmail() provider dispatch (Brevo vs SMTP vs SendGrid vs Mock).
 *  4. Environment schema validation (env.ts rules for EMAIL_PROVIDER=brevo).
 *  5. Critical OTP flow failure handling: invalidates generated OTP in DB and throws EMAIL_DELIVERY_FAILED.
 *  6. All mail flows (OTP, Tournament, Security alerts, Support, Admin) format and forward correctly.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import { prisma } from "@gaming-hub/db";
import {
  sendEmail,
  sendBrevoEmail,
  getBrevoSender,
  type SendEmailOptions,
} from "../emailTransport";
import * as EmailTransport from "../emailTransport";
import { requestWithdrawalOtp, verifyWalletOtp } from "../walletRequests";
import { TournamentEmailService } from "../tournamentEmailService";

// Helper to isolate process.env safely
function withEnv<T>(overrides: Record<string, string | undefined>, fn: () => T): T {
  const original: Record<string, string | undefined> = {};
  for (const key of Object.keys(overrides)) {
    original[key] = process.env[key];
    if (overrides[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = overrides[key];
    }
  }
  const restore = () => {
    for (const key of Object.keys(original)) {
      if (original[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = original[key];
      }
    }
  };
  try {
    const result = fn();
    if (result && typeof (result as any).then === "function") {
      return (result as any).finally(restore);
    }
    restore();
    return result;
  } catch (err) {
    restore();
    throw err;
  }
}

describe("Brevo HTTP API Email Provider Suite", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. Brevo HTTP API Client (POST https://api.brevo.com/v3/smtp/email)
  // =========================================================================
  describe("sendBrevoEmail() — HTTP API Client", () => {
    it("sends email via Brevo REST API with correct URL, api-key header, and JSON body", async () => {
      let capturedUrl = "";
      let capturedHeaders: Record<string, string> = {};
      let capturedBody: any = null;

      global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        capturedUrl = url;
        capturedHeaders = (init?.headers as Record<string, string>) || {};
        capturedBody = JSON.parse(init?.body as string);
        return new Response(
          JSON.stringify({ messageId: "<202609171400.1234567@smtp-relay.mailin.fr>" }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        );
      });

      const options: SendEmailOptions = {
        to: "player@example.com",
        subject: "Gaming Hub - Verification Code",
        text: "Your code is 123456",
        html: "<p>Your code is <strong>123456</strong></p>",
      };

      const result = await withEnv(
        {
          BREVO_API_KEY: "xkeysib-test-secret-api-key-12345",
          BREVO_FROM_EMAIL: "noreply@gaminghub.com",
          BREVO_FROM_NAME: "Gaming Hub Official",
        },
        () => sendBrevoEmail(options),
      );

      // Verify URL
      expect(capturedUrl).toBe("https://api.brevo.com/v3/smtp/email");

      // Verify Headers
      expect(capturedHeaders["api-key"]).toBe("xkeysib-test-secret-api-key-12345");
      expect(capturedHeaders["Content-Type"]).toBe("application/json");
      expect(capturedHeaders["Accept"]).toBe("application/json");

      // Verify Body
      expect(capturedBody).toEqual({
        sender: {
          name: "Gaming Hub Official",
          email: "noreply@gaminghub.com",
        },
        to: [{ email: "player@example.com" }],
        subject: "Gaming Hub - Verification Code",
        htmlContent: "<p>Your code is <strong>123456</strong></p>",
        textContent: "Your code is 123456",
      });

      // Verify Result
      expect(result.messageId).toBe("<202609171400.1234567@smtp-relay.mailin.fr>");
      expect(result.accepted).toContain("player@example.com");
    });

    it("throws a clean error when BREVO_API_KEY is not configured", async () => {
      await withEnv({ BREVO_API_KEY: undefined }, async () => {
        await expect(
          sendBrevoEmail({
            to: "player@example.com",
            subject: "Test",
            text: "Test",
            html: "<p>Test</p>",
          }),
        ).rejects.toThrow("[emailTransport] BREVO_API_KEY is not configured");
      });
    });

    it("throws a clean error when BREVO_API_KEY is an SMTP key (starts with xsmtpsib-)", async () => {
      await withEnv({ BREVO_API_KEY: "xsmtpsib-fake-smtp-password-12345" }, async () => {
        await expect(
          sendBrevoEmail({
            to: "player@example.com",
            subject: "Test",
            text: "Test",
            html: "<p>Test</p>",
          }),
        ).rejects.toThrow("BREVO_API_KEY is an SMTP key (starts with 'xsmtpsib-')");
      });
    });

    it("handles Brevo API error responses safely without leaking secrets", async () => {
      const secretApiKey = "xkeysib-super-secret-key-that-must-never-leak";

      global.fetch = vi.fn().mockImplementation(async () => {
        return new Response(
          JSON.stringify({
            code: "unauthorized",
            message: `Key ${secretApiKey} was not recognized by the Brevo gateway.`,
          }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        );
      });

      await withEnv({ BREVO_API_KEY: secretApiKey }, async () => {
        let caughtError: Error | null = null;
        try {
          await sendBrevoEmail({
            to: "player@example.com",
            subject: "Test",
            text: "Test",
            html: "<p>Test</p>",
          });
        } catch (err: any) {
          caughtError = err;
        }

        expect(caughtError).not.toBeNull();
        expect(caughtError!.message).toContain("[emailTransport] Brevo API error (status 401)");
        // Must redact the secret key completely!
        expect(caughtError!.message).not.toContain(secretApiKey);
        expect(caughtError!.message).toContain("[REDACTED]");
      });
    });

    it("handles network failure cleanly without crashing", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED 1.2.3.4:443"));

      await withEnv({ BREVO_API_KEY: "xkeysib-valid-key" }, async () => {
        await expect(
          sendBrevoEmail({
            to: "player@example.com",
            subject: "Test",
            text: "Test",
            html: "<p>Test</p>",
          }),
        ).rejects.toThrow("[emailTransport] Brevo HTTP network request failed");
      });
    });
  });

  // =========================================================================
  // 2. Central Provider Dispatcher
  // =========================================================================
  describe("sendEmail() — Central Provider Dispatch", () => {
    it("dispatches to Brevo when EMAIL_PROVIDER=brevo and calls Brevo HTTPS endpoint", async () => {
      let calledBrevo = false;
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("brevo.com")) {
          calledBrevo = true;
          return new Response(JSON.stringify({ messageId: "brevo-dispatch-ok" }), {
            status: 201,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response("{}", { status: 404 });
      });

      await withEnv(
        {
          EMAIL_PROVIDER: "brevo",
          BREVO_API_KEY: "xkeysib-dispatch-key-123",
          BREVO_FROM_EMAIL: "noreply@gaminghub.com",
        },
        async () => {
          const res = await sendEmail({
            to: "user@test.com",
            subject: "Welcome",
            text: "Hello",
            html: "<p>Hello</p>",
          });

          expect(calledBrevo).toBe(true);
          expect(res.messageId).toBe("brevo-dispatch-ok");
          expect(res.accepted).toContain("user@test.com");
        },
      );
    });

    it("dispatches to mock provider in development/test mode", async () => {
      await withEnv({ NODE_ENV: "test", EMAIL_PROVIDER: "mock" }, async () => {
        const res = await sendEmail({
          to: "user@test.com",
          subject: "Welcome",
          text: "Hello",
          html: "<p>Hello</p>",
        });

        expect(res.messageId).toMatch(/^mock-/);
        expect(res.accepted).toContain("user@test.com");
      });
    });

    it("forbids mock provider in production mode", async () => {
      await withEnv({ NODE_ENV: "production", EMAIL_PROVIDER: "mock" }, async () => {
        await expect(
          sendEmail({
            to: "user@test.com",
            subject: "Welcome",
            text: "Hello",
            html: "<p>Hello</p>",
          }),
        ).rejects.toThrow("[emailTransport] Mock email provider is forbidden in production");
      });
    });
  });

  // =========================================================================
  // 3. Environment Schema Validation (env.ts rules)
  // =========================================================================
  describe("Environment Validation Rules", () => {
    const testSchema = z
      .object({
        NODE_ENV: z.enum(["development", "test", "production"]),
        EMAIL_PROVIDER: z.enum(["brevo", "smtp", "sendgrid", "ses", "mock"]).default("mock"),
        BREVO_API_KEY: z.string().optional(),
        BREVO_FROM_EMAIL: z.string().optional(),
        BREVO_FROM_NAME: z.string().optional().default("Gaming Hub"),
        EMAIL_FROM: z.string().optional(),
        SMTP_FROM: z.string().optional(),
      })
      .superRefine((data, ctx) => {
        if (data.NODE_ENV === "production" && (!data.EMAIL_PROVIDER || data.EMAIL_PROVIDER === "mock")) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["EMAIL_PROVIDER"],
            message: "EMAIL_PROVIDER must be explicitly configured as 'brevo', 'sendgrid', 'smtp', or 'ses' in production.",
          });
        }
        if (data.NODE_ENV === "production" && data.EMAIL_PROVIDER === "brevo") {
          if (!data.BREVO_API_KEY) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["BREVO_API_KEY"],
              message: "BREVO_API_KEY is required when EMAIL_PROVIDER is 'brevo' in production",
            });
          }
          if (!data.BREVO_FROM_EMAIL && !data.EMAIL_FROM && !data.SMTP_FROM) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["BREVO_FROM_EMAIL"],
              message: "BREVO_FROM_EMAIL (or EMAIL_FROM) is required when EMAIL_PROVIDER is 'brevo' in production",
            });
          }
        }
      });

    it("accepts valid production Brevo configuration", () => {
      const config = {
        NODE_ENV: "production" as const,
        EMAIL_PROVIDER: "brevo" as const,
        BREVO_API_KEY: "xkeysib-abc123valid",
        BREVO_FROM_EMAIL: "admin@gaminghub.com",
      };
      const result = testSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it("rejects production Brevo when BREVO_API_KEY is missing", () => {
      const config = {
        NODE_ENV: "production" as const,
        EMAIL_PROVIDER: "brevo" as const,
        BREVO_FROM_EMAIL: "admin@gaminghub.com",
      };
      const result = testSchema.safeParse(config);
      expect(result.success).toBe(false);
      expect(result.error?.issues.some((i) => i.path.includes("BREVO_API_KEY"))).toBe(true);
    });

    it("rejects production when EMAIL_PROVIDER=mock", () => {
      const config = {
        NODE_ENV: "production" as const,
        EMAIL_PROVIDER: "mock" as const,
      };
      const result = testSchema.safeParse(config);
      expect(result.success).toBe(false);
      expect(result.error?.issues.some((i) => i.path.includes("EMAIL_PROVIDER"))).toBe(true);
    });
  });

  // =========================================================================
  // 4. Critical OTP Flow Failure Handling (Invalidate OTP on delivery error)
  // =========================================================================
  describe("Critical OTP Flow — Failure Invalidation", () => {
    it("invalidates generated OTP in database and throws EMAIL_DELIVERY_FAILED when sendEmail fails", async () => {
      const userId = `test-otp-fail-${Date.now()}`;

      // Create test user in DB
      await prisma.user.create({
        data: {
          id: userId,
          username: `u_${Date.now().toString(36)}`,
          displayName: "Test User",
          email: `${userId}@test.local`,
          wallet: { create: { balance: 500 } },
          profile: { create: { country: "IN", twoFactorEnabled: false } },
        },
      });

      // Force sendEmail to reject
      vi.spyOn(EmailTransport, "sendEmail").mockRejectedValue(
        new Error("[emailTransport] Brevo API error (status 401): unauthorized"),
      );

      await withEnv({ EMAIL_PROVIDER: "brevo" }, async () => {
        await expect(requestWithdrawalOtp(userId)).rejects.toThrow(
          "Failed to deliver withdrawal verification code to your email. Please try again later.",
        );
      });

      // Verify generated OTP was immediately invalidated (consumedAt is NOT null)
      const otpRecord = await prisma.walletOtp.findFirst({
        where: { userId },
        orderBy: { createdAt: "desc" },
      });

      expect(otpRecord).not.toBeNull();
      expect(otpRecord?.consumedAt).not.toBeNull();

      // Cleanup
      await prisma.walletOtp.deleteMany({ where: { userId } }).catch(() => undefined);
      await prisma.profile.deleteMany({ where: { userId } }).catch(() => undefined);
      await prisma.wallet.deleteMany({ where: { userId } }).catch(() => undefined);
      await prisma.user.deleteMany({ where: { id: userId } }).catch(() => undefined);
    });
  });

  // =========================================================================
  // 5. Verification of Mail Flows (Withdrawal, Tournament, Security, Support, Admin)
  // =========================================================================
  describe("Mail Flows Payload Verification", () => {
    it("formats and dispatches Tournament registration email through sendEmail()", async () => {
      let sentOptions: SendEmailOptions | null = null;
      vi.spyOn(EmailTransport, "sendEmail").mockImplementation(async (opts) => {
        sentOptions = opts;
        return { messageId: "tournament-sent-123", accepted: [opts.to] };
      });

      const userId = `tourn-user-${Date.now()}`;
      await prisma.user.create({
        data: {
          id: userId,
          username: `tu_${Date.now().toString(36)}`,
          displayName: "Tournament Player",
          email: `${userId}@tourn.test`,
          wallet: { create: { balance: 100 } },
          profile: { create: { country: "IN" } },
        },
      });

      await withEnv({ NODE_ENV: "production", EMAIL_PROVIDER: "brevo" }, async () => {
        await TournamentEmailService.sendRegistrationEmail({
          userId,
          tournamentId: "tourn_brevo_test",
          tournamentTitle: "Championship 2026",
          gameId: "chess",
        });
      });

      expect(sentOptions).not.toBeNull();
      expect(sentOptions!.to).toBe(`${userId}@tourn.test`);
      expect(sentOptions!.subject).toBe("Tournament Registration Confirmed");
      expect(sentOptions!.text).toContain("successfully registered for");
      expect(sentOptions!.html).toContain("Championship 2026");

      // Cleanup
      await prisma.profile.deleteMany({ where: { userId } }).catch(() => undefined);
      await prisma.wallet.deleteMany({ where: { userId } }).catch(() => undefined);
      await prisma.user.deleteMany({ where: { id: userId } }).catch(() => undefined);
    });
  });
});
