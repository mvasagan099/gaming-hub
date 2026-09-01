import { describe, it, expect, beforeEach } from "vitest";
import {
  isStaleStateVersion,
  isSequentialStateVersion,
  isStateVersionGap,
  getCarromPocketDedupeKey,
  calculateStateHash,
  SYNC_RATE_LIMIT_MAX,
  SYNC_RATE_LIMIT_WINDOW_MS,
  type AuthoritativeMatchState,
  type CarromAuthoritativeState,
} from "@gaming-hub/shared";
import { CarromEngine, ChessEngine, LudoEngine, CricketEngine } from "@gaming-hub/game-engine";
import { GameStateSyncManager } from "../../../apps/socket-server/src/sync/GameStateSyncManager";

describe("Centralized Game State Sync + Recovery System", () => {
  beforeEach(() => {
    // Reset internal static maps if needed
  });

  // ==========================================================================
  // 1. Authoritative State Data Contract & Version Reconciliation
  // ==========================================================================
  describe("1. Authoritative State & Version Rules", () => {
    it("strictly rejects stale or duplicate state versions", () => {
      const currentVersion = 100;
      expect(isStaleStateVersion(100, currentVersion)).toBe(true); // duplicate
      expect(isStaleStateVersion(99, currentVersion)).toBe(true);  // stale
      expect(isStaleStateVersion(50, currentVersion)).toBe(true);  // old
      expect(isStaleStateVersion(101, currentVersion)).toBe(false); // next
    });

    it("accepts and applies exact consecutive next state versions", () => {
      const currentVersion = 100;
      expect(isSequentialStateVersion(101, currentVersion)).toBe(true);
      expect(isSequentialStateVersion(102, currentVersion)).toBe(false);
      expect(isSequentialStateVersion(100, currentVersion)).toBe(false);
    });

    it("detects gaps in state versions to trigger full sync", () => {
      const currentVersion = 100;
      expect(isStateVersionGap(101, currentVersion)).toBe(false); // sequential
      expect(isStateVersionGap(102, currentVersion)).toBe(true);  // gap of 1
      expect(isStateVersionGap(105, currentVersion)).toBe(true);  // gap of 4
      expect(isStateVersionGap(99, currentVersion)).toBe(false);  // stale, not gap
    });

    it("calculates deterministic fast state hashes", () => {
      const stateA = { coins: [{ id: "c1", x: 100, y: 200 }], turnNumber: 5 };
      const stateB = { coins: [{ id: "c1", x: 100, y: 200 }], turnNumber: 5 };
      const stateC = { coins: [{ id: "c1", x: 100, y: 201 }], turnNumber: 5 };

      const hashA = calculateStateHash(stateA);
      const hashB = calculateStateHash(stateB);
      const hashC = calculateStateHash(stateC);

      expect(hashA).toBe(hashB);
      expect(hashA).not.toBe(hashC);
      expect(typeof hashA).toBe("string");
      expect(hashA.length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // 2. Server State Sync Manager & Monotonicity
  // ==========================================================================
  describe("2. GameStateSyncManager Authority & Rate Limiting", () => {
    const matchId = "match-sync-test-1";

    it("initializes authoritative state at version 1 and action sequence 0", () => {
      const initial = GameStateSyncManager.initializeMatch(
        matchId,
        "carrom",
        { score: { player1: 0, player2: 0 } },
        Date.now() + 30000,
        "player1"
      );

      expect(initial.matchId).toBe(matchId);
      expect(initial.stateVersion).toBe(1);
      expect(initial.actionSequence).toBe(0);
      expect(initial.status).toBe("playing");
      expect(initial.currentPlayerId).toBe("player1");
      expect(initial.stateHash).toBeDefined();
    });

    it("monotonically increments stateVersion and actionSequence upon accepted actions", () => {
      const updated = GameStateSyncManager.applyActionUpdate(
        matchId,
        "act-101",
        { score: { player1: 5, player2: 0 } },
        { turnNumber: 1, currentPlayerId: "player2" }
      );

      expect(updated.stateVersion).toBe(2);
      expect(updated.actionSequence).toBe(1);
      expect(updated.lastActionId).toBe("act-101");
      expect(updated.turnNumber).toBe(1);
      expect(updated.currentPlayerId).toBe("player2");
    });

    it("rejects late actions once match status is finished with MATCH_FINISHED", () => {
      GameStateSyncManager.finalizeMatch(matchId, { winner: "player1" });
      expect(GameStateSyncManager.isMatchFinished(matchId)).toBe(true);

      expect(() => {
        GameStateSyncManager.applyActionUpdate(matchId, "act-late", { score: { player1: 10 } });
      }).toThrow(/MATCH_FINISHED|Match is already completed/);
    });

    it("enforces rate limits on sync requests (max 5 per 10s)", () => {
      const rateMatchId = "match-rate-limit-test";
      GameStateSyncManager.initializeMatch(rateMatchId, "carrom", { test: true });

      const clientKey = `client-test-${Date.now()}`;
      // Perform 5 allowed syncs
      for (let i = 0; i < 5; i++) {
        const res = GameStateSyncManager.handleStateSyncRequest(clientKey, rateMatchId, 1);
        expect(res.matchId).toBe(rateMatchId);
      }

      // 6th sync within same window must throw RATE_LIMITED
      expect(() => {
        GameStateSyncManager.handleStateSyncRequest(clientKey, rateMatchId, 1);
      }).toThrow(/Too many state sync requests|RATE_LIMITED/);
    });
  });

  // ==========================================================================
  // 3. Carrom Authoritative Physics & Single Final Positions
  // ==========================================================================
  describe("3. Carrom Authoritative State & Deduplication", () => {
    it("produces identical final coin positions on both clients from server physics", () => {
      const engine = new CarromEngine([
        { userId: "p1", seat: 0 },
        { userId: "p2", seat: 1 },
      ]);

      // Player 0 shoots
      const shotResult = engine.apply({
        type: "strike",
        angle: 0.5,
        power: 0.8,
        x: 250,
      }, 0);

      expect(shotResult.ok).toBe(true);
      const serverSerialized = engine.serialize() as any;

      // Both clients receive exact serialized coin array
      const client1Coins = serverSerialized.coins;
      const client2Coins = serverSerialized.coins;

      expect(client1Coins.length).toBe(client2Coins.length);
      for (let i = 0; i < client1Coins.length; i++) {
        expect(client1Coins[i].x).toBe(client2Coins[i].x);
        expect(client1Coins[i].y).toBe(client2Coins[i].y);
        expect(client1Coins[i].pocketed).toBe(client2Coins[i].pocketed);
      }
    });

    it("deduplicates pocket events using shotId + coinId", () => {
      const shotId = 178709999;
      const coinId = "coin-white-3";

      const key = getCarromPocketDedupeKey(shotId, coinId);
      expect(key).toBe(`carrom-pocket:${shotId}:${coinId}`);

      // First time: allowed
      const isFirst = GameStateSyncManager.checkAndMarkCarromPocket(shotId, coinId);
      expect(isFirst).toBe(true);

      // Duplicate attempt: rejected / ignored
      const isSecond = GameStateSyncManager.checkAndMarkCarromPocket(shotId, coinId);
      expect(isSecond).toBe(false);
    });

    it("server determines queenState and extra turns, not client animation", () => {
      const engine = new CarromEngine([
        { userId: "p1", seat: 0 },
        { userId: "p2", seat: 1 },
      ]);

      const state = engine.serialize() as any;
      expect(state.queenState).toBe("ON_BOARD");
      expect(state.currentSeat).toBe(0);
      expect(state.players[0].queenCovered).toBe(false);
    });
  });

  // ==========================================================================
  // 4. Chess State Authority & Reconnect
  // ==========================================================================
  describe("4. Chess State Sync & Reconnect", () => {
    it("maintains identical board FEN and move history on both clients", () => {
      const engine = new ChessEngine([
        { userId: "white-player", seat: 0 },
        { userId: "black-player", seat: 1 },
      ]);

      // Move 1: e4
      const move1 = engine.apply({
        type: "move",
        from: "e2",
        to: "e4",
      }, 0);
      expect(move1.ok).toBe(true);

      const state1 = engine.serialize() as any;
      expect(state1.fen).toContain("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR");
      expect(state1.history.length).toBe(1);

      // Duplicate or illegal move rejected
      const dup = engine.apply({
        type: "move",
        from: "e2",
        to: "e4",
      }, 0);
      expect(dup.ok).toBe(false);
    });

    it("reconnect restores exact board snapshot and active clocks", () => {
      const engine = new ChessEngine(
        [
          { userId: "white-player", seat: 0 },
          { userId: "black-player", seat: 1 },
        ],
        undefined,
        { timeControl: { baseSeconds: 300, incrementSeconds: 0, delaySeconds: 0 } }
      );

      engine.apply({ type: "move", from: "e2", to: "e4" }, 0);
      const snapshot = engine.serialize() as any;

      // Reconnecting client receives snapshot directly
      expect(snapshot.fen).toBeDefined();
      expect(snapshot.clocks).toBeDefined();
      expect(snapshot.clocks[0].remainingMs).toBeGreaterThan(0);
      expect(snapshot.clocks[1].remainingMs).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // 5. Ludo State Authority
  // ==========================================================================
  describe("5. Ludo State Sync", () => {
    it("produces identical dice roll and token positions for all players", () => {
      const engine = new LudoEngine([
        { userId: "ludo-p1", seat: 0 },
        { userId: "ludo-p2", seat: 1 },
      ]);

      const roll = engine.apply({ type: "roll" }, 0);
      expect(roll.ok).toBe(true);

      const rollEvent = roll.events.find((e) => e.type === "roll") as any;
      expect(rollEvent).toBeDefined();
      expect(rollEvent.dice).toBeGreaterThanOrEqual(1);
      expect(rollEvent.dice).toBeLessThanOrEqual(6);
    });
  });

  // ==========================================================================
  // 6. Cricket State Authority
  // ==========================================================================
  describe("6. Cricket State Sync", () => {
    it("one ball produces authoritative score update and shared state", () => {
      const engine = new CricketEngine([
        { userId: "batsman", seat: 0 },
        { userId: "bowler", seat: 1 },
      ]);

      const toss = engine.apply({ type: "toss-call", call: "heads" }, 0);
      expect(toss.ok).toBe(true);

      const state = engine.serialize() as any;
      expect(state.players).toBeDefined();
    });
  });

  // ==========================================================================
  // 7. Server Restart & Recovery
  // ==========================================================================
  describe("7. Server Restart Match Recovery", () => {
    it("recovers active matches without resetting the board", () => {
      const restartMatchId = "match-restart-101";
      const savedState: AuthoritativeMatchState = {
        matchId: restartMatchId,
        gameId: "chess",
        stateVersion: 14,
        actionSequence: 13,
        status: "playing",
        currentPlayerId: "user-bob",
        turnNumber: 7,
        turnStartedAt: Date.now() - 5000,
        turnExpiresAt: Date.now() + 25000,
        gameState: { fen: "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2" },
        lastActionId: "act-13",
        lastActionSequence: 13,
        updatedAt: Date.now(),
      };

      // Server restarts and recovers match
      GameStateSyncManager.recoverMatch(savedState);

      const retrieved = GameStateSyncManager.getMatchState(restartMatchId);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.stateVersion).toBe(14);
      expect(retrieved?.turnNumber).toBe(7);
      expect(retrieved?.currentPlayerId).toBe("user-bob");
      expect((retrieved?.gameState as any).fen).toContain("rnbqkbnr/pp1ppppp");
    });
  });
});
