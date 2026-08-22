import { AppError } from "@gaming-hub/shared";
import { SuspiciousActivityService } from "./suspiciousActivityService";

export type RateLimitCategory =
  | "AUTH"
  | "WALLET"
  | "GAME_ENTRY"
  | "TOURNAMENT"
  | "ADMIN"
  | "PUBLIC_API"
  | "SOCKET_CONNECT"
  | "REFERRAL"
  | "SEARCH";

export interface RateLimitConfig {
  maxRequests: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  total: number;
  remaining: number;
  retryAfterSeconds: number;
  resetTime: number;
}

export interface RateLimitMetricItem {
  key: string;
  category: RateLimitCategory;
  hitCount: number;
  throttledCount: number;
  lastHit: Date;
}

export class RateLimitService {
  private static defaultConfigs: Record<RateLimitCategory, RateLimitConfig> = {
    AUTH: { maxRequests: 5, windowSeconds: 60 },
    WALLET: { maxRequests: 10, windowSeconds: 60 },
    GAME_ENTRY: { maxRequests: 15, windowSeconds: 60 },
    TOURNAMENT: { maxRequests: 10, windowSeconds: 60 },
    ADMIN: { maxRequests: 20, windowSeconds: 60 },
    PUBLIC_API: { maxRequests: 60, windowSeconds: 60 },
    SOCKET_CONNECT: { maxRequests: 10, windowSeconds: 60 },
    REFERRAL: { maxRequests: 10, windowSeconds: 60 },
    SEARCH: { maxRequests: 40, windowSeconds: 60 },
  };

  // In-memory sliding window cache: key -> timestamp[]
  private static requestTimestamps = new Map<string, number[]>();
  private static throttleCounts = new Map<string, number>();
  private static metrics = new Map<string, RateLimitMetricItem>();

  /**
   * 1. Check Rate Limit and update sliding window
   */
  static checkRateLimit(
    key: string,
    category: RateLimitCategory,
    overrideConfig?: Partial<RateLimitConfig>
  ): RateLimitResult {
    const config: RateLimitConfig = {
      ...this.defaultConfigs[category],
      ...(overrideConfig ?? {}),
    };

    const now = Date.now();
    const windowMs = config.windowSeconds * 1000;
    const cutoff = now - windowMs;

    const fullKey = `${category}:${key}`;
    let timestamps = this.requestTimestamps.get(fullKey) ?? [];

    // Filter out expired timestamps
    timestamps = timestamps.filter((t) => t > cutoff);

    // Track metrics
    const metric = this.metrics.get(fullKey) ?? {
      key,
      category,
      hitCount: 0,
      throttledCount: 0,
      lastHit: new Date(),
    };
    metric.hitCount += 1;
    metric.lastHit = new Date();

    if (timestamps.length >= config.maxRequests) {
      const oldest = timestamps[0];
      const retryAfterSeconds = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
      const throttles = (this.throttleCounts.get(fullKey) ?? 0) + 1;
      this.throttleCounts.set(fullKey, throttles);

      metric.throttledCount += 1;
      this.metrics.set(fullKey, metric);

      // If continuous flooding (e.g. >= 5 violations), trigger suspicious activity alert
      if (throttles >= 5 && key.startsWith("user:")) {
        const userId = key.replace("user:", "");
        void SuspiciousActivityService.createAlert({
          userId,
          type: "DUPLICATE_REQUEST_FLOOD",
          severity: "HIGH",
          score: 80,
          reason: `Repeated rate-limit violations on ${category}: throttled ${throttles} times within cooldown`,
          metadata: { category, throttles, maxRequests: config.maxRequests },
        });
      }

      return {
        allowed: false,
        total: timestamps.length,
        remaining: 0,
        retryAfterSeconds,
        resetTime: oldest + windowMs,
      };
    }

    // Add current timestamp and store
    timestamps.push(now);
    this.requestTimestamps.set(fullKey, timestamps);
    this.metrics.set(fullKey, metric);

    return {
      allowed: true,
      total: timestamps.length,
      remaining: Math.max(0, config.maxRequests - timestamps.length),
      retryAfterSeconds: 0,
      resetTime: now + windowMs,
    };
  }

  /**
   * 2. Assert Rate Limit (throws AppError on breach)
   */
  static assertRateLimit(
    key: string,
    category: RateLimitCategory,
    overrideConfig?: Partial<RateLimitConfig>
  ): RateLimitResult {
    const res = this.checkRateLimit(key, category, overrideConfig);
    if (!res.allowed) {
      throw new AppError(
        "RATE_LIMITED",
        `Rate limit exceeded for ${category}. Please retry in ${res.retryAfterSeconds} seconds`,
        429
      );
    }
    return res;
  }

  /**
   * 3. Get Rate Limiting Real-Time Metrics for Administrators
   */
  static getRateLimitMetrics() {
    const items = Array.from(this.metrics.values());
    items.sort((a, b) => b.throttledCount - a.throttledCount);

    const totalHits = items.reduce((acc, i) => acc + i.hitCount, 0);
    const totalThrottled = items.reduce((acc, i) => acc + i.throttledCount, 0);

    return {
      totalHits,
      totalThrottled,
      activeActors: items.length,
      topThrottled: items.slice(0, 20),
    };
  }

  /**
   * Helper: Reset state for unit tests
   */
  static resetForTesting(): void {
    this.requestTimestamps.clear();
    this.throttleCounts.clear();
    this.metrics.clear();
  }
}
