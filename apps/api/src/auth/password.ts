import { createClient } from "@supabase/supabase-js";
import { AppError } from "@gaming-hub/shared";
import { env } from "../env";

async function passwordClient(user: { id: string; email: string | null }, currentPassword: string) {
  if (!user.email || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new AppError("SERVICE_UNAVAILABLE", "Password authentication is not configured", 503);
  }
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const signedIn = await client.auth.signInWithPassword({ email: user.email, password: currentPassword });
  if (signedIn.error || signedIn.data.user?.id !== user.id) {
    if (signedIn.data.session) await client.auth.signOut({ scope: "local" });
    throw new AppError("UNAUTHORIZED", "Current password is incorrect", 401);
  }
  return client;
}

export async function verifyProviderPassword(user: { id: string; email: string | null }, password: string) {
  const client = await passwordClient(user, password);
  await client.auth.signOut({ scope: "local" });
}

/** Reauthenticate and change the credential used by the actual login provider. */
export async function changeProviderPassword(user: { id: string; email: string | null }, currentPassword: string, password: string) {
  const client = await passwordClient(user, currentPassword);
  const updated = await client.auth.updateUser({ password });
  if (updated.error || updated.data.user?.id !== user.id) {
    await client.auth.signOut({ scope: "local" });
    throw new AppError("SERVICE_UNAVAILABLE", "Password could not be updated", 503);
  }
  // Old refresh credentials must not mint new sessions after password changes.
  try {
    const logout = await client.auth.signOut({ scope: "global" });
    return !logout.error;
  } catch {
    return false;
  }
}
