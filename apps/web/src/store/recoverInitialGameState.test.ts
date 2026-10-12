import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ state: {} as any, sync: vi.fn() }));
vi.mock('./multiplayerStore', () => ({ useMultiplayerStore: { getState: () => fixture.state } }));
import { recoverInitialGameState } from './recoverInitialGameState';
let stop: (() => void) | undefined;
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks(); fixture.sync.mockResolvedValue(undefined);
  fixture.state = { room: { id: 'room', matchId: 'match', status: 'playing' },
    status: 'connected', matchId: null, gameState: null, requestFullStateSync: fixture.sync };
});
afterEach(() => { stop?.(); stop = undefined; vi.useRealTimers(); });
describe('initial game snapshot recovery', () => {
  it('requests initial state and stops once the matching board state arrives', async () => {
    stop = recoverInitialGameState('room', 'match');
    expect(fixture.sync).toHaveBeenCalledExactlyOnceWith('match');
    fixture.state.matchId = 'match'; fixture.state.gameState = { players: [] };
    await vi.advanceTimersByTimeAsync(9_000);
    expect(fixture.sync).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
  it('does not refetch an already hydrated match', () => {
    fixture.state.matchId = 'match'; fixture.state.gameState = {};
    stop = recoverInitialGameState('room', 'match');
    expect(fixture.sync).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
  it('retries failed delivery within a bounded readiness window', async () => {
    fixture.sync.mockRejectedValue(new Error('temporary network failure'));
    stop = recoverInitialGameState('room', 'match');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fixture.sync).toHaveBeenCalledTimes(10); expect(vi.getTimerCount()).toBe(0);
  });
  it('never overlaps requests and cleans its timer on unmount', async () => {
    fixture.sync.mockImplementation(() => new Promise(() => {}));
    stop = recoverInitialGameState('room', 'match');
    await vi.advanceTimersByTimeAsync(9_000); expect(fixture.sync).toHaveBeenCalledOnce();
    stop(); expect(vi.getTimerCount()).toBe(0);
  });
  it.each(['leave', 'rematch', 'finish'])('stops recovery on %s', async change => {
    stop = recoverInitialGameState('room', 'match');
    if (change === 'leave') fixture.state.room = null;
    if (change === 'rematch') fixture.state.room.matchId = 'next-match';
    if (change === 'finish') fixture.state.room.status = 'ended';
    await vi.advanceTimersByTimeAsync(6_000);
    expect(fixture.sync).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
  it('waits for connection before requesting initial state', async () => {
    fixture.state.status = 'reconnecting'; stop = recoverInitialGameState('room', 'match');
    expect(fixture.sync).not.toHaveBeenCalled(); fixture.state.status = 'connected';
    await vi.advanceTimersByTimeAsync(3_000); expect(fixture.sync).toHaveBeenCalledOnce();
  });
});
