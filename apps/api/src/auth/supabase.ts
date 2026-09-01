import { createRemoteJWKSet, jwtVerify } from "jose";
import { env } from "../env";

const jwks = createRemoteJWKSet(
  new URL(`${env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`),
);

export interface VerifiedSupabaseToken {
  sub: string;
  email: string | null;
  emailVerified: boolean;
  issuedAt: number;
  /** Raw `user_metadata` claim (e.g. username chosen at signup). */
  userMetadata: Record<string, unknown> | null;
}

/**
 * Verifies a Supabase access token against the project JWKS. This is the only
 * source of truth for identity: the API and the socket server both trust the
 * same token, and refresh is handled by the client SDK (supabase-js).
 */
export async function verifyAccessToken(token: string): Promise<VerifiedSupabaseToken> {
  // Test mode: tokens are `test.<userId>` so integration tests can drive the
  // real authenticate/ensureUser pipeline without a Supabase project. The
  // production path below is untouched.
  if (process.env.NODE_ENV === "test" && token.startsWith("test.")) {
    const sub = token.slice("test.".length);
    if (!sub) {
      throw new Error("Test token is missing subject");
    }
    return {
      sub,
      email: `${sub}@test.local`,
      emailVerified: true,
      issuedAt: Date.now() / 1000,
      userMetadata: { username: `testuser_${sub}` },
    };
  }

  const { payload } = await jwtVerify(token, jwks, {
    issuer: `${env.SUPABASE_URL}/auth/v1`,
    audience: "authenticated",
  });

  if (!payload.sub) {
    throw new Error("Token is missing subject");
  }

  return {
    sub: payload.sub,
    email: typeof payload.email === "string" ? payload.email : null,
    emailVerified: payload.email_verified === true,
    issuedAt: typeof payload.iat === "number" ? payload.iat : Date.now() / 1000,
    userMetadata:
      typeof payload.user_metadata === "object" && payload.user_metadata !== null
        ? (payload.user_metadata as Record<string, unknown>)
        : null,
  };
}
