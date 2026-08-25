import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  DEFAULT_GAME_CONFIGS,
  DEFAULT_GLOBAL_MATCH_SETTINGS,
  GAME_IDS,
  gameConfigSchema,
  globalMatchSettingsSchema,
  TIMEOUT_RESOLUTIONS,
  type GameConfig,
  type GameId,
  type MatchConfigSnapshot,
  type TimeoutResolution,
  type GlobalMatchSettingsConfig,
} from "@gaming-hub/shared";

describe("Global Game Time & Timeout Configuration System", () => {
  let mockGameConfigs: Record<GameId, GameConfig>;
  let mockGlobalSettings: GlobalMatchSettingsConfig;
  let mockAuditLogs: Array<{
    adminId: string;
    gameType: string;
    action: string;
    oldValue: any;
    newValue: any;
    timestamp: number;
  }>;
  let activeMatches: Map<
    string,
    {
      matchId: string;
      gameId: GameId;
      startedAt: number;
      matchDeadline: number;
      snapshot: MatchConfigSnapshot;
      status: "ACTIVE" | "COMPLETED";
    }
  >;

  beforeEach(() => {
    mockGameConfigs = JSON.parse(JSON.stringify(DEFAULT_GAME_CONFIGS));
    mockGlobalSettings = JSON.parse(JSON.stringify(DEFAULT_GLOBAL_MATCH_SETTINGS));
    mockAuditLogs = [];
    activeMatches = new Map();
  });

  // Mock service helpers
  const getGameConfig = (gameId: GameId): GameConfig => {
    return mockGameConfigs[gameId];
  };

  const updateGameConfig = (
    gameId: GameId,
    updates: Partial<GameConfig>,
    adminId: string,
    hasPermission = true,
  ): GameConfig => {
    if (!hasPermission) {
      throw new Error("FORBIDDEN: Admin lacks permission to modify game settings");
    }

    const current = mockGameConfigs[gameId];
    if (!current) {
      throw new Error(`Game ${gameId} not found`);
    }

    const nextDuration = updates.matchDurationSeconds ?? current.matchDurationSeconds ?? 600;
    if (nextDuration > mockGlobalSettings.maxMatchDurationSeconds) {
      throw new Error(`Match duration ${nextDuration}s exceeds global limit ${mockGlobalSettings.maxMatchDurationSeconds}s`);
    }
    if (nextDuration < 30) {
      throw new Error(`Match duration must be at least 30s`);
    }

    const nextTurnTimeout = updates.turnTimerSeconds ?? current.turnTimerSeconds ?? 0;
    if (nextTurnTimeout < 0 || nextTurnTimeout > 600) {
      throw new Error("Invalid turn timeout value");
    }

    const nextVersion = (current.configVersion ?? 1) + 1;
    const merged: GameConfig = {
      ...current,
      ...updates,
      configVersion: nextVersion,
      updatedAt: new Date().toISOString(),
      updatedBy: adminId,
    };

    const parsed = gameConfigSchema.safeParse(merged);
    if (!parsed.success) {
      throw new Error(`Validation failed: ${parsed.error.message}`);
    }

    mockAuditLogs.push({
      adminId,
      gameType: gameId,
      action: "GAME_CONFIG_UPDATED",
      oldValue: current,
      newValue: merged,
      timestamp: Date.now(),
    });

    mockGameConfigs[gameId] = merged;
    return merged;
  };

  const updateGlobalSettings = (
    updates: Partial<GlobalMatchSettingsConfig>,
    adminId: string,
    hasPermission = true,
  ): GlobalMatchSettingsConfig => {
    if (!hasPermission) {
      throw new Error("FORBIDDEN: Admin lacks permission to modify global match settings");
    }

    const nextMax = updates.maxMatchDurationSeconds ?? mockGlobalSettings.maxMatchDurationSeconds;
    if (nextMax > 600) {
      throw new Error("maxMatchDurationSeconds cannot exceed hard platform limit of 600s");
    }
    if (nextMax <= 0) {
      throw new Error("maxMatchDurationSeconds must be greater than 0");
    }

    const warningTimes = updates.warningTimesSeconds ?? mockGlobalSettings.warningTimesSeconds;
    for (const w of warningTimes) {
      if (w >= nextMax) {
        throw new Error(`Warning time ${w}s must be less than max match duration ${nextMax}s`);
      }
    }

    const nextVersion = (mockGlobalSettings.version ?? 1) + 1;
    const merged: GlobalMatchSettingsConfig = {
      ...mockGlobalSettings,
      ...updates,
      version: nextVersion,
      updatedAt: new Date().toISOString(),
      updatedBy: adminId,
    };

    const parsed = globalMatchSettingsSchema.safeParse(merged);
    if (!parsed.success) {
      throw new Error(`Validation failed: ${parsed.error.message}`);
    }

    mockAuditLogs.push({
      adminId,
      gameType: "SYSTEM",
      action: "MATCH_SETTINGS_UPDATED",
      oldValue: mockGlobalSettings,
      newValue: merged,
      timestamp: Date.now(),
    });

    mockGlobalSettings = merged;
    return merged;
  };

  const startMatch = (gameId: GameId, matchId: string, entryFee = 100) => {
    const config = getGameConfig(gameId);
    if (!config.enabled) {
      throw new Error(`Game ${gameId} is disabled`);
    }

    const snapshot: MatchConfigSnapshot = {
      gameId,
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
      drawPolicy: config.drawPolicy,
      configVersion: config.configVersion,
      gameSpecificSettings: config.gameSpecificSettings ?? {},
      snapshotAt: Date.now(),
    };

    const startedAt = Date.now();
    const matchDeadline = startedAt + (snapshot.matchDurationSeconds * 1000);

    const match = {
      matchId,
      gameId,
      startedAt,
      matchDeadline,
      snapshot,
      status: "ACTIVE" as const,
    };

    activeMatches.set(matchId, match);
    return match;
  };

  // 1. Default Configuration & Resolution Strategies for all 10 Games
  describe("All 10 Games Default Configuration & Typed Strategies", () => {
    const expectedResolutions: Record<GameId, TimeoutResolution> = {
      chess: "CONFIGURED_CHESS_RESOLUTION",
      carrom: "CURRENT_POINTS",
      ludo: "CURRENT_PROGRESS",
      "snake-ladder": "CURRENT_POSITION",
      "table-tennis": "CURRENT_MATCH_SCORE",
      cricket: "CURRENT_RUNS",
      "fruit-ninja": "CURRENT_SCORE",
      "snake-vs-worms": "CURRENT_SCORE",
      "bubble-shooter": "CURRENT_SCORE_PROGRESS",
      snooker: "CURRENT_FRAME_SCORE",
    };

    for (const gameId of GAME_IDS) {
      it(`configures ${gameId} with 600s max duration and ${expectedResolutions[gameId]} strategy`, () => {
        const config = DEFAULT_GAME_CONFIGS[gameId];
        expect(config).toBeDefined();
        expect(config.enabled).toBe(true);
        expect(config.matchDurationSeconds).toBe(600);
        expect(config.timeoutResolution).toBe(expectedResolutions[gameId]);
        expect(config.allowDraw).toBe(true);
        expect(config.configVersion).toBeGreaterThanOrEqual(1);
      });
    }
  });

  // 2. Global Match Duration Limits & Validation
  describe("Global Match Limit Validation", () => {
    it("reads default global match limit as 600 seconds (10 minutes)", () => {
      expect(mockGlobalSettings.maxMatchDurationSeconds).toBe(600);
      expect(mockGlobalSettings.warningTimesSeconds).toEqual([300, 120, 60, 30, 10]);
    });

    it("rejects configuring a global match duration > 600 seconds", () => {
      expect(() => {
        updateGlobalSettings({ maxMatchDurationSeconds: 700 }, "admin-1");
      }).toThrow(/cannot exceed hard platform limit/i);
    });

    it("rejects configuring a non-positive duration", () => {
      expect(() => {
        updateGlobalSettings({ maxMatchDurationSeconds: 0 }, "admin-1");
      }).toThrow(/must be greater than 0/i);
    });

    it("rejects warning times greater than or equal to the maximum match duration", () => {
      expect(() => {
        updateGlobalSettings({ maxMatchDurationSeconds: 300, warningTimesSeconds: [400, 120, 60] }, "admin-1");
      }).toThrow(/must be less than max match duration/i);
    });

    it("allows valid global settings updates and increments version", () => {
      const initialVer = mockGlobalSettings.version;
      const updated = updateGlobalSettings(
        { maxMatchDurationSeconds: 540, warningTimesSeconds: [300, 120, 60, 30, 10] },
        "admin-1",
      );
      expect(updated.maxMatchDurationSeconds).toBe(540);
      expect(updated.version).toBe(initialVer + 1);
      expect(mockAuditLogs.length).toBe(1);
      expect(mockAuditLogs[0].action).toBe("MATCH_SETTINGS_UPDATED");
    });
  });

  // 3. Game Settings Updates, RBAC, Validation & Audit
  describe("Admin Game Configuration CRUD, RBAC & Audit", () => {
    it("rejects unauthorized admin modifications", () => {
      expect(() => {
        updateGameConfig("snooker", { matchDurationSeconds: 540 }, "unauthorized-user", false);
      }).toThrow(/FORBIDDEN/i);
      expect(mockAuditLogs.length).toBe(0);
    });

    it("rejects game match duration greater than platform maximum (600s)", () => {
      expect(() => {
        updateGameConfig("snooker", { matchDurationSeconds: 650 }, "admin-1", true);
      }).toThrow(/exceeds global limit/i);
    });

    it("updates turn timeout and match duration and increments configurationVersion", () => {
      const initialVer = getGameConfig("snooker").configVersion;
      const updated = updateGameConfig(
        "snooker",
        { matchDurationSeconds: 540, turnTimerSeconds: 25 },
        "admin-1",
        true,
      );

      expect(updated.matchDurationSeconds).toBe(540);
      expect(updated.turnTimerSeconds).toBe(25);
      expect(updated.configVersion).toBe(initialVer + 1);
      expect(mockAuditLogs.length).toBe(1);
      expect(mockAuditLogs[0].gameType).toBe("snooker");
    });

    it("rejects invalid free-text winner rules (enforces strongly typed enum)", () => {
      expect(TIMEOUT_RESOLUTIONS).toContain("CURRENT_FRAME_SCORE");
      expect(TIMEOUT_RESOLUTIONS).not.toContain("arbitrary_free_text_rule");

      const invalidPayload = {
        ...DEFAULT_GAME_CONFIGS["snooker"],
        timeoutResolution: "arbitrary_rule_text" as any,
      };

      const result = gameConfigSchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);
    });
  });

  // 4. Active Match Protection (CRITICAL REQUIREMENT)
  describe("Active Match Protection & Snapshot Invariance", () => {
    it("preserves active match deadline and snapshot when admin changes game configuration", () => {
      // Step 1: Start Snooker match under initial 600s config (v1)
      const match1 = startMatch("snooker", "match-101", 100);
      const originalDeadline = match1.matchDeadline;
      const originalSnapshotVer = match1.snapshot.configVersion;
      expect(originalSnapshotVer).toBe(1);
      expect(match1.snapshot.matchDurationSeconds).toBe(600);

      // Step 2: Admin changes Snooker settings from 600s to 480s (v2)
      updateGameConfig("snooker", { matchDurationSeconds: 480 }, "admin-1", true);
      expect(getGameConfig("snooker").matchDurationSeconds).toBe(480);
      expect(getGameConfig("snooker").configVersion).toBe(2);

      // Step 3: Verify existing active match is COMPLETELY UNCHANGED
      const activeMatch = activeMatches.get("match-101")!;
      expect(activeMatch.matchDeadline).toBe(originalDeadline);
      expect(activeMatch.snapshot.matchDurationSeconds).toBe(600);
      expect(activeMatch.snapshot.configVersion).toBe(1);

      // Step 4: Start NEW match under updated configuration (v2)
      const match2 = startMatch("snooker", "match-102", 100);
      expect(match2.snapshot.matchDurationSeconds).toBe(480);
      expect(match2.snapshot.configVersion).toBe(2);
      expect(match2.matchDeadline).toBe(match2.startedAt + 480_000);
    });

    it("verifies active match protection across all 10 games", () => {
      for (const gameId of GAME_IDS) {
        // Start initial match
        const matchId1 = `active-${gameId}-1`;
        const match1 = startMatch(gameId, matchId1, 100);
        const deadline1 = match1.matchDeadline;

        // Admin updates settings for this game
        updateGameConfig(gameId, { matchDurationSeconds: 450 }, "admin-1", true);

        // Active match remains strictly invariant
        const retrieved = activeMatches.get(matchId1)!;
        expect(retrieved.matchDeadline).toBe(deadline1);
        expect(retrieved.snapshot.matchDurationSeconds).toBe(600);

        // New match adopts new 450s duration
        const matchId2 = `new-${gameId}-2`;
        const match2 = startMatch(gameId, matchId2, 100);
        expect(match2.snapshot.matchDurationSeconds).toBe(450);
        expect(match2.snapshot.configVersion).toBeGreaterThan(retrieved.snapshot.configVersion);
      }
    });
  });

  // 5. Game Disabling & Tournament Protection
  describe("Game Disabling & Availability", () => {
    it("disabling a game prevents new matches but allows active matches to continue", () => {
      // Start match while enabled
      const match = startMatch("chess", "chess-match-1", 100);
      expect(match.status).toBe("ACTIVE");

      // Admin disables Chess
      updateGameConfig("chess", { enabled: false }, "admin-1", true);
      expect(getGameConfig("chess").enabled).toBe(false);

      // Existing match continues unaffected
      expect(activeMatches.get("chess-match-1")?.status).toBe("ACTIVE");

      // New player trying to start Chess is rejected
      expect(() => {
        startMatch("chess", "chess-match-2", 100);
      }).toThrow(/disabled/i);
    });
  });

  // 6. Financial & Wallet Isolation
  describe("Financial & Entry Fee Safety", () => {
    it("changing match-time configuration does not alter entry fee or prize calculation", () => {
      const match = startMatch("cricket", "cricket-match-1", 500);
      expect(match.snapshot.entryFee).toBe(500);

      // Admin modifies timers
      updateGameConfig("cricket", { matchDurationSeconds: 420, turnTimerSeconds: 15 }, "admin-1", true);

      // Match snapshot entry fee remains untouched
      expect(activeMatches.get("cricket-match-1")?.snapshot.entryFee).toBe(500);
    });
  });
});
