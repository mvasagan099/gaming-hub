import { prisma } from "@gaming-hub/db";
import { gameSettingsSchema, DEFAULT_FEATURE_FLAGS } from "@gaming-hub/shared";
import type { z } from "zod";
import { AppError } from "@gaming-hub/shared";

const CACHE_TTL_MS = 5_000;
let cache: z.infer<typeof gameSettingsSchema> | null = null;
let cacheExpiresAt = 0;

let flagsCache: Record<string, boolean> | null = null;
let flagsCacheExpiresAt = 0;

/**
 * Reads the admin-configured `game` settings category. Cached briefly so every
 * room/matching request does not hit the DB.
 */
async function getGameSettings(): Promise<z.infer<typeof gameSettingsSchema>> {
  if (cache && Date.now() < cacheExpiresAt) return cache;

  const rows = await prisma.siteSetting.findMany({
    where: { category: "game" },
    select: { key: true, value: true },
  });
  const merged: Record<string, unknown> = {};
  for (const row of rows) {
    const field = row.key.startsWith("game.") ? row.key.slice("game.".length) : null;
    if (field) merged[field] = row.value;
  }
  const parsed = gameSettingsSchema.safeParse(merged);
  cache = parsed.success ? parsed.data : gameSettingsSchema.parse({});
  cacheExpiresAt = Date.now() + CACHE_TTL_MS;
  return cache;
}

/**
 * Resolved enterprise feature flags: admin-stored `developer.featureFlags`
 * overlaid on the shared catalog defaults. Cached like the game settings.
 */
export async function getFeatureFlags(): Promise<Record<string, boolean>> {
  if (flagsCache && Date.now() < flagsCacheExpiresAt) return flagsCache;

  const row = await prisma.siteSetting.findUnique({
    where: { key: "developer.featureFlags" },
    select: { value: true },
  });
  const stored =
    row && row.value && typeof row.value === "object"
      ? (row.value as Record<string, boolean>)
      : {};
  flagsCache = { ...DEFAULT_FEATURE_FLAGS, ...stored };
  flagsCacheExpiresAt = Date.now() + CACHE_TTL_MS;
  return flagsCache;
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

export async function getDisabledGames(): Promise<string[]> {
  return (await getGameSettings()).disabledGames;
}

/** Seconds a player may wait in the queue before being timed out. */
export async function getMatchmakingTimeoutSeconds(): Promise<number> {
  return (await getGameSettings()).matchmakingTimeoutSeconds;
}

export async function assertGameEnabled(gameId: string): Promise<void> {
  const disabled = await getDisabledGames();
  if (disabled.includes(gameId)) {
    throw new AppError(
      "FEATURE_DISABLED",
      "This game is currently disabled by the platform administrators",
      403,
    );
  }
}
