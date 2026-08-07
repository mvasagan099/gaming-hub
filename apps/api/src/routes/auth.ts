import type { FastifyInstance } from "fastify";
import { decodeJwt } from "jose";
import { AppError } from "@gaming-hub/shared";
import { authSessionSchema } from "@gaming-hub/shared";
import { prisma } from "@gaming-hub/db";
import { env } from "../env";
import { verifyAccessToken } from "../auth/supabase";
import { ensureUser, getAuthenticatedUserData } from "../services/users";
import { authenticate } from "../plugins/authenticate";
import { requireUser } from "../lib/http";
import { auditFromRequest } from "../services/audit";
import { getCategorySettings } from "../services/settings";
import { recordLoginSession } from "../services/sessions";

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
    return getAuthenticatedUserData(requireUser(request));
  });

  app.post(
    "/api/auth/session",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (request) => {
      const { token } = authSessionSchema.parse(request.body);

      // The token is NOT yet verified here. decodeJwt only extracts the payload
      // so failed attempts can be tied to an identity for lockout purposes.
      let hintEmail: string | null = null;
      try {
        const payload = decodeJwt(token);
        hintEmail = typeof payload.email === "string" ? payload.email : null;
      } catch {
        // Unparseable token: fall through to verification (will fail).
      }

      if (await isLockedOut(hintEmail)) {
        auditFromRequest(request, {
          actorType: "system",
          action: "auth.session.rejected",
          category: "auth",
          meta: { reason: "locked_out", email: hintEmail },
        });
        throw new AppError("ACCOUNT_LOCKED", "Too many failed attempts, try again later", 429);
      }

      let verified;
      try {
        verified = await verifyAccessToken(token);
      } catch {
        auditFromRequest(request, {
          actorType: "system",
          action: "auth.session.failed",
          category: "auth",
          meta: { reason: "invalid_token", email: hintEmail },
        });
        throw new AppError("UNAUTHORIZED", "Invalid or expired token", 401);
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
      
      const profile = await prisma.profile.findUnique({
        where: { userId: verified.sub },
        select: { twoFactorEnabled: true },
      });
      
      if (profile?.twoFactorEnabled) {
        auditFromRequest(request, {
          actorType: "user",
          actorId: verified.sub,
          action: "auth.session.2fa_required",
          category: "auth",
          targetType: "user",
          targetId: verified.sub,
          meta: { email: verified.email },
        });
        return { status: "2fa_required", userId: verified.sub };
      }
      
      await recordLoginSession({
        userId: verified.sub,
        token,
        ip: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });
      auditFromRequest(request, {
        actorType: "user",
        actorId: verified.sub,
        action: "auth.session.created",
        category: "auth",
        targetType: "user",
        targetId: verified.sub,
        meta: { email: verified.email },
      });
      return { status: "ok" };
    },
  );
}
