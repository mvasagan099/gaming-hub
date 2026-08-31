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
      orderBy: { updatedAt: "asc" },
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
  const queryToken = (request.query as { token?: string })?.token;
  const token = header?.startsWith("Bearer ")
    ? header.slice("Bearer ".length).trim()
    : queryToken;

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

    if (isBelowMinimum || versionConfig.forceUpdate) {
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
  const queryToken = (request.query as { token?: string })?.token;
  const token = header?.startsWith("Bearer ")
    ? header.slice("Bearer ".length).trim()
    : queryToken;

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
