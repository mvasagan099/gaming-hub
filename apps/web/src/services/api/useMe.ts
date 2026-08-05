import { useEffect, useState } from "react";
import { useAuthStore } from "../../store/authStore";
import { apiClient, ApiError } from "./client";
import { WALLET_CHANGED_EVENT } from "./practiceReward";

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
  } | null;
  wallet: MeWallet | null;
  unreadNotifications: number;
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
  const [loading, setLoading] = useState(false);
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

    apiClient
      .get<MePayload>("/auth/me")
      .then((payload) => {
        if (cancelled) return;
        setMe(payload);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError) setError(err.message);
        else setError("Failed to load your profile");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [session, nonce]);

  // Refresh the balance whenever the wallet changes (e.g. practice rewards).
  useEffect(() => {
    const handler = () => setNonce((n) => n + 1);
    window.addEventListener(WALLET_CHANGED_EVENT, handler);
    return () => window.removeEventListener(WALLET_CHANGED_EVENT, handler);
  }, []);

  return { me, loading, error, reload: () => setNonce((n) => n + 1) };
}
