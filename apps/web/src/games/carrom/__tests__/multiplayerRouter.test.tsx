import { describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ mySeat: null as number | null, isSpectator: false, room: { players: [{ seat: 0, displayName: 'White' }, { seat: 1, displayName: 'Black' }] } }));
vi.mock('../../../store/multiplayerStore', () => ({ useMultiplayerStore: (select: any) => select(state) }));
vi.mock('../CarromMultiplayer', () => ({ default: () => null }));
import { CarromGame } from '../CarromGame';
describe('Carrom routing authority', () => {
  it.each([null, 0, 1])('never converts spectator seat %s into participant authority', seat => {
    state.mySeat = seat; state.isSpectator = true;
    const child = CarromGame({ mode: 'multiplayer', stake: 0, onBack: vi.fn() }) as any;
    expect(child.props.mySeat).toBeNull();
  });
  it.each([null, 0, 1])('preserves the assigned participant seat %s including pending assignment', seat => {
    state.mySeat = seat; state.isSpectator = false;
    const child = CarromGame({ mode: 'multiplayer', stake: 0, onBack: vi.fn() }) as any;
    expect(child.props.mySeat).toBe(seat);
  });
});
