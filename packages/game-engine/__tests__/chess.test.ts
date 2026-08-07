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
});
