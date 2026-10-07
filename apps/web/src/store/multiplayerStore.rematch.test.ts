import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const socket = vi.hoisted(() => ({ listeners: new Map<string, (data: any) => void>(), emitWithAck: vi.fn(), emit: vi.fn(), connect: vi.fn(), disconnect: vi.fn() }));
const notifications = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('@gaming-hub/socket', () => ({ createTypedSocket: () => ({ ...socket, on: (event: string, callback: any) => socket.listeners.set(event, callback) }) }));
vi.mock('./authStore', () => ({ useAuthStore: { getState: () => ({ session: { access_token: 'local-test' }, user: { id: 'p1' } }) } }));
vi.mock('./walletStore', () => ({ useWalletStore: { getState: () => ({ fetchWallet: vi.fn() }) } }));
vi.mock('../services/api/practiceReward', () => ({ notifyWalletChanged: vi.fn() }));
vi.mock('react-hot-toast', () => ({ default: notifications }));
import { useMultiplayerStore } from './multiplayerStore';

beforeEach(() => {
  vi.clearAllMocks();
  socket.listeners.clear();
  useMultiplayerStore.getState().disconnect();
  useMultiplayerStore.getState().connect();
  useMultiplayerStore.setState({ room: { id: 'room-1', matchId: 'old-match', players: [{ id: 'p1', lastAcceptedActionSequence: 0 }] } as never, matchId: 'old-match', lastStateVersion: 99, rematchState: null });
});
afterEach(() => { useMultiplayerStore.getState().disconnect(); });

