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
}

export async function authenticateToken(token: string): Promise<AuthenticatedUser> {
  const { payload } = await jwtVerify(token, jwks, {
    issuer: `${env.SUPABASE_URL}/auth/v1`,
    audience: "authenticated",
  });

  if (!payload.sub) {
    throw new Error("Token is missing subject");
  }

  const user = await ensureUser(payload.sub, typeof payload.email === "string" ? payload.email : null);
  return {
    userId: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
  };
}
