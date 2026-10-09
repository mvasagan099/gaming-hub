import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DistributedRoomCoordinator } from '../../../apps/socket-server/src/distributed/coordinator';
import { MultiplayerFramework } from '../src/framework';
import { createTestFramework, createMatchRoom, makePlayer } from './helpers';
let framework: MultiplayerFramework;
const gate = () => { let release!: () => void; const promise = new Promise<void>(r => release = r); return { promise, release }; };
beforeEach(() => { MultiplayerFramework.resetInstance(); framework = createTestFramework({ enableReplay: false }); });
afterEach(async () => { vi.useRealTimers(); vi.restoreAllMocks(); await framework.shutdown(); });
function setup() {
  const subscriber = { status: 'ready', on: vi.fn(), off: vi.fn(), subscribe: vi.fn(), quit: vi.fn() };
  const redis = { duplicate: () => subscriber, status: 'ready', eval: vi.fn() };
  const store = { validateSchema: vi.fn(), commit: vi.fn().mockResolvedValue(1) };
  const coordinator = new DistributedRoomCoordinator(framework, redis as any, store as any);
  return { coordinator, store };
}
describe('Distributed admission and background coalescing', () => {
  it('limits per-user routing before retaining dispatch work and ignores client lifecycle flags', async () => {
    const { coordinator: c } = setup(), g = gate(), dispatch = vi.fn(() => g.promise);
    (c as any).dispatch = dispatch;
    const command = { event: 'room:create', playerId: 'a', socketId: 's', user: {}, payload: { lifecycle: true } };
    const work = Array.from({ length: 32 }, () => c.route(command));
    await expect(c.route(command)).rejects.toThrow('ROOM_QUEUE_OVERLOADED');
    expect(dispatch).toHaveBeenCalledTimes(32); expect(c.getMemoryStats().routingOperations).toBe(32);
    g.release(); await Promise.all(work); expect(c.getMemoryStats().routingPlayers).toBe(0);
  });
  it('rejects owner queue overflow before engine work or durable commit', async () => {
    const { coordinator: c, store } = setup(), g = gate();
    const room = createMatchRoom('chess', [makePlayer('a', 0), makePlayer('b', 1)]);
    framework.roomManager.registerRoom(room); (c as any).owned.set(room.id, { token: '1', revision: 0 });
    (c as any).ownership.assert = vi.fn(() => g.promise);
    const execute = vi.fn(async () => 42), work = Array.from({ length: 64 }, () => c.local(room.id, execute));
    await expect(c.local(room.id, execute)).rejects.toThrow('ROOM_QUEUE_OVERLOADED');
    expect(execute).not.toHaveBeenCalled(); expect(store.commit).not.toHaveBeenCalled();
    g.release(); await Promise.all(work); expect(execute).toHaveBeenCalledTimes(64);
    expect(store.commit).toHaveBeenCalledTimes(64); expect(c.getMemoryStats().pendingOwnerOperations).toBe(0);
  });
  it('allows only one in-flight recovery sweep and lease renewal per room', async () => {
    vi.useFakeTimers(); const { coordinator: c } = setup(), g = gate();
    (c as any).owned.set('a', { token: '1', revision: 0 });
    const recover = vi.spyOn(c, 'recoverExpired').mockImplementation(() => g.promise);
    const renew = vi.spyOn(c as any, 'renew').mockImplementation(() => g.promise);
    await c.start(vi.fn());
    try {
      await vi.advanceTimersByTimeAsync(20_000); expect(recover).toHaveBeenCalledOnce(); expect(renew).toHaveBeenCalledOnce();
      g.release(); await vi.advanceTimersByTimeAsync(4000); expect(recover.mock.calls.length).toBeGreaterThan(1);
    } finally { g.release(); await c.stop(); }
    expect(c.getMemoryStats().renewingRooms).toBe(0);
  });
});
