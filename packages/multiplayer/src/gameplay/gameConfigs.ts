/**
 * Per-game configuration for the server-authoritative gameplay framework.
 *
 * Every game in the shared registry is described exactly once so the
 * MatchManager, TurnManager, ActionValidator and disconnect handlers can make
 * uniform decisions (turn gating, cooldowns, timers, forfeit policy) without
 * game-specific branches.
 */

import { GAME_IDS, getGameDefinition, type GameId } from "@gaming-hub/shared";
import type { GamePlayConfig } from "./types";

function baseConfig(gameId: GameId, overrides: Partial<GamePlayConfig>): GamePlayConfig {
  const def = getGameDefinition(gameId);
  const turnBased = def.mode === "turn-based";
  return {
    gameId,
    mode: def.mode,
    turnBased,
    minPlayers: def.minPlayers,
    maxPlayers: def.maxPlayers,
    minPlayersToStart: def.minPlayers,
    actionCooldownMs: turnBased ? 150 : 50,
    pauseOnDisconnect: turnBased,
    forfeitOnDisconnect: true,
    defaultTurnTimerMs: turnBased ? 30_000 : 0,
    defaultMatchTimerMs: 0,
    ...overrides,
  };
}

export const GAME_PLAY_CONFIGS: Record<GameId, GamePlayConfig> = {
  "snake-ladder": baseConfig("snake-ladder", {}),
  ludo: baseConfig("ludo", {}),
  chess: baseConfig("chess", { defaultTurnTimerMs: 120_000 }),
  cricket: baseConfig("cricket", {}),
  carrom: baseConfig("carrom", {}),
  "fruit-ninja": baseConfig("fruit-ninja", {
    actionCooldownMs: 100,
    defaultMatchTimerMs: 90_000,
    pauseOnDisconnect: false,
  }),
  "bubble-shooter": baseConfig("bubble-shooter", {
    actionCooldownMs: 100,
    defaultMatchTimerMs: 120_000,
    pauseOnDisconnect: false,
  }),
  "table-tennis": baseConfig("table-tennis", {
    actionCooldownMs: 20,
    pauseOnDisconnect: false,
  }),
  "snake-vs-worms": baseConfig("snake-vs-worms", {
    actionCooldownMs: 50,
    defaultMatchTimerMs: 180_000,
    pauseOnDisconnect: false,
  }),
};

/** Returns the gameplay config for a game id. */
export function getGamePlayConfig(gameId: GameId): GamePlayConfig {
  return GAME_PLAY_CONFIGS[gameId];
}

/** True when every registered game has a gameplay config. */
export function hasCompleteGameConfigs(): boolean {
  return GAME_IDS.every((id) => id in GAME_PLAY_CONFIGS);
}
