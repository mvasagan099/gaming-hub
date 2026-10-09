import type { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@gaming-hub/db";
import { AppError, isVersionBelowMinimum } from "@gaming-hub/shared";
import { env } from "../env";
import { verifyAccessToken } from "../auth/supabase";
import { ensureUser } from "../services/users";
import { hashToken, recordLoginSession } from "../services/sessions";

// ─── Version Enforcement Cache ─────────────────────────────────────────────────

interface VersionCacheEntry {
  minimumSupportedVersion: string;
  forceUpdate: boolean;
  cachedAt: number;
}

/** In-memory 60-second TTL cache for the AppVersionConfig to avoid a DB hit on every request. */
let versionCache: VersionCacheEntry | null = null;
const VERSION_CACHE_TTL_MS = 60_000;

async function getVersionConfig(): Promise<VersionCacheEntry> {
  const now = Date.now();
  if (versionCache && now - versionCache.cachedAt < VERSION_CACHE_TTL_MS) {
    return versionCache;
  }
  try {
    const config = await prisma.appVersionConfig.findFirst({
      // Cosmetic fix (backlog): use desc so that if multiple rows exist the most
      // recently updated record wins. With a singleton there is only ever one row
      // but the intent should be clear to future maintainers.
      orderBy: { updatedAt: "desc" },
      select: { minimumSupportedVersion: true, forceUpdate: true },
    });
    const entry: VersionCacheEntry = {
      minimumSupportedVersion: config?.minimumSupportedVersion ?? "1.0",
      forceUpdate: config?.forceUpdate ?? false,
      cachedAt: now,
    };
    versionCache = entry;
    return entry;
  } catch {
    // If DB is unreachable, fall back to permissive defaults so a DB blip
    // doesn't lock out all authenticated users.
    return {
      minimumSupportedVersion: "1.0",
      forceUpdate: false,
      cachedAt: now,
    };
  }
}

// ─── Main Authenticate Handler ─────────────────────────────────────────────────

const userActivityThrottle = new Map<string, number>();

export function touchUserPresence(userId: string): void {
  const now = Date.now();
  const lastTouch = userActivityThrottle.get(userId) ?? 0;
  if (now - lastTouch > 20_000) {
    userActivityThrottle.set(userId, now);
    prisma.user
      .update({
        where: { id: userId },
        data: { isOnline: true, lastSeenAt: new Date() },
      })
      .catch(() => {});
  }
}

export async function authenticate(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
const header = request.headers.authorization;
  const token = header?.startsWith("Bearer ")
    ? header.slice("Bearer ".length).trim()
    : undefined;

  if (!token) {
    throw new AppError("UNAUTHORIZED", "Missing bearer token", 401);
  }

  let verified: Awaited<ReturnType<typeof verifyAccessToken>>;
  try {
    verified = await verifyAccessToken(token);
  } catch (error) {
    request.log.warn({ error }, "Failed to verify access token");
    throw new AppError("UNAUTHORIZED", "Invalid or expired token", 401);
  }

  if (env.requireEmailVerification && !verified.emailVerified) {
    throw new AppError("EMAIL_NOT_VERIFIED", "Please verify your email address", 403);
  }

  const user = await ensureUser(verified.sub, verified.email, verified.userMetadata);

  const penalty = await prisma.playerPenalty.findFirst({ where: {
    userId: user.id, status: "ACTIVE", type: { not: "AFK_WARNING" },
    OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
  } });
  if (penalty) throw new AppError("ACCOUNT_BANNED", "Account access is suspended", 403);

  // Keep player online presence fresh
  touchUserPresence(user.id);

  // Check if this session token was explicitly revoked or expired
  const tokenHash = hashToken(token);
  const existingSession = await prisma.loginSession.findUnique({ where: { tokenHash } });
  if (existingSession?.revokedAt || (existingSession && (existingSession.userId !== user.id || existingSession.expiresAt <= new Date()))) {
    throw new AppError("SESSION_REVOKED", "Your session was terminated because your account was signed in on another device", 401);
  }

  // Ensure active session is recorded / refreshed in DB (atomically revoking older sessions)
  if (!existingSession || (verified.providerSessionId && !existingSession.providerSessionId)) {
    await recordLoginSession({
      userId: user.id,
      token,
      ip: request.ip,
      userAgent: (request.headers["user-agent"] as string) ?? null,
      expiresAt: verified.expiresAt,
      providerSessionId: verified.providerSessionId,
    });
  }

  // ─── Android Version Enforcement ────────────────────────────────────────────
  // Only applies when the client explicitly identifies as Android and supplies a
  // version string. Web browsers and server-to-server calls are exempt.
  const platform = request.headers["x-app-platform"];
  const clientVersion = request.headers["x-app-version"];

  if (
    typeof platform === "string" &&
    platform.toLowerCase() === "android" &&
    typeof clientVersion === "string" &&
    clientVersion.trim().length > 0
  ) {
    const versionConfig = await getVersionConfig();
    const isBelowMinimum = isVersionBelowMinimum(
      clientVersion.trim(),
      versionConfig.minimumSupportedVersion,
    );

    if (isBelowMinimum) {
      // NEW-1 fix: forceUpdate is an AND condition with isBelowMinimum, not OR.
      //
      // Previous (buggy):   if (isBelowMinimum || versionConfig.forceUpdate)
      //   → enabling forceUpdate locked out ALL Android users regardless of version.
      //
      // Correct behaviour (aligned with the shared-type docstring):
      //   - isBelowMinimum → hard-lock on the server (this block).
      //   - forceUpdate    → hint sent in the public /api/app/version-config response
      //                      for the client to show a soft "please update" prompt,
      //                      even when the installed version is still above minimum.
      //
      // If the intent is ever to add a true "lock everyone out regardless of version"
      // escape-hatch, a separate `forceUpdateAll: boolean` field should be added to
      // AppVersionConfig with distinct admin UI labelling.
      throw new AppError(
        "APP_UPDATE_REQUIRED",
        `This version of the app is no longer supported. Please update to version ${versionConfig.minimumSupportedVersion} or later.`,
        426,
      );
    }
  }

  request.user = user;

  // ─── Login-Time MFA Gate ─────────────────────────────────────────────────────
  // If the authenticated user has 2FA enabled but the current session has not yet
  // had mfaVerifiedAt stamped, this is a PENDING MFA LOGIN session.
  //
  // Such sessions must only be allowed to call POST /api/auth/2fa/verify to
  // complete their second factor. All other routes are blocked with MFA_PENDING.
  //
  // This is deliberately placed AFTER setting request.user so the 2FA verify
  // endpoint can access the user identity to perform TOTP validation.
  const isMfaVerifyRoute =
    request.method === "POST" &&
    ["/api/auth/2fa/verify", "/api/security/2fa/verify-login", "/api/auth/logout"].includes(request.url.split("?")[0]);

  if (!isMfaVerifyRoute) {
    // Check profile lazily — only when needed (non-2FA users are unaffected)
    const profileForMfa = await prisma.profile.findUnique({
      where: { userId: user.id },
      select: { twoFactorEnabled: true },
    });

    if (profileForMfa?.twoFactorEnabled) {
      // Look up the session we already fetched above (re-use tokenHash)
      const mfaTokenHash = hashToken(token);
      const mfaSession = await prisma.loginSession.findUnique({
        where: { tokenHash: mfaTokenHash },
        select: { mfaVerifiedAt: true },
      });

      if (!mfaSession?.mfaVerifiedAt) {
        throw new AppError(
          "MFA_PENDING",
          "Login-time two-factor authentication is required. Please complete TOTP verification to access this resource.",
          403,
        );
      }
    }
  }
}

export async function optionalAuthenticate(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  // Optional identity must meet the same session/MFA eligibility as protected routes.
  if (!request.headers.authorization) return;
  try {
    await authenticate(request, _reply);
  } catch {
    Reflect.deleteProperty(request, "user");
  }
}

/** Logout grants no application access. A signed, already revoked credential
 * may still revoke its own refresh lineage (for example from an older tab). */
export async function authenticateLogout(request: FastifyRequest): Promise<void> {
  const header = request.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) throw new AppError("UNAUTHORIZED", "Missing bearer token", 401);
  let verified: Awaited<ReturnType<typeof verifyAccessToken>>;
  try { verified = await verifyAccessToken(token); }
  catch { throw new AppError("UNAUTHORIZED", "Invalid or expired token", 401); }
  const user = await prisma.user.findUnique({ where: { id: verified.sub } });
  if (!user) throw new AppError("UNAUTHORIZED", "Account not found", 401);
  request.user = user;
}

