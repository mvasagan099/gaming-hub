import { createServer as createTcpServer, connect as connectTcp, type Socket as TcpSocket } from 'node:net';
import { appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { io, type Socket } from 'socket.io-client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@gaming-hub/db';
import { GAME_IDS, type GameId } from '@gaming-hub/shared';
import { buildApp } from '../../app';
import { env } from '../../env';
import { createTestUser } from '../../../test/helpers';
import { GameHistoryService } from '../gameHistoryService';
import { WalletTransactionService } from '../walletTransactionService';

const root = fileURLToPath(new URL('../../../../..', import.meta.url));
const api = buildApp();
let loseFundingAck = false;
let settlementFault: 'none' | 'unavailable' | 'loseAck' = 'none';
api.addHook('onRequest', async (request, reply) => {
  if (settlementFault === 'unavailable' && request.url.endsWith('/settle')) return reply.code(503).send({ ok: false });
});
api.addHook('onSend', async (request, reply, payload) => {
  if (loseFundingAck && request.url === '/internal/matches/create-and-fund' && reply.statusCode === 200) {
    loseFundingAck = false; reply.raw.destroy();
  }
  if (settlementFault === 'loseAck' && request.url.endsWith('/settle') && reply.statusCode === 200) {
    settlementFault = 'none'; reply.raw.destroy();
  }
  return payload;
});
let redisUnavailable = false;
const redisLinks = new Set<TcpSocket>();
const redisProxy = createTcpServer(client => {
  if (redisUnavailable) { client.destroy(); return; }
  const target = new URL(process.env.TEST_REDIS_URL!);
  const upstream = connectTcp({ host: target.hostname, port: Number(target.port || 6379) });
  redisLinks.add(client); redisLinks.add(upstream);
  client.on('error', () => undefined); upstream.on('error', () => client.destroy());
  client.on('close', () => { upstream.destroy(); redisLinks.delete(client); });
  upstream.on('close', () => { client.destroy(); redisLinks.delete(upstream); });
  client.pipe(upstream).pipe(client);
});
let apiPort: number, aPort: number, bPort: number, redisPort: number;
async function listen(server: ReturnType<typeof createTcpServer>, port = 0) {
  const listening = once(server, 'listening');
  server.listen(port, '127.0.0.1');
  await listening;
  return (server.address() as { port: number }).port;
}
async function availablePort() {
  const reservation = createTcpServer();
  const port = await listen(reservation);
  await new Promise<void>((resolve, reject) => reservation.close(error => error ? reject(error) : resolve()));
  return port;
}
const children = new Set<ChildProcess>(), sockets = new Set<Socket>();
let a: ChildProcess, b: ChildProcess;
async function until(check: () => Promise<boolean>, timeout = 20000) {
  const start = Date.now(); while (!await check()) {
    if (Date.now() - start > timeout) throw new Error('Condition timed out');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}
async function server(port: number) {
  const child = spawn(process.execPath, ['--import', 'tsx', 'apps/socket-server/src/index.ts'], { cwd: root,
    env: { ...process.env, NODE_ENV: 'test', PORT: String(port), API_URL: `http://127.0.0.1:${apiPort}`,
      INTERNAL_API_KEY: env.INTERNAL_API_KEY, REDIS_URL: `redis://127.0.0.1:${redisPort}`, DISTRIBUTED_MATCHES: 'true',
      SUPABASE_URL: 'http://127.0.0.1:19999', CORS_ORIGIN: 'http://localhost', LOG_LEVEL: 'error' },
    stdio: ['ignore', 'pipe', 'pipe'] });
  children.add(child);
  let diagnostics = '', spawnError: Error | undefined;
  child.once('error', error => { spawnError = error; });
  const logfile = join(tmpdir(), `gaming-recovery-socket-${port}-${child.pid}.log`);
  const record = (chunk: Buffer) => {
    diagnostics = (diagnostics + chunk.toString()).slice(-8192);
    appendFileSync(logfile, chunk.toString());
  };
  child.stderr!.on('data', record); child.stdout!.on('data', record);
  try {
    await until(async () => {
      if (spawnError) throw spawnError;
      if (child.exitCode != null || child.signalCode != null) throw new Error(`Socket process failed on ${port}: ${diagnostics.slice(-1500)}`);
      try {
        const response = await fetch(`http://127.0.0.1:${port}/health/ready`, { signal: AbortSignal.timeout(1000) });
        const ready = response.ok; await response.body?.cancel(); return ready;
      } catch { return false; }
    });
    return child;
  } catch (error) { await kill(child); throw error; }
}
async function kill(child: ChildProcess) {
  if (child.exitCode == null && child.signalCode == null) {
    // close includes stdio teardown; no replacement process starts during shutdown.
    const done = once(child, 'close'); child.kill('SIGKILL'); await done;
  }
  children.delete(child);
}
function socketOnce(socket: Socket, event: string): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off(event, handler); reject(new Error(`Socket event timed out: ${event}`)); }, 10000);
    const handler = (...args: any[]) => { clearTimeout(timer); resolve(args); };
    socket.once(event, handler);
  });
}
async function connect(port: number, id: string) {
  const socket = io(`http://127.0.0.1:${port}`, { auth: { token: `test.${id}` }, transports: ['websocket'], reconnection: false, autoConnect: false });
  sockets.add(socket);
  socket.on('disconnect', () => sockets.delete(socket));
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); socket.off('connect', connected); socket.off('connect_error', failed); };
    const connected = () => { cleanup(); resolve(); };
    const failed = (error: any) => {
      cleanup(); socket.disconnect(); sockets.delete(socket);
      const cause = error.description?.error?.code ?? error.description?.code ?? error.context?.code ?? '';
      reject(new Error(`Replica ${port}: ${error.message}${cause ? ` (${cause})` : ''}`, { cause: error }));
    };
    const timer = setTimeout(() => failed(new Error('Socket connect timed out')), 10000);
    socket.once('connect', connected); socket.once('connect_error', failed); socket.connect();
  });
  return socket;
}
async function command(socket: Socket, event: string, payload: unknown) {
  const response = await socket.timeout(10000).emitWithAck(event, payload);
  if (!response.ok) throw new Error(`${event}: ${response.error?.message}`);
  return response.data;
}
const actions: Record<GameId, Record<string, unknown>> = {
  'snake-ladder': { type: 'roll' }, ludo: { type: 'roll' }, chess: { type: 'move', from: 'e2', to: 'e4' },
  carrom: { type: 'place-striker', x: 400 }, 'fruit-ninja': { type: 'slice-begin', x: 1, y: 1 },
  'bubble-shooter': { type: 'shoot', angle: -Math.PI / 2 }, 'table-tennis': { type: 'ready' },
  'snake-vs-worms': { type: 'direction', direction: 'right', sequenceNumber: 1 }, snooker: { type: 'strike', angle: 0, power: 0.5 },
};
beforeAll(async () => {
  if (!process.env.TEST_REDIS_URL) throw new Error('Real integration requires TEST_REDIS_URL');
  const redisTarget = new URL(process.env.TEST_REDIS_URL);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(redisTarget.hostname)) throw new Error('Disposable local Redis required');
  redisPort = await listen(redisProxy);
  await api.listen({ port: 0, host: '127.0.0.1' });
  apiPort = (api.server.address() as { port: number }).port;
  aPort = await availablePort(); bPort = await availablePort();
  a = await server(aPort); b = await server(bPort);
});
// Restart prerequisites belong to every test, including tests following owner death.
beforeEach(async () => {
  if (a.exitCode != null || a.signalCode != null) a = await server(aPort);
  if (b.exitCode != null || b.signalCode != null) b = await server(bPort);
});
afterEach(() => {
  loseFundingAck = false; settlementFault = 'none'; redisUnavailable = false;
  for (const socket of sockets) socket.disconnect();
  sockets.clear();
});
afterAll(async () => {
  for (const socket of sockets) socket.disconnect();
  await Promise.all([...children].map(child => kill(child).catch(() => undefined)));
  await api.close();
  for (const link of redisLinks) link.destroy();
  await new Promise<void>(resolve => redisProxy.close(() => resolve()));
});

