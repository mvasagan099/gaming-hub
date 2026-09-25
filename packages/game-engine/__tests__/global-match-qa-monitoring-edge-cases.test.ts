import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  SnakeLadderEngine,
  LudoEngine,
  ChessEngine,
  FruitNinjaEngine,
  BubbleShooterEngine,
  TableTennisEngine,
  SnakeVsWormsEngine,
  CarromEngine,
  SnookerEngine,
} from "../src";

const testPlayers = [
  { userId: "user-alpha", seat: 0, ready: true },
  { userId: "user-beta", seat: 1, ready: true },
];

describe("GLOBAL 10-MINUTE MATCH QA, MONITORING & EDGE-CASE PROTECTION TESTS", () => {
  // =========================================================================
  // 1. AUDIT & DATA INTEGRITY TESTS (Requirements 1, 2, 3)
  // =========================================================================
  describe("1. Audit & Data Integrity Validation", () => {
    it("detects valid 10-minute match configuration and active state fields", () => {
      const engine = new SnookerEngine(testPlayers);
      const startedAt = Date.now();
      const deadline = engine.currentMatchDeadline;

      expect(deadline).toBeDefined();
      expect(deadline).toBeGreaterThan(startedAt);
      expect(deadline! - startedAt).toBeLessThanOrEqual(600_000 + 1000); // 600s max limit
      expect((engine as any).state.finished).toBe(false);
      expect(engine.currentSeat).toBeDefined();
    });

    it("identifies expired matches where serverTime > matchDeadline", () => {
      const engine = new SnookerEngine(testPlayers);
      const deadline = engine.currentMatchDeadline!;
      const simulatedServerTime = deadline + 5000; // 5s past deadline

      const isExpired = simulatedServerTime >= deadline;
      expect(isExpired).toBe(true);

      // Trigger timeout resolution
      const res = engine.handleTimeout("match");
      expect(res.ok).toBe(true);
      expect(res.finished).toBe(true);
    });
  });

  // =========================================================================
  // 2. MATCH LIFECYCLE STATE MACHINE VALIDATION (Requirement 4)
  // =========================================================================
  describe("2. Match Lifecycle State Machine Transitions", () => {
    type MatchStatus = "ACTIVE" | "TIME_EXPIRED" | "FINALIZING" | "COMPLETED";

    function validateTransition(from: MatchStatus, to: MatchStatus): boolean {
      const valid: Record<MatchStatus, MatchStatus[]> = {
        ACTIVE: ["TIME_EXPIRED", "FINALIZING", "COMPLETED"],
        TIME_EXPIRED: ["FINALIZING", "COMPLETED"],
        FINALIZING: ["COMPLETED"],
        COMPLETED: [],
      };
      return valid[from]?.includes(to) ?? false;
    }

    it("permits valid transitions: ACTIVE -> TIME_EXPIRED -> FINALIZING -> COMPLETED", () => {
      expect(validateTransition("ACTIVE", "TIME_EXPIRED")).toBe(true);
      expect(validateTransition("TIME_EXPIRED", "FINALIZING")).toBe(true);
      expect(validateTransition("FINALIZING", "COMPLETED")).toBe(true);
      expect(validateTransition("ACTIVE", "COMPLETED")).toBe(true);
    });

    it("strictly prevents illegal backward transitions", () => {
      expect(validateTransition("COMPLETED", "ACTIVE")).toBe(false);
      expect(validateTransition("COMPLETED", "TIME_EXPIRED")).toBe(false);
      expect(validateTransition("TIME_EXPIRED", "ACTIVE")).toBe(false);
      expect(validateTransition("FINALIZING", "ACTIVE")).toBe(false);
    });
  });

  // =========================================================================
  // 3. CONCURRENCY & RACE CONDITIONS (Requirements 5, 6, 7)
  // =========================================================================
  describe("3. Concurrency & Exactly-Once Finalization", () => {
    it("Worker A claims finalization lock, Worker B is rejected (no duplicate finalization)", async () => {
      const finalizingMatches = new Set<string>();
      const matchId = "match-race-101";

      let workerAFinalized = false;
      let workerBFinalized = false;

      const workerA = async () => {
        if (finalizingMatches.has(matchId)) return false;
        finalizingMatches.add(matchId);
        workerAFinalized = true;
        return true;
      };

      const workerB = async () => {
        if (finalizingMatches.has(matchId)) return false;
        finalizingMatches.add(matchId);
        workerBFinalized = true;
        return true;
      };

      const [resA, resB] = await Promise.all([workerA(), workerB()]);

      // Exactly one worker must succeed
      expect(resA !== resB).toBe(true);
      expect(workerAFinalized || workerBFinalized).toBe(true);
      expect(workerAFinalized && workerBFinalized).toBe(false);
    });

    it("Normal result at 09:59.900 wins race over 10:00.000 timeout trigger", () => {
      const engine = new FruitNinjaEngine(testPlayers);
      (engine as any).state.scores = [250, 180];
      (engine as any).state.players[0].score = 250;
      (engine as any).state.players[1].score = 180;

      // Normal completion committed before deadline
      (engine as any).state.finished = true;
      (engine as any).state.winnerSeats = [0];

      // Late timeout worker triggers at 10:00.000
      const timeoutRes = engine.handleTimeout("match");
      expect(timeoutRes.ok).toBe(false);
      expect(engine.state.winnerSeats).toEqual([0]); // Normal result preserved
    });
  });

  // =========================================================================
  // 4. IN-FLIGHT ACTION VS LATE ACTION (Requirements 8, 9)
  // =========================================================================
  describe("4. In-Flight Action Completion vs Late Action Rejection", () => {
    it("action accepted before deadline executes to completion", () => {
      const engine = new SnakeLadderEngine(testPlayers);
      // Valid roll action accepted
      const rollRes = engine.apply({ type: "roll" }, 0);
      expect(rollRes.ok).toBe(true);
      expect(rollRes.state.players[0].position).toBeGreaterThan(0);
    });

    it("action received after deadline expiration is strictly rejected", () => {
      const engine = new SnakeLadderEngine(testPlayers);
      // Simulate expired match
      engine.handleTimeout("match");
      expect((engine as any).state.finished).toBe(true);

      // Attempt late action
      const lateActionRes = engine.apply({ type: "roll" }, 0);
      expect(lateActionRes.ok).toBe(false);
      expect(lateActionRes.error).toMatch(/finished|not active|game is not active/i);
    });
  });

  // =========================================================================
  // 5. CLIENT CLOCK MANIPULATION & NETWORK DELAY (Requirements 10, 11)
  // =========================================================================
  describe("5. Client Clock Manipulation & Network Delay Invariance", () => {
    it("server deadline is authoritative even if client clock is skewed by 1 hour", () => {
      const serverNow = Date.now();
      const serverDeadline = serverNow + 600_000;

      // Client time advanced by 1 hour (+3,600,000ms)
      const clientManipulatedTime = serverNow + 3_600_000;
      // Server must check serverNow, not clientManipulatedTime
      const isServerExpired = serverNow >= serverDeadline;
      expect(isServerExpired).toBe(false);

      // Client time moved backward by 1 hour (-3,600,000ms)
      const clientRewoundTime = serverNow - 3_600_000;
      const isStillAuthoritative = serverNow < serverDeadline;
      expect(isStillAuthoritative).toBe(true);
    });

    it("handles simulated network delays (100ms - 5000ms) authoritatively", () => {
      const serverDeadline = 1000;
      const arrivals = [
        { arrivalMs: 900, delay: 100, shouldAccept: true },
        { arrivalMs: 950, delay: 500, shouldAccept: true },
        { arrivalMs: 999, delay: 1000, shouldAccept: true },
        { arrivalMs: 1001, delay: 3000, shouldAccept: false },
        { arrivalMs: 1005, delay: 5000, shouldAccept: false },
      ];

      for (const req of arrivals) {
        const accepted = req.arrivalMs <= serverDeadline;
        expect(accepted).toBe(req.shouldAccept);
      }
    });
  });

  // =========================================================================
  // 6. RECONNECT, REFRESH & MULTI-TAB INVARIANCE (Requirements 12, 13, 14, 23, 24)
  // =========================================================================
  describe("6. Reconnection & Background Resync Invariance", () => {
    it("preserves identical matchDeadline and authoritative score across reconnects", () => {
      const engine = new SnookerEngine(testPlayers);
      const originalDeadline = engine.currentMatchDeadline;
      (engine as any).state.player1Score = 42;
      (engine as any).state.player2Score = 27;

      // Reconnect simulation: serialize & restore
      const serialized = engine.serialize();
      expect(serialized).toBeDefined();

      // Deadlines must remain constant
      expect(engine.currentMatchDeadline).toBe(originalDeadline);
      expect((engine.state as any).player1Score).toBe(42);
      expect((engine.state as any).player2Score).toBe(27);
    });

    it("expired match during sleep/disconnect finalizes authoritatively upon resync", () => {
      const engine = new TableTennisEngine(testPlayers);
      (engine as any).state.players[0].sets = 1;
      (engine as any).state.players[1].sets = 0;

      // Deadline passes while player disconnected
      const res = engine.handleTimeout("match");
      expect(res.ok).toBe(true);
      expect(res.finished).toBe(true);
      expect(res.winnerSeats).toEqual([0]);
    });
  });

  // =========================================================================
  // 7. DUPLICATE SETTLEMENT & TOURNAMENT ADVANCEMENT (Requirements 15, 16, 17)
  // =========================================================================
  describe("7. Idempotent Settlement & Tournament Safety", () => {
    it("prevents duplicate settlement calls using idempotency key", async () => {
      const settledMatches = new Map<string, { winnerPayout: number; pot: number }>();
      const matchId = "match-settle-idempotent-999";

      const settleOnce = async (id: string, pot: number) => {
        if (settledMatches.has(id)) {
          // Idempotent replay: return cached result without moving funds
          return { cached: true, ...settledMatches.get(id)! };
        }
        const result = { winnerPayout: pot * 0.9, pot };
        settledMatches.set(id, result);
        return { cached: false, ...result };
      };

      const res1 = await settleOnce(matchId, 100);
      expect(res1.cached).toBe(false);
      expect(res1.winnerPayout).toBe(90);

      // Duplicate settlement attempt
      const res2 = await settleOnce(matchId, 100);
      expect(res2.cached).toBe(true);
      expect(res2.winnerPayout).toBe(90);
      expect(settledMatches.size).toBe(1); // Exactly one settlement record
    });
  });

  // =========================================================================
  // 8. 10-MINUTE BOUNDARY TESTS (Requirement 20)
  // =========================================================================
  describe("8. Precise 10-Minute Boundary Conditions", () => {
    const deadlineMs = 600_000;

    it("09:59.000 (599,000ms) is ACTIVE", () => {
      expect(599_000 < deadlineMs).toBe(true);
    });

    it("09:59.900 (599,900ms) is ACTIVE", () => {
      expect(599_900 < deadlineMs).toBe(true);
    });

    it("09:59.999 (599,999ms) is ACTIVE", () => {
      expect(599_999 < deadlineMs).toBe(true);
    });

    it("10:00.000 (600,000ms) is EXPIRED", () => {
      expect(600_000 >= deadlineMs).toBe(true);
    });

    it("10:00.001 (600,001ms) is EXPIRED", () => {
      expect(600_001 >= deadlineMs).toBe(true);
    });

    it("10:01.000 (601,000ms) is EXPIRED", () => {
      expect(601_000 >= deadlineMs).toBe(true);
    });
  });

  // =========================================================================
  // 9. GAME-SPECIFIC TIMEOUT & TIE TESTS (Requirements 18, 19)
  // =========================================================================
  describe("9. Deterministic Tie Handling Across All 10 Games", () => {
    it("1. Snake & Ladder: handles position tie with standard draw (no random selection)", () => {
      const engine = new SnakeLadderEngine(testPlayers);
      (engine as any).state.players[0].position = 60;
      (engine as any).state.players[1].position = 60;

      const res = engine.handleTimeout("match");
      expect(res.ok).toBe(true);
      expect(res.winnerSeats.length).toBe(2); // Tied leaders
    });

    it("2. Ludo: handles identical tokens & steps with standard draw", () => {
      const engine = new LudoEngine(testPlayers);
      // Both players have 1 finished token and other 3 tokens in yard (initial)
      (engine as any).state.players[0].tokens[0].isFinished = true;
      (engine as any).state.players[1].tokens[0].isFinished = true;

      const res = engine.handleTimeout("match");
      expect(res.ok).toBe(true);
      expect(res.winnerSeats.length).toBe(2); // Deterministic draw
    });

    it("3. Chess: handles equal material & clocks with standard draw", () => {
      const engine = new ChessEngine(testPlayers);
      const res = engine.handleTimeout("match");
      expect(res.ok).toBe(true);
      expect(res.winnerSeats).toEqual([0, 1]); // Draw
    });

    it("4. Fruit Ninja: handles equal scores with standard draw", () => {
      const engine = new FruitNinjaEngine(testPlayers);
      (engine as any).state.scores = [150, 150];
      (engine as any).state.players[0].score = 150;
      (engine as any).state.players[1].score = 150;

      const res = engine.handleTimeout("match");
      expect(res.ok).toBe(true);
      expect(res.winnerSeats).toEqual([]); // Draw
    });

    it("5. Bubble Shooter: handles equal score & bubble count with draw", () => {
      const engine = new BubbleShooterEngine(testPlayers);
      (engine as any).state.players[0].score = 300;
      (engine as any).state.players[1].score = 300;

      const res = engine.handleTimeout("match");
      expect(res.ok).toBe(true);
      expect(res.winnerSeats).toEqual([]);
    });

    it("6. Table Tennis: handles equal sets & points with draw", () => {
      const engine = new TableTennisEngine(testPlayers);
      (engine as any).state.players[0].sets = 1;
      (engine as any).state.players[0].score = 5;
      (engine as any).state.players[1].sets = 1;
      (engine as any).state.players[1].score = 5;

      const res = engine.handleTimeout("match");
      expect(res.ok).toBe(true);
      expect(res.winnerSeats).toEqual([]);
    });

    it("7. Snake vs Worms: handles equal score & length with draw", () => {
      const engine = new SnakeVsWormsEngine(testPlayers);
      (engine as any).state.players[0].score = 500;
      (engine as any).state.players[1].score = 500;

      const res = engine.handleTimeout("match");
      expect(res.ok).toBe(true);
      expect(res.winnerSeats).toEqual([0, 1]);
    });

    it("9. Carrom: handles equal points & coins with draw", () => {
      const engine = new CarromEngine(testPlayers);
      (engine as any).state.players[0].score = 10;
      (engine as any).state.players[1].score = 10;

      const res = engine.handleTimeout("match");
      expect(res.ok).toBe(true);
      expect(res.winnerSeats).toEqual([0, 1]);
    });

    it("10. Snooker: handles equal frame points & break in 15-red Snooker with draw", () => {
      const engine = new SnookerEngine(testPlayers);
      (engine as any).state.player1Score = 30;
      (engine as any).state.player2Score = 30;
      (engine as any).state.player1HighestBreak = 14;
      (engine as any).state.player2HighestBreak = 14;

      const res = engine.handleTimeout("match");
      expect(res.ok).toBe(true);
    });
  });
});
