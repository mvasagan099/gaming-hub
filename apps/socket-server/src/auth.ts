import { createRemoteJWKSet, jwtVerify } from "jose";
import { env } from "./env";
import { ensureUser } from "./users";

const jwks = createRemoteJWKSet(
  new URL(`${env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`),
);

export interface AuthenticatedUser {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  role: string;
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

  const user = await ensureUser(
    payload.sub,
    typeof payload.email === "string" ? payload.email : null,
    typeof payload.user_metadata === "object" && payload.user_metadata !== null
      ? (payload.user_metadata as Record<string, unknown>)
      : null,
  );
  return {
    userId: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    role: user.role,
  };
}
