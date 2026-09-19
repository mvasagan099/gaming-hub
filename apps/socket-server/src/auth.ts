import { createHash } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { prisma } from "@gaming-hub/db";
import { env } from "./env";
import { ensureUser } from "./users";

const jwks = createRemoteJWKSet(
  new URL(`${env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`),
);

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface AuthenticatedUser {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  role: string;
  tokenHash?: string;
}


export async function authenticateToken(token: string): Promise<AuthenticatedUser> {
  const { payload } = await jwtVerify(token, jwks, {
    issuer: `${env.SUPABASE_URL}/auth/v1`,
    audience: "authenticated",
  });

  if (!payload.sub) {
    throw new Error("Token is missing subject");
  }

  if (env.requireEmailVerification && payload.email_verified !== true) {
    throw new Error("EMAIL_NOT_VERIFIED");
  }

  const tokenHash = hashToken(token);
  const existingSession = await prisma.loginSession.findUnique({
    where: { tokenHash },
  });

  if (existingSession?.revokedAt || (existingSession && existingSession.expiresAt < new Date())) {
    throw new Error("SESSION_REVOKED");
  }

  const user = await ensureUser(
    payload.sub,
    typeof payload.email === "string" ? payload.email : null,
    typeof payload.user_metadata === "object" && payload.user_metadata !== null
      ? (payload.user_metadata as Record<string, unknown>)
      : null,
  );

  // Check 2FA gating: If user has twoFactorEnabled, active session MUST have mfaVerifiedAt
  const profile = await prisma.profile.findUnique({
    where: { userId: user.id },
    select: { twoFactorEnabled: true },
  });

  if (profile?.twoFactorEnabled) {
    if (!existingSession?.mfaVerifiedAt) {
      throw new Error("MFA_PENDING");
    }
  }

  // Check active account bans / penalties
  const activePenalty = await prisma.playerPenalty.findFirst({
    where: {
      userId: user.id,
      status: "ACTIVE",
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ],
    },
  });

  if (activePenalty) {
    throw new Error("ACCOUNT_BANNED");
  }

  return {
    userId: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    role: user.role,
    tokenHash,
  };
}

