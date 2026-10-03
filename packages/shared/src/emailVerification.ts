/** Call only after JWT verification. User-writable metadata is never proof. */
export async function hasVerifiedEmail(
  claims: { sub?: string; email_verified?: unknown; email_confirmed_at?: unknown; app_metadata?: unknown },
  token: string,
  config: { url: string; key?: string },
): Promise<boolean> {
  if (claims.email_verified === true ||
      (typeof claims.email_confirmed_at === "string" && claims.email_confirmed_at.length > 0) ||
      (typeof claims.app_metadata === "object" && claims.app_metadata !== null &&
        (claims.app_metadata as Record<string, unknown>).email_verified === true)) return true;
  // Supabase access tokens need not include a top-level verification claim.
  // Read the trusted Auth user record so ordinary confirmed accounts still work.
  if (!config.key || !claims.sub) return false;
  const response = await fetch(`${config.url}/auth/v1/user`, {
    headers: { apikey: config.key, Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) return false;
  const user = await response.json() as { id?: string; email_confirmed_at?: string | null };
  return user.id === claims.sub && typeof user.email_confirmed_at === "string" && user.email_confirmed_at.length > 0;
}
