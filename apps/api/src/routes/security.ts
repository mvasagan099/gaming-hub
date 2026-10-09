import type { FastifyInstance } from "fastify";
import { generateSecret, generateURI, verify, NobleCryptoPlugin, ScureBase32Plugin } from "otplib";
import { prisma } from "@gaming-hub/db";
import { AppError, changePasswordSchema, setup2FASchema, verify2FASchema, disable2FASchema } from "@gaming-hub/shared";
import { authenticate, requireMfa } from "../plugins/authenticate";
import { requireUser, parseSchema } from "../lib/http";
import { auditFromRequest } from "../services/audit";
import { hashToken } from "../services/sessions";
import { RateLimitService } from "../services/rateLimitService";
import { encryptTotpSecret, loadTotpSecret, isTotpEncryptionConfigured } from "../lib/crypto";
import { changeProviderPassword, verifyProviderPassword } from "../auth/password";

// Account attempts share an atomic PostgreSQL budget in production.
const MAX_2FA_ATTEMPTS = 5;
const WINDOW_SECONDS_2FA = 15 * 60; // 15 minutes

async function check2FALockout(userId: string): Promise<void> {
  // Use checkRateLimit (not assertRateLimit) so we can provide a clearer error message.
  const result = await RateLimitService.checkSharedRateLimit(
    userId,
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


const cryptoPlugin = new NobleCryptoPlugin();
const base32Plugin = new ScureBase32Plugin();

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
    
    if (data.newPassword !== data.confirmPassword) {
      throw new AppError("VALIDATION_ERROR", "New passwords do not match", 400);
    }
    
    if (data.newPassword.length < 8) {
      throw new AppError("VALIDATION_ERROR", "Password must be at least 8 characters", 400);
    }
    
    const attempt = await RateLimitService.checkSharedRateLimit(`password:${user.id}`, "AUTH", { maxRequests: 5, windowSeconds: 900 });
    if (!attempt.allowed) throw new AppError("RATE_LIMITED", "Too many password change attempts", 429);
    const providerRevoked = await changeProviderPassword(user, data.currentPassword, data.newPassword);
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { updatedAt: new Date() } });
      await tx.profile.update({ where: { userId: user.id }, data: { passwordHash: null } });
      await tx.loginSession.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date(), isCurrent: false, mfaVerifiedAt: null } });
    });
    
    await auditFromRequest(request, {
      actorType: "user",
      actorId: user.id,
      action: "security.password.changed",
      category: "security",
      targetType: "user",
      targetId: user.id,
    });
    if (!providerRevoked) throw new AppError("SERVICE_UNAVAILABLE", "Password changed and Gaming Hub sessions revoked, but provider logout could not be confirmed. Sign in again to manage remaining provider sessions.", 503);
    
    return { ok: true };
  });
  
  app.post("/api/security/2fa/setup", { preHandler: authenticate }, async (request, reply) => {
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
    if (profile.twoFactorEnabled) await requireMfa(request, reply);

    if (data.currentPassword) {
      const attempt = await RateLimitService.checkSharedRateLimit(`factor-setup:${user.id}`, "AUTH", { maxRequests: 5, windowSeconds: 900 });
      if (!attempt.allowed) throw new AppError("RATE_LIMITED", "Too many verification attempts", 429);
      await verifyProviderPassword(user, data.currentPassword);
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

    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      const rawToken = authHeader.slice("Bearer ".length).trim();
      const tokenHash = hashToken(rawToken);
      await prisma.loginSession.updateMany({
        where: { tokenHash, userId: user.id },
        data: { mfaVerifiedAt: new Date() },
      });
    }
    
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
    { preHandler: authenticate, config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (request) => {
      const user = requireUser(request);
      const data = parseSchema(verify2FASchema, request.body);

      if (!data.userId || !data.token) {
        throw new AppError("VALIDATION_ERROR", "userId and token are required", 400);
      }

      if (data.userId !== user.id) throw new AppError("FORBIDDEN", "Cannot verify another user\'s session", 403);

      // Enforce per-userId lockout before any DB access.
      await check2FALockout(data.userId);

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

      // Successful verification does not reset the shared attempt budget.

      // Only this authenticated, unrevoked session is eligible for verification.
      const rawToken = request.headers.authorization!.slice(7).trim();
      const now = new Date();
      const result = await prisma.loginSession.updateMany({
        where: { userId: user.id, tokenHash: hashToken(rawToken), revokedAt: null, expiresAt: { gt: now } },
        data: { mfaVerifiedAt: now },
      });
      if (result.count !== 1) throw new AppError("SESSION_REVOKED", "Session is no longer active", 401);

      await auditFromRequest(request, {
        actorType: "user",
        actorId: data.userId,
        action: "security.2fa.login_success",
        category: "security",
        targetType: "user",
        targetId: data.userId,
      });

      return { ok: true, mfaVerified: true };
    },
  );
}
