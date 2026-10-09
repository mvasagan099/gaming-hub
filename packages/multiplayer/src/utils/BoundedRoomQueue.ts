/** Bound client work before retaining it in a serial promise chain. */
export class BoundedRoomQueue {
  private readonly tails = new Map<string, Promise<void>>();
  private readonly depths = new Map<string, number>();
  private pending = 0;
  constructor(private readonly roomLimit = 64, private readonly totalLimit = 1024) {}
  getMemoryStats() {
    return { pendingRoomQueues: this.tails.size, pendingOperations: this.pending };
  }
  enqueue<T>(roomId: string, task: () => Promise<T>, lifecycle = false): Promise<T> {
    const depth = this.depths.get(roomId) ?? 0;
    // Finite server expiry/cleanup callbacks retain admission and FIFO order.
    // This flag comes from server code, never from a client payload.
    if (!lifecycle && (depth >= this.roomLimit || this.pending >= this.totalLimit)) {
      return Promise.reject(new Error("ROOM_QUEUE_OVERLOADED"));
    }
    this.depths.set(roomId, depth + 1);
    this.pending++;
    const previous = this.tails.get(roomId) ?? Promise.resolve();
    const next = previous.then(task, task);
    const settled = next.then(() => undefined, () => undefined).then(() => {
      this.pending--;
      const remaining = this.depths.get(roomId)! - 1;
      if (remaining === 0) this.depths.delete(roomId);
      else this.depths.set(roomId, remaining);
      if (this.tails.get(roomId) === settled) this.tails.delete(roomId);
    });
    this.tails.set(roomId, settled);
    return next.then(value => settled.then(() => value),
      error => settled.then(() => { throw error; }));
  }
  async drain(): Promise<void> { await Promise.all(this.tails.values()); }
}
