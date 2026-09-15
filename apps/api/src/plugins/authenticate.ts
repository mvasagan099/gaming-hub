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

  // Check if this session token was explicitly revoked or expired
  const tokenHash = hashToken(token);
  const existingSession = await prisma.loginSession.findUnique({ where: { tokenHash } });
  if (existingSession?.revokedAt || (existingSession && existingSession.expiresAt < new Date())) {
    throw new AppError("SESSION_REVOKED", "Your session was terminated because your account was signed in on another device", 401);
  }

  // Ensure active session is recorded / refreshed in DB (atomically revoking older sessions)
  if (!existingSession) {
    await recordLoginSession({
      userId: user.id,
      token,
      ip: request.ip,
      userAgent: (request.headers["user-agent"] as string) ?? null,
    }).catch(() => {});
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
}

export async function optionalAuthenticate(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
const header = request.headers.authorization;
  const token = header?.startsWith("Bearer ")
    ? header.slice("Bearer ".length).trim()
    : undefined;

  if (!token) return;

  try {
    const verified = await verifyAccessToken(token);
    if (env.requireEmailVerification && !verified.emailVerified) return;
    const user = await ensureUser(verified.sub, verified.email, verified.userMetadata);
    request.user = user;
  } catch {
    // Ignore invalid/expired tokens for optional auth
  }
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

  // Users without 2FA are not gated by MFA
  if (!profile?.twoFactorEnabled) return;

  // Retrieve the current session
  const header = request.headers.authorization as string | undefined;
  const rawToken = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const tokenHash = hashToken(rawToken);

  const session = await prisma.loginSession.findUnique({ where: { tokenHash } });
  if (!session?.mfaVerifiedAt) {
    throw new AppError(
      "MFA_REQUIRED",
      "This action requires 2FA verification. Please complete 2FA at /api/auth/2fa/verify.",
      403,
    );
  }

  // Freshness check: mfaVerifiedAt must be within MFA_FRESHNESS_MINUTES
  const freshnessMs = env.MFA_FRESHNESS_MINUTES * 60 * 1000;
  const verifiedAgeMs = Date.now() - session.mfaVerifiedAt.getTime();
  if (verifiedAgeMs > freshnessMs) {
    throw new AppError(
      "MFA_REQUIRED",
      `Your 2FA session has expired (older than ${env.MFA_FRESHNESS_MINUTES} minutes). ` +
        "Please re-verify at /api/auth/2fa/verify.",
      403,
    );
  }
}
