import type { GameId } from "@gaming-hub/shared";
import type { EngineInstance, EnginePlayer, RandomSource } from "./types";
import { SnakeLadderEngine } from "./snake-ladder/engine";
import { ChessEngine } from "./chess/engine";

/**
 * Game engines that have been migrated to the server-authoritative engine
 * contract. Every game in the registry is validated on the server.
 */
const ENGINES: Record<string, new (players: EnginePlayer[], rng?: RandomSource) => EngineInstance> = {
  "snake-ladder": SnakeLadderEngine,
  chess: ChessEngine,
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
): EngineInstance {
  const Ctor = ENGINES[gameId];
  if (!Ctor) {
    throw new Error(`Game engine for "${gameId}" is not available yet`);
  }
  return new Ctor(players, rng);
}
