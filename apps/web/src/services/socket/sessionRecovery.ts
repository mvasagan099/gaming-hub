import { supabase } from '../supabase';
import { useAuthStore } from '../../store/authStore';

/** Refresh reauthenticates the socket; revocation never silently retries it. */
export async function recoverSocketSession(reason: string): Promise<'reconnect' | 'mfa_pending' | 'revoked'> {
  if (!['TOKEN_REFRESH', 'TOKEN_EXPIRED', 'MFA_PENDING'].includes(reason)) return 'revoked';
  try {
    const result = reason === 'TOKEN_EXPIRED' ? await supabase.auth.refreshSession() : await supabase.auth.getSession();
    if (result.error || !result.data.session) return 'revoked';
    const status = await useAuthStore.getState().verifySession(result.data.session);
    if (status === 'authenticated') return 'reconnect';
    if (status === 'mfa_pending') return 'mfa_pending';
  } catch { /* Authorization failed; do not continue the socket session. */ }
  return 'revoked';
}
