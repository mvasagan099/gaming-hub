import { describe, expect, it } from 'vitest';
import { createEngine } from '../src';

describe.each(['ludo', 'snake-ladder'] as const)('%s authoritative turn clocks', game => {
  function fixture(random = 0.5) {
    let now = 1000;
    const engine = createEngine(game, [{ userId: 'a', seat: 0 }, { userId: 'b', seat: 1 }], () => random,
      { now: () => now, turnTimer: { turnDurationMs: 30000, warningThresholdMs: 5000 } });
    engine.serialize();
    return { engine, advance: (ms: number) => { now += ms; } };
  }
  it('arms the first turn and gives the next player a full configured turn', () => {
    const { engine, advance } = fixture();
    expect(engine.currentClockDeadline).toBe(31000);
    advance(5000);
    expect(engine.apply({ type: 'roll' }, 0).ok).toBe(true);
    expect(engine.state.currentSeat).toBe(1);
    expect(engine.currentClockDeadline).toBe(36000);
  });
  it('does not reset a clock for an invalid player action', () => {
    const { engine, advance } = fixture();
    advance(5000);
    expect(engine.apply({ type: 'roll' }, 1).ok).toBe(false);
    expect(engine.currentClockDeadline).toBe(31000);
  });
  it('resolves the configured first-turn timeout without a player move', () => {
    const { engine, advance } = fixture();
    advance(30000);
    const result = engine.handleTimeout!('turn', 0);
    if (game === 'ludo') {
      // Preserve Ludo's existing automatic roll on inactivity.
      expect(result).toMatchObject({ ok: true, finished: false });
      expect(engine.state.currentSeat).toBe(1);
      expect(engine.currentClockDeadline).toBe(61000);
    } else {
      expect(result).toMatchObject({ ok: true, finished: true, winnerSeats: [1] });
      expect(engine.currentClockDeadline).toBeNull();
    }
  });
  it('restarts the clock on a legal six bonus turn', () => {
    const { engine, advance } = fixture(0.99);
    advance(5000);
    expect(engine.apply({ type: 'roll' }, 0).ok).toBe(true);
    expect(engine.state.currentSeat).toBe(0);
    expect(engine.currentClockDeadline).toBe(36000);
  });
  if (game === 'ludo') it('keeps one budget for rolling and choosing a token, then starts the next turn', () => {
    const { engine, advance } = fixture();
    const state = engine.persistenceState();
    const players = state.players as unknown as Array<{ tokens: Array<{ state: string; position: number }> }>;
    players[0]!.tokens[0]!.state = 'active'; players[0]!.tokens[0]!.position = 0;
    players[0]!.tokens[1]!.state = 'active'; players[0]!.tokens[1]!.position = 2;
    engine.restoreState(state);
    advance(5000);
    expect(engine.apply({ type: 'roll' }, 0).ok).toBe(true);
    expect(engine.state.phase).toBe('selecting');
    expect(engine.currentClockDeadline).toBe(31000);
    advance(2000);
    const tokenId = (engine.state.legalMoves as string[])[0]!;
    expect(engine.apply({ type: 'move', tokenId }, 0).ok).toBe(true);
    expect(engine.state.currentSeat).toBe(1);
    expect(engine.currentClockDeadline).toBe(38000);
  });
});
