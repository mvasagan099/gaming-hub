import type { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@gaming-hub/db";
import { AppError } from "@gaming-hub/shared";
import { env } from "../env";
import { verifyAccessToken } from "../auth/supabase";
import { ensureUser } from "../services/users";
import { hashToken, recordLoginSession } from "../services/sessions";

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
  
  // Check if this session token was explicitly revoked
  const tokenHash = hashToken(token);
  const existingSession = await prisma.loginSession.findUnique({ where: { tokenHash } });
  if (existingSession?.revokedAt) {
    throw new AppError("UNAUTHORIZED", "Session has been revoked", 401);
  }

  // Ensure active session is recorded / refreshed in DB
  if (!existingSession) {
    await recordLoginSession({
      userId: user.id,
      token,
      ip: request.ip,
      userAgent: (request.headers["user-agent"] as string) ?? null,
    }).catch(() => {});
  }

  request.user = user;
}
