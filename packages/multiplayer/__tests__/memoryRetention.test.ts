import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MultiplayerFramework } from '../src/framework';
import { createTestFramework, createMatchRoom, makePlayer } from './helpers';
import { startMemoryDiagnostics } from '../../../apps/socket-server/src/memoryDiagnostics';

describe('bounded multiplayer memory', () => {
  let framework: MultiplayerFramework;
  beforeEach(async () => {
    MultiplayerFramework.resetInstance();
    framework = createTestFramework({ enableReplay: false });
    await framework.initialize();
  });
  afterEach(async () => { vi.useRealTimers(); await framework.shutdown(); MultiplayerFramework.resetInstance(); });

  it('releases room, player, sync, cache and timer records after 100 lifecycles', async () => {
    for (let n = 0; n < 100; n++) {
      const room = createMatchRoom('chess', [makePlayer(`a-${n}`, 0), makePlayer(`b-${n}`, 1)]);
      room.id = `memory-${n}`; room.code = room.id;
      framework.roomManager.registerRoom(room);
      framework.syncManager.handleStateAck(`a-${n}`, room.id, 1);
      framework.playerManager.recordActivity(`a-${n}`);
      framework.antiCheatManager.cacheActionResult(JSON.stringify([room.id, room.match!.matchId, `a-${n}`]), 'move', { state: room.match!.engine.serialize() });
      room.status = 'ended'; room.match!.finishedAt = Date.now();
      await framework.roomManager.closeRoom(room.id, 'test_cleanup');
    }
    const stats = framework.getMemoryStats();
    expect(stats.activeRoomCount).toBe(0);
    expect(stats.trackedPlayers).toBe(0);
    expect(stats.syncRooms).toBe(0);
    expect(stats.ackScopes).toBe(0);
    expect(stats.cachedActionResults).toBe(0);
    expect(stats.activeTimers).toBe(0);
    expect(stats.activeIntervals).toBe(1); // one framework-wide matchmaking sweep, no per-room intervals
  });

  it('bounds full action results independently of the TTL', () => {
    for (let n = 0; n < 1000; n++) framework.antiCheatManager.cacheActionResult('scope', `${n}`, { n });
    expect(framework.antiCheatManager.getMemoryStats().cachedActionResults).toBe(256);
    expect(framework.antiCheatManager.getCachedActionResult('scope', '0')).toBeNull();
    expect(framework.antiCheatManager.getCachedActionResult('scope', '999')).toEqual({ n: 999 });
  });

  it('releases settled operation queues while preserving serialization', async () => {
    let unblock!: () => void;
    const order: number[] = [];
    const first = framework.gameStateManager.enqueue('room', async () => { await new Promise<void>(r => { unblock = r; }); order.push(1); });
    const second = framework.gameStateManager.enqueue('room', async () => { order.push(2); });
    await Promise.resolve(); unblock(); await Promise.all([first, second]);
    expect(order).toEqual([1, 2]);
    expect(framework.gameStateManager.getMemoryStats().pendingRoomQueues).toBe(0);
  });

  it('bounds room-scoped acknowledgements and ignores unknown rooms or users', () => {
    const room = createMatchRoom('chess', [makePlayer('a', 0), makePlayer('b', 1)]);
    framework.roomManager.registerRoom(room);
    for (let n = 0; n < 1000; n++) {
      framework.syncManager.handleStateAck('a', room.id, n);
      framework.syncManager.handleStateAck('a', `unknown-${n}`, n);
      framework.syncManager.handleStateAck(`intruder-${n}`, room.id, n);
    }
    const acks = (framework.syncManager as any).acknowledgedSequences;
    expect(acks.size).toBe(1); expect(acks.get(`${room.id}:a`).size).toBe(128);
  });

  it('does not reapply an action after its full result has been evicted', async () => {
    const room = createMatchRoom('chess', [makePlayer('a', 0), makePlayer('b', 1)]);
    framework.roomManager.registerRoom(room);
    const action = { type: 'move', from: 'e2', to: 'e4', actionId: 'original' };
    const first = await framework.matchManager.applyAction({ roomId: room.id, playerId: 'a', action });
    expect(first.ok).toBe(true);
    for (let n = 0; n < 1000; n++) framework.antiCheatManager.cacheActionResult('other', `${n}`, { n });
    const apply = vi.spyOn(room.match!.engine, 'apply');
    const retry = await framework.matchManager.applyAction({ roomId: room.id, playerId: 'a', action });
    expect(retry.ok).toBe(true); expect(retry.events).toEqual([]); expect(apply).not.toHaveBeenCalled();
    expect(room.match!.actionHistory).toHaveLength(1);
    room.status = 'ended'; room.match!.finishedAt = Date.now();
  });

  it('owns one delayed spectator timer per room and coalesces transient snapshots', async () => {
    vi.useFakeTimers();
    const room = createMatchRoom('table-tennis', [makePlayer('a', 0), makePlayer('b', 1)]);
    framework.roomManager.registerRoom(room);
    const manager = framework.spectatorManager as any;
    manager.spectatorConfigs.set(room.id, { delaySeconds: 15 });
    for (let n = 0; n < 1000; n++) await manager.broadcastToSpectators(room.id, 'game:state', { state: { n }, events: [] });
    expect(manager.delayBuffers.get(room.id)).toHaveLength(1);
    expect(manager.getMemoryStats().spectatorTimers).toBe(1);
    await manager.broadcastToSpectators(room.id, 'game:state', { events: [{ type: 'score' }] });
    expect(manager.delayBuffers.get(room.id)).toHaveLength(2);
    manager.releaseRoom(room.id);
    expect(manager.getMemoryStats()).toEqual({ spectatorTimers: 0, spectatorBuffers: 0, spectators: 0 });
  });

  it('expires inactive security profiles without removing active ones', () => {
    vi.useFakeTimers(); framework.antiCheatManager.releasePlayer('inactive');
    vi.advanceTimersByTime(2 * 60 * 60 * 1000 + 1);
    expect(framework.antiCheatManager.getMemoryStats().idleSecurityProfiles).toBe(0);
  });

  it('logs aggregate memory and event-loop diagnostics and stops its timer', () => {
    vi.useFakeTimers(); const log = vi.fn();
    const stop = startMemoryDiagnostics(() => ({ connectedSocketCount: 2 }), log);
    vi.advanceTimersByTime(60000);
    expect(log).toHaveBeenCalledOnce();
    expect(log.mock.calls[0][0]).toMatchObject({ connectedSocketCount: 2, rss: expect.any(Number), heapUsed: expect.any(Number), eventLoopDelayMs: { p50: expect.any(Number), p95: expect.any(Number), p99: expect.any(Number) } });
    stop(); vi.advanceTimersByTime(60000); expect(log).toHaveBeenCalledOnce();
  });
});
