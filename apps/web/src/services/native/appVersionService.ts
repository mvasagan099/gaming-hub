import { App } from '@capacitor/app';
import { isNativePlatform, isAndroid } from './platform';
import type { AppVersionCheckResult, AppVersionConfigPublic } from '@gaming-hub/shared';
import { isVersionBelowMinimum } from '@gaming-hub/shared';
import { getApiUrl } from '../api/client';

function getVersionConfigUrl(): string {
  const base = getApiUrl().replace(/\/+$/, '');
  return `${base}/app/version-config`;
}

/**
 * Fetches the version config from the server.
 * Returns null on network failure (treated as permissive — don't block the app).
 */
export async function fetchVersionConfig(): Promise<AppVersionConfigPublic | null> {
  try {
    const res = await fetch(getVersionConfigUrl(), {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      // 5-second timeout so a slow server doesn't leave the splash screen up forever.
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return (await res.json()) as AppVersionConfigPublic;
  } catch {
    // Network failure or server down → permissive (don't block the user).
    return null;
  }
}

/**
 * Reads the installed Android app version from the Capacitor App plugin.
 * App.getInfo().version maps to android:versionName in the manifest (e.g. "1.0").
 * Returns null on web or if the plugin call fails.
 */
async function getInstalledVersion(): Promise<string | null> {
  if (!isNativePlatform() || !isAndroid()) return null;
  try {
    // App.getInfo() is available from @capacitor/app (already installed).
    // AppInfo.version = android:versionName from AndroidManifest.xml
    const info = await App.getInfo();
    return info.version ?? null;
  } catch {
    return null;
  }
}

/**
 * Performs a full version check and returns the result.
 *
 * - On web: instantly returns `{ isHardLocked: false, isSoftPrompt: false }`.
 * - On Android: fetches server config, reads installed version, compares semantically.
 * - On network failure: returns `{ isHardLocked: false }` (fail open).
 */
export async function checkAppVersion(): Promise<AppVersionCheckResult> {
  // Web browsers are completely exempt from version enforcement.
  if (!isNativePlatform() || !isAndroid()) {
    return {
      isHardLocked: false,
      isSoftPrompt: false,
      installedVersion: null,
      config: null,
    };
  }

  const [config, installedVersion] = await Promise.all([
    fetchVersionConfig(),
    getInstalledVersion(),
  ]);

  // If either piece of information is unavailable, fail open.
  if (!config || !installedVersion) {
    return {
      isHardLocked: false,
      isSoftPrompt: false,
      installedVersion,
      config,
    };
  }

  const isBelowMinimum = isVersionBelowMinimum(
    installedVersion,
    config.minimumSupportedVersion,
  );
  const isBelowLatest = isVersionBelowMinimum(
    installedVersion,
    config.latestVersion,
  );

  // Hard lock when:
  // 1. Installed version is strictly below the minimum supported version, OR
  // 2. Installed version is below the latest version AND force update is enabled.
  // Users on or above the latest version (and meeting minimum) are NEVER locked out.
  const isHardLocked = isBelowMinimum || (config.forceUpdate && isBelowLatest);

  // Soft prompt when: not hard locked but a newer version exists.
  const isSoftPrompt = !isHardLocked && isBelowLatest;

  return {
    isHardLocked,
    isSoftPrompt,
    installedVersion,
    config,
  };
}