describe('rematch consent and state synchronization', () => {
  it('publishes incoming physics state and the rendering marker in one notification', () => {
    const received: any[] = [];
    const unsubscribe = useMultiplayerStore.subscribe(state => received.push({ gameState: state.gameState, renderKey: state.renderKey }));
    socket.listeners.get('game:event')!({ matchId: 'old-match', eventType: 'GAME_STATE_UPDATED',
      payload: { state: { ball: { x: 123 } }, events: [] }, stateVersion: 100, eventId: 'atomic-physics' });
    unsubscribe();
    expect(received).toHaveLength(1);
    expect(received[0].gameState).toEqual({ ball: { x: 123 } });
  });
  it('binds an action to the current authoritative match', async () => {
    socket.emitWithAck.mockResolvedValue({ ok: true, data: { ok: true } });
    const action = { type: 'move', from: 'e2', to: 'e4' };
    expect(await useMultiplayerStore.getState().sendGameAction(action)).toEqual({ ok: true });
    expect(socket.emitWithAck).toHaveBeenCalledExactlyOnceWith('game:action', { roomId: 'room-1', matchId: 'old-match', action: { ...action, actionId: expect.any(String), clientSequence: 1 } });
  });

  it('does not send an action before the new match state arrives', async () => {
    useMultiplayerStore.setState({ room: { id: 'room-1', matchId: 'new-match' } as never });
    expect((await useMultiplayerStore.getState().sendGameAction({ type: 'move' })).ok).toBe(false);
    useMultiplayerStore.setState({ matchId: null });
    expect((await useMultiplayerStore.getState().sendGameAction({ type: 'move' })).ok).toBe(false);
    expect(socket.emitWithAck).not.toHaveBeenCalled();
  });

  it('sends the room request and shows waiting feedback', async () => {
    socket.emitWithAck.mockResolvedValue({ ok: true, data: { roomId: 'room-1', requestedBy: ['p1'], active: true } });
    await useMultiplayerStore.getState().rematch();
    expect(socket.emitWithAck).toHaveBeenCalledExactlyOnceWith('game:rematch-request', { roomId: 'room-1' });
    expect(useMultiplayerStore.getState().rematchState?.requestedBy).toEqual(['p1']);
    expect(notifications.success).toHaveBeenCalledOnce();
  });

  it('shows funding/server errors without an unhandled rejection', async () => {
    socket.emitWithAck.mockResolvedValue({ ok: false, error: { code: 'INSUFFICIENT_BALANCE', message: 'Insufficient balance' } });
    await expect(useMultiplayerStore.getState().rematch()).resolves.toBeUndefined();
    expect(useMultiplayerStore.getState().error).toBe('Insufficient balance');
    expect(notifications.error).toHaveBeenCalledWith('Insufficient balance');
  });

  it('resets the result and version for a new match and rejects old-match replay packets', async () => {
    let complete!: (result: any) => void;
    socket.emitWithAck.mockReturnValue(new Promise(resolve => { complete = resolve; }));
    const requesting = useMultiplayerStore.getState().rematch();
    useMultiplayerStore.setState({ room: { id: 'room-1', matchId: 'new-match' } as never, winner: { winnerSeats: [0], winnerIds: ['p1'] }, matchTimeExpired: true });
    const fresh = { roomId: 'room-1', matchId: 'new-match', state: { finished: false }, events: [], sequenceNumber: 1 };
    socket.listeners.get('game:state')!(fresh);
    expect(useMultiplayerStore.getState()).toMatchObject({ matchId: 'new-match', gameState: { finished: false }, winner: null, lastStateVersion: 1, matchTimeExpired: false, rematchState: null });
    complete({ ok: true, data: { roomId: 'room-1', requestedBy: ['p1'], active: true } });
    await requesting;
    expect(useMultiplayerStore.getState().rematchState).toBeNull();
    socket.listeners.get('game:state')!({ ...fresh, matchId: 'old-match', state: { finished: true }, sequenceNumber: 100 });
    socket.listeners.get('game:over')!({ matchId: 'old-match', winnerIds: ['p1'], winnerSeats: [0], state: { finished: true } });
    socket.listeners.get('game:event')!({ matchId: 'old-match', eventType: 'GAME_STATE_UPDATED', payload: { state: { finished: true } }, stateVersion: 101, eventId: 'old-event' });
    socket.listeners.get('match:time-expired')!({ matchId: 'old-match', expiredAt: Date.now() });
    expect(useMultiplayerStore.getState()).toMatchObject({ matchId: 'new-match', gameState: { finished: false }, winner: null, lastStateVersion: 1 });
    expect(useMultiplayerStore.getState().matchTimeExpired).toBe(false);
  });

  it('ignores a reconnect snapshot that arrives after a rematch has started', async () => {
    let complete!: (result: any) => void;
    socket.emitWithAck.mockReturnValue(new Promise(resolve => { complete = resolve; }));
    const syncing = useMultiplayerStore.getState().requestFullStateSync();
    useMultiplayerStore.setState({ matchId: 'new-match', gameState: { finished: false }, lastStateVersion: 1 });
    complete({ ok: true, data: { stateVersion: 99, actionSequence: 8, fullState: { gameState: { finished: true } } } });
    await syncing;
    expect(useMultiplayerStore.getState()).toMatchObject({ gameState: { finished: false }, matchId: 'new-match', lastStateVersion: 1 });
  });
  it.each(['snake-ladder', 'ludo', 'chess', 'carrom', 'fruit-ninja', 'bubble-shooter', 'table-tennis', 'snake-vs-worms', 'snooker'])('does not overwrite newer %s state with a delayed reconnect snapshot', async gameId => {
    useMultiplayerStore.setState({ room: { id: 'room-1', matchId: 'old-match', gameId } as never });
    let complete!: (result: any) => void;
    socket.emitWithAck.mockReturnValue(new Promise(resolve => { complete = resolve; }));
    const syncing = useMultiplayerStore.getState().requestFullStateSync();
    useMultiplayerStore.setState({ gameState: { paused: false } as never, lastStateVersion: 101 });
    complete({ ok: true, data: { stateVersion: 100, actionSequence: 8, fullState: { gameState: { paused: true } } } });
    await syncing;
    expect(useMultiplayerStore.getState()).toMatchObject({ gameState: { paused: false }, lastStateVersion: 101 });
  });
});