// ─── C-02: requireMfa ────────────────────────────────────────────────────────
/**
 * Pre-handler that enforces backend-level MFA completion AND freshness.
 *
 * Must be used AFTER `authenticate` (which sets `request.user`).
 * If the authenticated user has 2FA enabled, their active LoginSession must
 * have `mfaVerifiedAt` set within the last MFA_FRESHNESS_MINUTES minutes
 * (stamped by `POST /api/auth/2fa/verify`).
 *
 * Users without 2FA enabled are allowed through without restriction so that
 * disabling 2FA is never a breaking change for those accounts.
 */
export async function requireMfa(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const user = request.user;
  if (!user) {
    throw new AppError("UNAUTHORIZED", "Authentication required", 401);
  }

  // Check whether this user has 2FA enabled
  const profile = await prisma.profile.findUnique({
    where: { userId: user.id },
    select: { twoFactorEnabled: true },
  });

  // For administrative or privileged users, MFA enrollment is strictly mandatory
  if (!profile?.twoFactorEnabled) {
    if (user.role !== "USER") {
      throw new AppError(
        "MFA_ENROLLMENT_REQUIRED",
        "Administrative operations require two-factor authentication (2FA) to be enabled on your account.",
        403,
      );
    }
    // Standard users without 2FA enabled are not gated on non-admin routes
    return;
  }

  // Retrieve the current session
  const header = request.headers.authorization as string | undefined;
  const rawToken = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const tokenHash = hashToken(rawToken);

  const session = await prisma.loginSession.findUnique({ where: { tokenHash } });
  if (!session?.mfaVerifiedAt || session.userId !== user.id || session.revokedAt || session.expiresAt <= new Date()) {
    throw new AppError(
      "MFA_REQUIRED",
      "This action requires 2FA verification. Please complete 2FA at /api/auth/2fa/verify.",
      403,
    );
  }

  // Freshness check: mfaVerifiedAt must be within MFA_FRESHNESS_MINUTES
  const freshnessMs = env.MFA_FRESHNESS_MINUTES * 60 * 1000;
  const verifiedAgeMs = Date.now() - session.mfaVerifiedAt.getTime();
  if (verifiedAgeMs < 0 || verifiedAgeMs > freshnessMs) {
    throw new AppError(
      "MFA_REQUIRED",
      `Your 2FA session has expired (older than ${env.MFA_FRESHNESS_MINUTES} minutes). ` +
        "Please re-verify at /api/auth/2fa/verify.",
      403,
    );
  }
}
