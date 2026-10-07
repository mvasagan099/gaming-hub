import { getGameDefinition, type GameId, type JsonObject } from '@gaming-hub/shared';
import { createEngine } from './registry';
import { secureRandomSource } from './rng';
import type { EngineInstance, EngineOptions, EnginePlayer, RandomSource } from './types';

// Increment a game's version whenever canonical state/rule interpretation changes.
export const ENGINE_STATE_VERSIONS: Record<GameId, number> = {
  'snake-ladder': 1, ludo: 2, chess: 1, carrom: 1, 'fruit-ninja': 2,
  'bubble-shooter': 1, 'table-tennis': 1, 'snake-vs-worms': 1, snooker: 1,
};
export interface EngineCheckpoint {
  schemaVersion: 1;
  gameId: GameId;
  engineVersion: number;
  participants: EnginePlayer[];
  state: JsonObject;
  options: JsonObject;
}

const requiredFields: Record<GameId, string[]> = {
  'snake-ladder': ['players', 'phase', 'dice', 'logs'],
  ludo: ['players', 'phase', 'dice', 'legalMoves', 'logs'],
  chess: ['fen', 'history', 'players', 'clocks', 'timeControl', 'whitePlayerId', 'blackPlayerId'],
  carrom: ['coins', 'players'],
  'fruit-ninja': ['players', 'targets', 'spawnQueue', 'blades', 'phase'],
  'bubble-shooter': ['players', 'turnCount', 'result'],
  'table-tennis': ['players', 'ball', 'phase', 'rules'],
  'snake-vs-worms': ['players', 'food'],
  snooker: ['players', 'balls', 'turnStartedAtMs'],
};

export function serializeEngineState(engine: EngineInstance, participants: EnginePlayer[]): EngineCheckpoint {
  return { schemaVersion: 1, gameId: engine.gameId, engineVersion: ENGINE_STATE_VERSIONS[engine.gameId],
    participants: structuredClone(participants), state: engine.persistenceState(), options: engine.persistenceOptions() };
}

export function restoreEngineState(checkpoint: EngineCheckpoint, rng: RandomSource = secureRandomSource(), now?: () => number): EngineInstance {
  if (!checkpoint || checkpoint.schemaVersion !== 1 || !requiredFields[checkpoint.gameId] ||
      checkpoint.engineVersion !== ENGINE_STATE_VERSIONS[checkpoint.gameId]) {
    throw new Error('INCOMPATIBLE_ENGINE_CHECKPOINT: drain/cancel/refund through the API; never reinterpret legacy state');
  }
  const definition = getGameDefinition(checkpoint.gameId);
  if (!Array.isArray(checkpoint.participants) || checkpoint.participants.length < definition.minPlayers ||
      checkpoint.participants.length > definition.maxPlayers) throw new Error('Invalid checkpoint participants');
  const state = checkpoint.state;
  if (!state || typeof state !== 'object' || typeof state.finished !== 'boolean' ||
      !Array.isArray(state.winnerSeats) || typeof state.currentSeat !== 'number' ||
      requiredFields[checkpoint.gameId].some(key => !(key in state))) throw new Error('Invalid canonical checkpoint state');
  // Constructor validation checks distinct identity and canonical seats. Inject the
  // current wall clock; persisted absolute deadlines are deliberately not reset.
  const engine = createEngine(checkpoint.gameId, checkpoint.participants, rng,
    { ...checkpoint.options, ...(now ? { now } : {}) } as EngineOptions);
  engine.restoreState(state);
  if (checkpoint.gameId === 'snooker') {
    const epoch = checkpoint.options.persistedMatchStartedAtMs;
    if (typeof epoch !== 'number' || !Number.isFinite(epoch)) throw new Error('Missing Snooker match epoch');
    (engine as EngineInstance & { restoreMatchEpoch(epoch: number): void }).restoreMatchEpoch(epoch);
  }
  return engine;
}
