import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { io as connectClient, type Socket as ClientSocket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GAME_IDS, type GameId, type RoomFull } from '@gaming-hub/shared';
import { registerCarromPreviewHandler } from '../../../apps/socket-server/src/carromHandlers';
import { registerSnookerPreviewHandler } from '../../../apps/socket-server/src/snookerHandlers';
import { authenticatedEngineStateSync } from '../../../apps/socket-server/src/currentEngineStateSync';
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
      const active = framework.roomManager.getPlayerRoom(userId);
      if (active) void framework.playerManager.handleReconnect(userId, active.id, socket);
      socket.on('disconnect', () => {
        const room = framework.roomManager.getPlayerRoom(userId);
        if (room) void framework.playerManager.handleDisconnect(userId, room.id, socket);
      });
      registerCarromPreviewHandler(socket, io, framework, userId);
      registerSnookerPreviewHandler(socket, io, framework, userId);
      socket.on('game:state-sync', (payload, ack) => {
        try { ack({ ok: true, data: authenticatedEngineStateSync(framework, userId, payload.matchId) }); }
        catch (error) { ack({ ok: false, error: { message: (error as Error).message } }); }
      });
      socket.on('room:leave', async (payload, ack) => {
        try { await framework.roomManager.leaveRoom(payload.roomId, userId, socket); ack({ ok: true }); }
        catch (error) { ack({ ok: false, error: { message: (error as Error).message } }); }
      });
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


  it.each(GAME_IDS.flatMap(game => ['host', 'guest'].map(player => [game, player] as const)))('%s closes both clients and permits another room when %s exits', async (gameId, leaving) => {
    const created = await create(gameId);
    await roomAck(guest, 'room:join', { code: created.code });
    await roomAck(guest, 'room:ready', { roomId: created.id, ready: true });
    await roomAck(host, 'room:start', { roomId: created.id });
    const events: string[] = [];
    const closed = [host, guest].map(socket => new Promise<void>(resolve => {
      socket.once('game:over', () => events.push('over'));
      socket.once('room:closed', payload => { expect(payload.roomId).toBe(created.id); events.push('closed'); resolve(); });
    }));
    expect((await (leaving === 'host' ? host : guest).timeout(4000).emitWithAck('room:leave', { roomId: created.id })).ok).toBe(true);
    await Promise.all(closed);
    expect(events.filter(event => event === 'over')).toHaveLength(2);
    expect(events.indexOf('over')).toBeLessThan(events.indexOf('closed'));
    expect(framework.roomManager.getRoom(created.id)).toBeUndefined();
    for (const socket of [host, guest]) {
      const next = await roomAck(socket, 'room:create', { gameId: 'chess', isPrivate: true, stake: 0, maxPlayers: 2 });
      expect(next.id).not.toBe(created.id);
    }
  });

  it('preserves the prepared tournament match identity when both players start', async () => {
    const created = await create('chess');
    await roomAck(guest, 'room:join', { code: created.code, asSpectator: false });
    await roomAck(guest, 'room:ready', { roomId: created.id, ready: true });
    const room = framework.roomManager.getRoom(created.id)!;
    room.config.settings.tournamentId = 'bracket-tournament';
    // The tournament endpoint registers a waiting room with an existing match.
    const { createEngine, secureRandomSource } = await import('@gaming-hub/game-engine');
    room.match = {
      matchId: 'prepared-bracket-match',
      engine: createEngine('chess', [{ userId: 'host', seat: 0 }, { userId: 'guest', seat: 1 }], secureRandomSource()),
      turnNumber: 0, startedAt: Date.now(), pausedAt: null, pausedBy: null,
      finishedAt: null, winnerIds: [], winnerSeats: [], stateSnapshots: [], actionHistory: [],
    };
    const started = await roomAck(host, 'room:start', { roomId: room.id });
    expect(started.matchId).toBe('prepared-bracket-match');
    expect(room.match.matchId).toBe('prepared-bracket-match');
    expect(fund.mock.calls[0][1]).toBe('prepared-bracket-match');
    expect((await authenticatedEngineStateSync(framework, 'guest', 'prepared-bracket-match')).matchId).toBe('prepared-bracket-match');
  });

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

  it.each(['chess', 'ludo', 'snake-ladder', 'bubble-shooter', 'fruit-ninja'] as const)(
    'runs %s intents, authorization, duplicate protection, reconnect, end and rematch on two sockets', async gameId => {
      const created = await create(gameId);
      await roomAck(guest, 'room:join', { code: created.code, asSpectator: false });
      await roomAck(guest, 'room:ready', { roomId: created.id, ready: true });
      await roomAck(host, 'room:start', { roomId: created.id });
      const room = framework.roomManager.getRoom(created.id)!;
      const engine = room.match!.engine as any;
      const oldMatch = room.match!.matchId;
      const a: any[] = [], b: any[] = [], endsA: any[] = [], endsB: any[] = [];
      host.on('game:state', value => a.push(value)); guest.on('game:state', value => b.push(value));
      host.on('game:over', value => endsA.push(value)); guest.on('game:over', value => endsB.push(value));
      const action = (socket: ClientSocket, value: any, matchId = room.match!.matchId) => socket.timeout(4000).emitWithAck('game:action', { roomId: room.id, matchId, action: value });
      const stranger = await client('outside');
      expect((await action(stranger, { type: 'resign' })).data.ok).toBe(false);
      const unauthorized = await stranger.timeout(4000).emitWithAck('game:state-sync', { matchId: oldMatch });
      expect(unauthorized.ok).toBe(false);
      if (gameId === 'fruit-ninja') {
        await vi.waitFor(() => expect(engine.state.phase).toBe('playing'), { timeout: 4500 });
        expect((await action(host, { type: 'slice-fruit', points: 999999 })).data.ok).toBe(false);
        const begin = { type: 'slice-begin', x: 1, y: 1, time: Date.now(), actionId: 'blade-begin' };
        expect((await action(host, begin)).data.ok).toBe(true);
        const duplicate = await action(host, begin); expect(duplicate.data.ok).toBe(true);
        expect((await action(host, { type: 'slice-end', x: 2, y: 2, time: Date.now(), actionId: 'blade-end' })).data.ok).toBe(true);
        expect(engine.state.scores).toEqual([0, 0]);
      } else {
        const intent = gameId === 'chess' ? { type: 'move', from: 'e2', to: 'e4' }
          : gameId === 'bubble-shooter' ? { type: 'shoot', angle: -Math.PI / 2 } : { type: 'roll' };
        const request = { ...intent, actionId: 'first-intent' };
        expect((await action(host, request)).data.ok).toBe(true);
        const before = structuredClone(engine.state);
        expect((await action(host, request)).data.ok).toBe(true);
        expect(engine.state).toEqual(before);
        if (gameId === 'chess') {
          expect((await action(host, { type: 'move', from: 'd2', to: 'd4' })).data.ok).toBe(false);
          expect((await action(guest, { type: 'move', from: 'e7', to: 'e5', actionId: 'black-move' })).data.ok).toBe(true);
          expect(engine.state.history).toEqual(['e4', 'e5']);
        }
      }
      await vi.waitFor(() => { expect(a.length).toBeGreaterThan(0); expect(b.at(-1)).toEqual(a.at(-1)); });
      const stateBeforeReconnect = engine.serialize();
      guest.disconnect(); guest = await client('guest');
      await roomAck(guest, 'room:join', { code: created.code, asSpectator: false });
      const sync = await guest.timeout(4000).emitWithAck('game:state-sync', { matchId: oldMatch });
      expect(sync.ok).toBe(true); expect(sync.data.matchId).toBe(oldMatch);
      const restored = sync.data.fullState.gameState;
      if (gameId === 'chess') { expect(restored.fen).toBe(stateBeforeReconnect.fen); expect(restored.history).toEqual(['e4', 'e5']); }
      if (gameId === 'ludo') expect(restored.players).toEqual(stateBeforeReconnect.players);
      guest.on('game:over', value => endsB.push(value));
      await new Promise(resolve => setTimeout(resolve, 170));
      expect((await action(guest, { type: 'resign', actionId: 'resignation' })).data.ok).toBe(true);
      await vi.waitFor(() => { expect(endsA).toHaveLength(1); expect(endsB).toHaveLength(1); });
      expect(endsA[0]).toEqual(endsB[0]); expect(endsA[0].state.winnerSeats).toEqual([0]);
      await framework.matchManager.requestRematch(room.id, 'host');
      await framework.matchManager.requestRematch(room.id, 'guest');
      expect(room.match!.matchId).not.toBe(oldMatch); expect(room.match!.engine.state.finished).toBe(false);
      expect((await action(host, { type: 'resign' }, oldMatch)).data.ok).toBe(false);
      expect(fund).toHaveBeenCalledTimes(2);
    });

  it.each(['bubble-shooter', 'snake-vs-worms'] as const)('%s retains eight distinct participants and rejects a ninth', async gameId => {
    const created = await roomAck(host, 'room:create', { gameId, isPrivate: true, stake: 100, maxPlayers: 8 });
    const participants = [host, guest];
    for (let i = 2; i < 8; i++) participants.push(await client(`player-${i}`));
    for (const socket of participants.slice(1)) {
      await roomAck(socket, 'room:join', { code: created.code, asSpectator: false });
      await roomAck(socket, 'room:ready', { roomId: created.id, ready: true });
    }
    const extra = await client('ninth-player');
    expect((await extra.timeout(4000).emitWithAck('room:join', { code: created.code, asSpectator: false })).ok).toBe(false);
    const roomState = await roomAck(host, 'room:start', { roomId: created.id });
    expect(roomState.players.map(player => player.seat).sort((a, b) => a! - b!)).toEqual([0,1,2,3,4,5,6,7]);
    const room = framework.roomManager.getRoom(created.id)!;
    const sync = await participants[7]!.timeout(4000).emitWithAck('game:state-sync', { matchId: room.match!.matchId });
    expect(sync.ok).toBe(true);
    expect(sync.data.fullState.gameState.players.filter((p: any) => roomState.players.some(participant => participant.seat === p.seat)).map((p: any) => p.seat).sort()).toEqual([0,1,2,3,4,5,6,7]);
    expect(fund).toHaveBeenCalledOnce();
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

  it('synchronizes Snooker aim, shots, settling time, cue placement, reconnects and rematches', async () => {
    const created = await create('snooker');
    await roomAck(guest, 'room:join', { code: created.code, asSpectator: false });
    await roomAck(guest, 'room:ready', { roomId: created.id, ready: true });
    await roomAck(host, 'room:start', { roomId: created.id });
    const room = framework.roomManager.getRoom(created.id)!;
    const engine = room.match!.engine as any;
    const states: any[] = [], previews: any[] = [], endings: any[] = [];
    guest.on('game:state', state => states.push(state));
    guest.on('snooker:aim-position', preview => previews.push(preview));
    guest.on('game:over', value => endings.push(value));
    const action = (socket: ClientSocket, value: any, matchId = room.match!.matchId) => socket.timeout(4000).emitWithAck('game:action', {
      roomId: room.id, matchId, action: { ...value, expectedStateVersion: room.match!.engine.state.stateVersion },
    });
    const aim = (matchId = room.match!.matchId) => host.emit('snooker:aim-position', { roomId: room.id, matchId,
      turnNumber: room.match!.engine.state.turnNumber, angle: 0.2, power: 0.5, sequence: 1 });
    aim(); await vi.waitFor(() => expect(previews).toHaveLength(1));
    // Wall-clock age may exceed ten minutes after reconnect pauses; the engine owns active playing time.
    room.match!.startedAt = Date.now() - 660000;
    expect((await action(guest, { type: 'strike', angle: 0.1, power: 0.5 })).data.ok).toBe(false);
    expect((await action(host, { type: 'strike', angle: 0.1, power: 0.5, shotId: 'snooker-shot' })).data.ok).toBe(true);
    await vi.waitFor(() => expect(states.at(-1)?.state.lastProcessedShotId).toBe('snooker-shot'));
    expect(states.at(-1).state.keyframes.length).toBeGreaterThan(1);
    expect(engine.currentClockDeadline).toBe(engine.state.shotPlaybackEndsAtMs + 20000);
    const receiver = engine.currentSeat === 0 ? host : guest;
    expect((await action(receiver, { type: 'strike', angle: 0, power: 0.5, shotId: 'overlap' })).data.ok).toBe(false);
    // Advance the authoritative settling boundary without waiting through a full shot.
    engine.state.shotPlaybackEndsAtMs = Date.now() - 1;
    engine.state.cueBallInHand = true; engine.state.inBaulkOnly = true;
    expect((await action(receiver, { type: 'place-cue-ball', x: 150, y: 240 })).data.ok).toBe(true);
    await vi.waitFor(() => expect(states.at(-1)?.state.keyframes).toEqual([]));
    expect(states.at(-1).state.cueBallInHand).toBe(false);
    guest.disconnect();
    await vi.waitFor(() => expect(engine.state.paused).toBe(true));
    expect(engine.currentClockDeadline).toBeNull();
    guest = await client('guest');
    await roomAck(guest, 'room:join', { code: created.code, asSpectator: false });
    await vi.waitFor(() => expect(engine.state.paused).toBe(false));
    expect(engine.state.balls.find((b: any) => b.type === 'cue')).toMatchObject({ x: 150, y: 240 });
    guest.on('game:over', value => endings.push(value));
    guest.on('snooker:aim-position', preview => previews.push(preview));
    expect((await action(guest, { type: 'resign' })).data.ok).toBe(true);
    await vi.waitFor(() => expect(endings).toHaveLength(1));
    expect(endings[0].state).toMatchObject({ finished: true, frameStatus: 'MATCH_END', winnerSeats: [0] });
    const oldMatch = room.match!.matchId;
    await framework.matchManager.requestRematch(room.id, 'host');
    await framework.matchManager.requestRematch(room.id, 'guest');
    expect(room.match!.matchId).not.toBe(oldMatch);
    expect(room.match!.engine.state).toMatchObject({ frameNumber: 1, shotNumber: 0, keyframes: [], finished: false });
    aim(); await vi.waitFor(() => expect(previews).toHaveLength(2));
    aim(oldMatch);
    expect((await action(host, { type: 'strike', angle: 0, power: 0.5 }, oldMatch)).data.ok).toBe(false);
    expect((await action(host, { type: 'strike', angle: 0.1, power: 0.5, shotId: 'fresh-rematch-shot' })).data.ok).toBe(true);
  });

  it.each(['table-tennis', 'snake-vs-worms'] as const)('gives %s the full three minutes after delayed funding completes', async gameId => {
    let now = Date.now();
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const created = await create(gameId);
    await roomAck(guest, 'room:join', { code: created.code, asSpectator: false });
    await roomAck(guest, 'room:ready', { roomId: created.id, ready: true });
    fund.mockImplementationOnce(async () => { now += 30000; });
    await roomAck(host, 'room:start', { roomId: created.id });
    const match = framework.roomManager.getRoom(created.id)!.match!;
    expect(match.startedAt).toBe(now);
    expect(match.engine.serialize().matchRemainingMs).toBe(180000);
    expect((match.engine as any).currentMatchDeadline).toBe(now + 180000);
  });

  it('runs Snake vs Worms steering, boost, scoring, spectators, reconnect, rematch and timeout', async () => {
    const created = await create('snake-vs-worms');
    await roomAck(guest, 'room:join', { code: created.code, asSpectator: false });
    await roomAck(guest, 'room:ready', { roomId: created.id, ready: true });
    await roomAck(host, 'room:start', { roomId: created.id });
    const room = framework.roomManager.getRoom(created.id)!;
    const engine = room.match!.engine as any;
    const states: any[] = [], endings: any[] = [];
    host.on('game:state', value => states.push(value)); host.on('game:over', value => endings.push(value));
    const action = (socket: ClientSocket, value: any, matchId = room.match!.matchId) => socket.timeout(4000).emitWithAck('game:action', { roomId: room.id, matchId, action: value });
    expect(engine.currentMatchDeadline - room.match!.startedAt).toBe(180000);
    expect((await action(host, { type: 'direction', direction: 'down' })).data.ok).toBe(true);
    expect((await action(guest, { type: 'direction', direction: 'up' })).data.ok).toBe(true);
    await vi.waitFor(() => {
      expect(engine.state.players[0].direction).toBe('down');
      expect(engine.state.players[1].direction).toBe('up');
      expect(states.length).toBeGreaterThan(0);
    });
    expect((await action(guest, { type: 'direction', direction: 'down' })).data.ok).toBe(false);
    expect((await action(host, { type: 'boost-start' })).data.ok).toBe(true);
    engine.state.food = [{ id: 'test-food', x: engine.state.players[0].body[0].x, y: engine.state.players[0].body[0].y + 10, type: 'golden', score: 50, growth: 3 }];
    await vi.waitFor(() => expect(engine.state.players[0].score).toBeGreaterThanOrEqual(50));
    expect((await action(host, { type: 'pause' })).data.ok).toBe(true);
    const paused = engine.serialize().matchRemainingMs;
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(engine.serialize().matchRemainingMs).toBe(paused);
    expect((await action(guest, { type: 'resume' })).data.ok).toBe(true);
    const viewer = await client('viewer');
    await roomAck(viewer, 'room:join', { code: created.code, asSpectator: true });
    expect((await action(viewer, { type: 'boost-start' })).data.ok).toBe(false);
    expect((await action(guest, { type: 'boost-start' })).data.ok).toBe(true);
    guest.disconnect(); await vi.waitFor(() => expect(engine.state.players[1].isBoosting).toBe(false));
    expect(engine.state.paused).toBe(false);
    guest = await client('guest'); await roomAck(guest, 'room:join', { code: created.code, asSpectator: false });
    expect((await action(guest, { type: 'resign' })).data.ok).toBe(true);
    await vi.waitFor(() => expect(endings).toHaveLength(1));
    expect(endings[0].state).toMatchObject({ finished: true, gameStatus: 'finished', winnerSeats: [0] });
    const oldMatch = room.match!.matchId;
    await framework.matchManager.requestRematch(room.id, 'host'); await framework.matchManager.requestRematch(room.id, 'guest');
    expect(room.match!.matchId).not.toBe(oldMatch);
    expect((await action(host, { type: 'direction', direction: 'up' }, oldMatch)).data.ok).toBe(false);
    expect((await action(host, { type: 'direction', direction: 'up' })).data.ok).toBe(true);
    const rematch = room.match!.engine as any;
    rematch.state.food = []; rematch.state.players.forEach((p: any) => { p.score = 0; p.pendingGrowth = 0; });
    rematch.state.matchStartedAtMs = Date.now() - 180001;
    await (framework.matchManager as any).handleClockExpiry(room);
    await vi.waitFor(() => expect(endings).toHaveLength(2));
    expect(endings[1].state).toMatchObject({ gameStatus: 'finished', endReason: 'TIME_EXPIRED', winnerSeats: [] });
  });

  it('runs Table Tennis readiness, rally, pause, reconnect, timeout and rematch for two clients', async () => {
    const created = await create('table-tennis');
    await roomAck(guest, 'room:join', { code: created.code, asSpectator: false });
    await roomAck(guest, 'room:ready', { roomId: created.id, ready: true });
    const started = await roomAck(host, 'room:start', { roomId: created.id });
    const room = framework.roomManager.getRoom(created.id)!;
    const engine = room.match!.engine as any;
    const states: any[] = [], guestStates: any[] = [], endings: any[] = [];
    host.on('game:state', state => states.push(state));
    guest.on('game:state', state => guestStates.push(state));
    host.on('game:over', state => endings.push(state));
    const action = async (socket: ClientSocket, value: any, matchId = room.match!.matchId) => {
      // Respect the production action cooldown between intentional inputs.
      await new Promise(resolve => setTimeout(resolve, 20));
      return socket.timeout(4000).emitWithAck('game:action', { roomId: room.id, matchId, action: value });
    };
    const server = engine.state.servingSeat === 0 ? host : guest;
    const receiver = server === host ? guest : host;
    expect((await action(server, { type: 'serve', angle: 0 })).data.ok).toBe(false);
    expect((await action(host, { type: 'ready' })).data.ok).toBe(true);
    expect((await action(guest, { type: 'ready' })).data.ok).toBe(true);
    expect((await action(receiver, { type: 'serve', angle: 0 })).data.ok).toBe(false);
    expect((await action(server, { type: 'serve', angle: 0 })).data.ok).toBe(true);
    await vi.waitFor(() => {
      expect(states.at(-1)?.state.ball?.inPlay).toBe(true);
      expect(guestStates.at(-1)?.state.ball?.inPlay).toBe(true);
    });
    const initialX = engine.state.ball.x;
    await vi.waitFor(() => expect(engine.state.ball.x).not.toBe(initialX));
    expect((await action(host, { type: 'pause' })).data.ok).toBe(true);
    const pausedBall = structuredClone(engine.state.ball);
    const remaining = engine.serialize().matchRemainingMs;
    await new Promise(resolve => setTimeout(resolve, 70));
    expect(engine.state.ball).toEqual(pausedBall);
    expect(engine.serialize().matchRemainingMs).toBe(remaining);
    expect((await action(host, { type: 'resume' })).data.ok).toBe(true);
    expect(engine.currentClockDeadline).toBeNull();
    // Advance one missed ball through the real physics loop and check both clients.
    engine.state.ball.x = 620; engine.state.ball.vx = 5;
    await vi.waitFor(() => {
      expect(states.at(-1)?.state.players[0].score).toBe(1);
      expect(guestStates.at(-1)?.state.players[0].score).toBe(1);
      expect(states.at(-1)?.state.ball).toBeNull();
      expect(guestStates.at(-1)?.events).toContainEqual(expect.objectContaining({ type: 'point-scored', winnerSeat: 0 }));
    });
    expect((await action(guest, { type: 'paddle-move', y: 240 })).data.ok).toBe(true);
    guest.disconnect(); guest = await client('guest');
    await roomAck(guest, 'room:join', { code: created.code, asSpectator: false });
    expect(engine.state.players[1].paddleY).toBe(240);
    // Force the authoritative deadline forward; test timeout without a three-minute wait.
    engine.state.matchStartedAtMs = Date.now() - 180001;
    await (framework.matchManager as any).handleClockExpiry(room);
    await vi.waitFor(() => expect(endings).toHaveLength(1));
    expect(room.status).toBe('ended');
    await (framework.matchManager as any).handleClockExpiry(room);
    expect(endings).toHaveLength(1);
    await framework.matchManager.requestRematch(room.id, 'host');
    await framework.matchManager.requestRematch(room.id, 'guest');
    expect(room.match!.matchId).not.toBe(started.matchId);
    expect(room.match!.engine.state).toMatchObject({ phase: 'waiting', totalPointsPlayed: 0, finished: false });
    expect((await action(host, { type: 'paddle-move', y: 0 }, started.matchId!)).data.ok).toBe(false);
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
