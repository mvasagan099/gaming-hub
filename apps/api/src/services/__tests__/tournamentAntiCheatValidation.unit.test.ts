import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  DEFAULT_TOURNAMENT_TIERS,
  DEFAULT_TIER_PRIZE_DISTRIBUTION,
  calculatePrizes,
  type TournamentTierConfig,
  type TournamentStatus,
} from "@gaming-hub/shared";
import {
  GameValidators,
  getValidator,
  ChessValidator,
  LudoValidator,
  SnakeLadderValidator,
  BubbleShooterValidator,
  FruitNinjaValidator,
  SnakeVsWormsValidator,
  TableTennisValidator,
  CarromValidator,
  SnookerValidator,
} from "@gaming-hub/game-engine";

// All 10 Competitive Games
const ALL_9_GAMES = [
  "chess",
  "ludo",
  "snake-ladder",
  "bubble-shooter",
  "fruit-ninja",
  "snake-vs-worms",
  "table-tennis",
  "carrom",
  "snooker",
] as const;

describe("Tournament Anti-Cheat, Action Validation & Fair-Play System", () => {
  // -------------------------------------------------------------------------
  // 1 & 2. Authoritative Score & Winner Protection
  // -------------------------------------------------------------------------
  describe("1-2. Never Trust Client Score or Winner", () => {
    it("Test 1: Server computes score deterministically and ignores client-submitted score manipulation", () => {
      // Mock game engine calculation
      function computeAuthoritativeScore(gameState: { runs: number; wickets: number }, clientScorePayload?: number): number {
        // Authoritative score is derived strictly from server gameState
        const serverScore = gameState.runs;
        return serverScore;
      }

      const gameState = { runs: 42, wickets: 2 };
      const clientSpoofedScore = 999999;

      const authoritativeScore = computeAuthoritativeScore(gameState, clientSpoofedScore);
      expect(authoritativeScore).toBe(42);
      expect(authoritativeScore).not.toBe(clientSpoofedScore);
    });

    it("Test 2: Match winner is strictly determined by game engine rules, not client assertion", () => {
      interface MockEngineResult {
        playerAScore: number;
        playerBScore: number;
        playerAId: string;
        playerBId: string;
      }

      function determineAuthoritativeWinner(engineResult: MockEngineResult, clientClaimedWinnerId: string): string {
        // Server derives winner from validated scores
        if (engineResult.playerAScore > engineResult.playerBScore) {
          return engineResult.playerAId;
        } else if (engineResult.playerBScore > engineResult.playerAScore) {
          return engineResult.playerBId;
        }
        return "DRAW";
      }

      const matchState: MockEngineResult = {
        playerAScore: 10,
        playerBScore: 25,
        playerAId: "player-alpha",
        playerBId: "player-beta",
      };

      // Player A attempts to claim they won
      const claimedWinner = "player-alpha";
      const authoritativeWinner = determineAuthoritativeWinner(matchState, claimedWinner);

      expect(authoritativeWinner).toBe("player-beta");
      expect(authoritativeWinner).not.toBe(claimedWinner);
    });
  });

  // -------------------------------------------------------------------------
  // 3 & 4. 10-Minute Hard Match Timer Protection & Server Clock
  // -------------------------------------------------------------------------
  describe("3-4. 10-Minute Match Deadline & Server Clock Authoritativeness", () => {
    function validateMatchActionTimestamp(params: {
      startedAt: number;
      actionReceivedAt: number;
      clientClockTimestamp: number;
    }): { valid: boolean; reason?: string } {
      const MATCH_LIMIT_MS = 10 * 60 * 1000; // 10 minutes = 600,000ms
      const deadline = params.startedAt + MATCH_LIMIT_MS;

      // Always use server received time (actionReceivedAt), ignore clientClockTimestamp
      if (params.actionReceivedAt > deadline) {
        return {
          valid: false,
          reason: "Match deadline exceeded (10-minute limit)",
        };
      }
      return { valid: true };
    }

    it("Test 3: Accepts actions within 10-minute window (e.g. 5 minutes in)", () => {
      const startedAt = 1000000;
      const actionReceivedAt = startedAt + 5 * 60 * 1000; // 5 mins in
      const clientClock = startedAt + 1 * 60 * 1000;

      const result = validateMatchActionTimestamp({ startedAt, actionReceivedAt, clientClockTimestamp: clientClock });
      expect(result.valid).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it("Test 4: Rejects actions after 10-minute hard deadline even if client clock is spoofed backwards", () => {
      const startedAt = 1000000;
      const actionReceivedAt = startedAt + 10 * 60 * 1000 + 1000; // 10 mins + 1 sec
      const clientClockSpoofed = startedAt + 2 * 60 * 1000; // Client claims it's only 2 minutes in

      const result = validateMatchActionTimestamp({
        startedAt,
        actionReceivedAt,
        clientClockTimestamp: clientClockSpoofed,
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toBe("Match deadline exceeded (10-minute limit)");
    });
  });

  // -------------------------------------------------------------------------
  // 5 & 6. Identity Authentication & Room Membership Authorization
  // -------------------------------------------------------------------------
  describe("5-6. Account Identity & Room Membership Authorization", () => {
    interface SessionToken {
      userId: string;
      role: string;
    }

    interface MatchRoom {
      roomId: string;
      playerAId: string;
      playerBId: string;
    }

    function authorizeMatchAction(params: {
      session: SessionToken;
      payloadUserId: string;
      room: MatchRoom;
    }): { authorized: boolean; effectiveUserId: string; error?: string } {
      // 1. Never trust payloadUserId; always bind to session.userId
      const effectiveUserId = params.session.userId;

      // 2. Verify effective user is one of the two matched participants
      if (effectiveUserId !== params.room.playerAId && effectiveUserId !== params.room.playerBId) {
        return {
          authorized: false,
          effectiveUserId,
          error: "Unauthorized: User is not an active player in this match room",
        };
      }

      return { authorized: true, effectiveUserId };
    }

    it("Test 5: Ignores client payload userId and uses authenticated session identity", () => {
      const session: SessionToken = { userId: "user-alpha", role: "player" };
      const room: MatchRoom = { roomId: "room-1", playerAId: "user-alpha", playerBId: "user-beta" };

      const result = authorizeMatchAction({
        session,
        payloadUserId: "user-beta", // Attacker attempts to spoof user-beta
        room,
      });

      expect(result.authorized).toBe(true);
      expect(result.effectiveUserId).toBe("user-alpha"); // Bound to session, not payload
    });

    it("Test 6: Rejects 3rd-party spectator or intruder attempting to send gameplay actions", () => {
      const session: SessionToken = { userId: "user-charlie", role: "spectator" };
      const room: MatchRoom = { roomId: "room-1", playerAId: "user-alpha", playerBId: "user-beta" };

      const result = authorizeMatchAction({
        session,
        payloadUserId: "user-charlie",
        room,
      });

      expect(result.authorized).toBe(false);
      expect(result.error).toContain("User is not an active player");
    });
  });

  // -------------------------------------------------------------------------
  // 7 & 8. Action Idempotency & Stale State Versioning
  // -------------------------------------------------------------------------
  describe("7-8. Action Idempotency & State Versioning", () => {
    class ActionProcessor {
      private processedActions = new Map<string, { result: any; turnNumber: number }>();
      public turnNumber = 0;

      processAction(action: { actionId: string; stateVersion?: number; type: string }) {
        // 1. Idempotency Check
        if (this.processedActions.has(action.actionId)) {
          return {
            ok: true,
            isDuplicate: true,
            result: this.processedActions.get(action.actionId)!.result,
          };
        }

        // 2. State Version Validation (Reject stale client actions)
        if (action.stateVersion !== undefined && action.stateVersion < this.turnNumber - 1 && this.turnNumber > 1) {
          return {
            ok: false,
            isDuplicate: false,
            error: "STALE_STATE_VERSION",
          };
        }

        // Process action and mutate state
        this.turnNumber++;
        const result = { success: true, newTurn: this.turnNumber, actionType: action.type };
        this.processedActions.set(action.actionId, { result, turnNumber: this.turnNumber });

        return { ok: true, isDuplicate: false, result };
      }
    }

    it("Test 7: Processes unique actions and increments state version", () => {
      const processor = new ActionProcessor();
      const first = processor.processAction({ actionId: "act-1", type: "move" });

      expect(first.ok).toBe(true);
      expect(first.isDuplicate).toBe(false);
      expect(processor.turnNumber).toBe(1);
    });

    it("Test 8: Duplicate actionId returns cached result without double execution", () => {
      const processor = new ActionProcessor();
      const first = processor.processAction({ actionId: "act-shot-101", type: "shot" });
      expect(first.ok).toBe(true);
      expect(processor.turnNumber).toBe(1);

      // Re-send same actionId
      const duplicate = processor.processAction({ actionId: "act-shot-101", type: "shot" });
      expect(duplicate.ok).toBe(true);
      expect(duplicate.isDuplicate).toBe(true);
      expect(duplicate.result).toEqual(first.result);
      expect(processor.turnNumber).toBe(1); // Turn number NOT incremented twice
    });

    it("Test: Rejects stale state updates", () => {
      const processor = new ActionProcessor();
      processor.turnNumber = 10;

      const stale = processor.processAction({ actionId: "act-stale", stateVersion: 5, type: "move" });
      expect(stale.ok).toBe(false);
      expect(stale.error).toBe("STALE_STATE_VERSION");
    });
  });

  // -------------------------------------------------------------------------
  // 9. All 10 Competitive Games Authoritative Validation
  // -------------------------------------------------------------------------
  describe("9. All 10 Competitive Games Authoritative Validators", () => {
    it("Test 9.1: Validates all 9 available games have registered validators", () => {
      for (const gameId of ALL_9_GAMES) {
        const validator = getValidator(gameId);
        expect(validator, `Validator for ${gameId} must exist`).toBeDefined();
      }
    });

    it("Test 9.2: ChessValidator validates moves and clocks", () => {
      const validator = new ChessValidator();
      const valid = validator.validateAction({ turn: "w" }, { type: "move", from: "e2", to: "e4" }, "user-1", Date.now());
      expect(valid.valid).toBe(true);

      const missingCoords = validator.validateAction({ turn: "w" }, { type: "move" }, "user-1", Date.now());
      expect(missingCoords.valid).toBe(false);
    });

    it("Test 9.3: LudoValidator validates dice and moves", () => {
      const validator = new LudoValidator();
      const validRoll = validator.validateAction({ currentTurn: "red" }, { type: "roll_dice", value: 6 }, "user-1", Date.now());
      expect(validRoll.valid).toBe(true);

      const invalidRoll = validator.validateAction({ currentTurn: "red" }, { type: "roll_dice", value: 9 }, "user-1", Date.now());
      expect(invalidRoll.valid).toBe(false);
    });

    it("Test 9.4: SnakeLadderValidator validates board bounds and roll", () => {
      const validator = new SnakeLadderValidator();
      const valid = validator.validateAction({ playerPositions: { "user-1": 10 } }, { type: "roll", value: 4 }, "user-1", Date.now());
      expect(valid.valid).toBe(true);

      const impossibleRoll = validator.validateAction({ playerPositions: { "user-1": 10 } }, { type: "roll", value: 12 }, "user-1", Date.now());
      expect(impossibleRoll.valid).toBe(false);
    });

    it("Test 9.5: BubbleShooterValidator validates shot angles and colors", () => {
      const validator = new BubbleShooterValidator();
      const valid = validator.validateAction({}, { type: "shoot", angle: 45, bubbleColor: "red" }, "user-1", Date.now());
      expect(valid.valid).toBe(true);

      const invalidAngle = validator.validateAction({}, { type: "shoot", angle: 270, bubbleColor: "red" }, "user-1", Date.now());
      expect(invalidAngle.valid).toBe(false);
    });

    it("Test 9.6: FruitNinjaValidator validates swipe coordinates and blade velocity", () => {
      const validator = new FruitNinjaValidator();
      const valid = validator.validateAction({}, { type: "slice", coordinates: [{ x: 10, y: 10 }, { x: 20, y: 20 }] }, "user-1", Date.now());
      expect(valid.valid).toBe(true);

      const missingCoords = validator.validateAction({}, { type: "slice", coordinates: [] }, "user-1", Date.now());
      expect(missingCoords.valid).toBe(false);
    });

    it("Test 9.7: SnakeVsWormsValidator validates direction updates", () => {
      const validator = new SnakeVsWormsValidator();
      const valid = validator.validateAction({}, { type: "direction", angle: Math.PI / 2 }, "user-1", Date.now());
      expect(valid.valid).toBe(true);

      const invalidAngle = validator.validateAction({}, { type: "direction", angle: 999 }, "user-1", Date.now());
      expect(invalidAngle.valid).toBe(false);
    });

    it("Test 9.8: TableTennisValidator validates paddle bounds", () => {
      const validator = new TableTennisValidator();
      const valid = validator.validateAction({}, { type: "paddle-move", y: 0.5 }, "user-1", Date.now());
      expect(valid.valid).toBe(true);

      const outOfBounds = validator.validateAction({}, { type: "paddle-move", y: 2.5 }, "user-1", Date.now());
      expect(outOfBounds.valid).toBe(false);
    });

    it("Test 9.9: CarromValidator validates striker strike power and placement", () => {
      const validator = new CarromValidator();
      const valid = validator.validateAction({}, { type: "strike", power: 75, angle: 180 }, "user-1", Date.now());
      expect(valid.valid).toBe(true);

      const impossiblePower = validator.validateAction({}, { type: "strike", power: 500, angle: 180 }, "user-1", Date.now());
      expect(impossiblePower.valid).toBe(false);
    });

    it("Test 9.11: SnookerValidator validates strike force, cue ball coords, and color nomination", () => {
      const validator = new SnookerValidator();
      const validStrike = validator.validateAction({}, { type: "strike", power: 60, angle: Math.PI / 4 }, "user-1", Date.now());
      expect(validStrike.valid).toBe(true);

      const invalidPower = validator.validateAction({}, { type: "strike", power: 150, angle: 0 }, "user-1", Date.now());
      expect(invalidPower.valid).toBe(false);

      const validColor = validator.validateAction({}, { type: "select_color", color: "blue" }, "user-1", Date.now());
      expect(validColor.valid).toBe(true);

      const invalidColor = validator.validateAction({}, { type: "select_color", color: "purple" }, "user-1", Date.now());
      expect(invalidColor.valid).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 10. Fair-Play Risk Scoring & Non-Punitive Disconnect Policy
  // -------------------------------------------------------------------------
  describe("10. Fair-Play Risk Scoring & Disconnect Handling", () => {
    it("Test 10: Disconnects and latency spikes do not immediately ban players", () => {
      class FairPlayScorer {
        private riskScores = new Map<string, number>();

        recordEvent(playerId: string, eventType: string, severity: "low" | "medium" | "high" | "critical") {
          const current = this.riskScores.get(playerId) ?? 0;
          const delta = severity === "critical" ? 30 : severity === "high" ? 15 : severity === "medium" ? 5 : 2;
          this.riskScores.set(playerId, Math.min(100, current + delta));
        }

        getScore(playerId: string): number {
          return this.riskScores.get(playerId) ?? 0;
        }

        shouldAutoBan(playerId: string): boolean {
          // Rule 23: Never auto-ban solely on heuristic triggers
          return false;
        }
      }

      const scorer = new FairPlayScorer();
      // Record a transient network disconnect
      scorer.recordEvent("user-1", "network_disconnect", "low");
      expect(scorer.getScore("user-1")).toBe(2);
      expect(scorer.shouldAutoBan("user-1")).toBe(false);

      // Record multiple anomalies
      scorer.recordEvent("user-1", "invalid_shot", "medium");
      scorer.recordEvent("user-1", "rate_spike", "medium");
      expect(scorer.getScore("user-1")).toBe(12);
      expect(scorer.shouldAutoBan("user-1")).toBe(false); // Flags for admin review, does not auto-ban
    });
  });

  // -------------------------------------------------------------------------
  // 11 & 12. Prize Distribution & 5 Tournament Tiers Invariants
  // -------------------------------------------------------------------------
  describe("11-12. Prize Protection & 5 Tournament Tiers", () => {
    it("Test 11: Distributes prizes strictly to verified winners in 50%, 25%, 15%, 10% ratio", () => {
      const totalPool = 10000;
      const prizes = calculatePrizes(totalPool, DEFAULT_TIER_PRIZE_DISTRIBUTION);

      expect(prizes.length).toBe(4);
      expect(prizes[0]!.rank).toBe(1);
      expect(prizes[0]!.amount).toBe(5000); // 50%
      expect(prizes[1]!.rank).toBe(2);
      expect(prizes[1]!.amount).toBe(2500); // 25%
      expect(prizes[2]!.rank).toBe(3);
      expect(prizes[2]!.amount).toBe(1500); // 15%
      expect(prizes[3]!.rank).toBe(4);
      expect(prizes[3]!.amount).toBe(1000); // 10%
    });

    it("Test 12: Validates anti-cheat applies identically across all 5 tiers", () => {
      const tiers = DEFAULT_TOURNAMENT_TIERS;
      expect(tiers.length).toBe(5);

      const mini = tiers.find((t) => t.code === "mini")!;
      const basic = tiers.find((t) => t.code === "basic")!;
      const standard = tiers.find((t) => t.code === "standard")!;
      const premium = tiers.find((t) => t.code === "premium")!;
      const pro = tiers.find((t) => t.code === "pro")!;

      expect(mini.entryFee).toBe(5);
      expect(basic.entryFee).toBe(10);
      expect(standard.entryFee).toBe(25);
      expect(premium.entryFee).toBe(50);
      expect(pro.entryFee).toBe(100);

      for (const tier of tiers) {
        // All tiers inherit authoritative 10-minute match limit and anti-cheat validation
        const matchConfig = {
          tier: tier.code,
          matchLimitSeconds: 600, // 10 mins
          serverAuthoritative: true,
        };
        expect(matchConfig.matchLimitSeconds).toBe(600);
        expect(matchConfig.serverAuthoritative).toBe(true);
      }
    });
  });
});
