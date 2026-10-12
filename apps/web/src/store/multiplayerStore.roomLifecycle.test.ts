import { packCarromTrajectory } from "@gaming-hub/shared";
import { GAME_IDS } from "@gaming-hub/shared";
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
  it('recovers a missed initial Snake snapshot using the authoritative room match', async () => {
    const room = { ...ended, status: 'playing', matchId: 'fresh-match' };
    useMultiplayerStore.setState({ room, matchId: null, gameState: null, winner: { seat: 1 } as any, matchTimeExpired: true, lastStateVersion: 99, status: 'connected' });
    socket.emitWithAck.mockResolvedValue({ ok: true, data: {
      stateVersion: 1, actionSequence: 0, fullState: { gameState: { gameId: 'snake-vs-worms', players: [] } },
    } });
    await useMultiplayerStore.getState().requestFullStateSync();
    expect(socket.emitWithAck).toHaveBeenCalledWith('game:state-sync', expect.objectContaining({ matchId: 'fresh-match', lastStateVersion: 0 }));
    expect(useMultiplayerStore.getState().matchId).toBe('fresh-match');
    expect(useMultiplayerStore.getState().winner).toBeNull();
    expect(useMultiplayerStore.getState().matchTimeExpired).toBe(false);
    expect(useMultiplayerStore.getState().gameState).toEqual({ gameId: 'snake-vs-worms', players: [] });
  });
  it('discards initial recovery after leaving the room', async () => {
    let reply!: (value: any) => void;
    useMultiplayerStore.setState({ room: { ...ended, status: 'playing' }, matchId: null, gameState: null });
    socket.emitWithAck.mockImplementation(() => new Promise(resolve => { reply = resolve; }));
    const pending = useMultiplayerStore.getState().requestFullStateSync('old-match');
    useMultiplayerStore.setState({ room: null, matchId: null });
    reply({ ok: true, data: { stateVersion: 1, fullState: { gameState: {} } } });
    await pending;
    expect(useMultiplayerStore.getState().gameState).toBeNull();
  });
  it.each(GAME_IDS)('does not rewind %s gameplay with a delayed countdown start reply', async gameId => {
    let reply!: (value: any) => void;
    const waiting = { ...ended, gameId, status: 'waiting', matchId: null };
    useMultiplayerStore.setState({ room: waiting, matchId: null });
    socket.emitWithAck.mockImplementation(() => new Promise(resolve => { reply = resolve; }));
    const pending = useMultiplayerStore.getState().startGame();
    const countdown = { ...waiting, status: 'starting', matchId: 'new-match', lifecyclePhase: 'COUNTDOWN', countdownEndsAt: 1000 };
    socket.listeners.get('room:update')!(countdown);
    const playing = { ...countdown, status: 'playing', lifecyclePhase: 'PLAYING', countdownEndsAt: null, awaitingGameLoad: false };
    socket.listeners.get('room:update')!(playing);
    reply({ ok: true, data: countdown });
    expect(await pending).toEqual(playing);
    expect(useMultiplayerStore.getState().room).toEqual(playing);
  });
  it.each(['carrom', 'snake-vs-worms'])('%s does not restore board loading after both clients are ready', async gameId => {
    let reply!: (value: any) => void;
    const loading = { ...ended, gameId, status: 'playing', lifecyclePhase: 'READY_CHECK', awaitingGameLoad: true };
    useMultiplayerStore.setState({ room: loading });
    socket.emitWithAck.mockImplementation(() => new Promise(resolve => { reply = resolve; }));
    const pending = useMultiplayerStore.getState().setReady(true);
    const playing = { ...loading, lifecyclePhase: 'PLAYING', awaitingGameLoad: false };
    socket.listeners.get('room:update')!(playing);
    reply({ ok: true, data: loading });
    expect(await pending).toEqual(playing);
    expect(useMultiplayerStore.getState().room).toEqual(playing);
  });
  it.each(GAME_IDS)('%s ignores gameplay events after the room has been left', async gameId => {
    useMultiplayerStore.setState({ room: { ...ended, gameId, status: 'playing' } });
    socket.emitWithAck.mockResolvedValue({ ok: true });
    await useMultiplayerStore.getState().leaveRoom();
    socket.listeners.get('game:event')!({ matchId: ended.matchId, gameId, eventId: 'departed-state',
      eventType: 'GAME_STATE_UPDATED', stateVersion: 50, payload: { state: { playing: true } } });
    expect(useMultiplayerStore.getState().matchId).toBeNull();
    expect(useMultiplayerStore.getState().gameState).toBeNull();
  });
  it.each(['setReady', 'startGame'] as const)('ignores a delayed %s reply after leaving', async operation => {
    let reply!: (value: any) => void;
    useMultiplayerStore.setState({ room: { ...ended, status: 'waiting' } });
    socket.emitWithAck.mockImplementation(event => event === 'room:leave' ? Promise.resolve({ ok: true })
      : new Promise(resolve => { reply = resolve; }));
    const pending = operation === 'setReady' ? useMultiplayerStore.getState().setReady(true) : useMultiplayerStore.getState().startGame();
    await useMultiplayerStore.getState().leaveRoom();
    reply({ ok: true, data: { ...ended, status: 'playing' } });
    await pending;
    expect(useMultiplayerStore.getState().room).toBeNull();
  });
  it.each(GAME_IDS)('does not rewind a started %s match when the Ready reply arrives late', async gameId => {
    let reply!: (value: any) => void;
    const waiting = { ...ended, gameId, status: 'waiting', matchId: null };
    useMultiplayerStore.setState({ room: waiting });
    socket.emitWithAck.mockImplementation(() => new Promise(resolve => { reply = resolve; }));
    const pending = useMultiplayerStore.getState().setReady(true);
    socket.listeners.get('room:update')!({ ...waiting, status: 'playing', matchId: 'new-match' });
    reply({ ok: true, data: waiting });
    await pending;
    expect(useMultiplayerStore.getState().room).toMatchObject({ status: 'playing', matchId: 'new-match' });
  });
  it.each(['createRoom', 'joinRoom'] as const)('does not rewind a broadcast-started room with a delayed %s reply', async operation => {
    useMultiplayerStore.setState({ room: null });
    let reply!: (value: any) => void;
    const waiting = { ...ended, status: 'waiting', matchId: null };
    socket.emitWithAck.mockImplementation(() => new Promise(resolve => { reply = resolve; }));
    const pending = operation === 'createRoom' ? useMultiplayerStore.getState().createRoom('chess', true, 0, 2)
      : useMultiplayerStore.getState().joinRoom({ code: 'ABC234' });
    socket.listeners.get('room:update')!({ ...waiting, status: 'playing', matchId: 'new-match' });
    reply({ ok: true, data: waiting });
    await pending;
    expect(useMultiplayerStore.getState().room).toMatchObject({ status: 'playing', matchId: 'new-match' });
  });
  it.each(['createRoom', 'joinRoom'] as const)('ignores a delayed %s reply after disconnecting', async operation => {
    useMultiplayerStore.setState({ room: null });
    let reply!: (value: any) => void;
    socket.emitWithAck.mockImplementation(() => new Promise(resolve => { reply = resolve; }));
    const pending = operation === 'createRoom' ? useMultiplayerStore.getState().createRoom('chess', true, 0, 2)
      : useMultiplayerStore.getState().joinRoom({ code: 'ABC234' });
    // Attach rejection handling before a stale response settles.
    const settled = pending.catch(() => null);
    useMultiplayerStore.getState().disconnect();
    reply({ ok: true, data: ended });
    await settled;
    expect(useMultiplayerStore.getState().room).toBeNull();
  });
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
