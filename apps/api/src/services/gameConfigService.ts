import { prisma } from "@gaming-hub/db";
import {
  AppError,
  DEFAULT_GAME_CONFIGS,
  GAME_DEFINITIONS,
  GAME_IDS,
  gameConfigSchema,
  isGameId,
  type GameConfig,
  type GameId,
  type MatchConfigSnapshot,
  type PublicGameInfo,
} from "@gaming-hub/shared";
import { audit } from "./audit";

const CACHE_TTL_MS = 10_000;
let configsCache: Record<GameId, GameConfig> | null = null;
let cacheExpiresAt = 0;

export class GameConfigService {
  /**
   * Clears the in-memory cache so subsequent reads query the latest database values.
   */
  static invalidateCache(): void {
    configsCache = null;
    cacheExpiresAt = 0;
  }

  /**
   * Retrieves all 9 centralized game configurations.
   */
  static async getAllConfigs(): Promise<Record<GameId, GameConfig>> {
    if (configsCache && Date.now() < cacheExpiresAt) {
      return configsCache;
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

    configsCache = result as Record<GameId, GameConfig>;
    cacheExpiresAt = Date.now() + CACHE_TTL_MS;
    return configsCache;
  }

  /**
   * Retrieves the current configuration for a specific game.
   */
  static async getGameConfig(gameId: GameId): Promise<GameConfig> {
    if (!isGameId(gameId)) {
      throw new AppError("NOT_FOUND", `Game '${gameId}' not found`, 404);
    }
    const all = await this.getAllConfigs();
    const config = all[gameId];
    if (!config) {
      return DEFAULT_GAME_CONFIGS[gameId];
    }
    return config;
  }

  /**
   * Returns list of games for public client display.
   */
  static async getAvailableGamesForUser(): Promise<PublicGameInfo[]> {
    const allConfigs = await this.getAllConfigs();
    const defMap = new Map(GAME_DEFINITIONS.map((g) => [g.id, g]));

    return GAME_IDS.map((id) => {
      const config = allConfigs[id] ?? DEFAULT_GAME_CONFIGS[id];
      const def = defMap.get(id);
      return {
        gameId: id,
        name: config.name,
        category: def?.category ?? "Board",
        icon: def?.icon ?? "🎮",
        enabled: config.enabled,
        onlineEnabled: config.onlineEnabled,
        minPlayers: config.minPlayers,
        maxPlayers: config.maxPlayers,
        entryFees: config.entryFees,
        defaultEntryFee: config.defaultEntryFee,
        turnTimerSeconds: config.turnTimerSeconds,
        reconnectWindowSeconds: config.reconnectWindowSeconds,
        matchDurationSeconds: config.matchDurationSeconds,
        prizeMode: config.prizeMode,
        winnerPercentage: config.winnerPercentage,
      };
    });
  }

  /**
   * Validates whether a player can join / create a match for the given game and stake.
   */
  static async validateJoin(
    gameId: GameId,
    entryFee: number,
    playerBalance?: number,
  ): Promise<{ ok: true; config: GameConfig }> {
    const config = await this.getGameConfig(gameId);

    if (!config.enabled) {
      throw new AppError(
        "GAME_DISABLED",
        `${config.name} is currently disabled by administrators. New matches cannot be created.`,
        403,
      );
    }

    if (!config.onlineEnabled) {
      throw new AppError(
        "ONLINE_DISABLED",
        `Online multiplayer mode for ${config.name} is currently disabled.`,
        403,
      );
    }

    // Validate entry fee
    if (entryFee > 0) {
      const allowed = config.entryFees.includes(entryFee);
      const withinMinMax =
        (config.minEntryFee === undefined || entryFee >= config.minEntryFee) &&
        (config.maxEntryFee === undefined || entryFee <= config.maxEntryFee);

      if (!allowed && !withinMinMax) {
        throw new AppError(
          "INVALID_ENTRY_FEE",
          `Entry fee of ${entryFee} coins is not allowed for ${config.name}. Allowed: [${config.entryFees.join(", ")}]`,
          400,
        );
      }
    }

    // Validate balance if provided
    if (playerBalance !== undefined && entryFee > 0 && playerBalance < entryFee) {
      throw new AppError(
        "INSUFFICIENT_COINS",
        `Insufficient coins: You have ${playerBalance} coins, but entry fee is ${entryFee} coins.`,
        400,
      );
    }

    return { ok: true, config };
  }

  /**
   * Creates an immutable match configuration snapshot when a match starts.
   * Active matches retain this snapshot for their lifetime.
   */
  static async createSnapshot(
    gameId: GameId,
    entryFee: number,
  ): Promise<MatchConfigSnapshot> {
    const config = await this.getGameConfig(gameId);
    return {
      gameId: config.gameId as GameId,
      name: config.name,
      entryFee,
      minPlayers: config.minPlayers,
      maxPlayers: config.maxPlayers,
      turnTimerSeconds: config.turnTimerSeconds,
      reconnectWindowSeconds: config.reconnectWindowSeconds,
      matchDurationSeconds: config.matchDurationSeconds,
      prizeMode: config.prizeMode,
      winnerPercentage: config.winnerPercentage,
      fixedPrizeAmount: config.fixedPrizeAmount,
      drawPolicy: config.drawPolicy,
      configVersion: config.configVersion,
      gameSpecificSettings: config.gameSpecificSettings ?? {},
      snapshotAt: Date.now(),
    };
  }

  /**
   * Calculates pot, prize pool, winner payouts, and draw refunds based on the match snapshot.
   */
  static calculatePrizeSettlement(
    snapshot: MatchConfigSnapshot,
    playerCount: number,
    winnerIds: string[],
  ): {
    totalPot: number;
    prizePool: number;
    winnerPayout: number;
    refundPerPlayer: number;
    isDraw: boolean;
  } {
    const isDraw = winnerIds.length === 0;
    const totalPot = snapshot.entryFee * playerCount;

    if (isDraw) {
      if (snapshot.drawPolicy === "REFUND_ENTRY") {
        return {
          totalPot,
          prizePool: 0,
          winnerPayout: 0,
          refundPerPlayer: snapshot.entryFee,
          isDraw: true,
        };
      } else if (snapshot.drawPolicy === "SPLIT_POT") {
        const splitAmount = playerCount > 0 ? Math.floor(totalPot / playerCount) : 0;
        return {
          totalPot,
          prizePool: totalPot,
          winnerPayout: 0,
          refundPerPlayer: splitAmount,
          isDraw: true,
        };
      } else {
        // NO_PRIZE
        return {
          totalPot,
          prizePool: 0,
          winnerPayout: 0,
          refundPerPlayer: 0,
          isDraw: true,
        };
      }
    }

    // Win case
    let prizePool = totalPot;
    if (snapshot.prizeMode === "WINNER_TAKES_POT") {
      prizePool = totalPot;
    } else if (snapshot.prizeMode === "WINNER_PERCENTAGE") {
      const pct = typeof snapshot.winnerPercentage === "number" ? snapshot.winnerPercentage : 90;
      prizePool = Math.round(totalPot * (pct / 100));
    } else if (snapshot.prizeMode === "FIXED_PRIZE") {
      prizePool = snapshot.fixedPrizeAmount ?? totalPot;
    } else if (snapshot.prizeMode === "DRAW_REFUND") {
      prizePool = totalPot;
    }

    const winnerCount = Math.max(1, winnerIds.length);
    const winnerPayout = Math.round(prizePool / winnerCount);

    return {
      totalPot,
      prizePool,
      winnerPayout,
      refundPerPlayer: 0,
      isDraw: false,
    };
  }

  /**
   * Updates game configuration, increments configVersion, writes audit log, and invalidates cache.
   */
  static async updateGameConfig(
    gameId: GameId,
    updates: Partial<GameConfig>,
    adminId: string,
  ): Promise<GameConfig> {
    if (!isGameId(gameId)) {
      throw new AppError("NOT_FOUND", `Game '${gameId}' not found`, 404);
    }

    const currentConfig = await this.getGameConfig(gameId);

    // Merge and increment configVersion
    const nextVersion = (currentConfig.configVersion ?? 1) + 1;
    const candidate = {
      ...currentConfig,
      ...updates,
      gameId,
      configVersion: nextVersion,
      updatedAt: new Date().toISOString(),
      updatedBy: adminId,
    };

    // Validate with zod schema
    const parseResult = gameConfigSchema.safeParse(candidate);
    if (!parseResult.success) {
      const issue = parseResult.error.issues[0];
      throw new AppError(
        "VALIDATION_ERROR",
        `Invalid game configuration: ${issue?.path.join(".") || "field"} - ${issue?.message || "invalid value"}`,
        422,
      );
    }

    const validatedConfig = parseResult.data as GameConfig;

    // Persist to SiteSetting
    const key = `game_config.${gameId}`;
    await prisma.siteSetting.upsert({
      where: { key },
      create: {
        key,
        category: "game_config",
        value: validatedConfig as object,
        secret: false,
        updatedBy: adminId,
      },
      update: {
        value: validatedConfig as object,
        updatedBy: adminId,
      },
    });

    // Write audit log
    const actions: string[] = ["GAME_CONFIG_UPDATED"];
    if (updates.enabled !== undefined && updates.enabled !== currentConfig.enabled) {
      actions.push(updates.enabled ? "GAME_ENABLED" : "GAME_DISABLED");
    }
    if (updates.onlineEnabled !== undefined && updates.onlineEnabled !== currentConfig.onlineEnabled) {
      actions.push(updates.onlineEnabled ? "ONLINE_ENABLED" : "ONLINE_DISABLED");
    }
    if (updates.entryFees !== undefined && JSON.stringify(updates.entryFees) !== JSON.stringify(currentConfig.entryFees)) {
      actions.push("ENTRY_FEE_CHANGED");
    }
    if (updates.turnTimerSeconds !== undefined && updates.turnTimerSeconds !== currentConfig.turnTimerSeconds) {
      actions.push("TURN_TIMER_CHANGED");
    }
    if (updates.prizeMode !== undefined || updates.winnerPercentage !== undefined) {
      actions.push("PRIZE_CONFIG_CHANGED");
    }

    for (const action of actions) {
      audit({
        actorType: "user",
        actorId: adminId,
        action,
        category: "game",
        targetType: "game_config",
        targetId: gameId,
        meta: {
          gameId,
          oldConfig: currentConfig,
          newConfig: validatedConfig,
          configVersion: nextVersion,
        },
      });
    }

    // Invalidate Cache
    this.invalidateCache();

    return validatedConfig;
  }

  /**
   * Helper to enable or disable game.
   */
  static async setGameEnabled(gameId: GameId, enabled: boolean, adminId: string): Promise<GameConfig> {
    return this.updateGameConfig(gameId, { enabled }, adminId);
  }

  /**
   * Helper to enable or disable online mode.
   */
  static async setOnlineEnabled(gameId: GameId, onlineEnabled: boolean, adminId: string): Promise<GameConfig> {
    return this.updateGameConfig(gameId, { onlineEnabled }, adminId);
  }
}
