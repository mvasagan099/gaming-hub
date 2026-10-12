/** Presentation only: absorb delivery jitter without changing the server clock. */
export class NetworkPlaybackClock {
  private offset: number | null = null;
  private previousServerTime: number | null = null;
  private jitter: number[] = [];
  private intervals: number[] = [];
  private delay: number;
  private desired: number;
  private lastFrame: number | null = null;
  private readonly baseDelay: number;
  private readonly maxDelay: number;

  constructor(baseDelay: number, maxDelay = 150) {
    this.baseDelay = baseDelay; this.maxDelay = maxDelay;
    this.delay = this.desired = baseDelay;
  }

  reset(): void {
    this.offset = null; this.previousServerTime = null;
    this.jitter = []; this.intervals = [];
    this.delay = this.desired = this.baseDelay; this.lastFrame = null;
  }

  observe(serverTime: number, receivedAt: number): void {
    this.offset = Math.min(this.offset ?? Infinity, receivedAt - serverTime);
    this.jitter.push(Math.max(0, receivedAt - serverTime - this.offset));
    if (this.previousServerTime !== null && serverTime > this.previousServerTime) {
      this.intervals.push(serverTime - this.previousServerTime);
    }
    this.previousServerTime = serverTime;
    if (this.jitter.length > 20) this.jitter.shift();
    if (this.intervals.length > 20) this.intervals.shift();
    const percentile = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * 0.9)] ?? 0;
    const variation = percentile(this.jitter);
    // Small variations already fit the normal buffer. Do not add latency on
    // healthy links; slow server cadence and substantial jitter need history.
    this.desired = Math.min(this.maxDelay, Math.max(this.baseDelay, percentile(this.intervals)) + (variation > 40 ? variation : 0));
  }

  target(now: number): number {
    const elapsed = this.lastFrame === null ? 0 : Math.max(0, now - this.lastFrame);
    this.lastFrame = now;
    // Slew rather than jumping the playback cursor backwards when jitter rises.
    const change = Math.min(Math.abs(this.desired - this.delay), elapsed * 0.2);
    this.delay += Math.sign(this.desired - this.delay) * change;
    return now - (this.offset ?? 0) - this.delay;
  }

  /** Local authoritative trail keeps its existing latency, not the jitter buffer. */
  baseTarget(now: number): number { return now - (this.offset ?? 0) - this.baseDelay; }
}
