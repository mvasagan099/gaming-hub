import { AppError, DEFAULT_FEATURE_FLAGS, FEATURE_FLAG_GROUPS } from "@gaming-hub/shared";
import { getCategorySettings } from "./settings";

/**
 * Enterprise feature-flag enforcement.
 *
 * Flags are stored in `developer.featureFlags` (a flat `Record<string, boolean>`)
 * and default to the catalog values in `FEATURE_FLAG_GROUPS`. Every feature
 * surface calls `assertFeatureEnabled(key)` before acting so a single admin
 * toggle can kill a feature platform-wide without code changes.
 */
export async function getFeatureFlags(): Promise<Record<string, boolean>> {
  const developer = await getCategorySettings("developer");
  return { ...DEFAULT_FEATURE_FLAGS, ...developer.featureFlags };
}

export async function isFeatureEnabled(key: string): Promise<boolean> {
  const flags = await getFeatureFlags();
  return flags[key] !== false;
}

export async function assertFeatureEnabled(key: string, label?: string): Promise<void> {
  const flags = await getFeatureFlags();
  if (flags[key] === false) {
    throw new AppError(
      "FEATURE_DISABLED",
      `${label ?? key} is currently disabled`,
      403,
    );
  }
}

export async function getFeatureFlagGroups() {
  const flags = await getFeatureFlags();
  return FEATURE_FLAG_GROUPS.map((group) => ({
    key: group.group,
    label: group.label,
    description: group.description,
    flags: group.flags.map((flag) => ({
      key: flag.key,
      label: flag.label,
      description: flag.description,
      enabled: flags[flag.key] !== false,
    })),
  }));
}

const FEATURE_FLAG_KEYS = new Set(
  FEATURE_FLAG_GROUPS.flatMap((g) => g.flags.map((f) => f.key)),
);

export async function setFeatureFlag(
  key: string,
  enabled: boolean,
  updatedBy: string | null,
): Promise<void> {
  if (!FEATURE_FLAG_KEYS.has(key)) {
    throw new AppError("VALIDATION_ERROR", `Unknown feature flag: ${key}`, 400);
  }
  const developer = await getCategorySettings("developer");
  const next = { ...developer.featureFlags, [key]: enabled };
  const { setCategorySettings } = await import("./settings");
  await setCategorySettings("developer", { ...developer, featureFlags: next }, updatedBy);
}
