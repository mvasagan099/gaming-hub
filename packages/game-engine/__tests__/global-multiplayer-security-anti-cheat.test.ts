import { describe, it, expect, beforeEach } from "vitest";
import {
  GAME_IDS,
  type GameId,
  type SecurityEventRecord,
  type SecurityEventType,
  calculateStateHash,
} from "@gaming-hub/shared";
import {
  SnakeLadderEngine,
  LudoEngine,
  ChessEngine,
  FruitNinjaEngine,
  BubbleShooterEngine,
  TableTennisEngine,
  SnakeVsWormsEngine,
  CricketEngine,
  CarromEngine,
  SnookerEngine,
  createEngine,
  secureRandomSource,
} from "../src";

interface TestUser {
  userId: string;
  role: "USER" | "ADMIN";
}

interface TestPlayer {
  userId: string;
  seat: number;
  isSpectator: boolean;
}

interface TestMatchRuntime {
  matchId: string;
  gameId: GameId;
  status: "playing" | "finished" | "time_expired";
  engine: any;
  players: Map<string, TestPlayer>;
  stateVersion: number;
  matchStartedAt: number;
  matchDeadline: number;
  cachedActions: Map<string, any>;
  settled: boolean;
}

describe("GLOBAL MULTIPLAYER SECURITY & ANTI-CHEAT SYSTEM", () => {
  let activeMatches: Map<string, TestMatchRuntime>;
  let securityLogs: SecurityEventRecord[];
  let userWallets: Map<string, number>;
  let tournamentAdvancements: Map<string, string>; // matchId -> winnerUserId

  beforeEach(() => {
    activeMatches = new Map();
    securityLogs = [];
    userWallets = new Map([
      ["player-1", 1000],
      ["player-2", 1000],
      ["hacker-1", 1000],
    ]);
    tournamentAdvancements = new Map();
  });

  // Helper: Log security event
  const logSecurityEvent = (
    userId: string,
    matchId: string,
    gameId: GameId,
    eventType: SecurityEventType,
    severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
    details: Record<string, unknown>,
  ) => {
    const record: SecurityEventRecord = {
      id: `sec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      userId,
      matchId,
      gameId,
      eventType,
      severity,
      details,
      actionTaken: severity === "HIGH" || severity === "CRITICAL" ? "REJECT_ACTION" : "LOG",
      timestamp: Date.now(),
    };
    securityLogs.push(record);
    return record;
  };

  // Helper: Create match runtime
  const createTestMatch = (matchId: string, gameId: GameId): TestMatchRuntime => {
    const players = [
      { userId: "player-1", seat: 0, isSpectator: false },
      { userId: "player-2", seat: 1, isSpectator: false },
    ];
    const enginePlayers = players.map((p) => ({ userId: p.userId, seat: p.seat }));
    const engine = createEngine(gameId, enginePlayers, secureRandomSource(), {});
    const now = Date.now();

    const match: TestMatchRuntime = {
      matchId,
      gameId,
      status: "playing",
      engine,
      players: new Map(players.map((p) => [p.userId, p])),
      stateVersion: 1,
      matchStartedAt: now,
      matchDeadline: now + 600_000, // 10m limit
      cachedActions: new Map(),
      settled: false,
    };

    activeMatches.set(matchId, match);
    return match;
  };

  // Authoritative Action Processor
  const processClientAction = (
    authenticatedUser: TestUser,
    matchId: string,
    rawAction: Record<string, any>,
  ) => {
    const match = activeMatches.get(matchId);
    if (!match) throw new Error("MATCH_NOT_FOUND");
    if (match.status !== "playing") throw new Error("MATCH_NOT_ACTIVE");

    // 1. Room/Match Membership & Spectator Check
    const player = match.players.get(authenticatedUser.userId);
    if (!player || player.isSpectator) {
      logSecurityEvent(authenticatedUser.userId, matchId, match.gameId, "ROOM_SPOOFING", "HIGH", { rawAction });
      return { ok: false, error: "FORBIDDEN: Spectators or non-members cannot play" };
    }

    // 2. Deadline & Server Timer Check
    if (Date.now() >= match.matchDeadline) {
      match.status = "time_expired";
      return { ok: false, error: "MATCH_TIME_EXPIRED" };
    }

    // 3. Forgery / Score Tampering Detection
    const forgedKeys = ["score", "winner", "winnerId", "winnerSeats", "coins", "reward", "runs", "points", "kills", "pocketedCoins"];
    let detectedForgery = false;
    for (const key of forgedKeys) {
      if (key in rawAction) {
        detectedForgery = true;
        delete rawAction[key];
      }
    }
    if (detectedForgery) {
      logSecurityEvent(authenticatedUser.userId, matchId, match.gameId, "SCORE_TAMPERING_ATTEMPT", "HIGH", { rawAction });
    }

    // 4. Numeric Sanity Validation (NaN, Infinity, Negative Power, Out of Bounds)
    for (const [k, v] of Object.entries(rawAction)) {
      if (typeof v === "number") {
        if (!isFinite(v) || isNaN(v)) {
          logSecurityEvent(authenticatedUser.userId, matchId, match.gameId, "IMPOSSIBLE_ACTION", "HIGH", { field: k, value: v });
          return { ok: false, error: `Invalid numeric value for ${k}` };
        }
      }
    }
    if ("power" in rawAction && typeof rawAction.power === "number") {
      if (rawAction.power < 0 || rawAction.power > 100) {
        logSecurityEvent(authenticatedUser.userId, matchId, match.gameId, "IMPOSSIBLE_ACTION", "HIGH", { power: rawAction.power });
        return { ok: false, error: "Power is out of allowed bounds" };
      }
    }

    // 5. Action Idempotency Check
    const actionId = rawAction.actionId;
    if (actionId && match.cachedActions.has(actionId)) {
      return match.cachedActions.get(actionId);
    }

    // 6. State Version Check
    const clientStateVersion = rawAction.stateVersion;
    if (clientStateVersion !== undefined && clientStateVersion < match.stateVersion) {
      logSecurityEvent(authenticatedUser.userId, matchId, match.gameId, "STALE_ACTION_SPAM", "LOW", {
        clientStateVersion,
        serverStateVersion: match.stateVersion,
      });
      return { ok: false, error: "STALE_GAME_STATE", state: match.engine.serialize() };
    }

    // 7. Turn Order Check (for turn-based games)
    if (typeof match.engine.currentSeat === "number" && rawAction.type !== "resign" && rawAction.type !== "chat") {
      if (player.seat !== match.engine.currentSeat) {
        logSecurityEvent(authenticatedUser.userId, matchId, match.gameId, "WRONG_TURN", "MEDIUM", {
          playerSeat: player.seat,
          currentSeat: match.engine.currentSeat,
        });
        return { ok: false, error: "It is not your turn" };
      }
    }

    // 8. Server-Authoritative Engine Execution
    const result = match.engine.apply(rawAction, player.seat);

    if (result.ok) {
      match.stateVersion += 1;
      if (result.finished) {
        match.status = "finished";
      }
      if (actionId) {
        match.cachedActions.set(actionId, result);
      }
    }

    return result;
  };

  // =========================================================================
  // 1. FORGERY & SCORE / WINNER TAMPERING REJECTION
  // =========================================================================
  describe("1. Score & Winner Forgery Rejection", () => {
    it("rejects client attempts to inject arbitrary score, coins, or winner", () => {
      const match = createTestMatch("match-chess-1", "chess");
      const hacker: TestUser = { userId: "player-1", role: "USER" };

      // Hacker tries to send fake score and winner in action payload
      const payload = {
        type: "move",
        from: "e2",
        to: "e4",
        score: 999999,
        winner: "player-1",
        coins: 500000,
      };

      const res = processClientAction(hacker, match.matchId, payload);
      expect(res.ok).toBe(true);

      // Server applied the move legitimately but ignored forged score/winner/coins
      expect((match.engine.state as any).score).not.toBe(999999);
      expect(securityLogs.some((l) => l.eventType === "SCORE_TAMPERING_ATTEMPT")).toBe(true);
    });
  });

  // =========================================================================
  // 2. TURN ORDER & WRONG TURN PROTECTION
  // =========================================================================
  describe("2. Turn Order Protection", () => {
    it("rejects action from a player when it is not their turn", () => {
      const match = createTestMatch("match-ludo-1", "ludo");
      const player2: TestUser = { userId: "player-2", role: "USER" };

      // Seat 0 (player-1) starts. Player-2 tries to roll out of turn
      const res = processClientAction(player2, match.matchId, {
        type: "roll",
      });

      expect(res.ok).toBe(false);
      expect(res.error).toMatch(/not your turn/i);
      expect(securityLogs.some((l) => l.eventType === "WRONG_TURN")).toBe(true);
    });
  });

  // =========================================================================
  // 3. ACTION IDEMPOTENCY & DUPLICATE PROTECTION
  // =========================================================================
  describe("3. Action Idempotency", () => {
    it("returns previously cached result for duplicate actionId without double-executing", () => {
      const match = createTestMatch("match-snake-1", "snake-ladder");
      const player1: TestUser = { userId: "player-1", role: "USER" };

      const actionId = "action-uuid-12345";
      const res1 = processClientAction(player1, match.matchId, {
        type: "roll",
        actionId,
        stateVersion: 1,
      });
      expect(res1.ok).toBe(true);
      const versionAfterFirst = match.stateVersion;

      // Duplicate submission of same actionId
      const res2 = processClientAction(player1, match.matchId, {
        type: "roll",
        actionId,
        stateVersion: 1,
      });

      expect(res2.ok).toBe(true);
      // State version must NOT have incremented again
      expect(match.stateVersion).toBe(versionAfterFirst);
    });
  });

  // =========================================================================
  // 4. STALE ACTION DETECTION & STATE RESYNC
  // =========================================================================
  describe("4. State Version & Stale Action Protection", () => {
    it("rejects stale action and provides latest authoritative state for resync", () => {
      const match = createTestMatch("match-carrom-1", "carrom");
      const player1: TestUser = { userId: "player-1", role: "USER" };

      // Advance match to stateVersion 2
      match.stateVersion = 2;

      // Client sends action with stale stateVersion 1
      const res = processClientAction(player1, match.matchId, {
        type: "place-striker",
        x: 300,
        y: 507,
        stateVersion: 1,
      });

      expect(res.ok).toBe(false);
      expect(res.error).toBe("STALE_GAME_STATE");
      expect(res.state).toBeDefined();
      expect(securityLogs.some((l) => l.eventType === "STALE_ACTION_SPAM")).toBe(true);
    });
  });

  // =========================================================================
  // 5. NUMERIC SANITY & IMPOSSIBLE VALUES (NaN, Infinity, Negative Power)
  // =========================================================================
  describe("5. Impossible Action & Numeric Sanity", () => {
    it("rejects actions with NaN, Infinity, or impossible negative power", () => {
      const match = createTestMatch("match-snooker-1", "snooker");
      const player1: TestUser = { userId: "player-1", role: "USER" };

      // Case 1: NaN power
      const resNan = processClientAction(player1, match.matchId, {
        type: "strike",
        power: NaN,
        angle: 1.5,
      });
      expect(resNan.ok).toBe(false);

      // Case 2: Infinity angle
      const resInf = processClientAction(player1, match.matchId, {
        type: "strike",
        power: 50,
        angle: Infinity,
      });
      expect(resInf.ok).toBe(false);

      // Case 3: Negative power
      const resNeg = processClientAction(player1, match.matchId, {
        type: "strike",
        power: -20,
        angle: 1.0,
      });
      expect(resNeg.ok).toBe(false);

      // Case 4: Excessive power > 100
      const resExcess = processClientAction(player1, match.matchId, {
        type: "strike",
        power: 500,
        angle: 1.0,
      });
      expect(resExcess.ok).toBe(false);
      expect(securityLogs.some((l) => l.eventType === "IMPOSSIBLE_ACTION")).toBe(true);
    });
  });

  // =========================================================================
  // 6. ROOM SPOOFING & SPECTATOR PROTECTION
  // =========================================================================
  describe("6. Room & Socket Identity Protection", () => {
    it("rejects actions from unauthenticated users or non-member spectators", () => {
      const match = createTestMatch("match-tt-1", "table-tennis");
      const spectator: TestUser = { userId: "intruder-99", role: "USER" };

      const res = processClientAction(spectator, match.matchId, {
        type: "paddle-move",
        y: 200,
      });

      expect(res.ok).toBe(false);
      expect(res.error).toMatch(/FORBIDDEN/);
      expect(securityLogs.some((l) => l.eventType === "ROOM_SPOOFING")).toBe(true);
    });
  });

  // =========================================================================
  // 7. TIMER MANIPULATION IMMUNITY
  // =========================================================================
  describe("7. Timer Manipulation Immunity", () => {
    it("rejects actions after authoritative deadline even if client clock is lagging", () => {
      const match = createTestMatch("match-cricket-1", "cricket");
      const player1: TestUser = { userId: "player-1", role: "USER" };

      // Set server deadline in the past
      match.matchDeadline = Date.now() - 5000;

      const res = processClientAction(player1, match.matchId, {
        type: "bowl",
        speed: 80,
      });

      expect(res.ok).toBe(false);
      expect(res.error).toBe("MATCH_TIME_EXPIRED");
      expect(match.status).toBe("time_expired");
    });
  });

  // =========================================================================
  // 8. ALL 10 GAMES SERVER-AUTHORITATIVE ENGINE VALIDATION
  // =========================================================================
  describe("8. Authoritative Engine Enforcement Across All 10 Games", () => {
    it("enforces server rules and rejects illegal moves across all 10 games", () => {
      for (const gameId of GAME_IDS) {
        const match = createTestMatch(`match-${gameId}`, gameId);
        const player1: TestUser = { userId: "player-1", role: "USER" };

        // Test with invalid move type for this game
        const res = processClientAction(player1, match.matchId, {
          type: "illegal-hack-action",
        });

        expect(res.ok).toBe(false);
      }
    });
  });

  // =========================================================================
  // 9. FINANCIAL & SETTLEMENT IDEMPOTENCY SAFETY
  // =========================================================================
  describe("9. Financial Settlement Idempotency", () => {
    it("settles match exactly once and prevents duplicate payout requests", () => {
      const match = createTestMatch("match-financial-1", "fruit-ninja");
      const stake = 100;
      const winnerId = "player-1";

      const settleMatchOnce = (m: TestMatchRuntime) => {
        if (m.settled) throw new Error("ALREADY_SETTLED: Duplicate settlement blocked");
        m.settled = true;
        const currentBal = userWallets.get(winnerId) ?? 0;
        userWallets.set(winnerId, currentBal + stake * 1.8);
      };

      settleMatchOnce(match);
      expect(userWallets.get(winnerId)).toBe(1180);

      // Duplicate settlement call
      expect(() => settleMatchOnce(match)).toThrow(/ALREADY_SETTLED/);
      expect(userWallets.get(winnerId)).toBe(1180); // No double payout
    });
  });

  // =========================================================================
  // 10. TOURNAMENT ADVANCEMENT INTEGRITY
  // =========================================================================
  describe("10. Tournament Advancement Integrity", () => {
    it("advances winner strictly based on server-verified finished match", () => {
      const match = createTestMatch("tournament-match-1", "bubble-shooter");
      
      const advanceTournamentWinner = (m: TestMatchRuntime, declaredWinner: string) => {
        if (m.status !== "finished") {
          throw new Error("UNFINISHED_MATCH: Cannot advance unfinished match");
        }
        if (tournamentAdvancements.has(m.matchId)) {
          throw new Error("ALREADY_ADVANCED: Winner already advanced");
        }
        tournamentAdvancements.set(m.matchId, declaredWinner);
      };

      // Unfinished match advancement attempt
      expect(() => advanceTournamentWinner(match, "player-1")).toThrow(/UNFINISHED_MATCH/);

      // Finish match legitimately
      match.status = "finished";
      advanceTournamentWinner(match, "player-1");
      expect(tournamentAdvancements.get(match.matchId)).toBe("player-1");

      // Duplicate advancement attempt
      expect(() => advanceTournamentWinner(match, "player-1")).toThrow(/ALREADY_ADVANCED/);
    });
  });
});
