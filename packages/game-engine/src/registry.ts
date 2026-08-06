import type { GameId } from "@gaming-hub/shared";
import type { EngineInstance, EngineOptions, EnginePlayer, RandomSource } from "./types";
import { SnakeLadderEngine } from "./snake-ladder/engine";
import { ChessEngine } from "./chess/engine";
import { LudoEngine } from "./ludo/engine";
import { BubbleShooterEngine } from "./bubble-shooter/engine";

/**
 * Game engines that have been migrated to the server-authoritative engine
 * contract. Every game in the registry is validated on the server.
 *
 * The options slot is typed `never` so each engine keeps its own constructor
 * signature; `createEngine` forwards the shared `EngineOptions` (only chess
 * reads it today) through a narrow cast.
 */
type EngineConstructor = new (
  players: EnginePlayer[],
  rng?: RandomSource,
  options?: never,
) => EngineInstance;

const ENGINES: Record<string, EngineConstructor> = {
  "snake-ladder": SnakeLadderEngine,
  chess: ChessEngine,
  ludo: LudoEngine,
  "bubble-shooter": BubbleShooterEngine,
};

export function isGameEngineAvailable(gameId: GameId): boolean {
  return gameId in ENGINES;
}

export function getEngineAvailability(): Record<GameId, boolean> {
  return Object.fromEntries(
    Object.keys(ENGINES).map((id) => [id, true]),
  ) as unknown as Record<GameId, boolean>;
}

export function createEngine(
  gameId: GameId,
  players: EnginePlayer[],
  rng?: RandomSource,
  options?: EngineOptions,
): EngineInstance {
  const Ctor = ENGINES[gameId];
  if (!Ctor) {
    throw new Error(`Game engine for "${gameId}" is not available yet`);
  }
  return new Ctor(players, rng, options as never);
}
