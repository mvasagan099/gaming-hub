import { describe, expect, it, vi } from 'vitest';
import { CarromEngine } from '@gaming-hub/game-engine';
import { registerCarromPreviewHandler } from '../../../apps/socket-server/src/carromHandlers';

function setup() {
  let receive!: (payload: any) => void;
  const state = new CarromEngine([{ seat: 0, userId: 'host' }, { seat: 1, userId: 'guest' }]).state;
  const room = { id: 'room', ioName: 'room:room', config: { gameId: 'carrom' }, status: 'playing',
    match: { matchId: 'match', engine: { state } }, players: new Map([['host', { seat: 0, isSpectator: false }]]) };
  const emit = vi.fn();
  registerCarromPreviewHandler({ on: (_: string, callback: any) => { receive = callback; } } as any,
    { to: () => ({ emit }) } as any, { roomManager: { getRoom: () => room, getPlayerRoom: () => room } } as any, 'host');
  const send = (overrides: any = {}) => receive({ roomId: 'room', matchId: room.match.matchId, turnNumber: state.turnNumber, sequence: 1, x: 280, ...overrides });
  return { room, state, emit, send };
}

describe('Carrom visual preview validation', () => {
  it('rejects stale matches, turns, sequences and invalid placements without poisoning later previews', () => {
    const { send, emit } = setup();
    send({ matchId: 'old' }); send({ turnNumber: 99 }); send({ x: 0, sequence: 99 });
    send({ x: NaN }); send({ sequence: Infinity });
    expect(emit).not.toHaveBeenCalled();
    send(); expect(emit).toHaveBeenCalledOnce();
    send(); send({ sequence: 0 }); expect(emit).toHaveBeenCalledOnce();
    send({ sequence: 2 }); expect(emit).toHaveBeenCalledTimes(2);
  });
  it('resets sequence ordering for a new match on the same socket', () => {
    const { send, emit, room } = setup();
    send({ sequence: 50 }); room.match.matchId = 'rematch'; send();
    expect(emit).toHaveBeenCalledTimes(2);
  });
  it('blocks opponent, spectator, finished and in-progress-shot previews', () => {
    const { send, emit, room, state } = setup();
    state.currentSeat = 1; send(); state.currentSeat = 0;
    state.isShotInProgress = true; send(); state.isShotInProgress = false;
    state.finished = true; send(); state.finished = false;
    room.players.get('host')!.isSpectator = true; send();
    expect(emit).not.toHaveBeenCalled();
  });
});
