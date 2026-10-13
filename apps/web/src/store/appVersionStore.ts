import { create } from 'zustand';
import type { AppVersionConfigPublic } from '@gaming-hub/shared';
import { checkAppVersion, fetchVersionConfig } from '../services/native/appVersionService';

export type AppVersionStatus =
  | 'idle'        // not yet checked
  | 'checking'    // check in flight
  | 'ok'          // version is fine, app proceeds normally
  | 'soft-prompt' // version OK but a newer one exists (non-blocking)
  | 'hard-locked'; // version is below minimum → full lock screen

interface AppVersionState {
  status: AppVersionStatus;
  config: AppVersionConfigPublic | null;
  installedVersion: string | null;
  /** Run the version check (no-op on web). Safe to call multiple times. */
  check: () => Promise<void>;
  /** Fetch public app version configuration for web and native shells. */
  fetchConfig: () => Promise<AppVersionConfigPublic | null>;
}

export const useAppVersionStore = create<AppVersionState>((set, get) => ({
  status: 'idle',
  config: null,
  installedVersion: null,

  fetchConfig: async () => {
    if (get().config) return get().config;
    try {
      const config = await fetchVersionConfig();
      if (config) {
        set({ config });
      }
      return config;
    } catch {
      return null;
    }
  },

  check: async () => {
    // Prevent concurrent or duplicate checks.
    if (get().status === 'checking') return;

    set({ status: 'checking' });

    try {
      const result = await checkAppVersion();

      if (result.isHardLocked) {
        set({
          status: 'hard-locked',
          config: result.config,
          installedVersion: result.installedVersion,
        });
      } else if (result.isSoftPrompt) {
        set({
          status: 'soft-prompt',
          config: result.config,
          installedVersion: result.installedVersion,
        });
      } else {
        set({
          status: 'ok',
          config: result.config,
          installedVersion: result.installedVersion,
        });
      }
    } catch {
      // If the check itself throws (should not happen since the service handles
      // errors internally), default to 'ok' so the app is not accidentally locked.
      set({ status: 'ok' });
    }
  },
}));
