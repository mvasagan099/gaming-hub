import { describe, it, expect, beforeEach } from "vitest";
import type { GameId, StandardMatchResult } from "@gaming-hub/shared";
import {
  GameResultAdapterRegistry,
  createEngine,
} from "../src/index";

const ALL_10_GAMES: GameId[] = [
  "snake-ladder",
  "ludo",
  "chess",
  "fruit-ninja",
  "bubble-shooter",
  "table-tennis",
  "snake-vs-worms",
  "cricket",
  "carrom",
  "snooker",
];

describe("Universal Game Result Adapters Suite", () => {
  beforeEach(() => {
    GameResultAdapterRegistry.initialize();
  });

  describe("1. Registry Resolution", () => {
    it("resolves a dedicated adapter for all 10 games", () => {
      for (const gameId of ALL_10_GAMES) {
        expect(GameResultAdapterRegistry.hasAdapter(gameId)).toBe(true);
        const adapter = GameResultAdapterRegistry.getAdapter(gameId);
        expect(adapter).toBeDefined();
        expect(adapter.gameId).toBe(gameId);
      }
    });

    it("throws when requesting an unsupported gameId", () => {
      expect(() => GameResultAdapterRegistry.getAdapter("poker" as any)).toThrow(
        /No result adapter registered/,
      );
    });
  });

  describe("2. Chess Result Adapter", () => {
    const adapter = GameResultAdapterRegistry.getAdapter("chess");
    const players = [
      { seat: 0, userId: "user-white" },
      { seat: 1, userId: "user-black" },
    ];

    it("evaluates material score and time limit winner correctly", () => {
      // White has an extra Queen (q=9)
      const state = {
        fen: "rnb1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        clocks: {
          0: { remainingMs: 30000 },
          1: { remainingMs: 30000 },
        },
      };

      const result = adapter.calculateTimeLimitResult(state, players);
      expect(result.resultReason).toBe("TIME_LIMIT");
      expect(result.winnerSeats).toEqual([0]);
      expect(result.winnerIds).toEqual(["user-white"]);
      expect(result.loserId).toBe("user-black");
      expect(result.isDraw).toBe(false);
    });

    it("evaluates clock times when material is equal", () => {
      const state = {
        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        clocks: {
          0: { remainingMs: 15000 },
          1: { remainingMs: 25000 }, // Black has more time
        },
      };

      const result = adapter.calculateTimeLimitResult(state, players);
      expect(result.winnerSeats).toEqual([1]);
      expect(result.winnerIds).toEqual(["user-black"]);
      expect(result.loserId).toBe("user-white");
      expect(result.isDraw).toBe(false);
    });

    it("returns draw when material and clocks are equal", () => {
      const state = {
        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        clocks: {
          0: { remainingMs: 20000 },
          1: { remainingMs: 20000 },
        },
      };

      const result = adapter.calculateTimeLimitResult(state, players);
      expect(result.isDraw).toBe(true);
      expect(result.winnerSeats).toEqual([]);
      expect(result.winnerIds).toEqual([]);
      expect(result.loserId).toBeNull();
    });
  });

  describe("3. Carrom Result Adapter", () => {
    const adapter = GameResultAdapterRegistry.getAdapter("carrom");
    const players = [
      { seat: 0, userId: "user-p1" },
      { seat: 1, userId: "user-p2" },
    ];

    it("resolves winner by score first", () => {
      const state = {
        players: [
          { seat: 0, score: 5, color: "white" },
          { seat: 1, score: 3, color: "black" },
        ],
        coins: [],
      };

      const result = adapter.calculateTimeLimitResult(state, players);
      expect(result.winnerSeats).toEqual([0]);
      expect(result.winnerIds).toEqual(["user-p1"]);
      expect(result.loserId).toBe("user-p2");
      expect(result.isDraw).toBe(false);
    });

    it("resolves tied score by pocketed assigned coins", () => {
      const state = {
        players: [
          { seat: 0, score: 4, color: "white" },
          { seat: 1, score: 4, color: "black" },
        ],
        coins: [
          { id: "c1", type: "white", pocketed: true },
          { id: "c2", type: "white", pocketed: true },
          { id: "c3", type: "black", pocketed: true },
        ],
      };

      const result = adapter.calculateTimeLimitResult(state, players);
      expect(result.winnerSeats).toEqual([0]);
      expect(result.winnerIds).toEqual(["user-p1"]);
    });

    it("resolves tied score and coins as a legitimate draw", () => {
      const state = {
        players: [
          { seat: 0, score: 2, color: "white" },
          { seat: 1, score: 2, color: "black" },
        ],
        coins: [
          { id: "c1", type: "white", pocketed: true },
          { id: "c2", type: "black", pocketed: true },
        ],
      };

      const result = adapter.calculateTimeLimitResult(state, players);
      expect(result.isDraw).toBe(true);
      expect(result.winnerSeats).toEqual([]);
      expect(result.loserId).toBeNull();
    });
  });

  describe("4. Snooker Result Adapter", () => {
    const adapter = GameResultAdapterRegistry.getAdapter("snooker");
    const players = [
      { seat: 0, userId: "user-s1" },
      { seat: 1, userId: "user-s2" },
    ];

    it("resolves winner by frame points", () => {
      const state = {
        player1Score: 45,
        player2Score: 32,
      };

      const result = adapter.calculateTimeLimitResult(state, players);
      expect(result.winnerSeats).toEqual([0]);
      expect(result.winnerIds).toEqual(["user-s1"]);
      expect(result.loserId).toBe("user-s2");
    });

    it("resolves tied points by highest break", () => {
      const state = {
        player1Score: 40,
        player2Score: 40,
        player1HighestBreak: 16,
        player2HighestBreak: 24,
      };

      const result = adapter.calculateTimeLimitResult(state, players);
      expect(result.winnerSeats).toEqual([1]);
      expect(result.winnerIds).toEqual(["user-s2"]);
      expect(result.loserId).toBe("user-s1");
    });
  });

  describe("5. Cricket Result Adapter", () => {
    const adapter = GameResultAdapterRegistry.getAdapter("cricket");
    const players = [
      { seat: 0, userId: "user-c1" },
      { seat: 1, userId: "user-c2" },
    ];

    it("resolves winner by total runs scored", () => {
      const state = {
        team1Score: 34,
        team2Score: 28,
        team1Wickets: 2,
        team2Wickets: 1,
      };

      const result = adapter.calculateTimeLimitResult(state, players);
      expect(result.winnerSeats).toEqual([0]);
      expect(result.winnerIds).toEqual(["user-c1"]);
    });

    it("resolves tied runs by wickets lost (fewer wickets wins)", () => {
      const state = {
        team1Score: 30,
        team2Score: 30,
        team1Wickets: 3,
        team2Wickets: 1, // Team 2 lost fewer wickets
      };

      const result = adapter.calculateTimeLimitResult(state, players);
      expect(result.winnerSeats).toEqual([1]);
      expect(result.winnerIds).toEqual(["user-c2"]);
    });

    it("resolves tied runs and tied wickets as DRAW", () => {
      const state = {
        team1Score: 25,
        team2Score: 25,
        team1Wickets: 2,
        team2Wickets: 2,
      };

      const result = adapter.calculateTimeLimitResult(state, players);
      expect(result.isDraw).toBe(true);
      expect(result.winnerSeats).toEqual([]);
    });
  });

  describe("6. Ludo Result Adapter", () => {
    const adapter = GameResultAdapterRegistry.getAdapter("ludo");
    const players = [
      { seat: 0, userId: "user-l1" },
      { seat: 1, userId: "user-l2" },
    ];

    it("resolves winner by finished tokens first", () => {
      const state = {
        players: [
          {
            seat: 0,
            color: "red",
            tokens: [
              { isFinished: true, isHome: false, position: 105 },
              { isFinished: false, isHome: false, position: 10 },
            ],
          },
          {
            seat: 1,
            color: "green",
            tokens: [
              { isFinished: false, isHome: true, position: 203 },
              { isFinished: false, isHome: false, position: 20 },
            ],
          },
        ],
      };

      const result = adapter.calculateTimeLimitResult(state, players);
      expect(result.winnerSeats).toEqual([0]);
      expect(result.winnerIds).toEqual(["user-l1"]);
    });

    it("resolves tied finished tokens by total track progress", () => {
      const state = {
        players: [
          {
            seat: 0,
            color: "red",
            tokens: [
              { isFinished: false, isHome: false, position: 10 }, // 10 steps from start 0
            ],
          },
          {
            seat: 1,
            color: "green",
            tokens: [
              { isFinished: false, isHome: false, position: 33 }, // 20 steps from start 13
            ],
          },
        ],
      };

      const result = adapter.calculateTimeLimitResult(state, players);
      expect(result.winnerSeats).toEqual([1]);
      expect(result.winnerIds).toEqual(["user-l2"]);
    });
  });

  describe("7. Snake & Ladder Result Adapter", () => {
    const adapter = GameResultAdapterRegistry.getAdapter("snake-ladder");
    const players = [
      { seat: 0, userId: "user-sl1" },
      { seat: 1, userId: "user-sl2" },
    ];

    it("resolves winner by highest board cell position", () => {
      const state = {
        players: [
          { seat: 0, position: 78 },
          { seat: 1, position: 64 },
        ],
      };

      const result = adapter.calculateTimeLimitResult(state, players);
      expect(result.winnerSeats).toEqual([0]);
      expect(result.winnerIds).toEqual(["user-sl1"]);
      expect(result.loserId).toBe("user-sl2");
    });

    it("resolves tied positions as draw", () => {
      const state = {
        players: [
          { seat: 0, position: 55 },
          { seat: 1, position: 55 },
        ],
      };

      const result = adapter.calculateTimeLimitResult(state, players);
      expect(result.isDraw).toBe(true);
      expect(result.winnerSeats).toEqual([]);
    });
  });

  describe("8. Fruit Ninja Result Adapter", () => {
    const adapter = GameResultAdapterRegistry.getAdapter("fruit-ninja");
    const players = [
      { seat: 0, userId: "user-fn1" },
      { seat: 1, userId: "user-fn2" },
    ];

    it("resolves winner by sliced fruit points", () => {
      const state = {
        scores: { 0: 120, 1: 95 },
      };

      const result = adapter.calculateTimeLimitResult(state, players);
      expect(result.winnerSeats).toEqual([0]);
      expect(result.winnerIds).toEqual(["user-fn1"]);
    });
  });

  describe("9. Bubble Shooter Result Adapter", () => {
    const adapter = GameResultAdapterRegistry.getAdapter("bubble-shooter");
    const players = [
      { seat: 0, userId: "user-bs1" },
      { seat: 1, userId: "user-bs2" },
    ];

    it("resolves winner by score first", () => {
      const state = {
        players: [
          { seat: 0, score: 500, grid: new Array(10) },
          { seat: 1, score: 350, grid: new Array(5) },
        ],
      };

      const result = adapter.calculateTimeLimitResult(state, players);
      expect(result.winnerSeats).toEqual([0]);
      expect(result.winnerIds).toEqual(["user-bs1"]);
    });

    it("resolves tied score by fewest remaining bubbles on grid", () => {
      const state = {
        players: [
          { seat: 0, score: 400, grid: new Array(12) },
          { seat: 1, score: 400, grid: new Array(6) }, // Player 1 has fewer bubbles
        ],
      };

      const result = adapter.calculateTimeLimitResult(state, players);
      expect(result.winnerSeats).toEqual([1]);
      expect(result.winnerIds).toEqual(["user-bs2"]);
    });
  });

  describe("10. Table Tennis Result Adapter", () => {
    const adapter = GameResultAdapterRegistry.getAdapter("table-tennis");
    const players = [
      { seat: 0, userId: "user-tt1" },
      { seat: 1, userId: "user-tt2" },
    ];

    it("resolves winner by sets won first, then points", () => {
      const state = {
        players: [
          { seat: 0, sets: 2, score: 4 },
          { seat: 1, sets: 1, score: 8 },
        ],
      };

      const result = adapter.calculateTimeLimitResult(state, players);
      expect(result.winnerSeats).toEqual([0]);
      expect(result.winnerIds).toEqual(["user-tt1"]);
    });
  });

  describe("11. Snake vs Worms Result Adapter", () => {
    const adapter = GameResultAdapterRegistry.getAdapter("snake-vs-worms");
    const players = [
      { seat: 0, userId: "user-svw1" },
      { seat: 1, userId: "user-svw2" },
    ];

    it("resolves winner by mass/score first, then body length", () => {
      const state = {
        players: [
          { seat: 0, score: 1500, body: new Array(25) },
          { seat: 1, score: 1200, body: new Array(30) },
        ],
      };

      const result = adapter.calculateTimeLimitResult(state, players);
      expect(result.winnerSeats).toEqual([0]);
      expect(result.winnerIds).toEqual(["user-svw1"]);
    });
  });

  describe("12. Client Result Tampering Validation", () => {
    const adapter = GameResultAdapterRegistry.getAdapter("chess");
    const players = [
      { seat: 0, userId: "user-white" },
      { seat: 1, userId: "user-black" },
    ];

    it("rejects result containing an intruder or non-participant winner", () => {
      const proposed: StandardMatchResult = {
        matchId: "match-123",
        gameType: "chess",
        player1: "user-white",
        player2: "user-black",
        winner: "intruder-hacker",
        loser: "user-black",
        finalScore: { "user-white": 10, "user-black": 0 },
        resultReason: "NORMAL",
        startedAt: Date.now() - 60000,
        endedAt: Date.now(),
        duration: 60,
        stateVersion: 5,
      };

      const validation = adapter.validateFinalResult({}, players, proposed);
      expect(validation.valid).toBe(false);
      expect(validation.reason).toContain("not a valid participant");
    });
  });
});
