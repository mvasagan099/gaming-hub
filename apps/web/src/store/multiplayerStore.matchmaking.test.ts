import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const socket = vi.hoisted(() => ({ listeners: new Map<string, (data: any) => void>(), emitWithAck: vi.fn(), connect: vi.fn(), disconnect: vi.fn() }));
const recovery = vi.hoisted(() => vi.fn());
vi.mock('../services/socket/sessionRecovery', () => ({ recoverSocketSession: recovery }));
vi.mock('@gaming-hub/socket', () => ({ createTypedSocket: () => ({ ...socket, on: (event: string, callback: any) => socket.listeners.set(event, callback) }) }));
vi.mock('./authStore', () => ({ useAuthStore: { getState: () => ({ session: { access_token: 'test' }, user: { id: 'p1' } }) } }));
vi.mock('./walletStore', () => ({ useWalletStore: { getState: () => ({ fetchWallet: vi.fn() }) } }));
vi.mock('../services/api/practiceReward', () => ({ notifyWalletChanged: vi.fn() }));
import { useMultiplayerStore } from './multiplayerStore';

beforeEach(() => {
  vi.clearAllMocks();
  socket.disconnect.mockReset();
  recovery.mockReset().mockResolvedValue('reconnect');
  useMultiplayerStore.getState().disconnect();
  useMultiplayerStore.setState({ matchFound: null });
  useMultiplayerStore.getState().connect();
});
afterEach(() => useMultiplayerStore.getState().disconnect());

describe('matchmaking join acknowledgement ordering', () => {
  it.each(['matchmaking:queued', 'game:queue-joined'])('ignores a late %s after a match has been found', event => {
    socket.listeners.get('game:match-found')!({ roomId: 'room', matchId: 'match', gameId: 'table-tennis' });
    socket.listeners.get(event)!({ position: 1, gameId: 'table-tennis', entryFee: 100 });
    expect(useMultiplayerStore.getState().matchmaking.queued).toBe(false);
    expect(useMultiplayerStore.getState().matchFound?.matchId).toBe('match');
  });
  it('does not restore searching from a delayed join ACK after cancellation', async () => {
    let complete!: (value: any) => void;
    socket.emitWithAck.mockImplementation(event => event === 'matchmaking:leave' ? Promise.resolve({ ok: true })
      : new Promise(resolve => { complete = resolve; }));
    const pending = useMultiplayerStore.getState().joinMatchmaking('table-tennis', 100);
    await useMultiplayerStore.getState().leaveMatchmaking();
    complete({ ok: true, data: { position: 1 } });
    await pending;
    expect(useMultiplayerStore.getState().matchmaking.queued).toBe(false);
  });
  it('does not clear a new search when the previous cancellation ACK arrives late', async () => {
    let cancel!: (value: any) => void;
    socket.emitWithAck.mockImplementation(event => event === 'matchmaking:leave'
      ? new Promise(resolve => { cancel = resolve; }) : Promise.resolve({ ok: true, data: { position: 1 } }));
    await useMultiplayerStore.getState().joinMatchmaking('table-tennis', 100);
    const leaving = useMultiplayerStore.getState().leaveMatchmaking();
    await useMultiplayerStore.getState().joinMatchmaking('chess', 50);
    cancel({ ok: true }); await leaving;
    expect(useMultiplayerStore.getState().matchmaking).toMatchObject({ queued: true, gameId: 'chess', stake: 50 });
  });
  it.each(['matchmaking:queued', 'game:queue-joined'])('ignores unsolicited or cancelled %s packets', event => {
    socket.listeners.get(event)!({ position: 1, gameId: 'table-tennis', entryFee: 100 });
    expect(useMultiplayerStore.getState().matchmaking.queued).toBe(false);
  });
  it('restores the same queued game and stake after verified token refresh', async () => {
    socket.emitWithAck.mockResolvedValue({ ok: true, data: { position: 1 } });
    await useMultiplayerStore.getState().joinMatchmaking('table-tennis', 100);
    socket.disconnect.mockImplementation(() => socket.listeners.get('disconnect')?.('io client disconnect'));
    socket.listeners.get('auth:session-revoked')!({ reason: 'TOKEN_REFRESH' });
    await vi.waitFor(() => expect(useMultiplayerStore.getState().pendingRequeue).toMatchObject({ gameId: 'table-tennis', stake: 100 }));
    expect(recovery).toHaveBeenCalledWith('TOKEN_REFRESH');
    socket.listeners.get('connect')!(undefined);
    await vi.waitFor(() => expect(socket.emitWithAck).toHaveBeenCalledTimes(2));
    expect(useMultiplayerStore.getState().pendingRequeue).toBeNull();
    expect(useMultiplayerStore.getState().matchmaking.queued).toBe(true);
  });

  it('keeps a waiting player queued', async () => {
    socket.emitWithAck.mockResolvedValue({ ok: true, data: { position: 1 } });
    await useMultiplayerStore.getState().joinMatchmaking('table-tennis', 100);
    expect(useMultiplayerStore.getState().matchmaking).toMatchObject({ queued: true, gameId: 'table-tennis', position: 1 });
  });
  it('does not resume searching when pairing completes before the ACK', async () => {
    let complete!: (value: any) => void;
    socket.emitWithAck.mockReturnValue(new Promise(resolve => { complete = resolve; }));
    const joining = useMultiplayerStore.getState().joinMatchmaking('table-tennis', 100);
    socket.listeners.get('game:match-found')!({ roomId: 'room', matchId: 'match', gameId: 'table-tennis' });
    complete({ ok: true, data: { position: 2 } });
    await joining;
    expect(useMultiplayerStore.getState().matchmaking.queued).toBe(false);
    expect(useMultiplayerStore.getState().matchFound?.matchId).toBe('match');
  });
  it('does not queue a player the server has already paired', async () => {
    socket.emitWithAck.mockResolvedValue({ ok: true, data: { position: 0 } });
    await useMultiplayerStore.getState().joinMatchmaking('table-tennis', 100);
    expect(useMultiplayerStore.getState().matchmaking.queued).toBe(false);
  });
  it('ignores a join ACK after disconnecting', async () => {
    let complete!: (value: any) => void;
    socket.emitWithAck.mockReturnValue(new Promise(resolve => { complete = resolve; }));
    const joining = useMultiplayerStore.getState().joinMatchmaking('table-tennis', 100);
    useMultiplayerStore.getState().disconnect();
    complete({ ok: true, data: { position: 1 } });
    await joining;
    expect(useMultiplayerStore.getState().matchmaking.queued).toBe(false);
  });
});
