import { describe, it, expect } from "vitest";
import { GAME_PLAY_CONFIGS, getGamePlayConfig, hasCompleteGameConfigs } from "../src/gameplay/gameConfigs";
import { GAME_IDS } from "@gaming-hub/shared";

describe("gameConfigs", () => {
  it("covers every registered game", () => {
    expect(hasCompleteGameConfigs()).toBe(true);
    for (const id of GAME_IDS) {
      expect(GAME_PLAY_CONFIGS[id]).toBeDefined();
      expect(GAME_PLAY_CONFIGS[id].gameId).toBe(id);
    }
  });

  it("classifies turn-based games", () => {
    for (const id of ["snake-ladder", "ludo", "chess", "carrom"] as const) {
      expect(getGamePlayConfig(id).turnBased).toBe(true);
    }
    for (const id of ["fruit-ninja", "bubble-shooter", "table-tennis", "snake-vs-worms"] as const) {
      expect(getGamePlayConfig(id).turnBased).toBe(false);
    }
  });

  it("assigns sensible timers and cooldowns", () => {
    expect(getGamePlayConfig("chess").defaultTurnTimerMs).toBe(120_000);
    expect(getGamePlayConfig("fruit-ninja").defaultMatchTimerMs).toBe(60_000);
    expect(getGamePlayConfig("table-tennis").defaultMatchTimerMs).toBe(180_000);
    expect(getGamePlayConfig("table-tennis").actionCooldownMs).toBe(15);
    expect(getGamePlayConfig("table-tennis").pauseOnDisconnect).toBe(false);
    expect(getGamePlayConfig("chess").pauseOnDisconnect).toBe(true);
    expect(getGamePlayConfig("snake-ladder").minPlayersToStart).toBeGreaterThan(0);
  });

  it("always has valid cooldowns and player counts", () => {
    for (const id of GAME_IDS) {
      const c = GAME_PLAY_CONFIGS[id];
      expect(c.actionCooldownMs).toBeGreaterThanOrEqual(0);
      expect(c.minPlayers).toBeGreaterThan(0);
      expect(c.maxPlayers).toBeGreaterThanOrEqual(c.minPlayers);
      expect(c.minPlayersToStart).toBeGreaterThanOrEqual(c.minPlayers);
      expect(c.minPlayersToStart).toBeLessThanOrEqual(c.maxPlayers);
    }
  });
});
