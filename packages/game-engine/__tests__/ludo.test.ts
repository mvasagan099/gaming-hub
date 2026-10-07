import { describe, expect, it } from "vitest";
import { LudoEngine } from "../src/ludo/engine";
import type { RandomSource } from "../src/types";

function mockRng(sequence: number[]): RandomSource {
  let idx = 0;
  return () => {
    const val = sequence[idx % sequence.length];
    idx++;
    return val;
  };
}

describe("LudoEngine", () => {
  const p0 = { userId: "user-1", seat: 0 };
  const p1 = { userId: "user-2", seat: 1 };

  it("initializes 2 players with green and blue tokens in yard", () => {
    const eng = new LudoEngine([p0, p1]);
    const state = eng.state;
    expect(state.phase).toBe("rolling");
    expect(state.currentSeat).toBe(0);
    expect(state.players).toHaveLength(2);
    expect(state.players[0].color).toBe("green");
    expect(state.players[1].color).toBe("blue");
    expect(state.players[0].tokens.every((t) => t.state === "yard")).toBe(true);
  });

  it("rejects action from player out of turn", () => {
    const eng = new LudoEngine([p0, p1]);
    const res = eng.apply({ type: "roll" }, 1);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/not your turn/i);
  });

  it("auto-enters yard token on a 6 when all yard choices lead to start tile", () => {
    // 0.99 -> roll = 6
    const rng = mockRng([0.99]);
    const eng = new LudoEngine([p0, p1], rng);
    const rollRes = eng.apply({ type: "roll" }, 0);
    expect(rollRes.ok).toBe(true);
    // Since all 4 yard tokens enter position 0, engine auto-enters first token and grants extra turn for 6
    expect(rollRes.state.phase).toBe("rolling");
    expect(rollRes.state.currentSeat).toBe(0);
    expect(rollRes.state.players[0].tokens[0].position).toBe(0);
    expect(rollRes.state.players[0].tokens[0].state).toBe("active");
  });

  it("triggers selection phase when multiple distinct move destinations exist", () => {
    const rng = mockRng([0.0]); // roll 1
    const eng = new LudoEngine([p0, p1], rng);

    // Place 2 green tokens at different active positions on the board
    (eng.state as any).players[0].tokens[0].state = "active";
    (eng.state as any).players[0].tokens[0].position = 2;
    (eng.state as any).players[0].tokens[1].state = "active";
    (eng.state as any).players[0].tokens[1].position = 10;

    const rollRes = eng.apply({ type: "roll" }, 0);
    expect(rollRes.ok).toBe(true);
    expect(rollRes.state.dice).toBe(1);
    expect(rollRes.state.phase).toBe("selecting");
    expect(rollRes.state.legalMoves).toHaveLength(2); // green-0 to 3, green-1 to 11

    // Move token green-1 to position 11
    const moveRes = eng.apply({ type: "move", tokenId: "green-1" }, 0);
    expect(moveRes.ok).toBe(true);
    expect(moveRes.state.players[0].tokens[1].position).toBe(11);
  });

  it("passes turn when rolling a non-6 with all tokens in yard", () => {
    // 0.1 -> roll = 1
    const rng = mockRng([0.1]);
    const eng = new LudoEngine([p0, p1], rng);
    const rollRes = eng.apply({ type: "roll" }, 0);
    expect(rollRes.ok).toBe(true);
    expect(rollRes.state.dice).toBe(1);
    expect(rollRes.state.currentSeat).toBe(1); // turn passed to player 2
  });

  it("auto-executes single legal move and declares winner when 4 tokens finish", () => {
    // 0.0 -> roll = 1
    const rng = mockRng([0.0]);
    const eng = new LudoEngine([p0, p1], rng);
    // Mark 3 tokens finished and 1 token at position 56 (1 step before finished 57)
    const p0Tokens = (eng.state as any).players[0].tokens;
    p0Tokens[1].state = "finished";
    p0Tokens[1].position = 57;
    p0Tokens[2].state = "finished";
    p0Tokens[2].position = 57;
    p0Tokens[3].state = "finished";
    p0Tokens[3].position = 57;
    p0Tokens[0].state = "active";
    p0Tokens[0].position = 56;

    // Single legal move auto-executes on roll
    const rollRes = eng.apply({ type: "roll" }, 0);
    expect(rollRes.ok).toBe(true);
    expect(rollRes.finished).toBe(true);
    expect(rollRes.winnerSeats).toEqual([0]);
  });
});
