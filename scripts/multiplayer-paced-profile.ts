/** Local fixture profiler. Real Socket.IO delivery, no auth/DB/financial calls.
 * Deliberately paced; GC retention is a separate, untimed measurement.
 * Run: node --expose-gc --import tsx scripts/multiplayer-paced-profile.ts report.json
 */
import { writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { performance, monitorEventLoopDelay } from 'node:perf_hooks';
import { Server } from 'socket.io';
import { io as connect } from 'socket.io-client';
import type { EngineInstance } from '../packages/game-engine/src/types';
import { createEngine } from '../packages/game-engine/src/registry';
import { MultiplayerFramework } from '../packages/multiplayer/src/framework';
import { createMatchRoom, makePlayer } from '../packages/multiplayer/__tests__/helpers';
import { isValidStrikerPlacement } from '../packages/game-engine/src/carrom/physics';
import { StateValidator } from '../packages/multiplayer/src/utils/StateValidator';

const output = process.argv[2];
if (!output) throw new Error('Report path required');
const durationMs = Number(process.env.PROFILE_DURATION_MS ?? 60000);
if (!Number.isFinite(durationMs) || durationMs < 10000 || durationMs > 180000) throw new Error('Duration must be 10–180 seconds');
const originalLog = console.log;
console.log = () => {}; // Engine debug output is not part of CPU profiling.
const http = createServer(), io = new Server(http, { transports: ['websocket'] });
io.on('connection', socket => {
  socket.join(String(socket.handshake.query.room));
  socket.on('profile:join', async (roomId, ack) => {
    for (const room of socket.rooms) if (room !== socket.id) await socket.leave(room);
    await socket.join(roomId); ack();
  });
});
await new Promise<void>(resolve => http.listen(0, '127.0.0.1', resolve));
const port = (http.address() as { port: number }).port;
const tails = new Map<string, Promise<void>>();
let pending = 0, peakPending = 0, broadcastCount = 0, receivedCount = 0;
const framework = MultiplayerFramework.getInstance({ io, enableReplay: false, enableAntiCheat: false,
  executeRoomTask: (id, task) => {
    pending++; peakPending = Math.max(peakPending, pending);
    const next = (tails.get(id) ?? Promise.resolve()).then(task);
    const settled = next.then(() => {}, () => {}).finally(() => { pending--; if (tails.get(id) === settled) tails.delete(id); });
    tails.set(id, settled); return next;
  } });
await framework.initialize();
const games = ['carrom', 'table-tennis', 'snake-vs-worms'] as const;
const generations = [0, 0, 0];
const completedGames: object[] = [];
function createRoom(game: typeof games[number], index: number) {
  const generation = generations[index]!;
  const players = [makePlayer(`${game}-${generation}-a`, 0), makePlayer(`${game}-${generation}-b`, 1)];
  const room = createMatchRoom(game, players);
  let seed = 20261008 + index + generation * 100;
  const rng = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  room.match!.engine = createEngine(game, players.map(p => ({ userId: p.id, seat: p.seat! })), rng);
  room.id = room.ioName = room.code = `paced-${game}-${generation}`; room.match!.matchId = room.id;
  framework.roomManager.registerRoom(room); return room;
}
const rooms = games.map(createRoom);
const clients = await Promise.all(rooms.flatMap(room => [0, 1].map(() => new Promise<ReturnType<typeof connect>>((resolve, reject) => {
  const client = connect(`http://127.0.0.1:${port}`, { query: { room: room.id }, transports: ['websocket'], reconnection: false, autoConnect: false });
  client.on('game:state', () => { receivedCount++; });
  client.once('connect_error', reject); client.once('connect', () => resolve(client)); client.connect();
}))));
const actionTimes: Record<string, number[]> = {}, physicsTimes: Record<string, number[]> = {}, pipelineTimes: Record<string, number[]> = {}, physicsPipelineTimes: Record<string, number[]> = {}, queueWaitTimes: number[] = [];
const samples: object[] = []; let peakRss = 0, peakHeap = 0;
const sample = () => { const m = process.memoryUsage(); peakRss = Math.max(peakRss, m.rss); peakHeap = Math.max(peakHeap, m.heapUsed); samples.push({ atMs: performance.now() - start, ...m, pending }); };
const loop = monitorEventLoopDelay({ resolution: 10 });
const cpuStart = process.cpuUsage(), start = performance.now(); loop.enable();
const activeDurationMs: Record<string, number> = Object.fromEntries(games.map(game => [game, 0]));
let nextControl = start, nextShot = start, nextSample = start, lastTick = start, sequence = 0, rejected = 0;
async function apply(room: typeof rooms[number], action: any, seat: number, tick = false, elapsed = 0) {
  const submittedAt = performance.now();
  await framework.gameStateManager.enqueue(room.id, async () => {
    queueWaitTimes.push(performance.now() - submittedAt);
    const engine = room.match!.engine as any, at = performance.now();
    const result = tick ? engine.tick(elapsed) : engine.apply(action, seat);
    const measured = performance.now() - at;
    if (!result.ok) { rejected++; throw new Error(`${room.config.gameId}: ${result.error}`); }
    ((tick ? physicsTimes : actionTimes)[room.config.gameId] ??= []).push(measured);
    if (!tick && room.config.gameId === 'carrom' && action.type === 'strike') (physicsTimes.carrom ??= []).push(measured);
    const player = [...room.players.values()].find(p => p.seat === seat)!;
    if (!tick) framework.gameStateManager.recordResult(room, result, player.id, seat,
      { ...action, actionId: `paced-${++sequence}` }, framework.eventDispatcher.toGameEvents(room, result.events));
    framework.playerManager.recordActivity(player.id);
    await framework.syncManager.broadcastGameState(room, result.events); broadcastCount++;
  });
  ((tick ? physicsPipelineTimes : pipelineTimes)[room.config.gameId] ??= []).push(performance.now() - submittedAt);
}
try {
  for (const room of rooms.slice(1)) for (const seat of [0, 1]) await apply(room, { type: 'ready' }, seat);
  while (performance.now() - start < durationMs) {
    const now = performance.now(), elapsed = now - lastTick; lastTick = now;
    for (let i = 0; i < rooms.length; i++) {
      const room = rooms[i]!;
      if ((room.match!.engine as EngineInstance).finished) {
        completedGames.push({ game: room.config.gameId, generation: generations[i], winnerSeats: (room.match!.engine as EngineInstance).winnerSeats, atMs: now - start });
        room.status = 'ended'; room.match!.finishedAt = Date.now();
        await framework.roomManager.closeRoom(room.id, 'profile_round_complete');
        generations[i]!++; rooms[i] = createRoom(games[i]!, i);
        await Promise.all(clients.slice(i * 2, i * 2 + 2).map(client => client.timeout(1000).emitWithAck('profile:join', rooms[i]!.id)));
        if (i > 0) for (const seat of [0, 1]) await apply(rooms[i]!, { type: 'ready' }, seat);
      }
      activeDurationMs[room.config.gameId]! += elapsed;
    }
    for (const room of rooms.slice(1)) {
      const engine = room.match!.engine as any;
      if (!engine.finished) await apply(room, {}, 0, true, elapsed);
    }
    if (now >= nextControl) {
      nextControl = now + 100; // 10 Hz input, 30 Hz physics/broadcast loop.
      const tennis = rooms[1]!, te = tennis.match!.engine as any;
      if (!te.finished) {
        if (te.state.phase === 'serve') await apply(tennis, { type: 'serve', angle: 0 }, te.state.servingSeat);
        for (const seat of [0, 1]) await apply(tennis, { type: 'paddle-move', y: Math.max(0, Math.min(320, (te.state.ball?.y ?? 200) - 40)) }, seat);
      }
      const snake = rooms[2]!, se = snake.match!.engine as any;
      if (!se.finished) for (const p of se.state.players) if (p.seat < 2 && p.status !== 'eliminated') {
        const directions = ['right', 'down', 'left', 'up'];
        const direction = directions[(directions.indexOf(p.direction) + (Math.floor((now - start) / 2000) % 2 ? 1 : 0)) % 4];
        await apply(snake, { type: 'direction', direction, sequenceNumber: sequence + 1 }, p.seat);
      }
    }
    if (now >= nextShot) {
      nextShot = now + 3000;
      const room = rooms[0]!, engine = room.match!.engine as any;
      if (!engine.finished) {
        // Find a legal baseline gap; invalid placements cannot mutate state.
        const seat = engine.state.currentSeat;
        let x: number | undefined;
        for (let candidate = 180; candidate <= 420; candidate += 10) {
          if (isValidStrikerPlacement(candidate, seat, engine.state.coins)) { x = candidate; break; }
        }
        if (x === undefined) throw new Error('No legal Carrom placement');
        await apply(room, { type: 'place-striker', x }, seat);
        await apply(room, { type: 'strike', x, angle: seat === 0 ? -Math.PI / 2 : Math.PI / 2, power: 0.35 }, seat);
      }
    }
    if (now >= nextSample) { sample(); nextSample = now + 1000; }
    await new Promise(resolve => setTimeout(resolve, 1000 / 30)); // Never catch up in a burst.
  }
  sample(); loop.disable();
  const elapsed = performance.now() - start, cpu = process.cpuUsage(cpuStart);
  const distribution = (values: number[]) => { const a = [...values].sort((a, b) => a - b); return { count: a.length, p50: a[Math.floor(a.length * .5)] ?? null, p95: a[Math.floor(a.length * .95)] ?? null, p99: a[Math.floor(a.length * .99)] ?? null }; };
  const costs = Object.fromEntries(rooms.map(room => {
    const state = (room.match!.engine as EngineInstance).serialize();
    const run = (fn: () => unknown) => { const values = []; for (let i = 0; i < 100; i++) { const at = performance.now(); fn(); values.push(performance.now() - at); } return distribution(values); };
    return [room.config.gameId, { bytes: Buffer.byteLength(JSON.stringify(state)), jsonCloneMs: run(() => JSON.parse(JSON.stringify(state))), structuredCloneMs: run(() => structuredClone(state)), serializationMs: run(() => (room.match!.engine as EngineInstance).serialize()), jsonEncodeMs: run(() => JSON.stringify(state)), hashMs: run(() => StateValidator.calculateHash(state)) }];
  }));
  const activeCounts = framework.getMemoryStats();
  for (const client of clients) client.disconnect();
  for (const room of rooms) { room.status = 'ended'; room.match!.finishedAt = Date.now(); await framework.roomManager.closeRoom(room.id, 'profile_complete'); }
  await new Promise(resolve => setTimeout(resolve, 100));
  const beforeGc = process.memoryUsage(); const gcAt = performance.now(); global.gc?.();
  const retention = { forcedGcAvailable: !!global.gc, forcedGcMs: performance.now() - gcAt, beforeGc, afterGc: process.memoryUsage(), cleanupCounts: framework.getMemoryStats() };
  const byGame = (times: Record<string, number[]>) => Object.fromEntries(
    Object.entries(times).map(([game, values]) => [game, distribution(values)]));
  const report = {
    nodeVersion: process.version,
    scope: 'Three paced local engine fixtures with six receiving Socket.IO clients; excludes authentication, PostgreSQL, Redis fencing, anti-cheat and settlement. Not a capacity or deployed-OOM claim.',
    durationMs: elapsed,
    seeds: games.map((game, i) => ({ game, seed: 20261008 + i, nextRoundSeedIncrement: 100 })),
    completedGames, activeDurationMs,
    cpuPercentOfOneCore: (cpu.user + cpu.system) / 1000 / elapsed * 100,
    cpu, peakRss, peakHeap,
    eventLoopDelayMs: {
      p50: loop.percentile(50) / 1e6,
      p95: loop.percentile(95) / 1e6,
      p99: loop.percentile(99) / 1e6,
    },
    actionLatencyMs: byGame(actionTimes),
    actionPipelineLatencyMs: byGame(pipelineTimes),
    physicsPipelineLatencyMs: byGame(physicsPipelineTimes),
    queueWaitMs: distribution(queueWaitTimes),
    physicsLatencyMs: byGame(physicsTimes),
    rejectedActions: rejected,
    queueDepth: {
      peakPending, finalPending: pending,
      scope: 'Instrumented local serial tasks, excludes distributed RPC backlog',
    },
    broadcastCount, expectedDeliveries: broadcastCount * 2,
    broadcastsPerSecond: broadcastCount / elapsed * 1000,
    receivedCount, costs, activeCounts, samples, retention,
  };
  writeFileSync(output, JSON.stringify(report, null, 2));
} finally {
  loop.disable(); clients.forEach(client => client.disconnect()); await framework.shutdown();
  await new Promise<void>(resolve => io.close(() => resolve())); console.log = originalLog;
}
