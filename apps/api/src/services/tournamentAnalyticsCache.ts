/**
 * Tournament Analytics Multi-Domain Cache
 *
 * High-performance, memory-efficient TTL cache for tournament counts,
 * registration statistics, financial totals, prize distributions, refund totals,
 * settlement metrics, and compiled analytics summaries.
 *
 * CRITICAL FINANCIAL SAFETY INVARIANT:
 * This cache is STRICTLY OBSERVATIONAL for administrative dashboard speed.
 * It is NEVER used for:
 * - Winner determination
 * - Prize settlement calculations
 * - Refund processing
 * - Wallet balance updates or ledger commits
 */

export interface CacheEntry<T> {
  data: T;
  expiresAt: number;
  domain: string;
  key: string;
  createdAt: number;
}

export type AnalyticsCacheDomain =
  | "TOURNAMENTS"
  | "REGISTRATIONS"
  | "FINANCIALS"
  | "PRIZES"
  | "REFUNDS"
  | "SETTLEMENTS"
  | "GAME_TIER"
  | "HEALTH"
  | "FULL_SUMMARY";

export class TournamentAnalyticsCache {
  private static store = new Map<string, CacheEntry<unknown>>();
  private static defaultTtlMs = 60_000; // 60 seconds
  private static hitCount = 0;
  private static missCount = 0;

  /**
   * Generates a deterministic composite key for a domain and filter parameters.
   */
  static buildKey(domain: AnalyticsCacheDomain, params: Record<string, unknown>): string {
    const sortedEntries = Object.entries(params)
      .filter(([_, v]) => v !== undefined && v !== null && v !== "")
      .sort(([a], [b]) => a.localeCompare(b));
    const paramString = sortedEntries.map(([k, v]) => `${k}=${String(v)}`).join("&");
    return `${domain}::${paramString || "all"}`;
  }

  /**
   * Retrieves an item from the cache if present and unexpired.
   */
  static get<T>(key: string): T | null {
    const entry = this.store.get(key) as CacheEntry<T> | undefined;
    if (!entry) {
      this.missCount++;
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      this.missCount++;
      return null;
    }

    this.hitCount++;
    return entry.data;
  }

  /**
   * Sets an item in the cache with a specified or default TTL.
   */
  static set<T>(key: string, data: T, domain: AnalyticsCacheDomain = "FULL_SUMMARY", ttlMs?: number): void {
    const ttl = ttlMs ?? this.defaultTtlMs;
    const now = Date.now();
    this.store.set(key, {
      data,
      expiresAt: now + ttl,
      domain,
      key,
      createdAt: now,
    });
  }

  /**
   * Invalidates all keys belonging to one or more domains.
   */
  static invalidateDomain(...domains: AnalyticsCacheDomain[]): number {
    const domainSet = new Set(domains);
    let deletedCount = 0;
    for (const [key, entry] of this.store.entries()) {
      if (domainSet.has(entry.domain as AnalyticsCacheDomain)) {
        this.store.delete(key);
        deletedCount++;
      }
    }
    return deletedCount;
  }

  /**
   * Invalidates tournament, overview, and full summary caches on tournament lifecycle changes.
   */
  static invalidateTournaments(_tournamentId?: string, _gameId?: string, _tier?: string): void {
    this.invalidateDomain("TOURNAMENTS", "GAME_TIER", "HEALTH", "FULL_SUMMARY");
  }

  /**
   * Invalidates registration, financial, and summary caches on player join/leave.
   */
  static invalidateRegistrations(_tournamentId?: string, _userId?: string): void {
    this.invalidateDomain("REGISTRATIONS", "FINANCIALS", "TOURNAMENTS", "GAME_TIER", "FULL_SUMMARY");
  }

  /**
   * Invalidates settlement, prize distribution, and financial caches on prize credit/failure/retry.
   */
  static invalidateSettlements(_tournamentId?: string): void {
    this.invalidateDomain("SETTLEMENTS", "PRIZES", "FINANCIALS", "HEALTH", "FULL_SUMMARY");
  }

  /**
   * Invalidates refund and financial caches on tournament cancellation refunds or retries.
   */
  static invalidateRefunds(_tournamentId?: string): void {
    this.invalidateDomain("REFUNDS", "FINANCIALS", "HEALTH", "FULL_SUMMARY");
  }

  /**
   * Invalidates scheduler status and health caches on scheduler pause/resume/run.
   */
  static invalidateScheduler(): void {
    this.invalidateDomain("HEALTH", "TOURNAMENTS", "FULL_SUMMARY");
  }

  /**
   * Clears the entire analytics cache store.
   */
  static invalidateAll(): void {
    this.store.clear();
  }

  /**
   * Cache telemetry and performance statistics.
   */
  static getStats(): {
    size: number;
    hitCount: number;
    missCount: number;
    hitRatePercent: number;
  } {
    const total = this.hitCount + this.missCount;
    return {
      size: this.store.size,
      hitCount: this.hitCount,
      missCount: this.missCount,
      hitRatePercent: total > 0 ? Number(((this.hitCount / total) * 100).toFixed(1)) : 0,
    };
  }

  /**
   * Resets hit/miss telemetry counters.
   */
  static resetStats(): void {
    this.hitCount = 0;
    this.missCount = 0;
  }
}
