import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { io as connectClient, type Socket as ClientSocket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GAME_IDS, type GameId, type RoomFull } from '@gaming-hub/shared';
import { MultiplayerFramework } from '../src/framework';
import { registerRoomLifecycleHandlers } from '../../../apps/socket-server/src/roomHandlers';

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
