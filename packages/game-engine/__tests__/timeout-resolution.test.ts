import { describe, it, expect } from "vitest";
import { SnakeLadderEngine } from "../src/snake-ladder/engine";
import { LudoEngine } from "../src/ludo/engine";
import { ChessEngine } from "../src/chess/engine";
import { FruitNinjaEngine } from "../src/fruit-ninja/engine";
import { BubbleShooterEngine } from "../src/bubble-shooter/engine";
import { TableTennisEngine } from "../src/table-tennis/engine";
import { SnakeVsWormsEngine } from "../src/snake-vs-worms/engine";
import { CarromEngine } from "../src/carrom/engine";
import { SnookerEngine } from "../src/snooker/engine";

describe("Global 10-Minute Match Timeout Winner Resolution Across All 10 Games", () => {
  const players = [
    { userId: "player-1", seat: 0 },
    { userId: "player-2", seat: 1 },
  ];

  it("1. Snake & Ladder: resolves winner by highest board cell position", () => {
    const engine = new SnakeLadderEngine(players);
    (engine as any).state.players[0].position = 45;
    (engine as any).state.players[1].position = 82;

    const res = engine.handleTimeout("match");
    expect(res.ok).toBe(true);
    expect(res.finished).toBe(true);
    expect(res.winnerSeats).toEqual([1]);
  });

  it("2. Ludo: resolves winner by (1) finished tokens, (2) total forward progress", () => {
    const engine = new LudoEngine(players);
    // Player 0 has 1 finished token, Player 1 has 0 finished tokens
    (engine as any).state.players[0].tokens[0].isFinished = true;
    (engine as any).state.players[1].tokens[0].position = 20;

    const res = engine.handleTimeout("match");
    expect(res.ok).toBe(true);
    expect(res.finished).toBe(true);
    expect(res.winnerSeats).toEqual([0]);
  });

  it("3. Chess: resolves winner by material balance on timeout", () => {
    const engine = new ChessEngine(players);
    // Standard starting position: equal material -> draw
    const res = engine.handleTimeout("match");
    expect(res.ok).toBe(true);
    expect(res.finished).toBe(true);
    expect(res.winnerSeats).toEqual([0, 1]);
  });

  it("4. Fruit Ninja: resolves winner by authoritative slice score", () => {
    const engine = new FruitNinjaEngine(players);
    (engine as any).state.scores = [150, 80];
    (engine as any).state.players[0].score = 150;
    (engine as any).state.players[1].score = 80;

    const res = engine.handleTimeout("match");
    expect(res.ok).toBe(true);
    expect(res.finished).toBe(true);
    expect(res.winnerSeats).toEqual([0]);
  });

  it("5. Bubble Shooter: resolves winner by score, then fewest bubbles", () => {
    const engine = new BubbleShooterEngine(players);
    (engine as any).state.players[0].score = 300;
    (engine as any).state.players[1].score = 250;

    const res = engine.handleTimeout("match");
    expect(res.ok).toBe(true);
    expect(res.finished).toBe(true);
    expect(res.winnerSeats).toEqual([0]);
  });

  it("6. Table Tennis: resolves winner by sets won, then current set points", () => {
    const engine = new TableTennisEngine(players);
    (engine as any).state.players[0].setsWon = 1;
    (engine as any).state.players[1].setsWon = 0;

    const res = engine.handleTimeout("match");
    expect(res.ok).toBe(true);
    expect(res.finished).toBe(true);
    expect(res.winnerSeats).toEqual([0]);
  });

  it("7. Snake vs Worms: resolves winner by mass/score, then length", () => {
    const engine = new SnakeVsWormsEngine(players);
    (engine as any).state.players[0].score = 450;
    (engine as any).state.players[1].score = 620;

    const res = engine.handleTimeout("match");
    expect(res.ok).toBe(true);
    expect(res.finished).toBe(true);
    expect(res.winnerSeats).toEqual([1]);
  });

  it("9. Carrom: resolves winner by score, then assigned pocketed coins", () => {
    const engine = new CarromEngine(players);
    (engine as any).state.players[0].score = 12;
    (engine as any).state.players[1].score = 7;

    const res = engine.handleTimeout("match");
    expect(res.ok).toBe(true);
    expect(res.finished).toBe(true);
    expect(res.winnerSeats).toEqual([0]);
  });

  it("10. Snooker: resolves winner by frame score, then highest match break", () => {
    const engine = new SnookerEngine(players);
    (engine as any).state.player1Score = 34;
    (engine as any).state.player2Score = 18;

    const res = engine.handleTimeout("match");
    expect(res.ok).toBe(true);
    expect(res.finished).toBe(true);
    expect(res.winnerSeats).toEqual([0]);
  });
});
