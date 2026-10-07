import { afterEach, describe, expect, it, vi } from 'vitest';
import { GAME_IDS, type GameId } from '@gaming-hub/shared';
import { createEngine, restoreEngineState, serializeEngineState, type GameAction } from '../src';

const participants = [{ userId: 'alice', seat: 0 }, { userId: 'bob', seat: 1 }];
const action: Record<GameId, GameAction> = {
  'snake-ladder': { type: 'roll' }, ludo: { type: 'roll' },
  chess: { type: 'move', from: 'e2', to: 'e4' },
  carrom: { type: 'place-striker', x: 400 },
  'fruit-ninja': { type: 'slice-begin', x: 1, y: 1, time: 0 }, 'bubble-shooter': { type: 'shoot', angle: -Math.PI / 2 },
  'table-tennis': { type: 'ready' }, 'snake-vs-worms': { type: 'direction', direction: 'right', sequenceNumber: 1 },
  snooker: { type: 'strike', angle: 0, power: 0.5 },
};

afterEach(() => vi.useRealTimers());
describe('versioned canonical engine checkpoint recovery', () => {
  it.each(GAME_IDS)('%s restores canonical state and absolute clocks, then continues and finishes', gameId => {
    vi.useFakeTimers(); vi.setSystemTime(1_800_000_000_000);
    const engine = createEngine(gameId, participants, () => 0.5,
      { timeControl: { baseSeconds: 180, incrementSeconds: 2, delaySeconds: 0 } });
    // Initialize state and begin clock-aware games without resetting on recovery.
    const start = engine as typeof engine & { startMatchClock?: () => void };
    start.startMatchClock?.();
    if (gameId === 'fruit-ninja') {
      const realtime = engine as typeof engine & { tick(): unknown };
      realtime.tick(); vi.advanceTimersByTime(3000); realtime.tick();
    }
    const result = engine.apply(gameId === 'fruit-ninja' ? { ...action[gameId], time: Date.now() } : action[gameId], 0);
    expect(result.ok, result.error).toBe(true);
    const checkpoint = JSON.parse(JSON.stringify(serializeEngineState(engine, participants)));
    const deadline = engine.currentClockDeadline;
    const matchDeadline = engine.currentMatchDeadline;
    vi.advanceTimersByTime(250);
    const restored = restoreEngineState(checkpoint, () => 0.5);
    expect(restored.persistenceState()).toEqual(engine.persistenceState());
    expect(restored.currentClockDeadline).toBe(deadline);
    expect(restored.currentMatchDeadline).toBe(matchDeadline);
    participants.forEach(player => expect(restored.seatOf(player.userId)).toBe(player.seat));
    expect(restored.apply({ type: 'resign' }, 1).finished).toBe(true);
    expect(restored.winnerSeats).toEqual([0]);
  });

  it('fails closed on legacy Ludo/Fruit versions and incomplete state', () => {
    for (const gameId of ['ludo', 'fruit-ninja'] as const) {
      const snapshot = serializeEngineState(createEngine(gameId, participants), participants);
      expect(() => restoreEngineState({ ...snapshot, engineVersion: 1 })).toThrow('INCOMPATIBLE_ENGINE_CHECKPOINT');
      expect(() => restoreEngineState({ ...snapshot, state: {} })).toThrow('Invalid canonical');
    }
  });
});
