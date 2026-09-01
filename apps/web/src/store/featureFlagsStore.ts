import { create } from 'zustand';
import { fetchFeatureFlags, type FeatureFlags } from '../services/api/featureFlags';

interface FeatureFlagsState {
  flags: FeatureFlags | null;
  isLoading: boolean;
  error: string | null;
  loadFlags: (force?: boolean) => Promise<void>;
}

export const useFeatureFlagsStore = create<FeatureFlagsState>((set, get) => ({
  flags: null,
  isLoading: false,
  error: null,
  loadFlags: async (force = false) => {
    if (!force && get().flags) return;
    set({ isLoading: true, error: null });
    try {
      const flags = await fetchFeatureFlags();
      set({ flags, isLoading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load feature flags';
      set({ error: message, isLoading: false });
    }
  },
}));

/** True when the flag is present and not explicitly disabled (defaults to enabled). */
export function useFeatureEnabled(key: string): boolean {
  return useFeatureFlagsStore((s) => (s.flags ? s.flags[key] !== false : true));
}
