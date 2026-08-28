import { useEffect, useState } from "react";
import { apiClient } from "./client";
import type { DetailedPublicProfile } from "@gaming-hub/shared";

const cache = new Map<string, DetailedPublicProfile>();

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

  const refetch = () => {
    if (userId) {
      cache.delete(userId);
      setFetchIndex((i) => i + 1);
    }
  };

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      setLoading(false);
      return;
    }

    if (cache.has(userId) && fetchIndex === 0) {
      setProfile(cache.get(userId) ?? null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    apiClient
      .get<DetailedPublicProfile>(`/users/${userId}/public-profile`)
      .then((data) => {
        if (cancelled) return;
        if (data) {
          cache.set(userId, data);
        }
        setProfile(data);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[usePublicProfile] Failed to fetch profile:", err);
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

