import { useEffect, useState, useRef } from "react";
import { apiClient } from "./client";
import type { PublicProfile } from "@gaming-hub/shared";

const cache = new Map<string, PublicProfile | null>();

interface UsePublicProfileResult {
  profile: PublicProfile | null;
  loading: boolean;
}

/**
 * Fetch and cache a public user profile by userId.
 * Results are cached in-memory for the lifetime of the page to avoid
 * re-fetching the same opponent every render.
 */
export function usePublicProfile(userId: string | null | undefined): UsePublicProfileResult {
  const [profile, setProfile] = useState<PublicProfile | null>(
    userId ? (cache.get(userId) ?? null) : null
  );
  const [loading, setLoading] = useState(false);
  const lastFetched = useRef<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      return;
    }

    // Already cached
    if (cache.has(userId)) {
      setProfile(cache.get(userId) ?? null);
      return;
    }

    // Already fetching same id
    if (lastFetched.current === userId) return;
    lastFetched.current = userId;

    let cancelled = false;
    setLoading(true);

    apiClient
      .get<PublicProfile>(`/users/${userId}`)
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
  }, [userId]);

  return { profile, loading };
}

/** Clear the profile cache (e.g. on logout) */
export function clearProfileCache() {
  cache.clear();
}
