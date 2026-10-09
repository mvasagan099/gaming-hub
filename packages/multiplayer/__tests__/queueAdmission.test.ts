import { describe, it, expect, vi } from 'vitest';
import { BoundedRoomQueue } from '../src/utils/BoundedRoomQueue';
const gate = () => { let release!: () => void; const promise = new Promise<void>(r => release = r); return { promise, release }; };
describe('Bounded room admission', () => {
  it('rejects overflow before execution, preserves FIFO, and releases counters', async () => {
    const q = new BoundedRoomQueue(2, 4), g = gate(), order: number[] = [];
    const first = q.enqueue('a', async () => { await g.promise; order.push(1); });
    const second = q.enqueue('a', async () => { order.push(2); });
    const overflow = vi.fn(async () => {});
    await expect(q.enqueue('a', overflow)).rejects.toThrow('ROOM_QUEUE_OVERLOADED');
    expect(overflow).not.toHaveBeenCalled(); g.release(); await Promise.all([first, second]);
    expect(order).toEqual([1, 2]); expect(q.getMemoryStats()).toEqual({ pendingRoomQueues: 0, pendingOperations: 0 });
    expect(await q.enqueue('a', async () => 42)).toBe(42);
  });
  it('limits total ordinary work across rooms', async () => {
    const q = new BoundedRoomQueue(4, 2), g = gate();
    const work = ['a', 'b'].map(id => q.enqueue(id, () => g.promise));
    await expect(q.enqueue('c', async () => {})).rejects.toThrow('ROOM_QUEUE_OVERLOADED');
    g.release(); await Promise.all(work);
  });
  it('releases failed work and drains admitted successors', async () => {
    const q = new BoundedRoomQueue();
    const failed = q.enqueue('a', async () => { throw Error('failed'); });
    const successor = q.enqueue('a', async () => 42);
    await expect(failed).rejects.toThrow('failed'); await q.drain(); expect(await successor).toBe(42);
    expect(q.getMemoryStats().pendingOperations).toBe(0);
  });
  it('retains only 64 ordinary tasks during a 10000-command burst', async () => {
    const q = new BoundedRoomQueue(), g = gate(), execute = vi.fn(() => g.promise);
    const results = Promise.allSettled(Array.from({ length: 10000 }, () => q.enqueue('a', execute)));
    expect(q.getMemoryStats().pendingOperations).toBe(64); g.release();
    const done = await results; expect(done.filter(r => r.status === 'rejected')).toHaveLength(9936);
    expect(execute).toHaveBeenCalledTimes(64); expect(q.getMemoryStats().pendingOperations).toBe(0);
  });
  it('keeps trusted expiry callbacks in FIFO order when ordinary admission is full', async () => {
    const q = new BoundedRoomQueue(1, 1), g = gate(), order: string[] = [];
    const input = q.enqueue('a', async () => { await g.promise; order.push('input'); });
    const expiry = q.enqueue('a', async () => { order.push('expiry'); }, true);
    await expect(q.enqueue('a', async () => {})).rejects.toThrow('ROOM_QUEUE_OVERLOADED');
    g.release(); await Promise.all([input, expiry]); expect(order).toEqual(['input', 'expiry']);
  });
});
