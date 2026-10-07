import { describe, expect, it } from 'vitest';
import { GAME_DEFINITIONS, DEFAULT_GAME_CONFIGS } from '@gaming-hub/shared';
import { createEngine } from '../src/registry';
import { SnakeVsWormsResultAdapter } from '../src/adapters/SnakeVsWormsResultAdapter';
import { SnakeVsWormsEngine } from '../src/snake-vs-worms/engine';

const participants = (count: number) => Array.from({ length: count }, (_, seat) => ({ userId: `human-${seat}`, seat }));
describe('enabled production engine player limits', () => {
  for (const definition of GAME_DEFINITIONS) {
    it(`${definition.id} accepts minimum/maximum and rejects unsupported counts and duplicate identities`, () => {
      for (const count of [definition.minPlayers, definition.maxPlayers]) {
        const engine = createEngine(definition.id, participants(count), () => 0.5);
        expect(engine.finished).toBe(false);
        for (const player of participants(count)) expect(engine.seatOf(player.userId)).toBe(player.seat);
      }
      expect(() => createEngine(definition.id, participants(definition.minPlayers - 1))).toThrow('Invalid participants');
      expect(() => createEngine(definition.id, participants(definition.maxPlayers + 1))).toThrow('Invalid participants');
      expect(() => createEngine(definition.id, [{ userId: 'same', seat: 0 }, { userId: 'same', seat: 1 }])).toThrow('Invalid participants');
      expect(DEFAULT_GAME_CONFIGS[definition.id]).toMatchObject({ minPlayers: definition.minPlayers, maxPlayers: definition.maxPlayers });
    });
  }
  it('never awards a timeout prize to a bot and looks scores up by canonical seat', () => {
    const players = participants(8);
    const engine = new SnakeVsWormsEngine(players);
    const state = engine.getStateSnapshot();
    state.players.forEach(player => { player.score = player.playerId.startsWith('ai-') ? 9999 : player.seat === 7 ? 500 : 0; });
    state.players.reverse();
    const result = new SnakeVsWormsResultAdapter().calculateTimeLimitResult(state, players);
    expect(result).toMatchObject({ winnerSeats: [7], winnerIds: ['human-7'], isDraw: false });
    expect(result.scores['human-7']).toBe(500);
  });
});
