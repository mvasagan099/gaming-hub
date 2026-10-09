import { packCarromTrajectory } from "@gaming-hub/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const socket = vi.hoisted(() => ({ listeners: new Map<string, (data: any) => void>(), emit: vi.fn(), emitWithAck: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), timeout: vi.fn() }));
vi.mock('@gaming-hub/socket', () => ({ createTypedSocket: () => Object.assign(socket, { on: (event: string, callback: any) => socket.listeners.set(event, socket.listeners.has(event) ? ((previous => (data: any) => { previous(data); callback(data); })(socket.listeners.get(event)!)) : callback) }) }));
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
  it('does not let a metadata event suppress the matching gameplay snapshot', () => {
    useMultiplayerStore.setState({ room: { ...ended, status: 'playing' }, lastStateVersion: 1, gameState: { score: 0 } });
    socket.listeners.get('game:event')!({ matchId: ended.matchId, eventId: 'countdown-2',
      eventType: 'COUNTDOWN_UPDATED', stateVersion: 2, payload: { countdown: 1 } });
    expect(useMultiplayerStore.getState().countdown).toBe(1);
    socket.listeners.get('game:state')!({ roomId: ended.id, matchId: ended.matchId,
      sequenceNumber: 2, state: { score: 1 }, events: [] });
    expect(useMultiplayerStore.getState().gameState).toEqual({ score: 1 });
    expect(useMultiplayerStore.getState().lastStateVersion).toBe(2);
  });
  it.each(['carrom', 'table-tennis', 'snake-vs-worms'])('does not replay %s events or render duplicate/older state versions', gameId => {
    useMultiplayerStore.setState({ room: { ...ended, gameId, status: 'playing' }, lastStateVersion: 0 });
    const receive = socket.listeners.get('game:state')!;
    const packet = { roomId: ended.id, matchId: ended.matchId, sequenceNumber: 2,
      state: { score: 1 }, events: [{ type: 'point-scored' }] };
    receive(packet);
    const applied = useMultiplayerStore.getState();
    receive(packet);
    receive({ ...packet, sequenceNumber: 1, state: { score: 0 } });
    expect(useMultiplayerStore.getState().renderKey).toBe(applied.renderKey);
    expect(useMultiplayerStore.getState().gameState).toEqual({ score: 1 });
    receive({ ...packet, sequenceNumber: 3, state: { score: 2 } });
    expect(useMultiplayerStore.getState().renderKey).toBe(applied.renderKey + 1);
    expect(useMultiplayerStore.getState().gameState).toEqual({ score: 2 });
  });
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
  it('does not restore a server-closed room from delayed room updates or game-over messages', async () => {
    socket.listeners.get('room:closed')!({ roomId: 'old-room', reason: 'player_left' });
    socket.listeners.get('room:update')!(ended);
    socket.listeners.get('game:over')!({ matchId: 'old-match', winnerSeats: [0], winnerIds: ['p1'], state: {} });
    expect(useMultiplayerStore.getState().room).toBeNull();
    expect(useMultiplayerStore.getState().matchId).toBeNull();
    const next = { ...ended, id: 'new-room', matchId: null, status: 'waiting' };
    socket.emitWithAck.mockResolvedValue({ ok: true, data: next });
    await useMultiplayerStore.getState().createRoom('chess', true, 0, 2);
    expect(socket.emitWithAck).toHaveBeenCalledExactlyOnceWith('room:create', expect.any(Object));
    expect(useMultiplayerStore.getState().room?.id).toBe('new-room');
  });

});

describe('audit delayed match-start identity', () => {
  it('does not overwrite a newer match with an old start packet', () => {
    useMultiplayerStore.setState({ room: { ...ended, id: 'new-room', matchId: 'new-match', status: 'playing' }, matchId: 'new-match' });
    socket.listeners.get('game:match-started')!({ roomId: 'old-room', matchId: 'old-match', matchDeadline: 999 });
    expect(useMultiplayerStore.getState().matchId).toBe('new-match');
  });
  it('does not restore a departed match from a late start packet', async () => {
    socket.emitWithAck.mockResolvedValue({ ok: true });
    await useMultiplayerStore.getState().leaveRoom();
    socket.listeners.get('game:match-started')!({ roomId: 'old-room', matchId: 'old-match', matchDeadline: 999 });
    expect(useMultiplayerStore.getState().matchId).toBeNull();
  });
});

it('accepts the current first-start and authoritative rematch identities', () => {
  const receive = socket.listeners.get('game:match-started')!;
  useMultiplayerStore.setState({ room: { ...ended, status: 'playing' }, matchId: null, countdown: 1 });
  receive({ matchId: 'old-match', startedAt: 1, matchDeadline: 20 });
  expect(useMultiplayerStore.getState()).toMatchObject({ matchId: 'old-match', matchDeadline: 20, countdown: null });
  socket.listeners.get('room:update')!({ ...ended, matchId: 'rematch', status: 'playing' });
  receive({ matchId: 'rematch', startedAt: 30, matchDeadline: 50 });
  expect(useMultiplayerStore.getState()).toMatchObject({ matchId: 'rematch', matchDeadline: 50 });
});

it('ignores a replayed start notification after the match has finished', () => {
  useMultiplayerStore.setState({ room: ended, matchId: 'old-match', winner: { winnerSeats: [0], winnerIds: ['p1'] } });
  socket.listeners.get('game:match-started')!({ matchId: 'old-match', startedAt: 1, matchDeadline: 2 });
  expect(useMultiplayerStore.getState().winner).toEqual({ winnerSeats: [0], winnerIds: ['p1'] });
});

it('decodes compact Carrom trajectories once at the state boundary', () => {
  useMultiplayerStore.setState({ room: { ...ended, gameId: 'carrom', status: 'playing' }, lastStateVersion: 0 });
  const frames = [{ frame: 0, pieces: [{ id: 'white-1', x: 10.125, y: 20, pocketed: false, pocketIndex: null }] }];
  socket.listeners.get('game:state')!({ roomId: ended.id, matchId: ended.matchId, sequenceNumber: 1,
    state: { lastTrajectory: null, packedCarromTrajectory: packCarromTrajectory(frames) }, events: [] });
  expect(useMultiplayerStore.getState().gameState).toEqual({ lastTrajectory: frames });
});

it('bounds Table Tennis action ACK waits instead of leaving paddle slots stuck forever', async () => {
  useMultiplayerStore.setState({ room: { ...ended, gameId: 'table-tennis', status: 'playing' } });
  socket.emitWithAck.mockResolvedValue({ ok: true, data: { ok: true } });
  await useMultiplayerStore.getState().sendGameAction({ type: 'paddle-move', y: 180, velocity: 1 });
  expect(socket.timeout).toHaveBeenCalledWith(8000);
});
