import { RateLimitService } from "../services/rateLimitService";
import type { FastifyInstance } from "fastify";
import { decodeJwt } from "jose";
import { AppError } from "@gaming-hub/shared";
import { authSessionSchema } from "@gaming-hub/shared";
import { prisma } from "@gaming-hub/db";
import { verify as verifyOtp, NobleCryptoPlugin, ScureBase32Plugin } from "otplib";
import { env } from "../env";
import { verifyAccessToken } from "../auth/supabase";
import { ensureUser, getAuthenticatedUserData } from "../services/users";
import { authenticate } from "../plugins/authenticate";
import { requireUser } from "../lib/http";
import { auditFromRequest } from "../services/audit";
import { getCategorySettings } from "../services/settings";
import { recordLoginSession, hashToken } from "../services/sessions";
import { loadTotpSecret } from "../lib/crypto";

// Failed sign-in lockout: more than this many failed session exchanges for an
// email within the window rejects further attempts, even with a valid token.
const SESSION_LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
const SESSION_LOCKOUT_MAX_ATTEMPTS = 15;

async function isLockedOut(email: string | null): Promise<boolean> {
  if (!email) return false;
  const since = new Date(Date.now() - SESSION_LOCKOUT_WINDOW_MS);
  const failures = await prisma.auditLog.findMany({
    where: { action: "auth.session.failed", createdAt: { gte: since } },
    select: { meta: true },
  });
  const count = failures.filter((row) => {
    const meta = row.meta as { email?: unknown } | null;
    return meta?.email === email;
  }).length;
  return count >= SESSION_LOCKOUT_MAX_ATTEMPTS;
}

