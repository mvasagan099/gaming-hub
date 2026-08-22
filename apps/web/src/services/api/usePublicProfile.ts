import { useEffect, useState, useRef } from "react";
import { apiClient } from "./client";
import type { DetailedPublicProfile } from "@gaming-hub/shared";

const cache = new Map<string, DetailedPublicProfile | null>();

interface UsePublicProfileResult {
  profile: DetailedPublicProfile | null;
  loading: boolean;
  refetch: () => void;
}

/**
 * Fetch and cache a public user profile by userId.
 * Results are cached in-memory for the lifetime of the page to avoid
 * re-fetching the same opponent every render.
 */
export function usePublicProfile(userId: string | null | undefined): UsePublicProfileResult {
  const [profile, setProfile] = useState<DetailedPublicProfile | null>(
    userId ? (cache.get(userId) ?? null) : null
  );
  const [loading, setLoading] = useState(false);
  const [fetchIndex, setFetchIndex] = useState(0);
  const lastFetched = useRef<string | null>(null);

  const refetch = () => {
    if (userId) {
      cache.delete(userId);
      lastFetched.current = null;
      setFetchIndex((i) => i + 1);
    }
  };

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      return;
    }

    // Already cached and not forced
    if (cache.has(userId) && fetchIndex === 0) {
      setProfile(cache.get(userId) ?? null);
      return;
    }

    if (lastFetched.current === userId && fetchIndex === 0) return;
    lastFetched.current = userId;

    let cancelled = false;
    setLoading(true);

    apiClient
      .get<DetailedPublicProfile>(`/users/${userId}/public-profile`)
      .then((data) => {
        if (cancelled) return;
        cache.set(userId, data);
        setProfile(data);
      })
      .catch(() => {
        if (cancelled) return;
        cache.set(userId, null);
        setProfile(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [userId, fetchIndex]);

  return { profile, loading, refetch };
}
