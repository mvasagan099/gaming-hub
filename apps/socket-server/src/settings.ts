import { prisma } from "@gaming-hub/db";
import {
  gameSettingsSchema,
  DEFAULT_FEATURE_FLAGS,
  DEFAULT_GAME_CONFIGS,
  gameConfigSchema,
  isGameId,
  type GameConfig,
  type GameId,
  type MatchConfigSnapshot,
} from "@gaming-hub/shared";
import type { z } from "zod";
import { AppError } from "@gaming-hub/shared";

const CACHE_TTL_MS = 5_000;
let cache: z.infer<typeof gameSettingsSchema> | null = null;
let cacheExpiresAt = 0;

let flagsCache: Record<string, boolean> | null = null;
let flagsCacheExpiresAt = 0;

let gameConfigsCache: Record<string, GameConfig> | null = null;
let gameConfigsCacheExpiresAt = 0;

export function invalidateSocketConfigCache(): void {
  cache = null;
  cacheExpiresAt = 0;
  flagsCache = null;
  flagsCacheExpiresAt = 0;
  gameConfigsCache = null;
  gameConfigsCacheExpiresAt = 0;
}

/**
 * Reads the admin-configured `game` settings category. Cached briefly so every
 * room/matching request does not hit the DB.
 */
export async function getGameSettings(): Promise<z.infer<typeof gameSettingsSchema>> {
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
 * Retrieves all centralized game configurations for socket runtime.
 */
export async function getAllGameConfigs(): Promise<Record<GameId, GameConfig>> {
  if (gameConfigsCache && Date.now() < gameConfigsCacheExpiresAt) {
    return gameConfigsCache as Record<GameId, GameConfig>;
  }

  const rows = await prisma.siteSetting.findMany({
    where: { category: "game_config" },
  });

  const result: Record<string, GameConfig> = { ...DEFAULT_GAME_CONFIGS };

  for (const row of rows) {
    if (row.key.startsWith("game_config.")) {
      const gameId = row.key.replace("game_config.", "") as GameId;
      if (isGameId(gameId)) {
        const parsed = gameConfigSchema.safeParse(row.value);
        if (parsed.success) {
          result[gameId] = parsed.data as GameConfig;
        }
      }
    }
  }

  gameConfigsCache = result;
  gameConfigsCacheExpiresAt = Date.now() + CACHE_TTL_MS;
  return gameConfigsCache as Record<GameId, GameConfig>;
}

/**
 * Retrieves configuration for a specific game.
 */
export async function getGameConfig(gameId: GameId): Promise<GameConfig> {
  const configs = await getAllGameConfigs();
  return configs[gameId] ?? DEFAULT_GAME_CONFIGS[gameId];
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
  const allConfigs = await getAllGameConfigs();
  const disabledFromConfigs = Object.values(allConfigs)
    .filter((c) => !c.enabled || !c.onlineEnabled)
    .map((c) => c.gameId);
  const disabledFromLegacy = (await getGameSettings()).disabledGames;
  return Array.from(new Set([...disabledFromConfigs, ...disabledFromLegacy]));
}

/** Seconds a player may wait in the queue before being timed out. */
export async function getMatchmakingTimeoutSeconds(): Promise<number> {
  return (await getGameSettings()).matchmakingTimeoutSeconds;
}

/**
 * Validates that game is enabled, online mode is enabled, and entry fee is allowed.
 */
export async function assertGameEnabled(gameId: GameId, entryFee?: number): Promise<GameConfig> {
  const config = await getGameConfig(gameId);

  if (!config.enabled) {
    throw new AppError(
      "GAME_DISABLED",
      `${config.name} is currently disabled by the platform administrators`,
      403,
    );
  }

  if (!config.onlineEnabled) {
    throw new AppError(
      "ONLINE_DISABLED",
      `Online multiplayer mode for ${config.name} is currently disabled`,
      403,
    );
  }

  if (entryFee !== undefined && entryFee > 0) {
    const isExplicitlyAllowed = config.entryFees.includes(entryFee);
    const hasCustomRange = config.minEntryFee !== undefined || config.maxEntryFee !== undefined;
    const withinCustomRange =
      hasCustomRange &&
      (config.minEntryFee === undefined || entryFee >= config.minEntryFee) &&
      (config.maxEntryFee === undefined || entryFee <= config.maxEntryFee);

    if (!isExplicitlyAllowed && !withinCustomRange) {
      throw new AppError(
        "INVALID_ENTRY_FEE",
        `Entry fee of ${entryFee} coins is not allowed for ${config.name}. Allowed: [${config.entryFees.join(", ")}]`,
        400,
      );
    }
  }

  return config;
}

/**
 * Creates match configuration snapshot for a new match.
 */
export async function createMatchConfigSnapshot(gameId: GameId, entryFee: number): Promise<MatchConfigSnapshot> {
  const config = await getGameConfig(gameId);
  return {
    gameId: config.gameId as GameId,
    name: config.name,
    entryFee,
    minPlayers: config.minPlayers,
    maxPlayers: config.maxPlayers,
    turnTimerSeconds: config.turnTimerSeconds,
    reconnectWindowSeconds: config.reconnectWindowSeconds,
    matchDurationSeconds: config.matchDurationSeconds ?? 600,
    timeoutResolution: config.timeoutResolution ?? "GAME_SPECIFIC",
    allowDraw: config.allowDraw ?? true,
    prizeMode: config.prizeMode,
    winnerPercentage: config.winnerPercentage,
    fixedPrizeAmount: config.fixedPrizeAmount,
    drawPolicy: config.drawPolicy,
    configVersion: config.configVersion,
    gameSpecificSettings: config.gameSpecificSettings ?? {},
    snapshotAt: Date.now(),
  };
}
