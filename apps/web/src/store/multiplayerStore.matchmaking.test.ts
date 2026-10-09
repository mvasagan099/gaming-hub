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
