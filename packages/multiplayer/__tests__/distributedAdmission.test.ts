import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DistributedRoomCoordinator } from '../../../apps/socket-server/src/distributed/coordinator';
import { MultiplayerFramework } from '../src/framework';
import { createTestFramework, createMatchRoom, makePlayer } from './helpers';

describe('distributed coordinator admission', () => {
  let framework: MultiplayerFramework;
  beforeEach(() => { MultiplayerFramework.resetInstance(); framework = createTestFramework({ enableReplay: false }); });
  afterEach(async () => { await framework.shutdown(); vi.restoreAllMocks(); vi.useRealTimers(); });
  function coordinator(store: object = {}) {
    const redis = { duplicate: () => ({ on: vi.fn() }) };
    return new DistributedRoomCoordinator(framework, redis as never, store as never);
  }
  it('bounds per-user routing before database lookup and releases admission slots', async () => {
    let release!: () => void;
    const gate = new Promise<void>(r => { release = r; });
    const c = coordinator();
    const dispatch = vi.fn(async () => { await gate; return 'created'; });
    (c as any).dispatch = dispatch;
    const command = { event: 'room:create', playerId: 'a', socketId: 's', user: {}, payload: { lifecycle: true } };
    const requests = Array.from({ length: 32 }, () => c.route(command));
    await expect(c.route(command)).rejects.toThrow('ROOM_QUEUE_OVERLOADED');
    expect(dispatch).toHaveBeenCalledTimes(32);
    expect(c.getMemoryStats().routingOperations).toBe(32);
    release(); await Promise.all(requests);
    expect(c.getMemoryStats()).toMatchObject({ routingOperations: 0, routingPlayers: 0 });
  });
  it('bounds the actual owner queue before fencing, dispatch or checkpoint mutation', async () => {
    const r = createMatchRoom('chess', [makePlayer('a', 0), makePlayer('b', 1)]);
    framework.roomManager.registerRoom(r);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const commit = vi.fn().mockResolvedValue(1);
    const c = coordinator({ commit });
    (c as any).owned.set(r.id, { token: '1', revision: 0 });
    const assert = vi.fn(async () => { await gate; });
    (c as any).ownership.assert = assert;
    const work = vi.fn().mockResolvedValue('ok');
    const requests = Array.from({ length: 64 }, () => c.local(r.id, work));
    await expect(c.local(r.id, work)).rejects.toThrow('ROOM_QUEUE_OVERLOADED');
    expect(work).not.toHaveBeenCalled(); expect(commit).not.toHaveBeenCalled();
    expect(c.getMemoryStats().pendingOwnerOperations).toBe(64);
    release(); await Promise.all(requests);
    expect(work).toHaveBeenCalledTimes(64); expect(commit).toHaveBeenCalledTimes(64);
    expect(c.getMemoryStats()).toMatchObject({ ownerQueues: 0, pendingOwnerOperations: 0 });
  });
  it('does not accumulate overlapping recovery or lease-renewal operations', async () => {
    vi.useFakeTimers();
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const subscriber = { status: 'ready', on: vi.fn(), off: vi.fn(), subscribe: vi.fn(), quit: vi.fn() };
    const redis = { duplicate: () => subscriber, eval: vi.fn() };
    const c = new DistributedRoomCoordinator(framework, redis as never, { validateSchema: vi.fn() } as never);
    const recover = vi.spyOn(c, 'recoverExpired').mockImplementation(() => gate);
    const renew = vi.spyOn(c as any, 'renew').mockImplementation(() => gate);
    (c as any).owned.set('room', { token: '1', revision: 0 });
    await c.start(vi.fn());
    await vi.advanceTimersByTimeAsync(20000);
    expect(recover).toHaveBeenCalledOnce(); expect(renew).toHaveBeenCalledOnce();
    release(); await Promise.resolve(); await Promise.resolve();
    await vi.advanceTimersByTimeAsync(4000);
    expect(recover.mock.calls.length).toBeGreaterThan(1);
    await c.stop();
    expect(c.getMemoryStats().renewingRooms).toBe(0);
  });
});
