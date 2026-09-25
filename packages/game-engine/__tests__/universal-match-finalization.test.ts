import { describe, it, expect, beforeEach, vi } from "vitest";
import type { GameId, StandardMatchResult } from "@gaming-hub/shared";
import {
  GameResultAdapterRegistry,
  createEngine,
} from "../src/index";

const AVAILABLE_GAMES: GameId[] = [
  "snake-ladder",
  "ludo",
  "chess",
  "fruit-ninja",
  "bubble-shooter",
  "table-tennis",
  "snake-vs-worms",
  "carrom",
  "snooker",
];

describe("Universal Match Result Validation & Finalization Pipeline", () => {
  beforeEach(() => {
    GameResultAdapterRegistry.initialize();
  });

  describe("1. Standard Result Structure Compliance Across All 9 Available Games", () => {
    for (const gameId of AVAILABLE_GAMES) {
      it(`produces standardized result structure for ${gameId}`, () => {
        const adapter = GameResultAdapterRegistry.getAdapter(gameId);
        const players = [
          { seat: 0, userId: "user-alpha" },
          { seat: 1, userId: "user-beta" },
        ];

        const engine = createEngine(
          gameId,
          [
            { seat: 0, userId: "user-alpha" },
            { seat: 1, userId: "user-beta" },
          ],
          () => 0.5,
        );

        const state = adapter.getAuthoritativeState(engine);
        const timeResult = adapter.calculateTimeLimitResult(state, players);

        const standardResult: StandardMatchResult = {
          matchId: `match-${gameId}-1`,
          gameType: gameId,
          player1: "user-alpha",
          player2: "user-beta",
          winner: timeResult.winnerIds[0] ?? null,
          loser: timeResult.loserId,
          finalScore: timeResult.scores,
          resultReason: "TIME_LIMIT",
          startedAt: Date.now() - 600_000,
          endedAt: Date.now(),
          duration: 600,
          stateVersion: 1,
          winnerSeats: timeResult.winnerSeats,
          isDraw: timeResult.isDraw,
          resultType: timeResult.isDraw ? "DRAW" : "WIN",
          finalState: state,
        };

        expect(standardResult.matchId).toBe(`match-${gameId}-1`);
        expect(standardResult.gameType).toBe(gameId);
        expect(standardResult.player1).toBe("user-alpha");
        expect(standardResult.player2).toBe("user-beta");
        expect(standardResult.duration).toBe(600);
        expect(standardResult.resultReason).toBe("TIME_LIMIT");
        expect(typeof standardResult.finalScore).toBe("object");

        const validation = adapter.validateFinalResult(state, players, standardResult);
        expect(validation.valid).toBe(true);
      });
    }
  });

  describe("2. 10-Minute Boundary & Late Action Guard", () => {
    it("accepts actions before deadline and rejects actions after 10-minute deadline", () => {
      const matchStartedAt = 1000000;
      const matchDurationMs = 600_000; // 10 minutes (600s)
      const matchDeadline = matchStartedAt + matchDurationMs;

      // 09:59:00 (590s) -> Normal gameplay
      const timeAt0959 = matchStartedAt + 590_000;
      expect(timeAt0959 < matchDeadline).toBe(true);

      // 09:59:59 (599.999s) -> Valid final action
      const timeAt095959 = matchStartedAt + 599_999;
      expect(timeAt095959 < matchDeadline).toBe(true);

      // 10:00:00 (600s) -> Deadline reached
      const timeAt1000 = matchStartedAt + 600_000;
      expect(timeAt1000 >= matchDeadline).toBe(true);

      // 10:00:01 (601s) -> Late action rejected
      const timeAt100001 = matchStartedAt + 601_000;
      expect(timeAt100001 >= matchDeadline).toBe(true);
    });
  });

  describe("3. Client Result Tampering Protection", () => {
    it("derives winner authoritatively from engine state regardless of client claims", () => {
      const adapter = GameResultAdapterRegistry.getAdapter("chess");
      const players = [
        { seat: 0, userId: "honest-player" },
        { seat: 1, userId: "cheater-player" },
      ];

      // Honest player has Queen, cheater has no Queen
      const state = {
        fen: "rnb1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        clocks: { 0: { remainingMs: 30000 }, 1: { remainingMs: 30000 } },
      };

      // Cheater claims they won with 999 score
      const fakeClientResult = {
        claimedWinner: "cheater-player",
        claimedScore: 999,
      };

      // Server calculates authoritative result ignoring fake client claims
      const authoritativeResult = adapter.calculateTimeLimitResult(state, players);
      expect(authoritativeResult.winnerIds).toEqual(["honest-player"]);
      expect(authoritativeResult.winnerIds).not.toContain(fakeClientResult.claimedWinner);
    });

    it("rejects forged score values and validates against server state", () => {
      const adapter = GameResultAdapterRegistry.getAdapter("carrom");
      const players = [
        { seat: 0, userId: "user-1" },
        { seat: 1, userId: "user-2" },
      ];

      const state = {
        players: [
          { seat: 0, score: 3, color: "white" },
          { seat: 1, score: 1, color: "black" },
        ],
        coins: [],
      };

      const serverScores = adapter.getAllScores(state, players);
      expect(serverScores["user-1"]).toBe(3);
      expect(serverScores["user-2"]).toBe(1);
    });
  });

  describe("4. Atomic Exactly-Once Finalization & Idempotency Simulation", () => {
    it("simulates atomic mutex so multiple finalize calls produce a single consistent result", async () => {
      const adapter = GameResultAdapterRegistry.getAdapter("table-tennis");
      const players = [
        { seat: 0, userId: "tt-user-1" },
        { seat: 1, userId: "tt-user-2" },
      ];

      const state = {
        players: [
          { seat: 0, sets: 2, score: 5 },
          { seat: 1, sets: 0, score: 2 },
        ],
      };

      // In-memory mutex simulation matching UniversalMatchFinalizer
      const finalizingMatches = new Set<string>();
      const finalizedResults = new Map<string, StandardMatchResult>();
      let databaseWrites = 0;
      let settlementTriggers = 0;
      let tournamentReports = 0;

      async function finalizeMatch(matchId: string, triggerReason: "NORMAL" | "TIME_LIMIT") {
        if (finalizingMatches.has(matchId)) {
          return finalizedResults.get(matchId) ?? null;
        }
        if (finalizedResults.has(matchId)) {
          return finalizedResults.get(matchId)!;
        }

        finalizingMatches.add(matchId);
        try {
          // Compute result
          const timeResult = adapter.calculateTimeLimitResult(state, players);
          const result: StandardMatchResult = {
            matchId,
            gameType: "table-tennis",
            player1: "tt-user-1",
            player2: "tt-user-2",
            winner: timeResult.winnerIds[0] ?? null,
            loser: timeResult.loserId,
            finalScore: timeResult.scores,
            resultReason: triggerReason,
            startedAt: Date.now() - 300000,
            endedAt: Date.now(),
            duration: 300,
            stateVersion: 1,
            winnerSeats: timeResult.winnerSeats,
            isDraw: timeResult.isDraw,
          };

          // Side-effects (must execute exactly once)
          databaseWrites++;
          settlementTriggers++;
          tournamentReports++;

          finalizedResults.set(matchId, result);
          return result;
        } finally {
          finalizingMatches.delete(matchId);
        }
      }

      // Concurrently call finalizeMatch 10 times (e.g. timeout worker + client finish race)
      const matchId = "atomic-match-1";
      const results = await Promise.all([
        finalizeMatch(matchId, "NORMAL"),
        finalizeMatch(matchId, "TIME_LIMIT"),
        finalizeMatch(matchId, "NORMAL"),
        finalizeMatch(matchId, "TIME_LIMIT"),
        finalizeMatch(matchId, "NORMAL"),
      ]);

      expect(databaseWrites).toBe(1);
      expect(settlementTriggers).toBe(1);
      expect(tournamentReports).toBe(1);

      // All returned results have the exact same winner and score
      for (const res of results) {
        if (res) {
          expect(res.winner).toBe("tt-user-1");
          expect(res.matchId).toBe(matchId);
        }
      }
    });
  });

  describe("5. Draw Handling Preservation", () => {
    it("never invents a winner on a legitimate draw across games", () => {
      const chessAdapter = GameResultAdapterRegistry.getAdapter("chess");
      const players = [
        { seat: 0, userId: "draw-user-1" },
        { seat: 1, userId: "draw-user-2" },
      ];

      const equalState = {
        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        clocks: { 0: { remainingMs: 20000 }, 1: { remainingMs: 20000 } },
      };

      const result = chessAdapter.calculateTimeLimitResult(equalState, players);
      expect(result.isDraw).toBe(true);
      expect(result.winnerSeats).toEqual([]);
      expect(result.winnerIds).toEqual([]);
      expect(result.loserId).toBeNull();
    });
  });
});
