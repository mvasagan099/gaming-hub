import type { FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "@gaming-hub/shared";
import { env } from "../env";
import { verifyAccessToken } from "../auth/supabase";
import { ensureUser } from "../services/users";

export async function authenticate(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw new AppError("UNAUTHORIZED", "Missing bearer token", 401);
  }

  const token = header.slice("Bearer ".length).trim();
  if (!token) {
    throw new AppError("UNAUTHORIZED", "Empty bearer token", 401);
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
  request.user = user;
}
