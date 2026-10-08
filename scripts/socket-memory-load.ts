/** Disposable local runtime/Socket.IO memory exercise. No DB or financial writes. */
import { writeFileSync } from 'node:fs';
import { performance, monitorEventLoopDelay } from 'node:perf_hooks';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import Redis from 'ioredis';
import { io as connect } from 'socket.io-client';
import { MultiplayerFramework } from '../packages/multiplayer/src/framework';
import { createMatchRoom, makePlayer } from '../packages/multiplayer/__tests__/helpers';

const target = process.argv[2];
if (!target || !global.gc) throw new Error('Specify report output and run Node with --expose-gc');
const http = createServer();
const io = new Server(http, { transports: ['websocket'] });
let connected = 0, peakSockets = 0;
io.on('connection', socket => {
  connected++; peakSockets = Math.max(peakSockets, connected);
  socket.on('echo', (_data, ack) => ack());
  socket.on('disconnect', () => { connected--; });
});
await new Promise<void>(resolve => http.listen(0, '127.0.0.1', resolve));
const address = http.address() as { port: number };
const endpoint = `http://127.0.0.1:${address.port}`;
const framework = MultiplayerFramework.getInstance({ io, enableReplay: false, enableAntiCheat: false,
  // Exercise production's one-snapshot mode without a DB. Ownership fencing is
  // separately verified by real two-server restart tests; this is not that test.
  executeRoomTask: async (_id, task) => task() });
await framework.initialize();
const redisUrl = process.env.SOCKET_MEMORY_REDIS_URL;
if (redisUrl && !['localhost', '127.0.0.1', '::1'].includes(new URL(redisUrl).hostname)) throw new Error('Local Redis only');
const redis = redisUrl ? new Redis(redisUrl) : null;
const socketLatencyMs: number[] = [], redisLatencyMs: number[] = [];
let lastCpu = process.cpuUsage(), lastCpuAt = performance.now();
const samples: any[] = [], actionTimes: Record<string, number[]> = {};
let peakRss = 0, peakHeap = 0;
const counters = () => Object.fromEntries(['roomManager','playerManager','syncManager','gameStateManager','antiCheatManager','timerManager','spectatorManager']
  .map(key => [key, Object.fromEntries(Object.entries((framework as any)[key])
    .filter(([, value]) => value instanceof Map || value instanceof Set).map(([name, value]: any) => [name, value.size]))]));
