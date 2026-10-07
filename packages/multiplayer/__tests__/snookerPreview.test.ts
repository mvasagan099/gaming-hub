import { describe, expect, it, vi } from 'vitest';
import { SnookerEngine, SnakeVsWormsEngine } from '@gaming-hub/game-engine';
import { registerSnookerPreviewHandler } from '../../../apps/socket-server/src/snookerHandlers';
import { currentEngineStateSync } from '../../../apps/socket-server/src/currentEngineStateSync';
function setup() {
  let handler!: (payload: any) => void;
  const state = new SnookerEngine([{ userId: 'a', seat: 0 }, { userId: 'b', seat: 1 }]).state;
  const room = { id: 'room', ioName: 'room', status: 'playing', config: { gameId: 'snooker' },
    match: { matchId: 'match', engine: { state } }, players: new Map([['a', { seat: 0, isSpectator: false }]]) };
  const emit = vi.fn();
  registerSnookerPreviewHandler({ on: (_: any, fn: any) => { handler = fn; } } as any,
    { to: () => ({ emit }) } as any, { roomManager: { getRoom: () => room } } as any, 'a');
  const send = (overrides: any = {}) => handler({ roomId: 'room', matchId: room.match.matchId, turnNumber: state.turnNumber, sequence: 1, angle: 0.2, power: 0.5, ...overrides });
  return { send, emit, state, room };
}
describe('Snooker aiming preview validation', () => {
  it('rejects stale matches, turns, duplicate sequences and non-finite aim without poisoning valid previews', () => {
    const { send, emit } = setup();
    send({ matchId: 'old' }); send({ turnNumber: 99 }); send({ angle: Infinity, sequence: 100 }); send({ sequence: NaN });
    expect(emit).not.toHaveBeenCalled(); send(); send(); expect(emit).toHaveBeenCalledOnce();
    send({ sequence: 2 }); expect(emit).toHaveBeenCalledTimes(2);
  });
  it('accepts restarted sequences on a new match or turn', () => {
    const { send, emit, room, state } = setup();
    send({ sequence: 50 }); room.match.matchId = 'rematch'; send(); state.turnNumber++; send();
    expect(emit).toHaveBeenCalledTimes(3);
  });
  it('blocks spectators, wrong games, finished frames, opponents and moving balls', () => {
    const { send, emit, room, state } = setup();
    state.currentSeat = 1; send(); state.currentSeat = 0;
    state.shotPlaybackEndsAtMs = Date.now() + 1000; send(); state.shotPlaybackEndsAtMs = 0;
    state.frameStatus = 'FRAME_END'; send(); state.frameStatus = 'BREAK';
    room.players.get('a')!.isSpectator = true; send(); room.players.get('a')!.isSpectator = false;
    room.config.gameId = 'chess'; send(); expect(emit).not.toHaveBeenCalled();
  });
  it('syncs the current engine and uses the broadcast version rather than the action count', () => {
    const engine = new SnookerEngine([{ userId: 'a', seat: 0 }, { userId: 'b', seat: 1 }]);
    engine.pauseClocks();
    const framework = { syncManager: { getStateVersion: () => 12 } } as any;
    const room = { id: 'room', config: { gameId: 'snooker' }, status: 'playing', match: { matchId: 'match', turnNumber: 2, engine } } as any;
    const paused = currentEngineStateSync(framework, room);
    expect(paused).toMatchObject({ stateVersion: 12, actionSequence: 2, fullState: { gameState: { paused: true } } });
    engine.resumeClocks(); expect(paused.fullState.gameState.paused).toBe(true);
    expect(currentEngineStateSync(framework, room).fullState.gameState.paused).toBe(false);
  });
  it('syncs the current Snake vs Worms positions with a current broadcast version and clock', () => {
    const engine = new SnakeVsWormsEngine([{ userId: 'a', seat: 0 }, { userId: 'b', seat: 1 }]);
    engine.startMatchClock(); engine.tick();
    const room = { id: 'room', config: { gameId: 'snake-vs-worms' }, status: 'playing', match: { matchId: 'match', turnNumber: 0, engine } } as any;
    const synced = currentEngineStateSync({ syncManager: { getStateVersion: () => 50 } } as any, room);
    expect(synced.fullState.gameState.gameId).toBe('snake-vs-worms');
    expect((synced.fullState.gameState.players as any[])[0].body[0]).toEqual({ x: 305, y: 600 });
    expect(synced.stateVersion).toBe(50);
    expect(synced.fullState.gameState.matchRemainingMs).toBeGreaterThan(179000);
    engine.tick(); expect((synced.fullState.gameState.players as any[])[0].body[0].x).toBe(305);
  });
});
