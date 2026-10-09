import { hasVerifiedEmail } from "@gaming-hub/shared";
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
  expiresAtMs?: number;
  testCredential?: boolean;
  providerSessionId?: string | null;
}


export async function authenticateToken(token: string): Promise<AuthenticatedUser> {
  if (env.NODE_ENV === "test" && token.startsWith("test.")) {
    const sub = token.slice("test.".length);
    if (!sub) {
      throw new Error("Test token is missing subject");
    }
    const tokenHash = hashToken(token);
    const user = await ensureUser(
      sub,
      `${sub}@test.local`,
      { username: `testuser_${sub}`, displayName: `Player ${sub}` },
    );
    return revalidateSocketUser({
      userId: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      role: user.role,
      tokenHash,
      testCredential: true,
    });
  }

  const { payload } = await jwtVerify(token, jwks, {
    issuer: `${env.SUPABASE_URL}/auth/v1`,
    audience: "authenticated",
    requiredClaims: ["exp"],
  }).catch((error: unknown) => {
    if (error instanceof Error && 'code' in error && error.code === 'ERR_JWT_EXPIRED') throw new Error('TOKEN_EXPIRED');
    throw new Error('UNAUTHORIZED');
  });

  if (!payload.sub) {
    throw new Error("Token is missing subject");
  }

  if (env.requireEmailVerification && !(await hasVerifiedEmail(payload, token, { url: env.SUPABASE_URL, key: env.SUPABASE_SERVICE_ROLE_KEY }))) {
    throw new Error("EMAIL_NOT_VERIFIED");
  }

  const tokenHash = hashToken(token);

  const user = await ensureUser(
    payload.sub,
    typeof payload.email === "string" ? payload.email : null,
    typeof payload.user_metadata === "object" && payload.user_metadata !== null
      ? (payload.user_metadata as Record<string, unknown>)
      : null,
  );

  return revalidateSocketUser({
    userId: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    role: user.role,
    tokenHash,
    expiresAtMs: Number(payload.exp) * 1000,
  });
}

/** Revalidate eligibility without repeating provider lookup on every game tick. */
export async function revalidateSocketUser(previous: AuthenticatedUser): Promise<AuthenticatedUser> {
  if (previous.expiresAtMs !== undefined && (!Number.isFinite(previous.expiresAtMs) || previous.expiresAtMs <= Date.now())) {
    throw new Error("TOKEN_EXPIRED");
  }
  const [session, user, profile, penalty] = await Promise.all([
    prisma.loginSession.findUnique({ where: { tokenHash: previous.tokenHash ?? "" } }),
    prisma.user.findUnique({ where: { id: previous.userId } }),
    prisma.profile.findUnique({ where: { userId: previous.userId }, select: { twoFactorEnabled: true } }),
    prisma.playerPenalty.findFirst({ where: {
      userId: previous.userId, status: "ACTIVE", type: { not: "AFK_WARNING" },
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    } }),
  ]);
  if (!user || user.deletedAt) throw new Error("ACCOUNT_DELETED");
  const testOnly = env.NODE_ENV === "test" && previous.testCredential;
  if (session?.revokedAt && session.providerSessionId && session.userId === previous.userId) {
    const refreshed = await prisma.loginSession.findFirst({ where: {
      userId: previous.userId, providerSessionId: session.providerSessionId, revokedAt: null, expiresAt: { gt: new Date() },
    } });
    if (refreshed) throw new Error("TOKEN_REFRESH");
  }
  if ((!session && !testOnly) || session && (session.userId !== user.id || session.revokedAt || session.expiresAt <= new Date())) {
    throw new Error("SESSION_REVOKED");
  }
  if (profile?.twoFactorEnabled && !session?.mfaVerifiedAt) throw new Error("MFA_PENDING");
  if (penalty) throw new Error("ACCOUNT_BANNED");
  return { ...previous, providerSessionId: session?.providerSessionId ?? null,
    username: user.username, displayName: user.displayName, avatarUrl: user.avatarUrl, role: user.role };
}
