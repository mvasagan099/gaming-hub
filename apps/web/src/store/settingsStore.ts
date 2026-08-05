import { create } from 'zustand';
import type { SiteSettings } from '@gaming-hub/shared';
import { fetchPublicSettings } from '../services/api/settings';

interface SettingsState {
  settings: Partial<SiteSettings> | null;
  isLoading: boolean;
  error: string | null;
  loadSettings: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: null,
  isLoading: false,
  error: null,
  loadSettings: async () => {
    set({ isLoading: true, error: null });
    try {
      const settings = await fetchPublicSettings();
      set({ settings, isLoading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load settings';
      set({ error: message, isLoading: false });
    }
  },
}));
