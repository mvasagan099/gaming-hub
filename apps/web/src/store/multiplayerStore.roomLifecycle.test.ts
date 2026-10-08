import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const socket = vi.hoisted(() => ({ listeners: new Map<string, (data: any) => void>(), emitWithAck: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), timeout: vi.fn() }));
vi.mock('@gaming-hub/socket', () => ({ createTypedSocket: () => Object.assign(socket, { on: (event: string, callback: any) => socket.listeners.set(event, callback) }) }));
vi.mock('./authStore', () => ({ useAuthStore: { getState: () => ({ session: { access_token: 'test' }, user: { id: 'p1' } }) } }));
vi.mock('./walletStore', () => ({ useWalletStore: { getState: () => ({ fetchWallet: vi.fn() }) } }));
vi.mock('../services/api/practiceReward', () => ({ notifyWalletChanged: vi.fn() }));
import { useMultiplayerStore } from './multiplayerStore';
const ended = { id: 'old-room', matchId: 'old-match', gameId: 'snake-vs-worms', status: 'ended', players: [], spectators: [], settings: {} } as any;
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
beforeEach(() => {
  useMultiplayerStore.getState().disconnect(); vi.clearAllMocks(); socket.listeners.clear(); socket.timeout.mockReturnValue(socket);
  useMultiplayerStore.getState().connect(); useMultiplayerStore.setState({ room: ended, matchId: 'old-match' });
});
afterEach(() => useMultiplayerStore.getState().disconnect());
describe('finished room cleanup before another game', () => {
  it('waits for the outstanding leave ACK before starting a new search', async () => {
    let acknowledge!: (response: any) => void;
    socket.emitWithAck.mockImplementation(event => event === 'room:leave' ? new Promise(resolve => { acknowledge = resolve; }) : Promise.resolve({ ok: true, data: { position: 1 } }));
    const leaving = useMultiplayerStore.getState().leaveRoom();
    const search = useMultiplayerStore.getState().joinMatchmaking('snake-vs-worms', 50);
    await flush(); expect(socket.emitWithAck.mock.calls.map(c => c[0])).toEqual(['room:leave']);
    acknowledge({ ok: true }); await Promise.all([leaving, search]);
    expect(socket.emitWithAck.mock.calls.map(c => c[0])).toEqual(['room:leave', 'matchmaking:join']);
    expect(useMultiplayerStore.getState().matchmaking.queued).toBe(true);
  });
  it('releases a completed room when the user explicitly searches again', async () => {
    socket.emitWithAck.mockResolvedValue({ ok: true, data: { position: 1 } });
    await useMultiplayerStore.getState().joinMatchmaking('chess', 50);
    expect(socket.emitWithAck.mock.calls.map(c => c[0])).toEqual(['room:leave', 'matchmaking:join']);
  });
  it('retains failed cleanup for retry and blocks a new search if cleanup still fails', async () => {
    socket.emitWithAck.mockResolvedValue({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Owner unavailable' } });
    await useMultiplayerStore.getState().leaveRoom();
    await expect(useMultiplayerStore.getState().joinMatchmaking('chess', 50)).rejects.toThrow('Owner unavailable');
    expect(socket.emitWithAck.mock.calls.every(c => c[0] === 'room:leave')).toBe(true);
    socket.emitWithAck.mockResolvedValue({ ok: true, data: { position: 1 } });
    await useMultiplayerStore.getState().joinMatchmaking('chess', 50);
    expect(socket.emitWithAck.mock.calls.at(-1)?.[0]).toBe('matchmaking:join');
  });
  it('does not revive departed room/game state from late broadcasts', async () => {
    socket.emitWithAck.mockResolvedValue({ ok: true }); await useMultiplayerStore.getState().leaveRoom();
    socket.listeners.get('room:update')!(ended);
    socket.listeners.get('game:finished')!({ matchId: 'old-match', finalState: {}, winner: 'p1' });
    expect(useMultiplayerStore.getState().room).toBeNull(); expect(useMultiplayerStore.getState().matchId).toBeNull();
  });
  it('ignores an old room closure after joining a new room', () => {
    const next = { ...ended, id: 'new-room', matchId: 'new-match', status: 'playing' };
    useMultiplayerStore.setState({ room: next, matchId: 'new-match' });
    socket.listeners.get('room:closed')!({ roomId: 'old-room' });
    expect(useMultiplayerStore.getState().room?.id).toBe('new-room');
  });
});
