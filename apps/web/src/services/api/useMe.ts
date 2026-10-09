import { useEffect, useState } from "react";
import { useAuthStore } from "../../store/authStore";
import { apiClient, ApiError } from "./client";
import { WALLET_CHANGED_EVENT } from "./practiceReward";
import { NOTIFICATION_CHANGED_EVENT } from "./enterprise";

export interface MeWallet {
  userId: string;
  balance: number;
}

export interface MePayload {
  user: {
    id: string;
    email: string | null;
    username: string;
    displayName: string;
    avatarUrl: string | null;
    role: string;
    createdAt: string;
  };
  profile: {
    coins: number;
    gems: number;
    xp: number;
    level: number;
    wins: number;
    losses: number;
    draws: number;
    bio: string | null;
    country: string | null;
    phone: string | null;
    dateOfBirth: string | null;
    gender: string | null;
    currency: string | null;
    referredBy: string | null;
    twoFactorEnabled?: boolean;
    streetAddress?: string | null;
    city?: string | null;
    state?: string | null;
    postcode?: string | null;
  } | null;
  wallet: MeWallet | null;
  unreadNotifications: number;
  mfaVerified?: boolean;
}

interface UseMeResult {
  me: MePayload | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useMe(): UseMeResult {
  const session = useAuthStore((s) => s.session);
  const [me, setMe] = useState<MePayload | null>(null);
  const [loading, setLoading] = useState<boolean>(!!session);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!session) {
      setMe(null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const fetchMe = async (attempt = 0) => {
      try {
        const payload = await apiClient.get<MePayload>("/auth/me");
        if (cancelled) return;
        setMe(payload);
        setError(null);
        setLoading(false);
      } catch (err: unknown) {
        if (cancelled) return;

        if (err instanceof ApiError && err.code === 'MFA_PENDING') {
          const pending = useAuthStore.getState().pendingMfaSession ?? session;
          useAuthStore.setState({ session: null, user: null, pendingMfaSession: pending, isMfaRequired: true });
          sessionStorage.setItem('mfa_pending', 'true');
          setMe(null);
          setLoading(false);
          return;
        }
        if (err instanceof ApiError && err.status === 401) {
          useAuthStore.getState().signOut().catch(() => {});
          setMe(null);
          setError(err.message);
          setLoading(false);
          return;
        }

        // If 502/503/504 or network error (Render cold start), retry once after 2 seconds
        if (attempt < 1 && (err instanceof ApiError ? err.status >= 500 : true)) {
          setTimeout(() => {
            if (!cancelled) {
              void fetchMe(attempt + 1);
            }
          }, 2000);
          return;
        }

        if (err instanceof ApiError) setError(err.message);
        else setError("Failed to load your profile");
        setLoading(false);
      }
    };

    void fetchMe();

    return () => {
      cancelled = true;
    };
  }, [session, nonce]);

  // Refresh the balance / notifications whenever wallet or notifications change.
  useEffect(() => {
    const handler = () => setNonce((n) => n + 1);
    window.addEventListener(WALLET_CHANGED_EVENT, handler);
    window.addEventListener(NOTIFICATION_CHANGED_EVENT, handler);
    return () => {
      window.removeEventListener(WALLET_CHANGED_EVENT, handler);
      window.removeEventListener(NOTIFICATION_CHANGED_EVENT, handler);
    };
  }, []);

  return { me, loading, error, reload: () => setNonce((n) => n + 1) };
}