describe('restartRecovery / crossReplicaOwnership / multiReplicaPaidMatch — real socket processes and HTTP API', () => {
  it('acknowledges a large Carrom shot through the non-owner replica once without losing recovery trajectory', async () => {
    const players = await Promise.all([createTestUser(), createTestUser()]);
    for (const player of players) await prisma.$transaction(tx => WalletTransactionService.createCredit(tx,
      { userId: player.id, amount: 1000, referenceType: 'ADMIN', referenceId: crypto.randomUUID() }));
    const first = await connect(aPort, players[0]!.id), second = await connect(bPort, players[1]!.id);
    const room = await command(first, 'room:create', { gameId: 'carrom', stake: 100, maxPlayers: 2, isPrivate: true });
    await command(second, 'room:join', { code: room.code });
    await Promise.all([command(first, 'room:ready', { roomId: room.id, ready: true }), command(second, 'room:ready', { roomId: room.id, ready: true })]);
    await command(first, 'room:start', { roomId: room.id });
    const load = () => prisma.liveRoomCheckpoint.findUniqueOrThrow({ where: { id: room.id } });
    await until(async () => ((await load()).snapshot as any).room.status === 'playing');
    const matchId = (await load()).matchId!;
    await command(first, 'game:loaded', { roomId: room.id, matchId });
    await command(second, 'game:loaded', { roomId: room.id, matchId });
    expect((await command(first, 'game:action', { roomId: room.id, matchId,
      action: { type: 'strike', x: 300, angle: 0, power: 0, actionId: crypto.randomUUID() } })).ok).toBe(true);
    const payload = { roomId: room.id, matchId, action: { type: 'strike', x: 300, angle: Math.PI / 2, power: 0.8, actionId: crypto.randomUUID() } };
    const receipt = await command(second, 'game:action', payload);
    expect(receipt.ok, receipt.error).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(receipt))).toBeLessThan(60 * 1024);
    const checkpoint = (await load()).snapshot as any;
    expect(checkpoint.match.actionHistory).toHaveLength(2);
    expect(checkpoint.match.engine.state.lastTrajectory.length).toBeGreaterThan(0);
    const duplicate = await command(second, 'game:action', payload);
    expect(duplicate.ok).toBe(true);
    expect(((await load()).snapshot as any).match.actionHistory).toHaveLength(2);
    await command(first, 'game:action', { roomId: room.id, matchId, action: { type: 'resign', actionId: crypto.randomUUID() } });
    await until(async () => (await prisma.gameResultOutbox.findUnique({ where: { matchId } }))?.status === 'DELIVERED');
    expect(await prisma.transaction.count({ where: { referenceId: matchId, referenceType: 'MATCH_PAYOUT' } })).toBe(1);
    first.disconnect(); second.disconnect();
  }, 60000);

  it('internalApiAuthentication accepts valid and rejects missing/wrong service credentials', async () => {
    for (const [key, status] of [[env.INTERNAL_API_KEY, 200], ['', 401], ['incorrect-service-key', 401]] as const) {
      const response = await fetch(`http://127.0.0.1:${apiPort}/metrics`, { headers: key ? { 'x-internal-key': key } : {} });
      expect(response.status).toBe(status); await response.body?.cancel();
    }
  });
  it.each(GAME_IDS)('%s checkpoints, loses the real owner, restores identity, continues and settles once', async gameId => {
    if (a.exitCode != null || a.signalCode != null) a = await server(aPort);
    const players = await Promise.all([createTestUser(), createTestUser()]);
    for (const player of players) await prisma.$transaction(tx => WalletTransactionService.createCredit(tx,
      { userId: player.id, amount: 1000, referenceType: 'ADMIN', referenceId: crypto.randomUUID() }));
    let first = await connect(aPort, players[0]!.id), second = await connect(bPort, players[1]!.id);
    const room = await command(first, 'room:create', { gameId, stake: 100, maxPlayers: 2, isPrivate: true });
    await command(second, 'room:join', { code: room.code });
    await Promise.all([command(first, 'room:ready', { roomId: room.id, ready: true }), command(second, 'room:ready', { roomId: room.id, ready: true })]);
    const starting = await command(first, 'room:start', { roomId: room.id });
    expect(starting.lifecyclePhase).toBe('COUNTDOWN');
    const load = () => prisma.liveRoomCheckpoint.findUniqueOrThrow({ where: { id: room.id } });
    await until(async () => ((await load()).snapshot as any).room.status === 'playing');
    const matchId = (await load()).matchId!;
    if (['carrom', 'snake-vs-worms'].includes(gameId)) {
      await command(first, 'game:loaded', { roomId: room.id, matchId });
      await command(second, 'game:loaded', { roomId: room.id, matchId });
      expect(((await load()).snapshot as any).match.gameplayStartedAt).toBeTypeOf('number');
    }
    if (gameId === 'carrom') {
      const baseline = await load();
      const preview = socketOnce(second, 'carrom:striker-position');
      // Use the non-owner replica: previews must still use membership/turn validation,
      // but cannot produce any durable mutation or block a real strike behind writes.
      for (let sequence = 1; sequence <= 12; sequence++) await command(second, 'carrom:striker-position',
        { roomId: room.id, matchId, turnNumber: 0, x: 300, sequence });
      expect((await load()).revision).toBe(baseline.revision);
      // The wrong-turn player never gets a preview broadcast.
      const validPreview = socketOnce(second, 'carrom:striker-position');
      for (let sequence = 1; sequence <= 12; sequence++) await command(first, 'carrom:striker-position',
        { roomId: room.id, matchId, turnNumber: 0, x: 300 + sequence, sequence });
      expect((await validPreview)[0]).toMatchObject({ matchId, seat: 0, sequence: 1 });
      expect((await preview)[0]).toMatchObject({ seat: 0 });
      const afterPreview = await load();
      expect(afterPreview.revision).toBe(baseline.revision);
      expect(afterPreview.snapshot).toEqual(baseline.snapshot);
    }
    const action = { ...actions[gameId], actionId: crypto.randomUUID(), ...(gameId === 'fruit-ninja' ? { time: Date.now() } : {}) };
    const applied = await command(first, 'game:action', { roomId: room.id, matchId, action });
    expect(applied.ok, applied.error).toBe(true);
    const before = await load(), canonical = before.snapshot as any;
    expect(canonical.match.actionHistory).toHaveLength(1);
    const owner = before.ownerId;
    // Both players initially use different replicas; kill the actual owner.
    // The surviving replica recovers the durable canonical world, then accepts both reconnects.
    // Kill before closing transports: recovery must use the last committed match.
    const ownerIsA = (await load()).ownerId === owner; // room creation always owned by A
    expect(ownerIsA).toBe(true);
    await kill(a); first.disconnect(); second.disconnect();
    await until(async () => { const current = await load(); return current.ownerId !== owner && current.fencingToken > before.fencingToken; }, 25000);
    first = await connect(bPort, players[0]!.id); second = await connect(bPort, players[1]!.id);
    await command(first, 'room:join', { roomId: room.id }); await command(second, 'room:join', { roomId: room.id });
    const after = (await load()).snapshot as any;
    expect(after.match.matchId).toBe(matchId);
    expect(after.match.participants).toEqual(canonical.match.participants);
    expect(after.players.map((p: any) => [p.id, p.seat])).toEqual(canonical.players.map((p: any) => [p.id, p.seat]));
    expect(after.match.actionHistory).toEqual(canonical.match.actionHistory);
    expect(after.stateVersion).toBeGreaterThanOrEqual(canonical.stateVersion);
    expect(after.match.startedAt).toBe(canonical.match.startedAt);
    expect(after.match.engine.engineVersion).toBe(canonical.match.engine.engineVersion);
    expect(after.match.engine.state.matchStartedAtMs).toBe(canonical.match.engine.state.matchStartedAtMs);
    if (['chess', 'ludo', 'snake-ladder', 'bubble-shooter', 'carrom'].includes(gameId)) {
      expect(after.match.engine.state.currentSeat).toBe(canonical.match.engine.state.currentSeat);
      for (const key of gameId === 'chess' ? ['fen', 'history', 'whitePlayerId', 'blackPlayerId'] :
        gameId === 'carrom' ? ['coins', 'scores'] : ['players']) {
        expect(after.match.engine.state[key]).toEqual(canonical.match.engine.state[key]);
      }
    }

    const duplicate = await command(first, 'game:action', { roomId: room.id, matchId, action });
    expect(duplicate.ok).toBe(true);
    expect(((await load()).snapshot as any).match.actionHistory).toHaveLength(1);
    if (gameId === 'carrom') {
      expect((await command(first, 'game:action', { roomId: room.id, matchId,
        action: { type: 'strike', angle: -Math.PI / 2, power: 0.5, actionId: crypto.randomUUID() } })).ok).toBe(true);
    }
    const finished = await command(second, 'game:action', { roomId: room.id, matchId, action: { type: 'resign', actionId: crypto.randomUUID() } });
    expect(finished.finished).toBe(true);
    await until(async () => (await prisma.gameResultOutbox.findUnique({ where: { matchId } }))?.status === 'DELIVERED');
    expect(await prisma.gameResultOutbox.count({ where: { matchId } })).toBe(1);
    expect(await prisma.matchPlayer.count({ where: { matchId } })).toBe(2);
    expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: players[0]!.id } })).balance).toBe(1080);
    expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: players[1]!.id } })).balance).toBe(900);
    // A private-room rematch must receive a new funded identity and fresh board admission.
    await command(first, 'game:rematch-request', { roomId: room.id });
    await command(second, 'game:rematch-accept', { roomId: room.id });
    await until(async () => ((await load()).snapshot as any).room.status === 'playing');
    const archivedReplay = await GameHistoryService.getMatchReplay(players[0]!.id, matchId);
    expect(archivedReplay.matchId).toBe(matchId);
    expect(archivedReplay.events.length).toBeGreaterThan(0);
    if (gameId === 'carrom') {
      expect(archivedReplay.initialState.coins).toHaveLength(19);
      expect(archivedReplay.events.some(event => (event.resultData.events as any[])?.some(e => e.type === 'shot-trajectory'))).toBe(true);
    }
    const nextMatchId = (await load()).matchId!;
    expect(nextMatchId).not.toBe(matchId);
    if (['carrom', 'snake-vs-worms'].includes(gameId)) {
      expect(((await load()).snapshot as any).match.loadedPlayerIds).toEqual([]);
      await command(first, 'game:loaded', { roomId: room.id, matchId: nextMatchId });
      await command(second, 'game:loaded', { roomId: room.id, matchId: nextMatchId });
    }
    expect((await command(first, 'game:action', { roomId: room.id, matchId, action })).ok).toBe(false);
    for (const [index, balance] of [[0, 980], [1, 800]] as const) {
      expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: players[index]!.id } })).balance).toBe(balance);
    }
    expect((await command(first, 'game:action', { roomId: room.id, matchId: nextMatchId,
      action: { ...actions[gameId], actionId: crypto.randomUUID(), ...(gameId === 'fruit-ninja' ? { time: Date.now() } : {}) } })).ok).toBe(true);
    await command(second, 'game:action', { roomId: room.id, matchId: nextMatchId, action: { type: 'resign' } });
    await until(async () => (await prisma.gameResultOutbox.findUnique({ where: { matchId: nextMatchId } }))?.status === 'DELIVERED');
    expect(await prisma.transaction.count({ where: { referenceId: nextMatchId, referenceType: 'MATCH_PAYOUT' } })).toBe(1);
    expect(await GameHistoryService.getMatchReplay(players[0]!.id, matchId)).toEqual(archivedReplay);
    await expect(GameHistoryService.getMatchReplay(crypto.randomUUID(), matchId)).rejects.toThrow(/Unauthorized/);
    expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: players[0]!.id } })).balance).toBe(1160);
    expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: players[1]!.id } })).balance).toBe(800);
    first.disconnect(); second.disconnect();
    a = await server(aPort);
  }, 60000);
});

