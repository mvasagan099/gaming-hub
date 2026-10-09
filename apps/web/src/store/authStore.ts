import { create } from 'zustand';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '../services/supabase';

interface AuthState {
  user: User | null;
  session: Session | null;
  /** Supabase session held during a pending login-time 2FA challenge.
   *  Not set as `session` until TOTP completes, preventing protected routes
   *  from considering the user fully authenticated prematurely. */
  pendingMfaSession: Session | null;
  isPasswordRecovery: boolean;
  recoverySession: Session | null;
  isMfaRequired: boolean;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setSession: (session: Session | null) => void;
  setPendingMfaSession: (session: Session | null) => void;
  setIsPasswordRecovery: (isPasswordRecovery: boolean) => void;
  setRecoverySession: (recoverySession: Session | null) => void;
  setIsMfaRequired: (isMfaRequired: boolean) => void;
  setLoading: (isLoading: boolean) => void;
  signOut: () => Promise<void>;
  verifySession: (session: Session | null) => Promise<'authenticated' | 'mfa_pending' | 'signed_out' | 'superseded'>;
  clearAuth: () => void;
}

let authGeneration = 0;
let verification: { token: string; promise: Promise<'authenticated' | 'mfa_pending' | 'signed_out' | 'superseded'> } | null = null;

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  session: null,
  pendingMfaSession: null,
  isPasswordRecovery: false,
  recoverySession: null,
  isMfaRequired: false,
  isLoading: true,
  setUser: (user) => set({ user }),
  setSession: (session) => set({ session }),
  setPendingMfaSession: (pendingMfaSession) => set({ pendingMfaSession }),
  setIsPasswordRecovery: (isPasswordRecovery) => {
    if (isPasswordRecovery) {
      authGeneration++;
      verification = null;
      set({ isPasswordRecovery, session: null, user: null, pendingMfaSession: null, isMfaRequired: false, isLoading: false });
    } else set({ isPasswordRecovery });
  },
  setRecoverySession: (recoverySession) => set({ recoverySession }),
  setIsMfaRequired: (isMfaRequired) => set({ isMfaRequired }),
  setLoading: (isLoading) => set({ isLoading }),
  clearAuth: () => {
    authGeneration++;
    verification = null;
    set({ user: null, session: null, pendingMfaSession: null, isPasswordRecovery: false, recoverySession: null, isMfaRequired: false, isLoading: false });
  },
  verifySession: async (session) => {
    if (!session) { useAuthStore.getState().clearAuth(); return 'signed_out'; }
    if (useAuthStore.getState().isPasswordRecovery) return 'superseded';
    if (verification?.token === session.access_token) return verification.promise;
    const generation = ++authGeneration;
    const current = useAuthStore.getState();
    const keepVerifiedSession = current.session?.user.id === session.user.id && !current.isMfaRequired && !current.isPasswordRecovery;
    // Keep an already verified board mounted during same-user refresh. The new
    // credential is never published until the backend accepts it.
    set({ ...(keepVerifiedSession ? {} : { session: null, user: null }), pendingMfaSession: session, isLoading: !keepVerifiedSession });
    const promise = (async (): Promise<'authenticated' | 'mfa_pending' | 'superseded'> => {
      try {
        const { apiClient } = await import('../services/api/client');
        const result = await apiClient.post<{ status: string; requiresTwoFactor?: boolean }>('/auth/session', { token: session.access_token }, session.access_token);
        if (generation !== authGeneration) return 'superseded';
        const pending = result.requiresTwoFactor || ['mfa_required', '2fa_required'].includes(result.status);
        if (!pending && !['ok', 'authenticated'].includes(result.status)) throw new Error('Application session could not be verified');
        if (pending) sessionStorage.setItem('mfa_pending', 'true');
        else sessionStorage.removeItem('mfa_pending');
        set({ session: pending ? null : session, user: pending ? null : session.user, pendingMfaSession: pending ? session : null,
          isMfaRequired: !!pending, isPasswordRecovery: false, recoverySession: null, isLoading: false });
        return pending ? 'mfa_pending' : 'authenticated';
      } catch (error) {
        // Provider credentials alone never promote a Gaming Hub login.
        if (generation === authGeneration) set({ session: null, user: null, isLoading: false });
        throw error;
      } finally {
        if (generation === authGeneration) verification = null;
      }
    })();
    verification = { token: session.access_token, promise };
    return promise;
  },
  signOut: async () => {
    const state = useAuthStore.getState();
    const token = (state.session ?? state.pendingMfaSession)?.access_token;
    state.clearAuth();
    let failure: unknown;
    try {
      sessionStorage.removeItem("mfa_pending");
      sessionStorage.removeItem("mfa_email");
      if (token) {
        const { apiClient } = await import('../services/api/client');
        await apiClient.post('/auth/logout', {}, token);
      }
    } catch (error) {
      failure = error;
    }
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (failure || error) throw failure ?? error;
  },
}));
