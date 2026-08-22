import { describe, it, expect, beforeEach } from "vitest";
import { RateLimitService } from "../rateLimitService";
import { SuspiciousActivityService } from "../suspiciousActivityService";

describe("Feature 25: Global Rate Limiting & Abuse Protection", () => {
  beforeEach(() => {
    RateLimitService.resetForTesting();
    SuspiciousActivityService.resetForTesting();
  });

  // ---------------------------------------------------------------------------
  // 1. Normal Request Flow
  // ---------------------------------------------------------------------------
  it("1. Normal request: requests within limit are allowed and decrease remaining count", () => {
    const res1 = RateLimitService.checkRateLimit("user:101", "GAME_ENTRY", { maxRequests: 5, windowSeconds: 60 });
    expect(res1.allowed).toBe(true);
    expect(res1.remaining).toBe(4);

    const res2 = RateLimitService.checkRateLimit("user:101", "GAME_ENTRY", { maxRequests: 5, windowSeconds: 60 });
    expect(res2.allowed).toBe(true);
    expect(res2.remaining).toBe(3);
  });

  // ---------------------------------------------------------------------------
  // 2. Rate Limit Breach & Retry-After
  // ---------------------------------------------------------------------------
  it("2. Limit breach: rejects excess requests with allowed: false and valid retryAfterSeconds", () => {
    const key = "ip:192.168.1.100";
    for (let i = 0; i < 3; i++) {
      RateLimitService.checkRateLimit(key, "AUTH", { maxRequests: 3, windowSeconds: 60 });
    }

    const breached = RateLimitService.checkRateLimit(key, "AUTH", { maxRequests: 3, windowSeconds: 60 });
    expect(breached.allowed).toBe(false);
    expect(breached.remaining).toBe(0);
    expect(breached.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(breached.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  // ---------------------------------------------------------------------------
  // 3. assertRateLimit Throws 429 AppError
  // ---------------------------------------------------------------------------
  it("3. Assertion: assertRateLimit throws RATE_LIMITED 429 when threshold exceeded", () => {
    const key = "user:202";
    for (let i = 0; i < 2; i++) {
      RateLimitService.assertRateLimit(key, "WALLET", { maxRequests: 2, windowSeconds: 60 });
    }

    expect(() => {
      RateLimitService.assertRateLimit(key, "WALLET", { maxRequests: 2, windowSeconds: 60 });
    }).toThrow(/RATE_LIMITED|Rate limit exceeded/i);
  });

  // ---------------------------------------------------------------------------
  // 4. Actor & Key Isolation
  // ---------------------------------------------------------------------------
  it("4. Key isolation: throttling one user does not affect other users or IPs", () => {
    const userA = "user:aaa";
    const userB = "user:bbb";

    for (let i = 0; i < 3; i++) {
      RateLimitService.checkRateLimit(userA, "TOURNAMENT", { maxRequests: 3, windowSeconds: 60 });
    }

    // User A is now throttled
    expect(RateLimitService.checkRateLimit(userA, "TOURNAMENT", { maxRequests: 3, windowSeconds: 60 }).allowed).toBe(false);

    // User B remains unaffected
    const resB = RateLimitService.checkRateLimit(userB, "TOURNAMENT", { maxRequests: 3, windowSeconds: 60 });
    expect(resB.allowed).toBe(true);
    expect(resB.remaining).toBe(2);
  });

  // ---------------------------------------------------------------------------
  // 5. Category-Specific Default Limits
  // ---------------------------------------------------------------------------
  it("5. Categories: enforces distinct default limits for AUTH vs PUBLIC_API", () => {
    // AUTH defaults to 5 requests
    for (let i = 0; i < 5; i++) {
      expect(RateLimitService.checkRateLimit("ip:test-auth", "AUTH").allowed).toBe(true);
    }
    expect(RateLimitService.checkRateLimit("ip:test-auth", "AUTH").allowed).toBe(false);

    // PUBLIC_API allows higher volume (default 60)
    for (let i = 0; i < 20; i++) {
      expect(RateLimitService.checkRateLimit("ip:test-pub", "PUBLIC_API").allowed).toBe(true);
    }
  });

  // ---------------------------------------------------------------------------
  // 6. Abuse Escalation to SuspiciousActivityService
  // ---------------------------------------------------------------------------
  it("6. Abuse escalation: persistent flooding (>=5 breaches) triggers security alert", async () => {
    const userKey = "user:spammer-99";

    // Fill capacity (2 requests)
    for (let i = 0; i < 2; i++) {
      RateLimitService.checkRateLimit(userKey, "GAME_ENTRY", { maxRequests: 2, windowSeconds: 60 });
    }

    // 5 consecutive flood attempts
    for (let i = 0; i < 5; i++) {
      RateLimitService.checkRateLimit(userKey, "GAME_ENTRY", { maxRequests: 2, windowSeconds: 60 });
    }

    const alerts = await SuspiciousActivityService.listAlerts({ userId: "spammer-99" });
    expect(alerts.total).toBeGreaterThanOrEqual(1);
    expect(alerts.items[0].type).toBe("DUPLICATE_REQUEST_FLOOD");
    expect(alerts.items[0].severity).toBe("HIGH");
  });

  // ---------------------------------------------------------------------------
  // 7. Admin Metrics Overview
  // ---------------------------------------------------------------------------
  it("7. Admin metrics: getRateLimitMetrics aggregates hits and throttled counts", () => {
    RateLimitService.checkRateLimit("user:m1", "ADMIN");
    RateLimitService.checkRateLimit("user:m1", "ADMIN", { maxRequests: 1, windowSeconds: 60 }); // throttled

    const metrics = RateLimitService.getRateLimitMetrics();
    expect(metrics.totalHits).toBeGreaterThanOrEqual(2);
    expect(metrics.totalThrottled).toBeGreaterThanOrEqual(1);
    expect(metrics.activeActors).toBeGreaterThanOrEqual(1);
  });
});
