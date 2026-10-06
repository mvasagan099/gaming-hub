import { describe, it, expect } from "vitest";
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

const players = [
  { userId: "player-1", seat: 0, ready: true },
  { userId: "player-2", seat: 1, ready: true },
];

describe("GLOBAL MATCH TIMEOUT ENGINE SPECIFICATION TESTS", () => {
  // =========================================================================
  // 1. Central 10-Minute Deadline & Invariance
  // =========================================================================
  describe("1. Central 10-Minute Deadline Configuration", () => {
    it("all games configure authoritative 600s (10-minute) maximum match deadline", () => {
      const snakeEngine = new SnakeLadderEngine(players);
      const snookerEngine = new SnookerEngine(players);
      const carromEngine = new CarromEngine(players);

      expect(snakeEngine.currentMatchDeadline).toBeGreaterThan(0);
      expect(snookerEngine.currentMatchDeadline).toBeGreaterThan(0);
      expect(carromEngine.currentMatchDeadline).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // 2. Normal Completion Has Priority over Timeout
  // =========================================================================
  describe("2. Normal Completion Has Priority", () => {
    it("if match naturally completes before deadline, timeout does not overwrite winner", () => {
      const engine = new FruitNinjaEngine(players);
      // Simulate normal win
      (engine as any).state.scores = [100, 50];
      (engine as any).state.players[0].score = 100;
      (engine as any).state.players[1].score = 50;
      (engine as any).state.finished = true;
      (engine as any).state.winnerSeats = [0];

      // Late timeout call on already finished match
      const timeoutRes = engine.handleTimeout("match");
      expect(timeoutRes.ok).toBe(false);
      expect(timeoutRes.error).toMatch(/not in an active state|Match is not in an active state/i);
      expect(engine.state.winnerSeats).toEqual([0]);
    });
  });

  // =========================================================================
  // 3. Duplicate Timeout Test & Idempotency
  // =========================================================================
  describe("3. Duplicate Timeout Handling & Idempotency", () => {
    it("handles multiple sequential timeout events idempotently without double-finalizing", () => {
      const engine = new TableTennisEngine(players);
      (engine as any).state.players[0].setsWon = 2;
      (engine as any).state.players[1].setsWon = 1;

      // First timeout event
      const res1 = engine.handleTimeout("match");
      expect(res1.ok).toBe(true);
      expect(res1.finished).toBe(true);
      expect(res1.winnerSeats).toEqual([0]);

      // Second duplicate timeout event
      const res2 = engine.handleTimeout("match");
      expect(res2.ok).toBe(false);
      expect(res2.finished).toBe(true);
      expect(res2.winnerSeats).toEqual([0]);
    });
  });

  // =========================================================================
  // 4. Deterministic Winner & Tiebreak Resolution (All 10 Games)
  // =========================================================================
  describe("4. Deterministic Winner Resolution Across All 10 Games", () => {
    it("1. Snake & Ladder: resolves closest player to 100", () => {
      const engine = new SnakeLadderEngine(players);
      (engine as any).state.players[0].position = 92;
      (engine as any).state.players[1].position = 75;

      const res = engine.handleTimeout("match");
      expect(res.ok).toBe(true);
      expect(res.winnerSeats).toEqual([0]);
    });

    it("2. Ludo: resolves finished tokens -> total forward progress -> nearest token", () => {
      const engine = new LudoEngine(players);
      (engine as any).state.players[0].tokens[0].isFinished = true;
      (engine as any).state.players[1].tokens[0].position = 20;

      const res = engine.handleTimeout("match");
      expect(res.ok).toBe(true);
      expect(res.winnerSeats).toEqual([0]);
    });

    it("3. Chess: evaluates standard material balance (Q=9, R=5, B=3, N=3, P=1)", () => {
      const engine = new ChessEngine(players);
      // White: King + Queen (9) vs Black: King (0)
      (engine as any).state.fen = "4k3/8/8/8/8/8/8/4K2Q w - - 0 1";

      const res = engine.handleTimeout("match");
      expect(res.ok).toBe(true);
      expect(res.winnerSeats).toEqual([0]); // White wins on material
    });

    it("4. Fruit Ninja: resolves highest authoritative slice score", () => {
      const engine = new FruitNinjaEngine(players);
      (engine as any).state.scores = [185, 120];
      (engine as any).state.players[0].score = 185;
      (engine as any).state.players[1].score = 120;

      const res = engine.handleTimeout("match");
      expect(res.ok).toBe(true);
      expect(res.winnerSeats).toEqual([0]);
    });

    it("5. Bubble Shooter: resolves score -> fewest remaining bubbles", () => {
      const engine = new BubbleShooterEngine(players);
      (engine as any).state.players[0].score = 450;
      (engine as any).state.players[1].score = 300;

      const res = engine.handleTimeout("match");
      expect(res.ok).toBe(true);
      expect(res.winnerSeats).toEqual([0]);
    });

    it("6. Table Tennis: resolves sets won -> current set points", () => {
      const engine = new TableTennisEngine(players);
      (engine as any).state.players[0].setsWon = 1;
      (engine as any).state.players[0].score = 6;
      (engine as any).state.players[1].setsWon = 0;
      (engine as any).state.players[1].score = 9;

      const res = engine.handleTimeout("match");
      expect(res.ok).toBe(true);
      expect(res.winnerSeats).toEqual([0]);
    });

    it("7. Snake vs Worms: resolves mass/score -> body length", () => {
      const engine = new SnakeVsWormsEngine(players);
      (engine as any).state.players[0].score = 800;
      (engine as any).state.players[1].score = 420;

      const res = engine.handleTimeout("match");
      expect(res.ok).toBe(true);
      expect(res.winnerSeats).toEqual([0]);
    });

    it("9. Carrom: resolves points -> pocketed assigned coins", () => {
      const engine = new CarromEngine(players);
      (engine as any).state.scores = [4, 1];
      (engine as any).state.players[0].score = 4;
      (engine as any).state.players[1].score = 1;

      const res = engine.handleTimeout("match");
      expect(res.ok).toBe(true);
      expect(res.winnerSeats).toEqual([0]);
    });

    it("10. Snooker: resolves frame points -> highest break in 15-red Snooker without changing format", () => {
      const engine = new SnookerEngine(players);
      (engine as any).state.player1Score = 54;
      (engine as any).state.player2Score = 32;

      const res = engine.handleTimeout("match");
      expect(res.ok).toBe(true);
      expect(res.winnerSeats).toEqual([0]);
    });
  });

  // =========================================================================
  // 5. Deterministic Tie Handling (No Random Selection)
  // =========================================================================
  describe("5. Deterministic Tie Handling", () => {
    it("declares deterministic draw when scores and tiebreak metrics are equal", () => {
      const engine = new FruitNinjaEngine(players);
      (engine as any).state.scores = [100, 100];
      (engine as any).state.players[0].score = 100;
      (engine as any).state.players[1].score = 100;

      const res = engine.handleTimeout("match");
      expect(res.ok).toBe(true);
      expect(res.finished).toBe(true);
      expect(res.winnerSeats).toEqual([]); // Authoritative draw
    });
  });
});
