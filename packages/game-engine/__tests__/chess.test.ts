import { describe, it, expect } from "vitest";
import { ChessEngine } from "../src/chess/engine";

describe("ChessEngine", () => {
  const players = [
    { seat: 0, userId: "p0", id: "p0", name: "White Player" },
    { seat: 1, userId: "p1", id: "p1", name: "Black Player" },
  ];

  it("handles valid moves and piece captures", () => {
    const engine = new ChessEngine(players);
    expect(engine.state.turn).toBe("w");
    expect(engine.state.currentSeat).toBe(0);

    // White moves e2 -> e4
    const r1 = engine.apply({ type: "move", from: "e2", to: "e4" }, 0);
    expect(r1.ok).toBe(true);
    expect(engine.state.turn).toBe("b");
    expect(engine.state.currentSeat).toBe(1);

    // Black moves d7 -> d5
    const r2 = engine.apply({ type: "move", from: "d7", to: "d5" }, 1);
    expect(r2.ok).toBe(true);
    expect(engine.state.turn).toBe("w");

    // White captures e4 -> d5
    const r3 = engine.apply({ type: "move", from: "e4", to: "d5" }, 0);
    expect(r3.ok).toBe(true);
    expect(r3.events[0]?.type).toBe("move");
    expect((r3.events[0] as any).isCapture).toBe(true);
    expect(engine.state.turn).toBe("b");
  });

  it("rejects out of turn moves", () => {
    const engine = new ChessEngine(players);
    // Black tries to move first
    const r1 = engine.apply({ type: "move", from: "e7", to: "e5" }, 1);
    expect(r1.ok).toBe(false);
    expect(r1.error).toBe("It is not your turn");
  });

  it("rejects illegal moves", () => {
    const engine = new ChessEngine(players);
    // White tries illegal move e2 -> e5 (over 2 squares)
    const r1 = engine.apply({ type: "move", from: "e2", to: "e5" }, 0);
    expect(r1.ok).toBe(false);
    expect(r1.error).toBe("Illegal move");
  });

  it("starts a 10-minutes match with seeded clocks and a live deadline", () => {
    let now = 5_000_000;
    const engine = new ChessEngine(players, undefined, {
      timeControl: { baseSeconds: 600, incrementSeconds: 0, delaySeconds: 0 },
      now: () => now,
    });

    expect(engine.state.timeControl).toEqual({ baseSeconds: 600, incrementSeconds: 0, delaySeconds: 0 });
    expect(engine.state.clocks).toEqual({
      0: { remainingMs: 600_000, startedAtMs: 5_000_000 },
      1: { remainingMs: 600_000, startedAtMs: null },
    });
    expect(engine.currentClockDeadline).toBe(5_600_000);

    // A move finalizes white's clock and starts black's.
    now += 2_000;
    const result = engine.apply({ type: "move", from: "e2", to: "e4" }, 0);
    expect(result.ok).toBe(true);

    const clocks = engine.state.clocks!;
    expect(clocks[0].remainingMs).toBe(598_000);
    expect(clocks[0].startedAtMs).toBeNull();
    expect(clocks[1].startedAtMs).toBe(5_002_000);
    expect(engine.currentClockDeadline).toBe(5_602_000);
  });

  it("checkmate mode has no clock", () => {
    const engine = new ChessEngine(players, undefined, {
      timeControl: { baseSeconds: 0, incrementSeconds: 0, delaySeconds: 0 },
    });

    expect(engine.state.timeControl).toBeNull();
    expect(engine.state.clocks).toBeNull();
    expect(engine.currentClockDeadline).toBeNull();
  });

  it("flags the current player when their clock hits zero", () => {
    let now = 1_000_000;
    const engine = new ChessEngine(players, undefined, {
      timeControl: { baseSeconds: 1, incrementSeconds: 0, delaySeconds: 0 },
      now: () => now,
    });

    const deadline = engine.currentClockDeadline!;
    expect(deadline).toBe(1_001_000);

    now = deadline + 1;
    const result = engine.handleTimeout("turn", engine.currentSeat);
    expect(result.ok).toBe(true);
    expect(result.finished).toBe(true);
    expect(result.state.endReason).toBe("flag");
    expect(result.state.result).toBe("0-1");
    expect(result.state.winnerSeats).toEqual([1]);
  });

  it("flags on move when the clock has already run out", () => {
    let now = 10_000_000;
    const engine = new ChessEngine(players, undefined, {
      timeControl: { baseSeconds: 1, incrementSeconds: 0, delaySeconds: 0 },
      now: () => now,
    });

    // Touch the state so the clock is seeded before time advances.
    engine.state;

    now += 2_000;
    const result = engine.apply({ type: "move", from: "e2", to: "e4" }, 0);
    expect(result.ok).toBe(true);
    expect(result.finished).toBe(true);
    expect(result.state.endReason).toBe("flag");
    expect(result.state.winnerSeats).toEqual([1]);
  });

  it("rejects stale or wrong-kind timeouts", () => {
    const engine = new ChessEngine(players, undefined, {
      timeControl: { baseSeconds: 600, incrementSeconds: 0, delaySeconds: 0 },
    });

    // Not the flagging seat's turn.
    expect(engine.handleTimeout("turn", 1).ok).toBe(false);
    // Chess has no match-level timer.
    expect(engine.handleTimeout("match").ok).toBe(false);
  });
});