const sample = (label: string) => {
  global.gc!(); const memory = process.memoryUsage(); peakRss = Math.max(peakRss, memory.rss); peakHeap = Math.max(peakHeap, memory.heapUsed);
  const cpu = process.cpuUsage(), now = performance.now();
  const cpuPercent = ((cpu.user - lastCpu.user + cpu.system - lastCpu.system) / 1000 / Math.max(1, now - lastCpuAt)) * 100;
  lastCpu = cpu; lastCpuAt = now;
  samples.push({ label, ...memory, cpuPercent, statePayloadBytes: (framework.syncManager as any).getMemoryStats?.().statePayloadBytes, sockets: connected, adapterRooms: io.sockets.adapter.rooms.size, counters: counters() });
};
const lag = monitorEventLoopDelay({ resolution: 10 }); lag.enable();
let next = 0;
const create = (gameId: 'carrom' | 'table-tennis' | 'snake-vs-worms') => {
  const id = ++next;
  const room = createMatchRoom(gameId, [makePlayer(`load-${id}-a`, 0), makePlayer(`load-${id}-b`, 1)]);
  room.id = `load-${id}`; room.ioName = room.id; room.code = room.id; room.match!.matchId = room.id;
  framework.roomManager.registerRoom(room);
  return room;
};
const play = async (room: ReturnType<typeof create>, count = 12) => {
  for (let i = 0; i < count; i++) {
    const engine = room.match!.engine as any;
    const action = room.config.gameId === 'carrom' ? { type: 'strike', x: 300, angle: -Math.PI / 2, power: 0.05 }
      : room.config.gameId === 'table-tennis' ? { type: 'paddle-move', y: 150 + i % 70, velocity: 0 }
      : { type: i % 2 ? 'boost-stop' : 'boost-start' };
    const seat = room.config.gameId === 'carrom' ? engine.state.currentSeat : i % 2;
    const player = [...room.players.values()].find(p => p.seat === seat)!;
    const at = performance.now();
    const result = engine.apply(action, seat);
    if (!result.ok) throw new Error(`Load action rejected: ${result.error}`);
    const events = framework.eventDispatcher.toGameEvents(room, result.events);
    framework.gameStateManager.recordResult(room, result, player.id, seat, { ...action, actionId: `${room.id}:${i}` }, events);
    framework.antiCheatManager.cacheActionResult(JSON.stringify([room.id, room.match!.matchId, player.id]), `${room.id}:${i}`, result);
    framework.syncManager.handleStateAck(player.id, room.id, i);
    framework.playerManager.recordActivity(player.id);
    await framework.gameStateManager.enqueue(room.id, async () => {});
    await framework.syncManager.broadcastGameState(room, result.events);
    (actionTimes[room.config.gameId] ??= []).push(performance.now() - at);
  }
};
const close = async (room: ReturnType<typeof create>) => {
  // Financial completion is outside this no-DB load harness.
  room.status = 'ended'; room.match!.finishedAt = Date.now();
  await framework.roomManager.closeRoom(room.id, 'memory_exercise_finished');
};
sample('baseline');
for (let i = 0; i < 100; i++) { const room = create((['carrom','table-tennis','snake-vs-worms'] as const)[i % 3]); await play(room); await close(room); if (i % 20 === 19) sample(`lifecycle-${i+1}`); }
sample('after-100-lifecycles');
for (let count of [10,25,50]) {
  const clients = await Promise.all(Array.from({ length: count * 2 }, () => new Promise<ReturnType<typeof connect>>(resolve => {
    const client = connect(endpoint, { transports: ['websocket'], forceNew: true, reconnection: false }); client.once('connect', () => resolve(client));
  })));
  const rooms = Array.from({ length: count }, (_, i) => create((['carrom','table-tennis','snake-vs-worms'] as const)[i % 3]));
  await Promise.all(rooms.map(room => play(room, 40))); sample(`active-${count}-games`);
  await Promise.all(rooms.map(close)); clients.forEach(client => client.disconnect());
  rooms.length = 0; clients.length = 0;
  await new Promise(resolve => setTimeout(resolve, 50)); sample(`cleaned-${count}-games`);
}
for (let i = 0; i < 500; i++) {
  const client = connect(endpoint, { transports: ['websocket'], forceNew: true, reconnection: false });
  await new Promise<void>(resolve => client.once('connect', resolve));
  let at = performance.now(); await client.emitWithAck('echo', null); socketLatencyMs.push(performance.now() - at);
  if (redis) { at = performance.now(); await redis.ping(); redisLatencyMs.push(performance.now() - at); }
  client.disconnect();
  if (i % 100 === 99) { await new Promise(resolve => setTimeout(resolve, 20)); sample(`reconnect-${i+1}`); }
}
await new Promise(resolve => setTimeout(resolve, 100)); sample('final');
lag.disable();
const percentile = (values: number[], p: number) => [...values].sort((a,b)=>a-b)[Math.min(values.length-1,Math.floor(values.length*p))];
writeFileSync(target, JSON.stringify({ scope: 'local runtime + actual Socket.IO; no Redis/PG/financial writes',
  lifecycleGames: 100, reconnectCycles: 500, concurrentGames: [10,25,50], peakSockets, peakRss, peakHeap,
  actionLatencyMs: Object.fromEntries(Object.entries(actionTimes).map(([game, times]) => [game, { p50: percentile(times,.5), p95: percentile(times,.95), p99: percentile(times,.99) }])),
  socketLatencyMs: { p50: percentile(socketLatencyMs,.5), p95: percentile(socketLatencyMs,.95), p99: percentile(socketLatencyMs,.99) },
  redisLatencyMs: redis ? { p50: percentile(redisLatencyMs,.5), p95: percentile(redisLatencyMs,.95), p99: percentile(redisLatencyMs,.99) } : null,
  eventLoopDelayMs: { p50: lag.percentile(50)/1e6,p95:lag.percentile(95)/1e6,p99:lag.percentile(99)/1e6 }, samples }, null, 2));
await redis?.quit(); await framework.shutdown(); await new Promise<void>(resolve => io.close(() => resolve()));