describe('all-game paid private-room admission and cancellation', () => {
  it.each(GAME_IDS)('%s rejects invalid admission and refunds a cancelled countdown once', async gameId => {
    const players = await Promise.all([createTestUser(), createTestUser(), createTestUser()]);
    for (const user of players) await prisma.$transaction(tx => WalletTransactionService.createCredit(tx,
      { userId: user.id, amount: 1000, referenceType: 'ADMIN', referenceId: crypto.randomUUID() }));
    const first = await connect(aPort, players[0]!.id), second = await connect(bPort, players[1]!.id);
    const outsider = await connect(bPort, players[2]!.id);
    try {
      const room = await command(first, 'room:create', { gameId, stake: 100, maxPlayers: 2, isPrivate: true });
      expect(room.isPrivate).toBe(true);
      expect((await second.timeout(10000).emitWithAck('room:join', { code: 'INVALID-CODE' })).ok).toBe(false);
      await command(second, 'room:join', { code: room.code.toLowerCase() });
      expect((await outsider.timeout(10000).emitWithAck('room:join', { roomId: room.id })).ok).toBe(false);
      expect((await outsider.timeout(10000).emitWithAck('room:ready', { roomId: room.id, ready: true })).ok).toBe(false);
      expect((await first.timeout(10000).emitWithAck('room:start', { roomId: room.id })).ok).toBe(false);
      expect((await second.timeout(10000).emitWithAck('room:start', { roomId: room.id })).ok).toBe(false);
      for (const user of players) expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } })).balance).toBe(1000);
      await command(first, 'room:ready', { roomId: room.id, ready: true });
      await command(second, 'room:ready', { roomId: room.id, ready: true });
      const started = await command(first, 'room:start', { roomId: room.id });
      expect(started.lifecyclePhase).toBe('COUNTDOWN');
      const saved = await prisma.liveRoomCheckpoint.findUniqueOrThrow({ where: { id: room.id } });
      const matchId = saved.matchId!;
      expect((await first.timeout(10000).emitWithAck('room:start', { roomId: room.id })).ok).toBe(false);
      expect((await command(first, 'game:action', { roomId: room.id, matchId, action: { type: 'resign' } })).ok).toBe(false);
      await command(second, 'room:leave', { roomId: room.id });
      await until(async () => (await prisma.gameResultOutbox.findUnique({ where: { matchId } }))?.status === 'DELIVERED');
      const { GameCoinService } = await import('../gameCoinService');
      await GameCoinService.cancelMatch(matchId, 'duplicate_private_room_cancellation');
      for (const user of players) expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } })).balance).toBe(1000);
      expect((await prisma.match.findUniqueOrThrow({ where: { id: matchId } })).status).toBe('ABORTED');
      expect(await prisma.transaction.count({ where: { referenceId: matchId, referenceType: 'MATCH_PAYOUT' } })).toBe(0);
      expect(await prisma.gameResultOutbox.count({ where: { matchId } })).toBe(1);
    } finally { first.disconnect(); second.disconnect(); outsider.disconnect(); }
  }, 60000);
});

