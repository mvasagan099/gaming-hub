import { describe, expect, it } from 'vitest';
import { BoundedRoomQueue } from '../src/utils/BoundedRoomQueue';

describe('bounded room admission', () => {
  it('retains a trusted expiry callback when player admission is full', async () => {
    const queue = new BoundedRoomQueue(1, 1);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const order: string[] = [];
    const input = queue.enqueue('room', async () => { await gate; order.push('input'); });
    await expect(queue.enqueue('room', async () => {})).rejects.toThrow('ROOM_QUEUE_OVERLOADED');
    const expiry = queue.enqueue('room', async () => { order.push('expiry'); }, true);
    release(); await Promise.all([input, expiry]);
    expect(order).toEqual(['input', 'expiry']);
    expect(queue.getMemoryStats().pendingOperations).toBe(0);
  });
  it('rejects overflow before executing work, preserves FIFO and releases slots', async () => {
    const queue = new BoundedRoomQueue(2, 4);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const order: number[] = [];
    const a = queue.enqueue('room', async () => { await gate; order.push(1); });
    const b = queue.enqueue('room', async () => { order.push(2); });
    await expect(queue.enqueue('room', async () => { order.push(3); })).rejects.toThrow('ROOM_QUEUE_OVERLOADED');
    expect(queue.getMemoryStats()).toEqual({ pendingRoomQueues: 1, pendingOperations: 2 });
    release(); await Promise.all([a, b]);
    expect(order).toEqual([1, 2]);
    expect(queue.getMemoryStats()).toEqual({ pendingRoomQueues: 0, pendingOperations: 0 });
    await queue.enqueue('room', async () => { order.push(4); });
    expect(order).toEqual([1, 2, 4]);
  });
  it('bounds aggregate backlog across different rooms', async () => {
    const queue = new BoundedRoomQueue(4, 2);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const a = queue.enqueue('a', () => gate);
    const b = queue.enqueue('b', () => gate);
    await expect(queue.enqueue('c', async () => 3)).rejects.toThrow('ROOM_QUEUE_OVERLOADED');
    release(); await Promise.all([a, b]);
    expect(queue.getMemoryStats().pendingOperations).toBe(0);
  });
  it('continues after failed work and drains without discarding admitted operations', async () => {
    const queue = new BoundedRoomQueue(2, 2);
    const a = queue.enqueue('room', async () => { throw new Error('invalid action'); });
    const failure = expect(a).rejects.toThrow('invalid action');
    const b = queue.enqueue('room', async () => 42);
    await queue.drain(); await failure;
    expect(await b).toBe(42);
    expect(queue.getMemoryStats().pendingRoomQueues).toBe(0);
  });
  it('rejects a sustained burst without retaining rejected closures', async () => {
    const queue = new BoundedRoomQueue(64, 1024);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let executions = 0;
    const burst = Array.from({ length: 10000 }, () => queue.enqueue('room', async () => { await gate; executions++; }));
    const results = Promise.allSettled(burst);
    expect(queue.getMemoryStats().pendingOperations).toBe(64);
    release();
    const done = await results;
    expect(done.filter(r => r.status === 'fulfilled')).toHaveLength(64);
    expect(executions).toBe(64);
    expect(queue.getMemoryStats().pendingOperations).toBe(0);
  });
});
