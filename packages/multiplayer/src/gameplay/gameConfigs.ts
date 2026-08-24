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
  carrom: baseConfig("carrom", {
    // Carrom's natural input is a rapid sequence: slider positioning ticks, a
    // confirm tap and a quick flick to shoot. A nonzero cooldown rejects these
    // legitimate bursts ("Action too frequent"), so the shot never reaches the
    // engine, the striker snaps back and the turn appears stuck. The engine
    // already validates every action, so 0 disables the framework-level gate.
    actionCooldownMs: 0,
  }),
  "fruit-ninja": baseConfig("fruit-ninja", {
    // The client streams blade samples (begin/move/end) during a swipe; a
    // non-zero framework cooldown would drop legitimate bursts before the
    // engine ever validates them. The engine is the authority on slices.
    actionCooldownMs: 0,
    defaultMatchTimerMs: 60_000,
    pauseOnDisconnect: false,
  }),
  "bubble-shooter": baseConfig("bubble-shooter", {
    actionCooldownMs: 100,
    defaultMatchTimerMs: 180_000,
    pauseOnDisconnect: false,
  }),
  "table-tennis": baseConfig("table-tennis", {
    actionCooldownMs: 15,
    pauseOnDisconnect: false,
  }),
  "snake-vs-worms": baseConfig("snake-vs-worms", {
    actionCooldownMs: 0,
    defaultMatchTimerMs: 180_000,
    pauseOnDisconnect: false,
  }),
  snooker: baseConfig("snooker", {
    defaultTurnTimerMs: 20_000,
    actionCooldownMs: 0,
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
