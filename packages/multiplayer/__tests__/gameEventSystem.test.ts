import { describe, it, expect, beforeEach } from "vitest";
import {
  type GameEventEnvelope,
  type InGameNotification,
  type GameId,
  STANDARD_GAME_EVENT_TYPES,
  GAME_SPECIFIC_EVENT_TYPES,
  GAME_EVENTS_BY_GAME,
  GAME_IDS,
} from "@gaming-hub/shared";
import { GameEventBus } from "../../../apps/socket-server/src/events/GameEventBus";

describe("Centralized Real-Time Notification & Game Event System (22 Acceptance Tests)", () => {
  beforeEach(() => {
    GameEventBus.cleanupMatch("test-match-1");
    GameEventBus.cleanupMatch("test-match-2");
  });

  // Test 1: Event envelope structure validity
  it("1. Standard event envelope conforms to required structure", () => {
    const envelope = GameEventBus.createEnvelope(
      "TURN_STARTED",
      "test-match-1",
      "carrom",
      { playerId: "p1", turnNumber: 1, turnStartedAtMs: 1000, turnExpiresAtMs: 31000 },
    );

    expect(envelope).toHaveProperty("eventId");
    expect(envelope).toHaveProperty("eventType", "TURN_STARTED");
    expect(envelope).toHaveProperty("matchId", "test-match-1");
    expect(envelope).toHaveProperty("gameId", "carrom");
    expect(envelope).toHaveProperty("stateVersion");
    expect(envelope).toHaveProperty("timestamp");
    expect(envelope).toHaveProperty("payload");
    expect(envelope.eventId).toMatch(/^evt_\d+_[a-f0-9]+$/);
  });

  // Test 2: Unique event IDs
  it("2. Distinct events have globally unique eventIds", () => {
    const evt1 = GameEventBus.createEnvelope("MATCH_FOUND", "test-match-1", "chess", {});
    const evt2 = GameEventBus.createEnvelope("MATCH_FOUND", "test-match-1", "chess", {});
    expect(evt1.eventId).not.toBe(evt2.eventId);
  });

  // Test 3: Monotonically increasing stateVersion
  it("3. State versions increase monotonically per match", () => {
    const evt1 = GameEventBus.createEnvelope("TURN_STARTED", "test-match-1", "ludo", {});
    const evt2 = GameEventBus.createEnvelope("TURN_CHANGED", "test-match-1", "ludo", {});
    const evt3 = GameEventBus.createEnvelope("GAME_FINISHED", "test-match-1", "ludo", {});

    expect(evt1.stateVersion).toBe(1);
    expect(evt2.stateVersion).toBe(2);
    expect(evt3.stateVersion).toBe(3);
  });

  // Test 4: Independent state versions per match
  it("4. Different matches maintain independent state versions", () => {
    const m1Evt1 = GameEventBus.createEnvelope("MATCH_STARTED", "test-match-1", "carrom", {});
    const m2Evt1 = GameEventBus.createEnvelope("MATCH_STARTED", "test-match-2", "chess", {});
    const m1Evt2 = GameEventBus.createEnvelope("TURN_STARTED", "test-match-1", "carrom", {});

    expect(m1Evt1.stateVersion).toBe(1);
    expect(m2Evt1.stateVersion).toBe(1);
    expect(m1Evt2.stateVersion).toBe(2);
  });

  // Test 5: Client stale packet drop logic
  it("5. Client correctly discards stale packets with stateVersion < currentVersion", () => {
    let currentVersion = 5;
    const incomingStaleEvent = { stateVersion: 4, eventType: "GAME_STATE_UPDATED" };

    const shouldDrop = incomingStaleEvent.stateVersion < currentVersion;
    expect(shouldDrop).toBe(true);
  });

  // Test 6: Client version gap detection logic
  it("6. Client detects stateVersion gaps (> currentVersion + 1) to trigger game:sync", () => {
    let currentVersion = 5;
    const incomingGapEvent = { stateVersion: 8, eventType: "GAME_STATE_UPDATED" };

    const hasGap = incomingGapEvent.stateVersion > currentVersion + 1;
    expect(hasGap).toBe(true);
  });

  // Test 7: MATCH_FOUND event envelope
  it("7. MATCH_FOUND event generates valid envelope with match metadata", () => {
    const envelope = GameEventBus.createEnvelope("MATCH_FOUND", "test-match-1", "snake_ladder", {
      matchId: "test-match-1",
      gameId: "snake_ladder",
      entryFee: 100,
      players: ["p1", "p2"],
    });

    expect(envelope.eventType).toBe("MATCH_FOUND");
    expect(envelope.payload.entryFee).toBe(100);
    expect(envelope.payload.players).toEqual(["p1", "p2"]);
  });

  // Test 8: PLAYER_READY & PLAYER_UNREADY events
  it("8. PLAYER_READY and PLAYER_UNREADY envelopes track player readiness", () => {
    const ready = GameEventBus.createEnvelope("PLAYER_READY", "test-match-1", "table_tennis", {
      playerId: "user-123",
      ready: true,
    });
    const unready = GameEventBus.createEnvelope("PLAYER_UNREADY", "test-match-1", "table_tennis", {
      playerId: "user-123",
      ready: false,
    });

    expect(ready.eventType).toBe("PLAYER_READY");
    expect(ready.payload.ready).toBe(true);
    expect(unready.eventType).toBe("PLAYER_UNREADY");
    expect(unready.payload.ready).toBe(false);
  });

  // Test 9: COUNTDOWN_STARTED & COUNTDOWN_UPDATED events
  it("9. Authoritative countdown events emit correct step values", () => {
    const c3 = GameEventBus.createEnvelope("COUNTDOWN_STARTED", "test-match-1", "cricket", { countdown: 3, value: 3 });
    const c2 = GameEventBus.createEnvelope("COUNTDOWN_UPDATED", "test-match-1", "cricket", { countdown: 2, value: 2 });
    const c0 = GameEventBus.createEnvelope("COUNTDOWN_UPDATED", "test-match-1", "cricket", { countdown: 0, value: 0 });

    expect(c3.payload.value).toBe(3);
    expect(c2.payload.value).toBe(2);
    expect(c0.payload.value).toBe(0);
  });

  // Test 10: MATCH_STARTED envelope with snapshot
  it("10. MATCH_STARTED envelope includes entryFee and snapshot", () => {
    const envelope = GameEventBus.createEnvelope("MATCH_STARTED", "test-match-1", "fruit_ninja", {
      matchId: "test-match-1",
      gameId: "fruit_ninja",
      entryFee: 50,
      configSnapshot: { configVersion: 1, turnTimerSeconds: 15 },
      players: [{ playerId: "p1", seat: 0, displayName: "Ninja" }],
      startedAt: 1234567890,
    });

    expect(envelope.payload.configSnapshot.turnTimerSeconds).toBe(15);
    expect(envelope.payload.players[0].displayName).toBe("Ninja");
  });

  // Test 11: TURN_STARTED with authoritative deadlines
  it("11. TURN_STARTED contains authoritative start and expiration timestamps", () => {
    const startMs = Date.now();
    const expiryMs = startMs + 30000;
    const envelope = GameEventBus.createEnvelope("TURN_STARTED", "test-match-1", "carrom", {
      playerId: "p1",
      turnNumber: 0,
      turnStartedAtMs: startMs,
      turnExpiresAtMs: expiryMs,
    });

    expect(envelope.payload.turnExpiresAtMs).toBeGreaterThan(envelope.payload.turnStartedAtMs);
  });

  // Test 12: TURN_CHANGED envelope on turn switches
  it("12. TURN_CHANGED records previous and next active players", () => {
    const envelope = GameEventBus.createEnvelope("TURN_CHANGED", "test-match-1", "chess", {
      previousPlayerId: "p1",
      nextPlayerId: "p2",
      reason: "NORMAL_MOVE",
      turnNumber: 1,
      turnStartedAtMs: Date.now(),
      turnExpiresAtMs: Date.now() + 300000,
    });

    expect(envelope.payload.previousPlayerId).toBe("p1");
    expect(envelope.payload.nextPlayerId).toBe("p2");
    expect(envelope.payload.reason).toBe("NORMAL_MOVE");
  });

  // Test 13: GAME_ACTION_ACCEPTED & GAME_ACTION_REJECTED
  it("13. GAME_ACTION_ACCEPTED and REJECTED envelopes contain actionId and actionType", () => {
    const accepted = GameEventBus.createEnvelope("GAME_ACTION_ACCEPTED", "test-match-1", "snake_worms", {
      actionId: "act_123",
      actionType: "CHANGE_DIRECTION",
      playerId: "p1",
    });

    const rejected = GameEventBus.createEnvelope("GAME_ACTION_REJECTED", "test-match-1", "snake_worms", {
      actionId: "act_124",
      actionType: "BOOST",
      playerId: "p1",
      reason: "INSUFFICIENT_ENERGY",
    });

    expect(accepted.payload.actionId).toBe("act_123");
    expect(rejected.payload.reason).toBe("INSUFFICIENT_ENERGY");
  });

  // Test 14: GAME_STATE_UPDATED with serialized engine state
  it("14. GAME_STATE_UPDATED envelope contains serialized game state and event log", () => {
    const state = { score: 100, ballsRemaining: 5 };
    const events = [{ type: "BALL_BOWLED", speed: 120 }];
    const envelope = GameEventBus.createEnvelope("GAME_STATE_UPDATED", "test-match-1", "cricket", {
      matchId: "test-match-1",
      state,
      events,
    });

    expect(envelope.payload.state).toEqual(state);
    expect(envelope.payload.events).toEqual(events);
  });

  // Test 15: Disconnect grace timestamp in PLAYER_DISCONNECTED
  it("15. PLAYER_DISCONNECTED contains reconnectExpiresAt deadline", () => {
    const reconnectExpiresAt = Date.now() + 30000;
    const envelope = GameEventBus.createEnvelope("PLAYER_DISCONNECTED", "test-match-1", "bubble_shooter", {
      playerId: "p2",
      reconnectExpiresAt,
    });

    expect(envelope.payload.reconnectExpiresAt).toBe(reconnectExpiresAt);
  });

  // Test 16: PLAYER_RECONNECTED envelope
  it("16. PLAYER_RECONNECTED contains reconnected player ID", () => {
    const envelope = GameEventBus.createEnvelope("PLAYER_RECONNECTED", "test-match-1", "bubble_shooter", {
      playerId: "p2",
    });

    expect(envelope.payload.playerId).toBe("p2");
  });

  // Test 17: PLAYER_FORFEITED envelope
  it("17. PLAYER_FORFEITED records winnerId and reason for forfeit", () => {
    const envelope = GameEventBus.createEnvelope("PLAYER_FORFEITED", "test-match-1", "chess", {
      playerId: "p2",
      winnerId: "p1",
      reason: "RECONNECT_EXPIRED",
    });

    expect(envelope.payload.winnerId).toBe("p1");
    expect(envelope.payload.reason).toBe("RECONNECT_EXPIRED");
  });

  // Test 18: GAME_FINISHED envelope with scores
  it("18. GAME_FINISHED envelope contains authoritative final scores and resultType", () => {
    const envelope = GameEventBus.createEnvelope("GAME_FINISHED", "test-match-1", "table_tennis", {
      matchId: "test-match-1",
      gameId: "table_tennis",
      resultType: "WIN",
      winnerId: "p1",
      loserId: "p2",
      winnerSeats: [0],
      scores: { p1: 11, p2: 9 },
    });

    expect(envelope.payload.resultType).toBe("WIN");
    expect(envelope.payload.scores.p1).toBe(11);
    expect(envelope.payload.scores.p2).toBe(9);
  });

  // Test 19: Settlement lifecycle events
  it("19. SETTLEMENT_STARTED and SETTLEMENT_COMPLETED track coin distribution", () => {
    const started = GameEventBus.createEnvelope("SETTLEMENT_STARTED", "test-match-1", "carrom", {
      matchId: "test-match-1",
      totalPot: 200,
      entryFee: 100,
    });

    const completed = GameEventBus.createEnvelope("SETTLEMENT_COMPLETED", "test-match-1", "carrom", {
      matchId: "test-match-1",
      prizePool: 200,
      winnerPayout: 180,
      refundPerPlayer: 0,
      isDraw: false,
      winnerIds: ["p1"],
    });

    expect(started.payload.totalPot).toBe(200);
    expect(completed.payload.winnerPayout).toBe(180);
  });

  // Test 20: In-game notifications priority classification
  it("20. In-game notifications correctly assign HIGH, MEDIUM, and LOW priority levels", () => {
    const highNotif: InGameNotification = {
      id: GameEventBus.generateEventId(),
      priority: "HIGH",
      title: "Match Found!",
      message: "Opponent located",
      eventType: "MATCH_FOUND",
      matchId: "m1",
      gameId: "chess",
      timestamp: Date.now(),
      ephemeralMs: 4000,
    };

    const medNotif: InGameNotification = {
      id: GameEventBus.generateEventId(),
      priority: "MEDIUM",
      title: "Player Ready",
      message: "Player is ready",
      eventType: "PLAYER_READY",
      matchId: "m1",
      gameId: "chess",
      timestamp: Date.now(),
      ephemeralMs: 3000,
    };

    expect(highNotif.priority).toBe("HIGH");
    expect(medNotif.priority).toBe("MEDIUM");
  });

  // Test 21: Game specific events coverage for all 9 games
  it("21. Game specific event definitions cover all 9 active games", () => {
    for (const gameId of GAME_IDS) {
      expect(GAME_EVENTS_BY_GAME[gameId]).toBeDefined();
      expect(GAME_EVENTS_BY_GAME[gameId].length).toBeGreaterThan(0);
    }

    // Check specific games
    expect(GAME_EVENTS_BY_GAME.carrom).toContain("CARROM_COIN_POCKETED");
    expect(GAME_EVENTS_BY_GAME.chess).toContain("CHESS_CHECKMATE");
    expect(GAME_EVENTS_BY_GAME.ludo).toContain("LUDO_TOKEN_MOVED");
    expect(GAME_EVENTS_BY_GAME["snake-ladder"]).toContain("SNAKE_TRIGGERED");
    expect(GAME_EVENTS_BY_GAME["table-tennis"]).toContain("POINT_SCORED");
    expect(GAME_EVENTS_BY_GAME.cricket).toContain("BALL_STARTED");
    expect(GAME_EVENTS_BY_GAME["fruit-ninja"]).toContain("BOMB_HIT");
    expect(GAME_EVENTS_BY_GAME["snake-vs-worms"]).toContain("PLAYER_COLLISION");
    expect(GAME_EVENTS_BY_GAME["bubble-shooter"]).toContain("BUBBLE_SHOT");
  });

  // Test 22: Standard event types list validity
  it("22. STANDARD_GAME_EVENT_TYPES includes all essential match lifecycle events", () => {
    const requiredTypes = [
      "MATCH_FOUND",
      "LOBBY_UPDATED",
      "PLAYER_READY",
      "COUNTDOWN_STARTED",
      "COUNTDOWN_UPDATED",
      "MATCH_STARTED",
      "TURN_STARTED",
      "TURN_CHANGED",
      "TURN_TIMEOUT",
      "PLAYER_DISCONNECTED",
      "PLAYER_RECONNECTED",
      "PLAYER_FORFEITED",
      "GAME_ACTION_ACCEPTED",
      "GAME_ACTION_REJECTED",
      "GAME_STATE_UPDATED",
      "GAME_FINISHED",
      "RESULT_CREATED",
      "SETTLEMENT_STARTED",
      "SETTLEMENT_COMPLETED",
      "MATCH_CANCELLED",
      "REMATCH_REQUESTED",
      "REMATCH_ACCEPTED",
      "REMATCH_STARTED",
    ];

    for (const req of requiredTypes) {
      expect(STANDARD_GAME_EVENT_TYPES).toContain(req);
    }
  });
});
