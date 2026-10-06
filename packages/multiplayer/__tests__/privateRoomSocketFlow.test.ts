import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { io as connectClient, type Socket as ClientSocket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GAME_IDS, type GameId, type RoomFull } from '@gaming-hub/shared';
import { registerCarromPreviewHandler } from '../../../apps/socket-server/src/carromHandlers';
import { applySocketGameAction } from '../../../apps/socket-server/src/gameActions';
import { MultiplayerFramework } from '../src/framework';
import { registerRoomLifecycleHandlers } from '../../../apps/socket-server/src/roomHandlers';

vi.mock('@gaming-hub/db', () => ({ prisma: { playerGameStats: { upsert: vi.fn().mockResolvedValue({}) } } }));

describe('private room Socket.IO lifecycle', () => {
  let io: Server;
  let framework: MultiplayerFramework;
  let host: ClientSocket;
  let guest: ClientSocket;
  let baseUrl: string;
  const clients: ClientSocket[] = [];
  let checkFeature: ReturnType<typeof vi.fn>;
  let fund: ReturnType<typeof vi.fn>;
  let hostUpdates: RoomFull[];
  let guestUpdates: RoomFull[];

  async function client(userId: string) {
    const socket = connectClient(baseUrl, { transports: ['websocket'], forceNew: true, reconnection: false, auth: { userId } });
    clients.push(socket);
    await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
    return socket;
  }

  beforeEach(async () => {
    MultiplayerFramework.resetInstance();
    const http = createServer();
    io = new Server(http);
    fund = vi.fn().mockResolvedValue(undefined);
    checkFeature = vi.fn().mockResolvedValue(undefined);
    framework = MultiplayerFramework.getInstance({ io, enableReplay: false, onMatchStarting: fund });
    io.on('connection', socket => {
      // Local fixture identity only. Production still supplies its authenticated user ID and guards.
      const userId = socket.handshake.auth.userId as string;
      socket.data.user = { username: userId, displayName: userId };
      registerCarromPreviewHandler(socket, io, framework, userId);
      socket.on('game:action', async (payload, ack) => {
        try { ack({ ok: true, data: await applySocketGameAction(framework, userId, payload) }); }
        catch (error) { ack({ ok: false, error: { message: (error as Error).message } }); }
      });
      registerRoomLifecycleHandlers(socket, framework, userId, async (ack, task) => {
        try { await task(); }
        catch (error) { ack?.({ ok: false, error: { code: 'INTERNAL_ERROR', message: (error as Error).message } }); }
      }, checkFeature);
    });
    await new Promise<void>(resolve => http.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(http.address() as { port: number }).port}`;
    host = await client('host');
    guest = await client('guest');
    hostUpdates = []; guestUpdates = [];
    host.on('room:update', room => hostUpdates.push(room));
    guest.on('room:update', room => guestUpdates.push(room));
  });

  afterEach(async () => {
    await framework.shutdown();
    clients.splice(0).forEach(socket => socket.disconnect());
    await new Promise<void>(resolve => io.close(() => resolve()));
    MultiplayerFramework.resetInstance();
    vi.restoreAllMocks();
  });

  async function roomAck(socket: ClientSocket, event: string, payload: unknown): Promise<RoomFull> {
    const response = await socket.timeout(4_000).emitWithAck(event, payload);
    expect(response.ok).toBe(true);
    expect(Array.isArray(response.data.players)).toBe(true);
    expect(Array.isArray(response.data.spectators)).toBe(true);
    expect(response.data).not.toHaveProperty('config');
    expect(response.data).not.toHaveProperty('match');
    return response.data;
  }

  function create(gameId: GameId = 'chess') {
    return roomAck(host, 'room:create', { gameId, isPrivate: true, stake: 100, maxPlayers: 2 });
  }

  it.each(GAME_IDS)('creates, joins by code, readies and starts a private %s match on both clients', async gameId => {
    const created = await create(gameId);
    expect(created).toMatchObject({ gameId, isPrivate: true, hostId: 'host', status: 'waiting', stake: 100, maxPlayers: 2, matchId: null });
    expect(created.code).toMatch(/^[A-Z2-9]{6}$/);
    expect(created.players).toMatchObject([{ id: 'host', seat: 0, isReady: true, isHost: true }]);
    expect(hostUpdates.at(-1)).toEqual(created);
    expect(framework.roomManager.getPublicRooms()).toEqual([]);
    const joined = await roomAck(guest, 'room:join', { code: created.code.toLowerCase(), asSpectator: false });
    expect(joined.players.map(player => [player.id, player.seat])).toEqual([['host', 0], ['guest', 1]]);
    expect(guestUpdates.at(-1)).toEqual(joined);
    await vi.waitFor(() => expect(hostUpdates.at(-1)).toEqual(joined));
    const ready = await roomAck(guest, 'room:ready', { roomId: created.id, ready: true });
    expect(ready.players.every(player => player.isReady)).toBe(true);
    const started = await roomAck(host, 'room:start', { roomId: created.id });
    expect(started).toMatchObject({ gameId, status: 'playing', hasStarted: true });
    expect(started.matchId).toEqual(expect.any(String));
    expect(hostUpdates.at(-1)).toEqual(started);
    await vi.waitFor(() => expect(guestUpdates.at(-1)).toEqual(started));
    expect(fund).toHaveBeenCalledOnce();
    expect(fund.mock.calls[0][1]).toBe(started.matchId);
    const duplicate = await host.timeout(4_000).emitWithAck('room:start', { roomId: created.id });
    expect(duplicate.ok).toBe(false);
    expect(fund).toHaveBeenCalledOnce();
    guest.disconnect();
    guest = await client('guest');
    const reconnect = await roomAck(guest, 'room:join', { code: created.code, asSpectator: false });
    expect(reconnect.matchId).toBe(started.matchId);
    expect(reconnect.players.map(player => [player.id, player.seat])).toEqual([['host', 0], ['guest', 1]]);
  });

  it('synchronizes Carrom previews, shots, reconnects and rematches across two clients', async () => {
    const created = await create('carrom');
    await roomAck(guest, 'room:join', { code: created.code, asSpectator: false });
    await roomAck(guest, 'room:ready', { roomId: created.id, ready: true });
    const started = await roomAck(host, 'room:start', { roomId: created.id });
    const room = framework.roomManager.getRoom(created.id)!;
    const previews: any[] = [];
    guest.on('carrom:striker-position', preview => previews.push(preview));
    const preview = (matchId: string, sequence: number) => host.emit('carrom:striker-position', {
      roomId: room.id, matchId, turnNumber: 0, x: 280, sequence,
    });
    expect(room).toMatchObject({ status: 'playing', config: { gameId: 'carrom' } });
    expect(room.players.get('host')?.seat).toBe(0);
    expect((room.match!.engine as any).state).toMatchObject({ currentSeat: 0, turnNumber: 0, isShotInProgress: false });
    preview(started.matchId!, 50);
    await vi.waitFor(() => expect(previews).toHaveLength(1));
    expect(previews[0]).toMatchObject({ matchId: started.matchId, seat: 0, x: 280 });
    expect((room.match!.engine.state as any).striker.x).toBe(300);
    const hostStates: any[] = [], guestStates: any[] = [];
    host.on('game:state', state => hostStates.push(state));
    guest.on('game:state', state => guestStates.push(state));
    const shoot = (socket: ClientSocket, matchId = started.matchId!) => socket.timeout(4_000).emitWithAck('game:action', {
      roomId: room.id, matchId, action: { type: 'strike', x: 280, angle: -Math.PI / 2, power: 0 },
    });
    const rejected = await shoot(guest);
    expect(rejected.data.ok).toBe(false);
    expect((await shoot(host)).data.ok).toBe(true);
    await vi.waitFor(() => {
      expect(hostStates.at(-1)?.state.currentSeat).toBe(1);
      expect(guestStates.at(-1)?.state.currentSeat).toBe(1);
    });
    expect(guestStates.at(-1)).toEqual(hostStates.at(-1));
    // Allow the normal anti-cheat minimum action interval after the rejected shot.
    await new Promise(resolve => setTimeout(resolve, 30));
    expect((await shoot(guest)).data.ok).toBe(true);
    await vi.waitFor(() => expect(hostStates.at(-1)?.state.currentSeat).toBe(0));
    expect((room.match!.engine.state as any).turnNumber).toBe(2);
    guest.disconnect();
    guest = await client('guest');
    const rejoined = await roomAck(guest, 'room:join', { code: created.code, asSpectator: false });
    expect(rejoined.matchId).toBe(started.matchId);
    await framework.matchManager.finishMatch(room, { ok: true, state: framework.gameStateManager.getState(room), events: [], finished: true, winnerSeats: [] });
    await framework.matchManager.requestRematch(room.id, 'host');
    await framework.matchManager.requestRematch(room.id, 'guest');
    const nextMatch = room.match!.matchId;
    expect(nextMatch).not.toBe(started.matchId);
    guest.on('carrom:striker-position', value => previews.push(value));
    preview(nextMatch, 1);
    await vi.waitFor(() => expect(previews).toHaveLength(2));
    expect(previews.at(-1)).toMatchObject({ matchId: nextMatch, sequence: 1, turnNumber: 0 });
    expect((await shoot(host, started.matchId!)).data.ok).toBe(false);
  });

  it('keeps readiness, ownership, room-code and capacity checks enforced', async () => {
    const created = await create();
    expect((await host.timeout(4_000).emitWithAck('room:start', { roomId: created.id })).ok).toBe(false);
    expect((await guest.timeout(4_000).emitWithAck('room:join', { code: 'BADCODE', asSpectator: false })).ok).toBe(false);
    await roomAck(guest, 'room:join', { code: created.code, asSpectator: false });
    expect((await guest.timeout(4_000).emitWithAck('room:start', { roomId: created.id })).ok).toBe(false);
    expect((await host.timeout(4_000).emitWithAck('room:start', { roomId: created.id })).ok).toBe(false);
    const outsider = await client('outsider');
    expect((await outsider.timeout(4_000).emitWithAck('room:join', { code: created.code, asSpectator: false })).ok).toBe(false);
    expect((await outsider.timeout(4_000).emitWithAck('room:ready', { roomId: created.id, ready: true })).ok).toBe(false);
    expect(fund).not.toHaveBeenCalled();
    expect(framework.roomManager.getRoom(created.id)!.players.size).toBe(2);
  });

  it('serializes spectator metadata without exposing internal runtime or passwords', async () => {
    const created = await create();
    const joined = await roomAck(guest, 'room:join', { code: created.code, asSpectator: true });
    expect(joined.spectators).toMatchObject([{ id: 'guest', seat: null, isReady: false, isHost: false, isSpectator: true, joinedAt: expect.any(String) }]);
    expect(JSON.stringify(joined)).not.toMatch(/socketIds|password|stateSnapshots/);
  });

  it('preserves feature checks and funding failure without publishing a playing match', async () => {
    checkFeature.mockRejectedValueOnce(new Error('Games are disabled'));
    expect((await host.timeout(4_000).emitWithAck('room:create', { gameId: 'chess', isPrivate: true, stake: 100 })).ok).toBe(false);
    const created = await create();
    expect(checkFeature).toHaveBeenCalledWith('games.realMoney', 'Real-money play');
    await roomAck(guest, 'room:join', { code: created.code, asSpectator: false });
    await roomAck(guest, 'room:ready', { roomId: created.id, ready: true });
    fund.mockRejectedValueOnce(new Error('Insufficient balance'));
    const failed = await host.timeout(4_000).emitWithAck('room:start', { roomId: created.id });
    expect(failed).toMatchObject({ ok: false, error: { message: 'Insufficient balance' } });
    expect(framework.roomManager.getRoom(created.id)).toMatchObject({ status: 'waiting', match: null });
    expect(hostUpdates.some(update => update.status === 'playing')).toBe(false);
  });
});
