import { prisma } from "@gaming-hub/db";
import {
  SETTINGS_CATEGORIES,
  DEFAULT_SETTINGS as SITE_SETTINGS_DEFAULTS,
  SECRET_SETTING_KEYS,
  type SettingsCategoryName,
  type SettingsShape,
  type SiteSettings,
} from "@gaming-hub/shared";
import type { Prisma } from "@gaming-hub/db";
import { AppError } from "@gaming-hub/shared";

const CACHE_TTL_MS = 5_000;
let cache: SiteSettings | null = null;
let cacheExpiresAt = 0;

/**
 * Loads the full, validated site settings object. Defaults fill any missing
 * rows so the system remains usable before an admin ever configures anything.
 */
export async function getSettings(): Promise<SiteSettings> {
  if (cache && Date.now() < cacheExpiresAt) return cache;

  const rows = await prisma.siteSetting.findMany();
  const merged = structuredClone(SITE_SETTINGS_DEFAULTS) as Record<string, Record<string, unknown>>;

  for (const row of rows) {
    const [category, field] = splitKey(row.key);
    if (!category || !(category in SETTINGS_CATEGORIES)) continue;
    if (!field) continue;
    merged[category][field] = row.value;
  }

  // Validate per category so a single stale/wrongly-typed row only resets that
  // category (to its defaults) instead of disabling every admin-configured
  // setting across the whole platform.
  const out = {} as Record<string, unknown>;
  for (const category of Object.keys(SETTINGS_CATEGORIES) as SettingsCategoryName[]) {
    const parsed = SETTINGS_CATEGORIES[category].safeParse(merged[category] ?? {});
    out[category] = parsed.success ? parsed.data : SITE_SETTINGS_DEFAULTS[category];
  }

  cache = out as SiteSettings;
  cacheExpiresAt = Date.now() + CACHE_TTL_MS;
  return cache;
}

/**
 * Single-field accessor used by enforcement paths (e.g. wallet limits, signup
 * gate). Reads the cached aggregate; callers destructure the field they need.
 */
export async function getCategorySettings<K extends SettingsCategoryName>(
  category: K,
): Promise<SettingsShape[K]> {
  const all = await getSettings();
  return all[category];
}

/** Public settings: secrets stripped. Returned by the unauthenticated endpoint. */
export async function getPublicSettings(): Promise<Partial<SiteSettings>> {
  const all = await getSettings();
  const clone = structuredClone(all) as Record<string, Record<string, unknown>>;
  for (const dotted of SECRET_SETTING_KEYS) {
    const [category, field] = splitKey(dotted);
    if (category && field && mergedHas(clone, category, field)) {
      delete clone[category][field];
    }
  }
  return clone as Partial<SiteSettings>;
}

/**
 * Validate and persist a single setting. Throws VALIDATION_ERROR if the key is
 * unknown or the value fails the field's schema, and merges the new value into
 * the cache immediately.
 */
export async function setSetting(
  key: string,
  value: unknown,
  updatedBy: string | null,
): Promise<void> {
  const [categoryName, field] = splitKey(key);
  const category = asCategoryName(categoryName);
  if (!category || !field) {
    throw new AppError("VALIDATION_ERROR", `Unknown setting key "${key}"`, 422);
  }

  const categorySchema = SETTINGS_CATEGORIES[category];
  const shape = categorySchema.shape as Record<
    string,
    { safeParse: (v: unknown) => { success: boolean; data?: unknown; error?: { flatten: () => unknown } } }
  >;
  const fieldSchema = shape[field];
  if (!fieldSchema || typeof fieldSchema.safeParse !== "function") {
    throw new AppError("VALIDATION_ERROR", `Unknown setting key "${key}"`, 422);
  }
  if (value === undefined) {
    throw new AppError("VALIDATION_ERROR", `Value required for "${key}"`, 422);
  }
  const result = fieldSchema.safeParse(value);
  if (!result.success) {
    throw new AppError("VALIDATION_ERROR", `Invalid value for "${key}"`, 422, result.error!.flatten());
  }

  const isSecret = SECRET_SETTING_KEYS.has(key);
  await prisma.siteSetting.upsert({
    where: { key },
    create: { key, category, value: result.data as Prisma.InputJsonValue, secret: isSecret, updatedBy },
    update: { value: result.data as Prisma.InputJsonValue, secret: isSecret, updatedBy },
  });

  // Invalidate so the next read reflects the change.
  cache = null;
}

/** Replace an entire category in one transaction. */
export async function setCategorySettings(
  category: SettingsCategoryName,
  partial: Record<string, unknown>,
  updatedBy: string | null,
): Promise<SettingsShape[typeof category]> {
  const categorySchema = SETTINGS_CATEGORIES[category];
  const parsed = categorySchema.safeParse({ ...SITE_SETTINGS_DEFAULTS[category], ...partial });
  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", `Invalid ${category} settings`, 422, parsed.error.flatten());
  }

  const rows = flattenCategory(parsed.data).map(([field, value]) => ({
    key: `${category}.${field}`,
    category,
    value: value as Prisma.InputJsonValue,
    secret: SECRET_SETTING_KEYS.has(`${category}.${field}`),
    updatedBy,
  }));

  await prisma.$transaction([
    prisma.siteSetting.deleteMany({ where: { category } }),
    prisma.siteSetting.createMany({ data: rows }),
  ]);

  cache = null;
  return parsed.data;
}

export function resetSettingsCache(): void {
  cache = null;
}

function splitKey(key: string): [string | undefined, string | undefined] {
  const idx = key.indexOf(".");
  if (idx <= 0) return [undefined, undefined];
  return [key.slice(0, idx), key.slice(idx + 1)];
}

function asCategoryName(name: string | undefined): SettingsCategoryName | undefined {
  if (!name) return undefined;
  return name in SETTINGS_CATEGORIES ? (name as SettingsCategoryName) : undefined;
}

function mergedHas(
  obj: Record<string, Record<string, unknown>>,
  category: string,
  field: string,
): boolean {
  return Boolean(obj[category] && field in obj[category]);
}

function flattenCategory(data: Record<string, unknown>): Array<[string, unknown]> {
  return Object.entries(data);
}