describe('private room initialization never awards an unstarted prize', () => {
  it.each(['carrom', 'snake-vs-worms'] as const)('%s rejects premature payouts and refunds a failed board load once', async gameId => {
    if (a.exitCode != null || a.signalCode != null) a = await server(aPort);
    const players = await Promise.all([createTestUser(), createTestUser()]);
    for (const user of players) await prisma.$transaction(tx => WalletTransactionService.createCredit(tx,
      { userId: user.id, amount: 1000, referenceType: 'ADMIN', referenceId: crypto.randomUUID() }));
    const first = await connect(aPort, players[0]!.id), second = await connect(bPort, players[1]!.id);
    const room = await command(first, 'room:create', { gameId, stake: 100, maxPlayers: 2, isPrivate: true });
    await command(second, 'room:join', { roomId: room.id });
    await command(first, 'room:ready', { roomId: room.id, ready: true });
    const invalidStart = await first.timeout(10000).emitWithAck('room:start', { roomId: room.id });
    expect(invalidStart.ok).toBe(false);
    for (const user of players) expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } })).balance).toBe(1000);
    await command(second, 'room:ready', { roomId: room.id, ready: true });
    await command(first, 'room:start', { roomId: room.id });
    const load = () => prisma.liveRoomCheckpoint.findUniqueOrThrow({ where: { id: room.id } });
    await until(async () => ((await load()).snapshot as any).room.status === 'playing');
    const matchId = (await load()).matchId!;
    await command(first, 'game:loaded', { roomId: room.id, matchId });
    await command(first, 'game:loaded', { roomId: room.id, matchId });
    expect(((await load()).snapshot as any).match.gameplayStartedAt).toBeNull();
    expect(((await load()).snapshot as any).match.actionHistory).toHaveLength(0);
    const payout = await fetch(`http://127.0.0.1:${apiPort}/internal/matches/${matchId}/settle`, {
      method: 'POST', headers: { 'x-internal-key': env.INTERNAL_API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ winnerIds: [players[0]!.id], reason: 'disconnect_grace_timeout' }),
    });
    expect(payout.status).toBe(409); await payout.body?.cancel();
    const { GameResultSecurityService } = await import('../gameResultSecurityService');
    await expect(GameResultSecurityService.validateForfeit({ matchId, forfeitingUserId: players[1]!.id })).rejects.toThrow('not completed');
    for (const user of players) expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } })).balance).toBe(900);
    await command(second, 'room:leave', { roomId: room.id });
    await until(async () => (await prisma.gameResultOutbox.findUnique({ where: { matchId } }))?.status === 'DELIVERED');
    const { GameCoinService } = await import('../gameCoinService');
    await GameCoinService.cancelMatch(matchId, 'repeat_initialization_failure');
    for (const user of players) expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } })).balance).toBe(1000);
    expect((await prisma.match.findUniqueOrThrow({ where: { id: matchId } })).status).toBe('ABORTED');
    expect(await prisma.transaction.count({ where: { referenceId: matchId, referenceType: 'MATCH_PAYOUT' } })).toBe(0);
    expect(await prisma.gameResultOutbox.count({ where: { matchId } })).toBe(1);
    first.disconnect(); second.disconnect();
  }, 60000);
});

