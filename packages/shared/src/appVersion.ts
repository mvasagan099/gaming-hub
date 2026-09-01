/**
 * App Version Control types and utilities.
 *
 * These are shared between the API (for validation and enforcement) and the
 * web/Capacitor frontend (for the client-side gate and admin UI).
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AppVersionConfig {
  id: string;
  /** The latest released version string (e.g. "1.2.0"). Informational only. */
  latestVersion: string;
  /** Oldest version still allowed to use the app. Anything below this → hard lock. */
  minimumSupportedVersion: string;
  /** Android Play Store / direct APK download URL shown on the update screen. */
  downloadUrl: string;
  /** Message shown on the forced-update screen. */
  updateMessage: string;
  /**
   * When true AND the installed version is below minimumSupportedVersion,
   * the app is hard-locked. When false, only a soft prompt is shown to users
   * who are above the minimum but below the latest version.
   */
  forceUpdate: boolean;
  updatedAt: string;
  updatedBy: string | null;
}

/** Public-safe subset returned by the unauthenticated /api/app/version-config endpoint. */
export type AppVersionConfigPublic = Omit<AppVersionConfig, "id" | "updatedBy">;

export interface AppVersionCheckResult {
  /** Whether the client must be hard-locked (block all app usage). */
  isHardLocked: boolean;
  /** Whether a soft update prompt should be shown (user can dismiss). */
  isSoftPrompt: boolean;
  /** The installed app version (native only; null on web). */
  installedVersion: string | null;
  /** The server-side config that was used for the check. */
  config: AppVersionConfigPublic | null;
}

// ─── Semantic Version Comparison ──────────────────────────────────────────────

/**
 * Parses a semver string like "1.10.3" into numeric parts [major, minor, patch].
 * Handles non-standard "1.0" (two-part) by padding with 0.
 */
function parseSemver(version: string): [number, number, number] {
  const clean = version.trim().replace(/^v/, "");
  const parts = clean.split(".").map((p) => {
    const n = parseInt(p, 10);
    return isNaN(n) ? 0 : n;
  });
  // Pad to at least 3 parts
  while (parts.length < 3) parts.push(0);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

/**
 * Compares two semantic version strings.
 *
 * Returns:
 *  - negative number if `a < b`
 *  - 0 if `a === b`
 *  - positive number if `a > b`
 *
 * Handles two-part versions (e.g. "1.0") by treating them as "1.0.0".
 *
 * @example
 *   compareSemver("1.9.0",  "1.10.0") < 0  // true  (1.9 < 1.10)
 *   compareSemver("2.0.0",  "1.99.9") > 0  // true  (2.0 > 1.99.9)
 *   compareSemver("1.0.0",  "1.0.0")  === 0 // true
 */
export function compareSemver(a: string, b: string): number {
  const [aMajor, aMinor, aPatch] = parseSemver(a);
  const [bMajor, bMinor, bPatch] = parseSemver(b);

  if (aMajor !== bMajor) return aMajor - bMajor;
  if (aMinor !== bMinor) return aMinor - bMinor;
  return aPatch - bPatch;
}

/**
 * Returns true if `installed` is strictly below `minimum` (semantic comparison).
 */
export function isVersionBelowMinimum(installed: string, minimum: string): boolean {
  return compareSemver(installed, minimum) < 0;
}

/**
 * Validates that a string looks like a valid semver (1–3 numeric parts separated by dots).
 * Accepts two-part "1.0" format since Android `versionName` sometimes omits the patch.
 */
export function isValidSemver(version: string): boolean {
  return /^\d+(\.\d+){1,2}$/.test(version.trim());
}