export async function authRoutes(app: FastifyInstance) {
  app.get("/api/auth/me", { preHandler: authenticate }, async (request) => {
    const authHeader = request.headers.authorization as string | undefined;
    const rawToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : undefined;
    return getAuthenticatedUserData(requireUser(request), rawToken);
  });

  app.post(
    "/api/auth/session",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (request) => {
      const { token } = authSessionSchema.parse(request.body);

      let verified;
      try {
        verified = await verifyAccessToken(token);
      } catch {
        auditFromRequest(request, {
          actorType: "system",
          action: "auth.session.failed",
          category: "auth",
          meta: { reason: "invalid_token" },
        });
        throw new AppError("UNAUTHORIZED", "Invalid or expired token", 401);
      }

      if (await isLockedOut(verified.email)) {
        auditFromRequest(request, {
          actorType: "system",
          action: "auth.session.rejected",
          category: "auth",
          meta: { reason: "locked_out", email: verified.email },
        });
        throw new AppError("ACCOUNT_LOCKED", "Too many failed attempts, try again later", 429);
      }

      const [general, authSettings] = await Promise.all([
        getCategorySettings("general"),
        getCategorySettings("auth"),
      ]);

      // Check if platform is under maintenance mode
      if (general.maintenanceEnabled) {
        auditFromRequest(request, {
          actorType: "system",
          action: "auth.session.failed",
          category: "auth",
          meta: { reason: "maintenance", email: verified.email },
        });
        throw new AppError("FEATURE_DISABLED", "The platform is currently under maintenance. Please try again later.", 403);
      }

      // Signup gate: existing users can always sign in, but if registrations are
      // disabled a brand-new account is not auto-provisioned.
      if (!authSettings.signupEnabled) {
        const existing = await prisma.user.findUnique({
          where: { id: verified.sub },
          select: { id: true, deletedAt: true },
        });
        if (!existing) {
          auditFromRequest(request, {
            actorType: "system",
            action: "auth.session.rejected",
            category: "auth",
            meta: { reason: "signup_disabled", email: verified.email },
          });
          throw new AppError(
            "FEATURE_DISABLED",
            "New registrations are currently disabled. Please try again later.",
            403,
          );
        }
      }

      if (env.requireEmailVerification && !verified.emailVerified) {
        auditFromRequest(request, {
          actorType: "system",
          action: "auth.session.failed",
          category: "auth",
          meta: { reason: "email_not_verified", email: verified.email },
        });
        throw new AppError("EMAIL_NOT_VERIFIED", "Please verify your email address", 403);
      }

      await ensureUser(verified.sub, verified.email, verified.userMetadata);
      
      await recordLoginSession({
        userId: verified.sub,
        token,
        ip: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      const profile = await prisma.profile.findUnique({
        where: { userId: verified.sub },
        select: { twoFactorEnabled: true },
      });
      
      const tokenHash = hashToken(token);
      const session = await prisma.loginSession.findUnique({ where: { tokenHash } });

      if (profile?.twoFactorEnabled && !session?.mfaVerifiedAt) {
        auditFromRequest(request, {
          actorType: "user",
          actorId: verified.sub,
          action: "auth.session.2fa_required",
          category: "auth",
          targetType: "user",
          targetId: verified.sub,
          meta: { email: verified.email },
        });
        return {
          status: "mfa_required",
          requiresTwoFactor: true,
          userId: verified.sub,
          challengeId: verified.sub,
        };
      }
      
      auditFromRequest(request, {
        actorType: "user",
        actorId: verified.sub,
        action: "auth.session.created",
        category: "auth",
        targetType: "user",
        targetId: verified.sub,
        meta: { email: verified.email },
      });
      return {
        status: "authenticated",
        requiresTwoFactor: false,
      };
    },
  );

  // ─── C-02: POST /api/auth/2fa/verify ──────────────────────────────────────
  // Called by the frontend after receiving { status: "2fa_required" } from
  // /api/auth/session.  Verifies the TOTP token and stamps mfaVerifiedAt on the
  // current LoginSession so backend middleware can confirm 2FA completion.
  app.post(
    "/api/auth/2fa/verify",
    { preHandler: authenticate, config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (request) => {
      const user = requireUser(request);
      const limit = await RateLimitService.checkSharedRateLimit(user.id, "TWO_FA");
      if (!limit.allowed) throw new AppError("RATE_LIMITED", "Too many TOTP attempts; retry after the cooldown.", 429);
      const { token: totpToken } = (request.body as { token?: unknown });
      if (typeof totpToken !== "string" || !totpToken.trim()) {
        throw new AppError("VALIDATION_ERROR", "TOTP token is required", 400);
      }

      const profile = await prisma.profile.findUnique({
        where: { userId: user.id },
        select: { twoFactorEnabled: true, twoFactorSecret: true, twoFactorSecretEncrypted: true, twoFactorSecretKeyVersion: true },
      });

      if (!profile?.twoFactorEnabled || (!profile.twoFactorSecret && !profile.twoFactorSecretEncrypted)) {
        throw new AppError("NOT_FOUND", "2FA is not enabled for this account", 400);
      }

      // Re-use the otplib verify pattern from security.ts
      const cryptoPlugin = new NobleCryptoPlugin();
      const base32Plugin = new ScureBase32Plugin();
      const totpSecret = loadTotpSecret(
        profile.twoFactorSecretEncrypted,
        profile.twoFactorSecretKeyVersion,
        profile.twoFactorSecret,
      );
      let isValid = false;
      try {
        const result = await verifyOtp({
          token: totpToken.trim(),
          secret: totpSecret,
          crypto: cryptoPlugin,
          base32: base32Plugin,
          epochTolerance: 30,
        });
        isValid = result.valid;
      } catch {
        isValid = false;
      }

      if (!isValid) {
        auditFromRequest(request, {
          actorType: "user",
          actorId: user.id,
          action: "auth.2fa.failed",
          category: "auth",
          targetType: "user",
          targetId: user.id,
        });
        throw new AppError("UNAUTHORIZED", "Invalid 2FA token", 401);
      }

      // Stamp the active session so requireMfa middleware will pass
      const authHeader = request.headers.authorization as string;
      const rawToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
      const tokenHash = hashToken(rawToken);
      const now = new Date();
      const result = await prisma.loginSession.updateMany({
        where: { userId: user.id, tokenHash, revokedAt: null, expiresAt: { gt: now } },
        data: { mfaVerifiedAt: now },
      });
      if (result.count !== 1) throw new AppError("SESSION_REVOKED", "Session is no longer active", 401);


      auditFromRequest(request, {
        actorType: "user",
        actorId: user.id,
        action: "auth.2fa.verified",
        category: "auth",
        targetType: "user",
        targetId: user.id,
      });

      return { status: "ok", mfaVerified: true };
    },
  );
}
