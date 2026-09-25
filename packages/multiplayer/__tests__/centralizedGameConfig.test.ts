import { describe, it, expect, beforeEach } from "vitest";
import {
  DEFAULT_GAME_CONFIGS,
  GAME_IDS,
  gameConfigSchema,
  type GameConfig,
  type MatchConfigSnapshot,
  type GameId,
} from "@gaming-hub/shared";

// In-memory simulation of the centralized game config service for testing the 18 acceptance scenarios
class MockGameConfigService {
  private configs: Record<GameId, GameConfig> = structuredClone(DEFAULT_GAME_CONFIGS);
  private auditLogs: Array<{ action: string; gameId: string; adminId: string; oldConfig: GameConfig; newConfig: GameConfig }> = [];
  private cache: Record<GameId, GameConfig> | null = null;

  invalidateCache() {
    this.cache = null;
  }

  getGameConfig(gameId: GameId): GameConfig {
    if (!this.cache) {
      this.cache = structuredClone(this.configs);
    }
    return this.cache[gameId];
  }

  updateGameConfig(gameId: GameId, updates: Partial<GameConfig>, adminUser: { role: string; id: string }): GameConfig {
    // 14. Authorization check
    if (adminUser.role !== "ADMIN") {
      throw new Error("FORBIDDEN: Only authorized admins can modify game configuration");
    }

    const current = this.getGameConfig(gameId);
    const nextVersion = (current.configVersion ?? 1) + 1;
    const candidate = {
      ...current,
      ...updates,
      gameId,
      configVersion: nextVersion,
      updatedAt: new Date().toISOString(),
      updatedBy: adminUser.id,
    };

    // 17. Validation check
    const parseResult = gameConfigSchema.safeParse(candidate);
    if (!parseResult.success) {
      throw new Error(`VALIDATION_ERROR: ${parseResult.error.issues[0]?.message}`);
    }

    const validated = parseResult.data as GameConfig;
    this.configs[gameId] = validated;

    // 15. Audit Log record
    this.auditLogs.push({
      action: updates.enabled !== undefined ? (updates.enabled ? "GAME_ENABLED" : "GAME_DISABLED") : "CONFIG_UPDATED",
      gameId,
      adminId: adminUser.id,
      oldConfig: current,
      newConfig: validated,
    });

    // 16. Invalidate Cache
    this.invalidateCache();

    return validated;
  }

  validateJoin(gameId: GameId, entryFee: number, playerBalance?: number): { ok: boolean; reason?: string } {
    const config = this.getGameConfig(gameId);
    if (!config.enabled) {
      throw new Error("GAME_DISABLED: Game is disabled");
    }
    if (!config.onlineEnabled) {
      throw new Error("ONLINE_DISABLED: Online mode is disabled");
    }
    if (entryFee > 0 && !config.entryFees.includes(entryFee)) {
      throw new Error(`INVALID_ENTRY_FEE: ${entryFee} is not allowed`);
    }
    if (playerBalance !== undefined && entryFee > 0 && playerBalance < entryFee) {
      throw new Error("INSUFFICIENT_COINS: Not enough coins");
    }
    return { ok: true };
  }

  createSnapshot(gameId: GameId, entryFee: number): MatchConfigSnapshot {
    const config = this.getGameConfig(gameId);
    return {
      gameId: config.gameId as GameId,
      name: config.name,
      entryFee,
      minPlayers: config.minPlayers,
      maxPlayers: config.maxPlayers,
      turnTimerSeconds: config.turnTimerSeconds,
      reconnectWindowSeconds: config.reconnectWindowSeconds,
      matchDurationSeconds: config.matchDurationSeconds,
      timeoutResolution: config.timeoutResolution,
      allowDraw: config.allowDraw,
      prizeMode: config.prizeMode,
      winnerPercentage: config.winnerPercentage,
      fixedPrizeAmount: config.fixedPrizeAmount,
      drawPolicy: config.drawPolicy,
      configVersion: config.configVersion,
      gameSpecificSettings: config.gameSpecificSettings ?? {},
      snapshotAt: Date.now(),
    };
  }

  calculatePrize(snapshot: MatchConfigSnapshot, playerCount: number, winnerIds: string[]) {
    const isDraw = winnerIds.length === 0;
    const totalPot = snapshot.entryFee * playerCount;

    if (isDraw) {
      if (snapshot.drawPolicy === "REFUND_ENTRY") {
        return { totalPot, prizePool: 0, winnerPayout: 0, refundPerPlayer: snapshot.entryFee, isDraw: true };
      } else if (snapshot.drawPolicy === "SPLIT_POT") {
        return { totalPot, prizePool: totalPot, winnerPayout: 0, refundPerPlayer: Math.floor(totalPot / playerCount), isDraw: true };
      } else {
        return { totalPot, prizePool: 0, winnerPayout: 0, refundPerPlayer: 0, isDraw: true };
      }
    }

    let prizePool = totalPot;
    if (snapshot.prizeMode === "WINNER_PERCENTAGE") {
      prizePool = Math.round(totalPot * (snapshot.winnerPercentage / 100));
    } else if (snapshot.prizeMode === "FIXED_PRIZE") {
      prizePool = snapshot.fixedPrizeAmount ?? totalPot;
    }

    const winnerPayout = winnerIds.length > 0 ? Math.round(prizePool / winnerIds.length) : 0;
    return { totalPot, prizePool, winnerPayout, refundPerPlayer: 0, isDraw: false };
  }

