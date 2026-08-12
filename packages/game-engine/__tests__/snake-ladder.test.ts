import { describe, expect, it } from "vitest";
import { SnakeLadderEngine } from "../src/snake-ladder/engine";
import type { RandomSource } from "../src/types";

function mockRng(sequence: number[]): RandomSource {
  let idx = 0;
  return () => {
    const val = sequence[idx % sequence.length];
    idx++;
    return val;
  };
}

describe("SnakeLadderEngine", () => {
  const p0 = { userId: "user-1", seat: 0 };
  const p1 = { userId: "user-2", seat: 1 };

  it("initializes with players at tile 1 and waiting-for-roll phase", () => {
    const eng = new SnakeLadderEngine([p0, p1]);
    const state = eng.state;
    expect(state.phase).toBe("waiting-for-roll");
    expect(state.currentSeat).toBe(0);
    expect(state.players).toHaveLength(2);
    expect(state.players[0].position).toBe(1);
    expect(state.players[1].position).toBe(1);
    expect(state.finished).toBe(false);
  });

  it("rejects roll from player whose turn it is not", () => {
    const eng = new SnakeLadderEngine([p0, p1]);
    const res = eng.apply({ type: "roll" }, 1);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/not your turn/i);
  });

  it("advances player token on a normal dice roll", () => {
    // 0.5 -> roll = Math.floor(0.5 * 6) + 1 = 4
    const rng = mockRng([0.5]);
    const eng = new SnakeLadderEngine([p0, p1], rng);
    const res = eng.apply({ type: "roll" }, 0);
    expect(res.ok).toBe(true);
    // tile 1 + 4 = 5 (tile 4 is a ladder, tile 5 is normal)
    expect(res.state.players[0].position).toBe(5);
    expect(res.state.currentSeat).toBe(1); // turn switched
  });

  it("climbs a ladder when landing on a ladder base", () => {
    // 0.49 -> roll = 3. Tile 1 + 3 = 4 -> Ladder 4 leads to 14
    const rng = mockRng([0.49]);
    const eng = new SnakeLadderEngine([p0, p1], rng);
    const res = eng.apply({ type: "roll" }, 0);
    expect(res.ok).toBe(true);
    expect(res.state.players[0].position).toBe(14);
    expect(res.events.some((e) => e.type === "ladder")).toBe(true);
  });

  it("grants extra turn on rolling a 6", () => {
    // 0.99 -> roll = 6
    const rng = mockRng([0.99]);
    const eng = new SnakeLadderEngine([p0, p1], rng);
    const res = eng.apply({ type: "roll" }, 0);
    expect(res.ok).toBe(true);
    expect(res.state.currentSeat).toBe(0); // extra turn granted
    expect(res.state.extraTurn).toBe(true);
  });

  it("declares winner when a player reaches tile 100", () => {
    const rng = mockRng([0.99]);
    const eng = new SnakeLadderEngine([p0, p1], rng);
    // Teleport p0 to tile 94
    (eng.state as any).players[0].position = 94;
    // Roll 6 -> 94 + 6 = 100
    const res = eng.apply({ type: "roll" }, 0);
    expect(res.ok).toBe(true);
    expect(res.finished).toBe(true);
    expect(res.winnerSeats).toEqual([0]);
    expect(res.state.players[0].position).toBe(100);
    expect(res.state.players[0].finished).toBe(true);
  });
});
