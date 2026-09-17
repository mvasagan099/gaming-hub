import { randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";
import type { FastifyInstance } from "fastify";
import { generateSecret, generateURI, verify, NobleCryptoPlugin, ScureBase32Plugin } from "otplib";
import { prisma } from "@gaming-hub/db";
import { AppError, changePasswordSchema, setup2FASchema, verify2FASchema, disable2FASchema } from "@gaming-hub/shared";
import { authenticate, requireMfa } from "../plugins/authenticate";
import { requireUser, parseSchema } from "../lib/http";
import { auditFromRequest } from "../services/audit";
import { RateLimitService } from "../services/rateLimitService";
import { encryptTotpSecret, loadTotpSecret, isTotpEncryptionConfigured } from "../lib/crypto";

// ---------------------------------------------------------------------------
// Per-userId 2FA login attempt tracking (NEW-3 fix — was bespoke Map, now uses
// RateLimitService so metrics, suspicious-activity alerts, and any future Redis
// backend all apply automatically).
//
// Window: 5 failures per 15 minutes → 429. Consistent with the AUTH category
// defaults used by other sensitive endpoints.
//
// In a multi-node deployment RateLimitService is already the shared in-process
// rate-limiter for all other sensitive paths.  A Redis back-end can be wired in
// a single place later rather than per-endpoint.
// ---------------------------------------------------------------------------
const MAX_2FA_ATTEMPTS = 5;
const WINDOW_SECONDS_2FA = 15 * 60; // 15 minutes

function check2FALockout(userId: string): void {
  // Use checkRateLimit (not assertRateLimit) so we can provide a clearer error message.
  const result = RateLimitService.checkRateLimit(
    `2fa:${userId}`,
    "TWO_FA",
    { maxRequests: MAX_2FA_ATTEMPTS, windowSeconds: WINDOW_SECONDS_2FA },
  );
  if (!result.allowed) {
    throw new AppError(
      "RATE_LIMITED",
      `Too many failed verification attempts. Please try again in ${result.retryAfterSeconds} seconds.`,
      429,
    );
  }
}

function record2FAFailure(_userId: string): void {
  // RateLimitService.checkRateLimit already records the hit on every call.
  // This function is intentionally a no-op — kept for call-site symmetry.
}

function reset2FAAttempts(userId: string): void {
  // Clear the sliding-window timestamps so a successful login immediately
  // grants a full fresh budget (mirrored from the old Map.delete behaviour).
  // We access the private static Maps via type-cast to reach internal state.
  const fullKey = `TWO_FA:2fa:${userId}`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (RateLimitService as any)["requestTimestamps"].delete(fullKey);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (RateLimitService as any)["throttleCounts"].delete(fullKey);
}

const scryptAsync = promisify(scrypt);

const cryptoPlugin = new NobleCryptoPlugin();
const base32Plugin = new ScureBase32Plugin();

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${derivedKey.toString("hex")}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return derivedKey.toString("hex") === hash;
}

function generateTOTPSecret(): string {
  return generateSecret();
}

async function verifyTOTP(token: string, secret: string): Promise<boolean> {
  try {
    const result = await verify({
      token,
      secret,
      crypto: cryptoPlugin,
      base32: base32Plugin,
      epochTolerance: 30,
    });
    return result.valid;
  } catch {
    return false;
  }
}

function getTOTPAuthUrl(userEmail: string, secret: string, issuer: string = "Gaming Hub"): string {
  return generateURI({
    secret,
    label: userEmail,
    issuer,
  });
}