describe('uniformCountdownRecovery / shared matchmaking / tournamentProvisioningRecovery', () => {
  it('releases the remaining account into a new room after a completed opponent departure and owner restart', async () => {
    if (a.exitCode != null || a.signalCode != null) a = await server(aPort);
    const players = await Promise.all([createTestUser(), createTestUser()]);
    for (const player of players) await prisma.$transaction(tx => WalletTransactionService.createCredit(tx,
      { userId: player.id, amount: 1000, referenceType: 'ADMIN', referenceId: crypto.randomUUID() }));
    const first = await connect(aPort, players[0]!.id), second = await connect(bPort, players[1]!.id);
    const created = await command(first, 'room:create', { gameId: 'table-tennis', stake: 100, maxPlayers: 2, isPrivate: true });
    await command(second, 'room:join', { code: created.code });
    await command(second, 'room:ready', { roomId: created.id, ready: true });
    await command(first, 'room:start', { roomId: created.id });
    const load = () => prisma.liveRoomCheckpoint.findUniqueOrThrow({ where: { id: created.id } });
    await until(async () => ((await load()).snapshot as any).room.status === 'playing');
    const matchId = (await load()).matchId!;
    await command(second, 'game:action', { roomId: created.id, matchId, action: { type: 'resign', actionId: crypto.randomUUID() } });
    await until(async () => (await prisma.gameResultOutbox.findUnique({ where: { matchId } }))?.status === 'DELIVERED');
    await command(first, 'room:leave', { roomId: created.id });
    const checkpoint = await load();
    expect((checkpoint.snapshot as any).players.map((p: any) => p.id)).toEqual([players[1]!.id]);
    expect((checkpoint.snapshot as any).match.engine.participants).toHaveLength(2);
    const balances = await Promise.all(players.map(player => prisma.wallet.findUniqueOrThrow({ where: { userId: player.id } })));
    await kill(a); first.disconnect();
    await until(async () => { const saved = await load(); return saved.ownerId !== checkpoint.ownerId && saved.fencingToken > checkpoint.fencingToken; }, 25000);
    const next = await command(second, 'room:create', { gameId: 'table-tennis', stake: 100, maxPlayers: 2, isPrivate: true });
    expect(next.id).not.toBe(created.id);
    expect(next.players.map((p: any) => p.id)).toEqual([players[1]!.id]);
    expect((await load()).closed).toBe(true);
    for (const [index, player] of players.entries()) {
      expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: player.id } })).balance).toBe(balances[index]!.balance);
    }
    expect(await prisma.gameResultOutbox.count({ where: { matchId } })).toBe(1);
    await command(second, 'room:leave', { roomId: next.id }); second.disconnect();
  }, 60000);

  it('restores an expired countdown deadline after owner death, funds once and starts once', async () => {
    const players = await Promise.all([createTestUser(), createTestUser()]);
    const first = await connect(aPort, players[0]!.id), second = await connect(bPort, players[1]!.id);
    const room = await command(first, 'room:create', { gameId: 'chess', stake: 0, maxPlayers: 2 });
    await command(second, 'room:join', { code: room.code });
    await Promise.all([command(first, 'room:ready', { roomId: room.id, ready: true }), command(second, 'room:ready', { roomId: room.id, ready: true })]);
    await command(first, 'room:start', { roomId: room.id });
    const before = await prisma.liveRoomCheckpoint.findUniqueOrThrow({ where: { id: room.id } });
    const deadline = (before.snapshot as any).room.countdownEndsAt;
    await kill(a); first.disconnect(); second.disconnect();
    await until(async () => { const current = await prisma.liveRoomCheckpoint.findUniqueOrThrow({ where: { id: room.id } }); return current.ownerId !== before.ownerId && (current.snapshot as any).room.status === 'playing'; }, 25000);
    const after = await prisma.liveRoomCheckpoint.findUniqueOrThrow({ where: { id: room.id } });
    expect(after.matchId).toBe(before.matchId);
    expect((after.snapshot as any).match.startedAt).toBe(deadline);
    expect((after.snapshot as any).room.lifecyclePhase).toBe('PLAYING');
    expect(await prisma.matchPlayer.count({ where: { matchId: before.matchId! } })).toBe(2);
    const reconnect = await connect(bPort, players[0]!.id); await command(reconnect, 'room:join', { roomId: room.id });
    const other = await connect(bPort, players[1]!.id); await command(other, 'room:join', { roomId: room.id });
    await command(other, 'game:action', { roomId: room.id, matchId: after.matchId, action: { type: 'resign' } });
    reconnect.disconnect(); other.disconnect(); a = await server(aPort);
  }, 60000);
  it('deduplicates concurrent starts and pauses countdown on disconnect without funding a new match', async () => {
    const players = await Promise.all([createTestUser(), createTestUser()]);
    const first = await connect(aPort, players[0]!.id), second = await connect(bPort, players[1]!.id);
    const room = await command(first, 'room:create', { gameId: 'chess', stake: 0, maxPlayers: 2 });
    await command(second, 'room:join', { roomId: room.id });
    await Promise.all([command(first, 'room:ready', { roomId: room.id, ready: true }), command(second, 'room:ready', { roomId: room.id, ready: true })]);
    await command(first, 'room:ready', { roomId: room.id, ready: true });
    const hostOnB = await connect(bPort, players[0]!.id);
    await command(hostOnB, 'room:join', { roomId: room.id });
    const starts = await Promise.all([first.timeout(10000).emitWithAck('room:start', { roomId: room.id }), hostOnB.timeout(10000).emitWithAck('room:start', { roomId: room.id })]);
    expect(starts.filter(r => r.ok)).toHaveLength(1);
    const load = () => prisma.liveRoomCheckpoint.findUniqueOrThrow({ where: { id: room.id } });
    const before = await load();
    second.disconnect();
    await until(async () => ((await load()).snapshot as any).room.lifecyclePhase === 'READY_CHECK');
    expect(((await load()).snapshot as any).room.countdownEndsAt).toBeNull();
    const rejoined = await connect(aPort, players[1]!.id);
    await command(rejoined, 'room:join', { roomId: room.id });
    await command(rejoined, 'room:ready', { roomId: room.id, ready: true });
    expect((await load()).matchId).toBe(before.matchId);
    await until(async () => ((await load()).snapshot as any).room.lifecyclePhase === 'PLAYING');
    expect(await prisma.matchPlayer.count({ where: { matchId: before.matchId! } })).toBe(2);
    await command(rejoined, 'game:action', { roomId: room.id, matchId: before.matchId, action: { type: 'resign' } });
    await until(async () => (await prisma.gameResultOutbox.findUnique({ where: { matchId: before.matchId! } }))?.status === 'DELIVERED');
    first.disconnect(); hostOnB.disconnect(); rejoined.disconnect();
  }, 60000);
  it('preserves selected Chess Quick Match settings across replicas, reconnect and rematch', async () => {
    const players = await Promise.all([createTestUser(), createTestUser()]);
    let first = await connect(aPort, players[0]!.id);
    const second = await connect(bPort, players[1]!.id);
    const settings = { timeControl: { baseSeconds: 600, incrementSeconds: 2, delaySeconds: 1 }, rated: false };
    const payload = { gameId: 'chess', stake: 0, gameMode: 'casual', settings };
    await command(first, 'matchmaking:join', payload);
    await command(second, 'matchmaking:join', { ...payload, settings: { timeControl: null, rated: false } });
    expect(await prisma.matchmakingQueue.count({ where: { userId: { in: players.map(p => p.id) }, status: 'MATCHED' } })).toBe(0);
    first.disconnect(); first = await connect(aPort, players[0]!.id);
    await command(first, 'matchmaking:join', payload);
    const found = socketOnce(first, 'matchmaking:found');
    await command(second, 'matchmaking:join', payload);
    const [room] = await found;
    const load = () => prisma.liveRoomCheckpoint.findUniqueOrThrow({ where: { id: room.roomId } });
    await until(async () => ((await load()).snapshot as any).room.status === 'playing');
    const before = await load();
    expect((before.snapshot as any).room.config.settings).toMatchObject(settings);
    expect((before.snapshot as any).match.engine.state.timeControl).toEqual(settings.timeControl);
    first.disconnect(); first = await connect(bPort, players[0]!.id);
    await command(first, 'room:join', { roomId: room.roomId });
    expect(((await load()).snapshot as any).room.config.settings).toMatchObject(settings);
    await command(second, 'game:action', { roomId: room.roomId, matchId: before.matchId, action: { type: 'resign' } });
    await until(async () => (await prisma.gameResultOutbox.findUnique({ where: { matchId: before.matchId! } }))?.status === 'DELIVERED');
    await command(first, 'game:rematch-request', { roomId: room.roomId });
    await command(second, 'game:rematch-accept', { roomId: room.roomId });
    await until(async () => { const next = await load(); return next.matchId !== before.matchId && (next.snapshot as any).room.status === 'playing'; });
    const next = await load();
    expect((next.snapshot as any).room.config.settings).toMatchObject(settings);
    expect((next.snapshot as any).match.engine.state.timeControl).toEqual(settings.timeControl);
    await command(second, 'game:action', { roomId: room.roomId, matchId: next.matchId, action: { type: 'resign' } });
    await until(async () => (await prisma.gameResultOutbox.findUnique({ where: { matchId: next.matchId! } }))?.status === 'DELIVERED');
    await command(first, 'room:leave', { roomId: room.roomId });
    await command(second, 'room:leave', { roomId: room.roomId });
    first.disconnect(); second.disconnect();
  }, 60000);
  it('pairs players connected to different replicas into one shared room', async () => {
    const players = await Promise.all([createTestUser(), createTestUser()]);
    const first = await connect(aPort, players[0]!.id), second = await connect(bPort, players[1]!.id);
    const found = socketOnce(first, 'matchmaking:found');
    await command(first, 'matchmaking:join', { gameId: 'chess', stake: 0, gameMode: 'casual' });
    await command(second, 'matchmaking:join', { gameId: 'chess', stake: 0, gameMode: 'casual' });
    const [room] = await found;
    const checkpoint = await prisma.liveRoomCheckpoint.findUniqueOrThrow({ where: { id: room.roomId } });
    expect((checkpoint.snapshot as any).players.map((p: any) => p.id).sort()).toEqual(players.map(p => p.id).sort());
    expect((checkpoint.snapshot as any).room.lifecyclePhase).toBe('COUNTDOWN');
    first.disconnect(); second.disconnect();
  });
  it('keeps a tournament provision retryable while unavailable, then provisions the same bracket identity', async () => {
    const { TournamentMatchService } = await import('../tournamentMatchService');
    const { runTournamentProvisioning } = await import('../tournamentProvisioningWorker');
    const players = await Promise.all([createTestUser(), createTestUser()]);
    const tournament = await prisma.tournament.create({ data: { title: 'Recovery fixture', description: 'Isolated integration', gameId: 'chess',
      startTime: new Date(), status: 'IN_PROGRESS', maxPlayers: 2, players: { create: players.map(p => ({ userId: p.id })) } } });
    const slot = await prisma.tournamentRound.create({ data: { tournamentId: tournament.id, roundNumber: 1, matchNumber: 1,
      status: 'READY', playerAId: players[0]!.id, playerBId: players[1]!.id } });
    const ids = await Promise.all([TournamentMatchService.ensureTournamentRoundMatch(slot.id), TournamentMatchService.ensureTournamentRoundMatch(slot.id)]);
    expect(ids[0]).toBe(ids[1]); const matchId = ids[0]!;
    const prior = process.env.SOCKET_SERVER_URL;
    try {
      process.env.SOCKET_SERVER_URL = 'http://127.0.0.1:19998'; await runTournamentProvisioning();
      expect((await prisma.tournamentProvisionJob.findUniqueOrThrow({ where: { matchId } })).status).toBe('FAILED_RETRYABLE');
      await prisma.tournamentProvisionJob.update({ where: { matchId }, data: { nextAttemptAt: new Date(0) } });
      process.env.SOCKET_SERVER_URL = `http://127.0.0.1:${bPort}`;
      await Promise.all([runTournamentProvisioning(), runTournamentProvisioning()]);
      expect((await prisma.tournamentProvisionJob.findUniqueOrThrow({ where: { matchId } })).status).toBe('READY');
      const checkpoint = await prisma.liveRoomCheckpoint.findUniqueOrThrow({ where: { id: matchId } });
      expect((checkpoint.snapshot as any).match.matchId).toBe(matchId);
      expect((await prisma.tournamentRound.findUniqueOrThrow({ where: { id: slot.id } })).matchId).toBe(matchId);
      const first = await connect(aPort, players[0]!.id), second = await connect(bPort, players[1]!.id);
      await command(first, 'room:join', { roomId: matchId }); await command(second, 'room:join', { roomId: matchId });
      await command(first, 'room:ready', { roomId: matchId, ready: true }); await command(second, 'room:ready', { roomId: matchId, ready: true });
      await command(first, 'room:start', { roomId: matchId });
      await until(async () => ((await prisma.liveRoomCheckpoint.findUniqueOrThrow({ where: { id: matchId } })).snapshot as any).room.status === 'playing');
      await command(second, 'game:action', { roomId: matchId, matchId, action: { type: 'resign' } });
      await until(async () => (await prisma.gameResultOutbox.findUnique({ where: { matchId } }))?.status === 'DELIVERED');
      expect((await prisma.tournamentRound.findUniqueOrThrow({ where: { id: slot.id } })).status).toBe('COMPLETED');
      first.disconnect(); second.disconnect();
    } finally { if (prior == null) delete process.env.SOCKET_SERVER_URL; else process.env.SOCKET_SERVER_URL = prior; }
  }, 60000);
});


