import type { Redis } from 'ioredis';

export interface OwnerLease { ownerId: string; token: string; ttlMs: number }
/** Redis owns admission; PostgreSQL issues monotonic fencing tokens (never reset by Redis loss). */
export class RedisMatchOwnership {
  constructor(private readonly redis: Redis, private readonly namespace = 'gaming:owners') {}
  private key(roomId: string) { return `${this.namespace}:${roomId}`; }
  async acquire(roomId: string, ownerId: string, token: string, ttlMs: number): Promise<boolean> {
    return await this.redis.set(this.key(roomId), JSON.stringify({ ownerId, token }), 'PX', ttlMs, 'NX') === 'OK';
  }
  async inspect(roomId: string): Promise<OwnerLease | null> {
    const values = await this.redis.eval(`local v=redis.call('GET',KEYS[1]); if not v then return nil end; return {v,redis.call('PTTL',KEYS[1])}`, 1, this.key(roomId)) as [string, number] | null;
    return values ? { ...JSON.parse(values[0]), ttlMs: Number(values[1]) } : null;
  }
  async assert(roomId: string, ownerId: string, token: string): Promise<void> {
    const value = await this.inspect(roomId);
    if (!value || value.ownerId !== ownerId || value.token !== token || value.ttlMs <= 0) throw new Error('STALE_MATCH_OWNER');
  }
  async renew(roomId: string, ownerId: string, token: string, ttlMs: number): Promise<boolean> {
    return Number(await this.redis.eval(`if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('PEXPIRE',KEYS[1],ARGV[2]) else return 0 end`, 1,
      this.key(roomId), JSON.stringify({ ownerId, token }), ttlMs)) === 1;
  }
  async release(roomId: string, ownerId: string, token: string): Promise<void> {
    await this.redis.eval(`if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end`, 1,
      this.key(roomId), JSON.stringify({ ownerId, token }));
  }
}