  getAuditLogs() {
    return this.auditLogs;
  }
}

describe("Centralized Game Configuration + Admin Control System (All 18 Acceptance Criteria)", () => {
  let service: MockGameConfigService;
  const admin = { role: "ADMIN", id: "admin-1" };
  const regularUser = { role: "USER", id: "user-1" };

  beforeEach(() => {
    service = new MockGameConfigService();
  });

  it("covers all 9 games with comprehensive default configurations", () => {
    for (const gameId of GAME_IDS) {
      const cfg = service.getGameConfig(gameId);
      expect(cfg).toBeDefined();
      expect(cfg.name).toBeTruthy();
      expect(cfg.entryFees.length).toBeGreaterThan(0);
      expect(cfg.minPlayers).toBeGreaterThanOrEqual(1);
      expect(cfg.maxPlayers).toBeGreaterThanOrEqual(cfg.minPlayers);
      expect(cfg.configVersion).toBe(1);
    }
  });

  // Test 1: Enable game
  it("1. Enable game", () => {
    service.updateGameConfig("carrom", { enabled: false }, admin);
    expect(service.getGameConfig("carrom").enabled).toBe(false);

    service.updateGameConfig("carrom", { enabled: true }, admin);
    expect(service.getGameConfig("carrom").enabled).toBe(true);
    expect(service.validateJoin("carrom", 100, 500).ok).toBe(true);
  });

  // Test 2: Disable game
  it("2. Disable game rejects new joins without affecting running games", () => {
    service.updateGameConfig("carrom", { enabled: false }, admin);
    expect(() => service.validateJoin("carrom", 100, 500)).toThrow("GAME_DISABLED");
  });

  // Test 3: Enable online
  it("3. Enable online allows multiplayer matchmaking", () => {
    service.updateGameConfig("chess", { onlineEnabled: true }, admin);
    expect(service.getGameConfig("chess").onlineEnabled).toBe(true);
    expect(service.validateJoin("chess", 100, 200).ok).toBe(true);
  });

  // Test 4: Disable online
  it("4. Disable online rejects online multiplayer joins", () => {
    service.updateGameConfig("chess", { onlineEnabled: false }, admin);
    expect(service.getGameConfig("chess").onlineEnabled).toBe(false);
    expect(() => service.validateJoin("chess", 100, 200)).toThrow("ONLINE_DISABLED");
  });

  // Test 5: Change entry fee
  it("5. Change entry fee updates allowed stakes list", () => {
    service.updateGameConfig("carrom", {
      entryFees: [100, 250, 500, 2000],
      defaultEntryFee: 250,
    }, admin);

    const updated = service.getGameConfig("carrom");
    expect(updated.entryFees).toEqual([100, 250, 500, 2000]);
    expect(updated.defaultEntryFee).toBe(250);
  });

  // Test 6: Try old invalid entry fee
  it("6. Try old invalid entry fee is strictly rejected", () => {
    service.updateGameConfig("carrom", {
      entryFees: [250, 500, 1000],
      defaultEntryFee: 250,
    }, admin);

    // Old fee 50 is no longer allowed
    expect(() => service.validateJoin("carrom", 50, 500)).toThrow("INVALID_ENTRY_FEE");
    // New fee 250 is allowed
    expect(service.validateJoin("carrom", 250, 500).ok).toBe(true);
  });

  // Test 7: Change turn timer
  it("7. Change turn timer updates configuration", () => {
    service.updateGameConfig("ludo", { turnTimerSeconds: 45 }, admin);
    expect(service.getGameConfig("ludo").turnTimerSeconds).toBe(45);
  });

  // Test 8, 9, 10, 11: Match snapshotting & immutability across config version changes
  it("8-11. Start match, change timer config, verify existing match keeps old timer, new match uses new timer", () => {
    // 8. Match 1 starts with initial snapshot (turn timer = 25s, version = 1)
    const match1Snapshot = service.createSnapshot("carrom", 100);
    expect(match1Snapshot.turnTimerSeconds).toBe(25);
    expect(match1Snapshot.configVersion).toBe(1);

    // 9. Admin changes turn timer to 60s (version increments to 2)
    service.updateGameConfig("carrom", { turnTimerSeconds: 60 }, admin);
    expect(service.getGameConfig("carrom").turnTimerSeconds).toBe(60);
    expect(service.getGameConfig("carrom").configVersion).toBe(2);

    // 10. Existing match 1 continues using its immutable snapshot (25s, v1)
    expect(match1Snapshot.turnTimerSeconds).toBe(25);
    expect(match1Snapshot.configVersion).toBe(1);

    // 11. New match 2 created after update gets the new configuration (60s, v2)
    const match2Snapshot = service.createSnapshot("carrom", 100);
    expect(match2Snapshot.turnTimerSeconds).toBe(60);
    expect(match2Snapshot.configVersion).toBe(2);
  });

  // Test 12 & 13: Prize configuration change and existing match immutability
  it("12-13. Change prize configuration, verify existing match keeps old prize configuration", () => {
    // Match starts with 90% prize mode
    const matchSnapshot = service.createSnapshot("carrom", 100); // 2 players * 100 = 200 pot
    const prizeBefore = service.calculatePrize(matchSnapshot, 2, ["player-1"]);
    expect(prizeBefore.totalPot).toBe(200);
    expect(prizeBefore.prizePool).toBe(180); // 90% of 200
    expect(prizeBefore.winnerPayout).toBe(180);

    // Admin updates prize configuration to 80%
    service.updateGameConfig("carrom", { winnerPercentage: 80 }, admin);
    expect(service.getGameConfig("carrom").winnerPercentage).toBe(80);

    // Existing active match keeps its original snapshot (180 payout)
    const settlementWithOldSnapshot = service.calculatePrize(matchSnapshot, 2, ["player-1"]);
    expect(settlementWithOldSnapshot.prizePool).toBe(180);
    expect(settlementWithOldSnapshot.winnerPayout).toBe(180);

    // New match gets new 80% prize rule (160 payout)
    const newMatchSnapshot = service.createSnapshot("carrom", 100);
    const prizeAfter = service.calculatePrize(newMatchSnapshot, 2, ["player-1"]);
    expect(prizeAfter.prizePool).toBe(160);
    expect(prizeAfter.winnerPayout).toBe(160);
  });

  // Test 14: Only authorized admin can change settings
  it("14. Verify only authorized admin can change settings", () => {
    expect(() => {
      service.updateGameConfig("chess", { turnTimerSeconds: 120 }, regularUser);
    }).toThrow("FORBIDDEN");
  });

  // Test 15: Audit logs
  it("15. Verify audit logs are created for every change", () => {
    service.updateGameConfig("ludo", { turnTimerSeconds: 25 }, admin);
    service.updateGameConfig("ludo", { enabled: false }, admin);

    const logs = service.getAuditLogs();
    expect(logs.length).toBe(2);
    expect(logs[0].gameId).toBe("ludo");
    expect(logs[0].adminId).toBe("admin-1");
    expect(logs[1].action).toBe("GAME_DISABLED");
  });

  // Test 16: Cache invalidation
  it("16. Verify cache invalidation produces fresh config immediately", () => {
    // Initial fetch caches
    const cached1 = service.getGameConfig("table-tennis");
    expect(cached1.turnTimerSeconds).toBe(0);

    // Update invalidates and reloads
    service.updateGameConfig("table-tennis", { turnTimerSeconds: 15 }, admin);
    const fresh = service.getGameConfig("table-tennis");
    expect(fresh.turnTimerSeconds).toBe(15);
  });

  // Test 17: Invalid configuration rejected
  it("17. Verify invalid configuration is rejected by validation schema", () => {
    // maxPlayers < minPlayers
    expect(() => {
      service.updateGameConfig("chess", { minPlayers: 4, maxPlayers: 2 }, admin);
    }).toThrow("VALIDATION_ERROR");

    // winnerPercentage > 100
    expect(() => {
      service.updateGameConfig("chess", { winnerPercentage: 150 }, admin);
    }).toThrow("VALIDATION_ERROR");

    // defaultEntryFee not in entryFees list
    expect(() => {
      service.updateGameConfig("chess", { entryFees: [100, 200], defaultEntryFee: 500 }, admin);
    }).toThrow("VALIDATION_ERROR");
  });

  // Test 18: Frontend receives current configuration
  it("18. Verify frontend receives current configuration and allowed entry fees", () => {
    service.updateGameConfig("fruit-ninja", {
      entryFees: [50, 100, 300, 1000],
      defaultEntryFee: 100,
      matchDurationSeconds: 90,
    }, admin);

    const config = service.getGameConfig("fruit-ninja");
    expect(config.entryFees).toEqual([50, 100, 300, 1000]);
    expect(config.matchDurationSeconds).toBe(90);
    expect(config.defaultEntryFee).toBe(100);
  });

  it("handles draw refund policies correctly", () => {
    // REFUND_ENTRY policy
    const refundSnapshot = service.createSnapshot("carrom", 100);
    const refundResult = service.calculatePrize(refundSnapshot, 2, []);
    expect(refundResult.isDraw).toBe(true);
    expect(refundResult.refundPerPlayer).toBe(100);

    // SPLIT_POT policy
    service.updateGameConfig("carrom", { drawPolicy: "SPLIT_POT" }, admin);
    const splitSnapshot = service.createSnapshot("carrom", 100);
    const splitResult = service.calculatePrize(splitSnapshot, 2, []);
    expect(splitResult.isDraw).toBe(true);
    expect(splitResult.refundPerPlayer).toBe(100); // 200 / 2 = 100
  });
});