export async function securityRoutes(app: FastifyInstance) {
  app.patch("/api/security/password", { preHandler: [authenticate, requireMfa] }, async (request) => {
    const user = requireUser(request);
    const data = parseSchema(changePasswordSchema, request.body);
    
    const profile = await prisma.profile.findUnique({
      where: { userId: user.id },
      select: { passwordHash: true },
    });
    
    if (!profile?.passwordHash) {
      throw new AppError("VALIDATION_ERROR", "Account uses external authentication. Password cannot be changed here.", 400);
    }
    
    if (!(await verifyPassword(data.currentPassword, profile.passwordHash))) {
      await auditFromRequest(request, {
        actorType: "user",
        actorId: user.id,
        action: "security.password.failed",
        category: "security",
        targetType: "user",
        targetId: user.id,
        meta: { reason: "invalid_current_password" },
      });
      throw new AppError("VALIDATION_ERROR", "Current password is incorrect", 401);
    }
    
    if (data.newPassword !== data.confirmPassword) {
      throw new AppError("VALIDATION_ERROR", "New passwords do not match", 400);
    }
    
    if (data.newPassword.length < 8) {
      throw new AppError("VALIDATION_ERROR", "Password must be at least 8 characters", 400);
    }
    
    const newPasswordHash = await hashPassword(data.newPassword);
    
    await prisma.profile.update({
      where: { userId: user.id },
      data: { passwordHash: newPasswordHash },
    });
    
    await auditFromRequest(request, {
      actorType: "user",
      actorId: user.id,
      action: "security.password.changed",
      category: "security",
      targetType: "user",
      targetId: user.id,
    });
    
    return { ok: true };
  });
  
  app.post("/api/security/2fa/setup", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const data = parseSchema(setup2FASchema, request.body);
    
    const profile = await prisma.profile.findUnique({
      where: { userId: user.id },
      select: { twoFactorEnabled: true, passwordHash: true },
    });
    
    if (!profile) {
      throw new AppError("NOT_FOUND", "Profile not found", 404);
    }
    
    if (profile.twoFactorEnabled && !data.reset) {
      throw new AppError("VALIDATION_ERROR", "2FA is already enabled", 400);
    }

    if (profile.passwordHash) {
      if (!data.currentPassword) {
        throw new AppError("VALIDATION_ERROR", "Current password is required to configure 2FA", 400);
      }
      if (!(await verifyPassword(data.currentPassword, profile.passwordHash))) {
        await auditFromRequest(request, {
          actorType: "user",
          actorId: user.id,
          action: "security.2fa.setup_failed",
          category: "security",
          targetType: "user",
          targetId: user.id,
          meta: { reason: "invalid_current_password" },
        });
        throw new AppError("VALIDATION_ERROR", "Current password is incorrect", 401);
      }
    }
    
    const secret = generateTOTPSecret();
    const email = user.email ?? "user";
    const authUrl = getTOTPAuthUrl(email, secret);

    // M-05: Store encrypted if key is configured, plaintext fallback for dev.
    const updateData: Record<string, unknown> = {};
    if (isTotpEncryptionConfigured()) {
      updateData.twoFactorSecretEncrypted = encryptTotpSecret(secret);
      updateData.twoFactorSecretKeyVersion = (await import("../lib/crypto")).currentTotpKeyVersion();
      updateData.twoFactorSecret = null; // clear plaintext
    } else {
      updateData.twoFactorSecret = secret; // dev fallback
    }

    await prisma.profile.update({
      where: { userId: user.id },
      data: updateData,
    });
    
    await auditFromRequest(request, {
      actorType: "user",
      actorId: user.id,
      action: "security.2fa.setup_initiated",
      category: "security",
      targetType: "user",
      targetId: user.id,
    });
    
    return {
      ok: true,
      secret,
      authUrl,
    };
  });
  
  app.post("/api/security/2fa/verify", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const data = parseSchema(verify2FASchema, request.body);
    
    const profile = await prisma.profile.findUnique({
      where: { userId: user.id },
      select: { twoFactorEnabled: true, twoFactorSecret: true, twoFactorSecretEncrypted: true, twoFactorSecretKeyVersion: true },
    });
    
    if (!profile) {
      throw new AppError("NOT_FOUND", "Profile not found", 404);
    }
    
    if (profile.twoFactorEnabled) {
      throw new AppError("VALIDATION_ERROR", "2FA is already enabled", 400);
    }
    
    if (!profile.twoFactorSecret && !profile.twoFactorSecretEncrypted) {
      throw new AppError("VALIDATION_ERROR", "2FA setup not initiated. Call /setup first", 400);
    }
    
    const secret = loadTotpSecret(
      profile.twoFactorSecretEncrypted,
      profile.twoFactorSecretKeyVersion,
      profile.twoFactorSecret,
    );
    if (!(await verifyTOTP(data.token, secret))) {
      await auditFromRequest(request, {
        actorType: "user",
        actorId: user.id,
        action: "security.2fa.verify_failed",
        category: "security",
        targetType: "user",
        targetId: user.id,
        meta: { reason: "invalid_totp" },
      });
      throw new AppError("VALIDATION_ERROR", "Invalid verification code", 400);
    }
    
    await prisma.profile.update({
      where: { userId: user.id },
      data: { twoFactorEnabled: true },
    });
    
    await auditFromRequest(request, {
      actorType: "user",
      actorId: user.id,
      action: "security.2fa.enabled",
      category: "security",
      targetType: "user",
      targetId: user.id,
    });
    
    return { ok: true, enabled: true };
  });
  
  app.post("/api/security/2fa/disable", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const data = parseSchema(disable2FASchema, request.body);
    
    const profile = await prisma.profile.findUnique({
      where: { userId: user.id },
      select: { twoFactorEnabled: true, twoFactorSecret: true, twoFactorSecretEncrypted: true, twoFactorSecretKeyVersion: true, passwordHash: true },
    });
    
    if (!profile?.twoFactorEnabled) {
      throw new AppError("VALIDATION_ERROR", "2FA is not enabled on this account", 400);
    }
    
    const secret = loadTotpSecret(
      profile.twoFactorSecretEncrypted,
      profile.twoFactorSecretKeyVersion,
      profile.twoFactorSecret,
    );
    if (!(await verifyTOTP(data.token, secret))) {
      await auditFromRequest(request, {
        actorType: "user",
        actorId: user.id,
        action: "security.2fa.disable_failed",
        category: "security",
        targetType: "user",
        targetId: user.id,
        meta: { reason: "invalid_totp" },
      });
      throw new AppError("VALIDATION_ERROR", "Invalid verification code", 400);
    }
    
    await prisma.profile.update({
      where: { userId: user.id },
      data: {
        twoFactorSecret: null,
        twoFactorSecretEncrypted: null,
        twoFactorSecretKeyVersion: null,
        twoFactorEnabled: false,
      },
    });
    
    await auditFromRequest(request, {
      actorType: "user",
      actorId: user.id,
      action: "security.2fa.disabled",
      category: "security",
      targetType: "user",
      targetId: user.id,
    });
    
    return { ok: true };
  });
  
  // HIGH-1 fix: strict 5 req/min rate limit + per-userId failed-attempt lockout.
  app.post(
    "/api/security/2fa/verify-login",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (request) => {
      const data = parseSchema(verify2FASchema, request.body);

      if (!data.userId || !data.token) {
        throw new AppError("VALIDATION_ERROR", "userId and token are required", 400);
      }

      // Enforce per-userId lockout before any DB access.
      check2FALockout(data.userId);

      const profile = await prisma.profile.findUnique({
        where: { userId: data.userId },
        select: {
          twoFactorSecret: true,
          twoFactorSecretEncrypted: true,
          twoFactorSecretKeyVersion: true,
          twoFactorEnabled: true,
        },
      });

      if (!profile || !profile.twoFactorEnabled || (!profile.twoFactorSecret && !profile.twoFactorSecretEncrypted)) {
        throw new AppError("VALIDATION_ERROR", "2FA is not enabled for this account", 400);
      }

      const secret = loadTotpSecret(
        profile.twoFactorSecretEncrypted,
        profile.twoFactorSecretKeyVersion,
        profile.twoFactorSecret,
      );

      if (!(await verifyTOTP(data.token, secret))) {
        // Record failure BEFORE auditing so an exception here doesn't skip the count.
        record2FAFailure(data.userId);
        await auditFromRequest(request, {
          actorType: "user",
          actorId: data.userId,
          action: "security.2fa.login_failed",
          category: "security",
          targetType: "user",
          targetId: data.userId,
          meta: { reason: "invalid_totp" },
        });
        throw new AppError("VALIDATION_ERROR", "Invalid verification code", 400);
      }

      // Success — clear the failure counter.
      reset2FAAttempts(data.userId);

      await auditFromRequest(request, {
        actorType: "user",
        actorId: data.userId,
        action: "security.2fa.login_success",
        category: "security",
        targetType: "user",
        targetId: data.userId,
      });

      return { ok: true };
    },
  );
}