describe('network failures with real HTTP and Redis transport', () => {
  async function paidChess() {
    const players = await Promise.all([createTestUser(), createTestUser()]);
    for (const p of players) await prisma.$transaction(tx => WalletTransactionService.createCredit(tx,
      { userId: p.id, amount: 1000, referenceType: 'ADMIN', referenceId: crypto.randomUUID() }));
    const first = await connect(aPort, players[0]!.id), second = await connect(bPort, players[1]!.id);
    const room = await command(first, 'room:create', { gameId: 'chess', stake: 100, maxPlayers: 2 });
    await command(second, 'room:join', { roomId: room.id });
    await command(first, 'room:ready', { roomId: room.id, ready: true }); await command(second, 'room:ready', { roomId: room.id, ready: true });
    await command(first, 'room:start', { roomId: room.id });
    await until(async () => ((await prisma.liveRoomCheckpoint.findUniqueOrThrow({ where: { id: room.id } })).snapshot as any).room.status === 'playing');
    const checkpoint = await prisma.liveRoomCheckpoint.findUniqueOrThrow({ where: { id: room.id } });
    return { players, first, second, room, matchId: checkpoint.matchId!, checkpoint };
  }
  it('refunds a funded intent when its HTTP acknowledgement is lost and the waiting room closes', async () => {
    const players = await Promise.all([createTestUser(), createTestUser()]);
    for (const p of players) await prisma.$transaction(tx => WalletTransactionService.createCredit(tx,
      { userId: p.id, amount: 1000, referenceType: 'ADMIN', referenceId: crypto.randomUUID() }));
    const first = await connect(aPort, players[0]!.id), second = await connect(bPort, players[1]!.id);
    try {
      const room = await command(first, 'room:create', { gameId: 'chess', stake: 100, maxPlayers: 2 });
      await command(second, 'room:join', { roomId: room.id });
      await command(first, 'room:ready', { roomId: room.id, ready: true }); await command(second, 'room:ready', { roomId: room.id, ready: true });
      loseFundingAck = true;
      const failed = await first.timeout(10000).emitWithAck('room:start', { roomId: room.id });
      expect(failed.ok).toBe(false);
      const saved = (await prisma.liveRoomCheckpoint.findUniqueOrThrow({ where: { id: room.id } })).snapshot as any;
      expect(saved.match).toBeNull(); expect(saved.room.pendingMatchId).toBeTruthy();
      const matchId = saved.room.pendingMatchId;
      expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: players[0]!.id } })).balance).toBe(900);
      await command(first, 'room:leave', { roomId: room.id }); await command(second, 'room:leave', { roomId: room.id });
      await until(async () => (await prisma.gameResultOutbox.findUnique({ where: { matchId } }))?.status === 'DELIVERED');
      expect((await prisma.match.findUniqueOrThrow({ where: { id: matchId } })).status).toBe('ABORTED');
      for (const p of players) expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: p.id } })).balance).toBe(1000);
      expect(await prisma.gameResultOutbox.count({ where: { matchId } })).toBe(1);
    } finally { loseFundingAck = false; first.disconnect(); second.disconnect(); }
  }, 60000);
  it('keeps API 503 results across owner death and retries a lost successful HTTP acknowledgement once', async () => {
    const f = await paidChess();
    try {
      settlementFault = 'unavailable';
      await command(f.second, 'game:action', { roomId: f.room.id, matchId: f.matchId, action: { type: 'resign' } });
      await until(async () => (await prisma.gameResultOutbox.findUnique({ where: { matchId: f.matchId } }))?.status === 'FAILED_RETRYABLE');
      expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: f.players[0]!.id } })).balance).toBe(900);
      // A retryable payout must retain its completed checkpoint until delivery.
      for (const client of [f.first, f.second]) {
        const rematch = await client.timeout(10000).emitWithAck('game:rematch-request', { roomId: f.room.id });
        expect(rematch.ok).toBe(false);
        expect(rematch.error.message).toContain('settlement is still processing');
      }
      expect((await prisma.liveRoomCheckpoint.findUniqueOrThrow({ where: { id: f.room.id } })).matchId).toBe(f.matchId);
      expect(await prisma.match.count({ where: { roomId: f.room.id } })).toBe(1);
      await kill(a); f.first.disconnect();
      settlementFault = 'loseAck';
      await until(async () => (await prisma.gameResultOutbox.findUnique({ where: { matchId: f.matchId } }))?.status === 'DELIVERED');
      expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: f.players[0]!.id } })).balance).toBe(1080);
      expect(await prisma.gameResultOutbox.count({ where: { matchId: f.matchId } })).toBe(1);
    } finally { settlementFault = 'none'; f.first.disconnect(); f.second.disconnect(); if (a.exitCode != null || a.signalCode != null) a = await server(aPort); }
  }, 60000);
  it('fails closed while real Redis transport is unavailable, then recovers and accepts one delayed duplicate action', async () => {
    const f = await paidChess();
    try {
      redisUnavailable = true; for (const link of redisLinks) link.destroy();
      const failed = await f.first.timeout(10000).emitWithAck('game:action', { roomId: f.room.id, matchId: f.matchId,
        action: { type: 'move', from: 'e2', to: 'e4', actionId: 'during-outage' } });
      expect(failed.ok).toBe(false);
      expect(((await prisma.liveRoomCheckpoint.findUniqueOrThrow({ where: { id: f.room.id } })).snapshot as any).match.actionHistory).toHaveLength(0);
      await new Promise(resolve => setTimeout(resolve, 6000)); redisUnavailable = false;
      await until(async () => (await prisma.liveRoomCheckpoint.findUniqueOrThrow({ where: { id: f.room.id } })).fencingToken > f.checkpoint.fencingToken, 25000);
      await command(f.first, 'room:join', { roomId: f.room.id }); await command(f.second, 'room:join', { roomId: f.room.id });
      const action = { type: 'move', from: 'e2', to: 'e4', actionId: 'after-outage', clientSequence: 2 };
      expect((await command(f.first, 'game:action', { roomId: f.room.id, matchId: f.matchId, action })).ok).toBe(true);
      expect((await command(f.first, 'game:action', { roomId: f.room.id, matchId: f.matchId, action })).ok).toBe(true);
      const delayed = await command(f.first, 'game:action', { roomId: f.room.id, matchId: f.matchId, action: { ...action, actionId: 'delayed-old-packet', clientSequence: 1 } });
      expect(delayed.ok).toBe(false); expect(delayed.error).toMatch(/sequence/);
      expect(((await prisma.liveRoomCheckpoint.findUniqueOrThrow({ where: { id: f.room.id } })).snapshot as any).match.actionHistory).toHaveLength(1);
      await command(f.second, 'game:action', { roomId: f.room.id, matchId: f.matchId, action: { type: 'resign' } });
      await until(async () => (await prisma.gameResultOutbox.findUnique({ where: { matchId: f.matchId } }))?.status === 'DELIVERED');
    } finally { redisUnavailable = false; f.first.disconnect(); f.second.disconnect(); }
  }, 60000);
});
