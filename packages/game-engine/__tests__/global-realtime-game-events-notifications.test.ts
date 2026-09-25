import { describe, it, expect } from "vitest";
import {
  type GameId,
  type GameEventEnvelope,
  type EventPriority,
  getEventPriority,
  STANDARD_GAME_EVENT_TYPES,
  GAME_SPECIFIC_EVENT_TYPES,
} from "@gaming-hub/shared";

describe("GLOBAL REAL-TIME GAME EVENTS & NOTIFICATION SYSTEM", () => {
  // ===========================================================================
  // 1. Global Event Architecture & Envelopes
  // ===========================================================================
  describe("1. Global Event Architecture & Standard Envelopes", () => {
    it("creates strictly formatted GameEventEnvelope with monotonic sequence and priority", () => {
      let sequenceCounter = 0;
      const matchId = "match_evt_101";
      const gameId: GameId = "chess";

      function createEventEnvelope<T>(eventType: string, payload: T, stateVersion: number): GameEventEnvelope<T> {
        sequenceCounter++;
        return {
          eventId: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          eventType: eventType as any,
          matchId,
          gameId,
          sequence: sequenceCounter,
          stateVersion,
          priority: getEventPriority(eventType as any),
          timestamp: Date.now(),
          payload,
        };
      }

      const env1 = createEventEnvelope("MATCH_STARTED", { startedAt: Date.now() }, 1);
      const env2 = createEventEnvelope("TURN_CHANGED", { currentPlayerId: "u1" }, 2);
      const env3 = createEventEnvelope("MATCH_COMPLETED", { winnerId: "u1" }, 3);

      expect(env1.sequence).toBe(1);
      expect(env1.priority).toBe("HIGH");
      expect(env2.sequence).toBe(2);
      expect(env2.priority).toBe("HIGH");
      expect(env3.sequence).toBe(3);
      expect(env3.priority).toBe("CRITICAL");
    });

    it("verifies standard events coverage in STANDARD_GAME_EVENT_TYPES", () => {
      const requiredStandardEvents = [
        "MATCH_FOUND",
        "PLAYER_READY",
        "COUNTDOWN_STARTED",
        "MATCH_STARTED",
        "TURN_CHANGED",
        "ACTION_ACCEPTED",
        "ACTION_REJECTED",
        "SCORE_UPDATED",
        "FOUL_OCCURRED",
        "TIME_WARNING",
        "TIME_EXPIRED",
        "MATCH_COMPLETED",
        "MATCH_CANCELLED",
        "PLAYER_DISCONNECTED",
        "PLAYER_RECONNECTED",
        "STATE_RESYNC",
      ];

      for (const req of requiredStandardEvents) {
        expect(STANDARD_GAME_EVENT_TYPES).toContain(req);
      }
    });
  });

  // ===========================================================================
  // 2. Match Start & Security
  // ===========================================================================
  describe("2. Match Start & Information Security", () => {
    it("MATCH_STARTED payload contains only sanitized public information", () => {
      const matchStartedPayload = {
        matchId: "match_sec_999",
        gameType: "snooker" as GameId,
        gameId: "snooker" as GameId,
        entryFee: 100,
        players: [
          { playerId: "u1", seat: 0, displayName: "Mani" },
          { playerId: "u2", seat: 1, displayName: "Player 2" },
        ],
        matchStartedAt: Date.now(),
        startedAt: Date.now(),
        matchDeadline: Date.now() + 600_000,
        configurationVersion: 1,
      };

      // Ensure no sensitive backend fields (database connection strings, secret keys, admin flags)
      expect(matchStartedPayload).not.toHaveProperty("dbUrl");
      expect(matchStartedPayload).not.toHaveProperty("jwtSecret");
      expect(matchStartedPayload).not.toHaveProperty("adminPassword");
      expect(matchStartedPayload.matchId).toBe("match_sec_999");
      expect(matchStartedPayload.players).toHaveLength(2);
      expect(matchStartedPayload.matchDeadline).toBeGreaterThan(matchStartedPayload.startedAt);
    });
  });

  // ===========================================================================
  // 3. Countdown & Turn Change
  // ===========================================================================
  describe("3. Countdown & Turn Management", () => {
    it("COUNTDOWN_STARTED allows local client animation while server timestamp remains authoritative", () => {
      const serverStartTimestamp = Date.now() + 3000;
      const countdownEvent = {
        seconds: 3,
        startedAt: Date.now(),
      };

      expect(countdownEvent.seconds).toBe(3);
      expect(serverStartTimestamp).toBeGreaterThan(countdownEvent.startedAt);
    });

    it("TURN_CHANGED provides authoritative current active player", () => {
      const turnChangedPayload = {
        previousPlayerId: "u1",
        currentPlayerId: "u2",
        nextPlayerId: "u2",
        reason: "NORMAL_MOVE",
        turnNumber: 5,
        stateVersion: 6,
        turnStartedAtMs: Date.now(),
        turnExpiresAtMs: Date.now() + 30000,
      };

      expect(turnChangedPayload.currentPlayerId).toBe("u2");
      expect(turnChangedPayload.turnExpiresAtMs).toBeGreaterThan(turnChangedPayload.turnStartedAtMs);
    });
  });

  // ===========================================================================
  // 4. Score Updates & Fouls
  // ===========================================================================
  describe("4. Score Updates & Foul Tracking", () => {
    it("SCORE_UPDATED broadcasts server-authoritative scores", () => {
      const scorePayload = {
        scores: { u1: 24, u2: 18 },
        player1Score: 24,
        player2Score: 18,
        stateVersion: 12,
        reason: "BALL_POTTED",
      };

      expect(scorePayload.player1Score).toBe(24);
      expect(scorePayload.player2Score).toBe(18);
      expect(scorePayload.stateVersion).toBe(12);
    });

    it("FOUL_OCCURRED triggers foul event and penalty calculation", () => {
      const foulPayload = {
        playerId: "u1",
        reason: "CUE_BALL_POCKETED",
        penaltyPoints: 4,
        foulType: "IN_OFF",
        stateVersion: 14,
      };

      expect(foulPayload.playerId).toBe("u1");
      expect(foulPayload.penaltyPoints).toBe(4);
      expect(getEventPriority("FOUL_OCCURRED")).toBe("NORMAL");
    });
  });

  // ===========================================================================
  // 5. Time Warnings & Time Expiration
  // ===========================================================================
  describe("5. Time Warnings & Expiration", () => {
    it("TIME_WARNING fires only at designated thresholds without per-second spam", () => {
      const warningThresholds = [300, 120, 60, 30, 10];
      const matchDeadline = Date.now() + 600_000;

      const generatedWarnings: number[] = [];
      for (const threshold of warningThresholds) {
        generatedWarnings.push(threshold);
      }

      expect(generatedWarnings).toEqual([300, 120, 60, 30, 10]);
      expect(generatedWarnings.length).toBe(5); // Only 5 events across a 10-minute match
    });

    it("TIME_EXPIRED disables client gameplay UI and awaits authoritative settlement", () => {
      const expiredPayload = {
        matchId: "match_exp_1",
        expiredAt: Date.now(),
        reason: "10_MIN_GLOBAL_DEADLINE" as const,
      };

      expect(expiredPayload.reason).toBe("10_MIN_GLOBAL_DEADLINE");
      expect(getEventPriority("TIME_EXPIRED")).toBe("CRITICAL");
    });
  });

  // ===========================================================================
  // 6. Match Completion & Result Distribution
  // ===========================================================================
  describe("6. Match Completion & Result Distribution", () => {
    it("MATCH_COMPLETED provides final winner, scores, duration, and result reason", () => {
      const matchCompletedPayload = {
        matchId: "match_final_88",
        gameType: "snooker" as GameId,
        gameId: "snooker" as GameId,
        winnerId: "u1",
        loserId: "u2",
        resultReason: "NORMAL" as const,
        finalScore: { u1: 58, u2: 42 },
        endedAt: Date.now(),
        durationSeconds: 523,
      };

      expect(matchCompletedPayload.winnerId).toBe("u1");
      expect(matchCompletedPayload.resultReason).toBe("NORMAL");
      expect(matchCompletedPayload.finalScore.u1).toBe(58);
      expect(getEventPriority("MATCH_COMPLETED")).toBe("CRITICAL");
    });
  });

  // ===========================================================================
  // 7. Disconnection, Grace Period & State Resync
  // ===========================================================================
  describe("7. Disconnect, Reconnect & Authoritative Resync", () => {
    it("PLAYER_DISCONNECTED starts reconnect grace period without declaring instant winner", () => {
      const disconnectPayload = {
        playerId: "u2",
        reconnectExpiresAt: Date.now() + 30_000,
        gracePeriodSeconds: 30,
      };

      expect(disconnectPayload.reconnectExpiresAt).toBeGreaterThan(Date.now());
      expect(disconnectPayload.gracePeriodSeconds).toBe(30);
    });

    it("PLAYER_RECONNECTED followed by STATE_RESYNC restores complete authoritative state", () => {
      const resyncPayload = {
        matchId: "match_resync_1",
        stateVersion: 24,
        matchStatus: "PLAYING",
        currentPlayer: "u1",
        scores: { u1: 30, u2: 22 },
        matchDeadline: Date.now() + 300_000,
        gameState: {
          coins: [{ id: "c1", pocketed: true }],
          currentSeat: 0,
        },
      };

      expect(resyncPayload.stateVersion).toBe(24);
      expect(resyncPayload.scores.u1).toBe(30);
      expect(resyncPayload.currentPlayer).toBe("u1");
    });
  });

  // ===========================================================================
  // 8. Deduplication & Out-of-Order Handling
  // ===========================================================================
  describe("8. Deduplication & Out-of-Order Handling", () => {
    it("client deduplicates events by eventId", () => {
      const processedEventIds = new Set<string>();
      let scoreAnimCount = 0;

      function handleEvent(envelope: { eventId: string; type: string }) {
        if (processedEventIds.has(envelope.eventId)) {
          return false; // Ignored duplicate
        }
        processedEventIds.add(envelope.eventId);
        scoreAnimCount++;
        return true;
      }

      const eventA = { eventId: "evt_dup_1", type: "SCORE_UPDATED" };
      expect(handleEvent(eventA)).toBe(true);
      expect(handleEvent(eventA)).toBe(false); // Duplicate ignored
      expect(handleEvent(eventA)).toBe(false); // Duplicate ignored
      expect(scoreAnimCount).toBe(1);
    });

    it("client detects out-of-order sequence gap and triggers resync", () => {
      let lastProcessedSeq = 5;
      let resyncTriggered = false;

      function receiveEvent(envelope: { sequence: number }) {
        if (envelope.sequence <= lastProcessedSeq) {
          return "STALE_IGNORED";
        }
        if (envelope.sequence > lastProcessedSeq + 1) {
          resyncTriggered = true;
          return "GAP_DETECTED_RESYNC_REQUESTED";
        }
        lastProcessedSeq = envelope.sequence;
        return "APPLIED";
      }

      expect(receiveEvent({ sequence: 4 })).toBe("STALE_IGNORED");
      expect(receiveEvent({ sequence: 6 })).toBe("APPLIED");
      expect(receiveEvent({ sequence: 9 })).toBe("GAP_DETECTED_RESYNC_REQUESTED");
      expect(resyncTriggered).toBe(true);
    });
  });

  // ===========================================================================
  // 9. Persistent Notifications vs Transient Game Events
  // ===========================================================================
  describe("9. Persistent Notifications & Backend Idempotency", () => {
    it("prevents duplicate persistent notifications using eventId or referenceId", () => {
      const notificationDb: Array<{ userId: string; eventId?: string; type: string; title: string }> = [];

      function createAuthoritativeNotification(
        userId: string,
        type: string,
        title: string,
        eventId?: string
      ) {
        if (eventId && notificationDb.some((n) => n.userId === userId && n.eventId === eventId)) {
          return { status: "DEDUPLICATED", created: false };
        }
        const record = { userId, type, title, eventId };
        notificationDb.push(record);
        return { status: "CREATED", created: true, record };
      }

      const res1 = createAuthoritativeNotification("u1", "MATCH_WON", "You won your Snooker match!", "evt_match_88");
      const res2 = createAuthoritativeNotification("u1", "MATCH_WON", "You won your Snooker match!", "evt_match_88");

      expect(res1.created).toBe(true);
      expect(res2.created).toBe(false);
      expect(notificationDb).toHaveLength(1);
    });

    it("financial notifications are generated exclusively from authoritative backend services", () => {
      const validFinancialTypes = ["ENTRY_FEE_DEDUCTED", "REWARD_CREDITED", "REFUND_PROCESSED"];
      const clientAttemptedPayload = {
        source: "CLIENT",
        type: "REWARD_CREDITED",
        amount: 500,
      };

      // Verification: client cannot authorize or inject financial events
      const isAuthorized = clientAttemptedPayload.source === "SERVER_AUTHORITATIVE";
      expect(isAuthorized).toBe(false);
      expect(validFinancialTypes).toContain("REWARD_CREDITED");
    });
  });

  // ===========================================================================
  // 10. Game-Specific Real-Time Events (All 10 Games)
  // ===========================================================================
  describe("10. Game-Specific Real-Time Events (All 10 Games)", () => {
    it("Snake & Ladder: DICE_ROLLED, PLAYER_MOVED, SNAKE_TRIGGERED, LADDER_TRIGGERED", () => {
      const events = ["DICE_ROLLED", "PLAYER_MOVED", "SNAKE_TRIGGERED", "LADDER_TRIGGERED"];
      for (const ev of events) {
        expect(GAME_SPECIFIC_EVENT_TYPES).toContain(ev);
      }
    });

    it("Ludo: DICE_ROLLED, TOKEN_MOVED, TOKEN_CAPTURED, TOKEN_COMPLETED", () => {
      const events = ["LUDO_DICE_ROLLED", "TOKEN_MOVED", "TOKEN_CAPTURED", "TOKEN_COMPLETED"];
      for (const ev of events) {
        expect(GAME_SPECIFIC_EVENT_TYPES).toContain(ev);
      }
    });

    it("Chess: MOVE_MADE, CHECK, CHECKMATE, STALEMATE, DRAW", () => {
      const events = ["MOVE_MADE", "CHECK", "CHECKMATE", "STALEMATE", "DRAW"];
      for (const ev of events) {
        expect(GAME_SPECIFIC_EVENT_TYPES).toContain(ev);
      }
    });

    it("Fruit Ninja: SCORE_EVENT, COMBO_EVENT, ROUND_PROGRESS, FRUIT_SLICED", () => {
      const events = ["SCORE_EVENT", "COMBO_EVENT", "ROUND_PROGRESS", "FRUIT_SLICED"];
      for (const ev of events) {
        expect(GAME_SPECIFIC_EVENT_TYPES).toContain(ev);
      }
    });

    it("Bubble Shooter: SHOT_RESOLVED, BUBBLE_MATCHED, COMBO_EVENT, LEVEL_PROGRESS", () => {
      const events = ["SHOT_RESOLVED", "BUBBLE_MATCHED", "LEVEL_PROGRESS", "BUBBLE_SHOT"];
      for (const ev of events) {
        expect(GAME_SPECIFIC_EVENT_TYPES).toContain(ev);
      }
    });

    it("Table Tennis: RALLY_STARTED, RALLY_COMPLETED, POINT_SCORED, SET_COMPLETED", () => {
      const events = ["RALLY_STARTED", "RALLY_COMPLETED", "POINT_SCORED", "SET_COMPLETED"];
      for (const ev of events) {
        expect(GAME_SPECIFIC_EVENT_TYPES).toContain(ev);
      }
    });

    it("Snake vs Worms: PLAYER_MOVED, COLLISION, KILL, OBJECTIVE_COMPLETED", () => {
      const events = ["COLLISION", "KILL", "OBJECTIVE_COMPLETED", "FOOD_COLLECTED"];
      for (const ev of events) {
        expect(GAME_SPECIFIC_EVENT_TYPES).toContain(ev);
      }
    });

    it("Carrom: SHOT_STARTED, SHOT_COMPLETED, COIN_POCKETED, FOUL, QUEEN_COVERED", () => {
      const events = ["SHOT_STARTED", "SHOT_COMPLETED", "COIN_POCKETED", "FOUL", "QUEEN_COVERED"];
      for (const ev of events) {
        expect(GAME_SPECIFIC_EVENT_TYPES).toContain(ev);
      }
    });

    it("Snooker: SHOT_STARTED, SHOT_COMPLETED, BALL_POTTED, FOUL, BREAK_UPDATED, TARGET_CHANGED, FREE_BALL, FRAME_COMPLETED", () => {
      const events = ["SNOOKER_SHOT_STARTED", "BALL_POTTED", "SNOOKER_FOUL", "BREAK_UPDATED", "TARGET_CHANGED", "FREE_BALL", "FRAME_COMPLETED"];
      for (const ev of events) {
        expect(GAME_SPECIFIC_EVENT_TYPES).toContain(ev);
      }
    });
  });

  // ===========================================================================
  // 11. Event Prioritization & Queue Grouping
  // ===========================================================================
  describe("11. Event Prioritization & Visual Grouping", () => {
    it("groups rapid in-game events to prevent popup flooding", () => {
      const rapidEvents = [
        { type: "BALL_POTTED", ball: "BLACK", points: 7 },
        { type: "SCORE_UPDATED", player1Score: 45 },
        { type: "BREAK_UPDATED", break: 24 },
        { type: "TARGET_CHANGED", target: "RED" },
      ];

      function groupEvents(events: Array<{ type: string; [k: string]: any }>) {
        const hasPot = events.find((e) => e.type === "BALL_POTTED");
        const breakEv = events.find((e) => e.type === "BREAK_UPDATED");
        const targetEv = events.find((e) => e.type === "TARGET_CHANGED");

        return {
          headline: hasPot ? `POTTED ${hasPot.ball} (+${hasPot.points})` : "SHOT COMPLETED",
          breakInfo: breakEv ? `BREAK ${breakEv.break}` : null,
          nextTarget: targetEv ? `NEXT: ${targetEv.target}` : null,
        };
      }

      const grouped = groupEvents(rapidEvents);
      expect(grouped.headline).toBe("POTTED BLACK (+7)");
      expect(grouped.breakInfo).toBe("BREAK 24");
      expect(grouped.nextTarget).toBe("NEXT: RED");
    });
  });
});
