import { create } from 'zustand';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '../services/supabase';

interface AuthState {
  user: User | null;
  session: Session | null;
  isPasswordRecovery: boolean;
  recoverySession: Session | null;
  isMfaRequired: boolean;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setSession: (session: Session | null) => void;
  setIsPasswordRecovery: (isPasswordRecovery: boolean) => void;
  setRecoverySession: (recoverySession: Session | null) => void;
  setIsMfaRequired: (isMfaRequired: boolean) => void;
  setLoading: (isLoading: boolean) => void;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  session: null,
  isPasswordRecovery: false,
  recoverySession: null,
  isMfaRequired: false,
  isLoading: true,
  setUser: (user) => set({ user }),
  setSession: (session) => set({ session }),
  setIsPasswordRecovery: (isPasswordRecovery) => set({ isPasswordRecovery }),
  setRecoverySession: (recoverySession) => set({ recoverySession }),
  setIsMfaRequired: (isMfaRequired) => set({ isMfaRequired }),
  setLoading: (isLoading) => set({ isLoading }),
  signOut: async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // Ignore network errors on sign out
    }
    set({ user: null, session: null, isPasswordRecovery: false, recoverySession: null, isMfaRequired: false });
  },
}));
