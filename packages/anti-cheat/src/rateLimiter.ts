// packages/anti-cheat/src/rateLimiter.ts

/** Simple token‑bucket rate limiter per player/action type */
interface Bucket {
  tokens: number;
  lastRefill: number;
}

export class RateLimiter {
  // default limits – can be overridden per game via config later
  private limits: Record<string, number> = {
    // actionType -> tokens per second
    MOVE: 1,
    SHOT: 5,
    ROLL_DICE: 2,
    DEFAULT: 10,
  };

  private buckets = new Map<string, Bucket>(); // key = `${playerId}:${actionType}`

  private now() {
    return Date.now();
  }

  private refill(bucket: Bucket, limit: number) {
    const now = this.now();
    const elapsed = (now - bucket.lastRefill) / 1000; // seconds
    const add = Math.floor(elapsed * limit);
    if (add > 0) {
      bucket.tokens = Math.min(bucket.tokens + add, limit);
      bucket.lastRefill = now;
    }
  }

  allow(playerId: string, actionType: string): boolean {
    const key = `${playerId}:${actionType}`;
    const limit = this.limits[actionType] ?? this.limits.DEFAULT;
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { tokens: limit, lastRefill: this.now() };
      this.buckets.set(key, bucket);
    }
    this.refill(bucket, limit);
    if (bucket.tokens > 0) {
      bucket.tokens -= 1;
      return true;
    }
    return false;
  }
}
