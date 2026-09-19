import { describe, it, expect } from "vitest";
import { CricketEngine } from "../src/cricket/engine";

describe("Cricket Batter Movement Across Crease", () => {
  const players = [
    { id: "p0", seat: 0, name: "Alice" },
    { id: "p1", seat: 1, name: "Bob" },
  ];

  function setupMatchToBattingTurn() {
    const eng = new CricketEngine(players, () => 0.5, { matchType: "1-over" });
    // p0 wins toss and chooses to bat -> p0 is batsman (seat 0), p1 is bowler (seat 1)
    eng.apply({ type: "toss-call", call: eng.state.tossResult! }, 0);
    eng.apply({ type: "toss-choice", choice: "bat" }, 0);
    return eng;
  }

  it("initializes state with batterCreaseX = 0 and movementLocked = false", () => {
    const eng = setupMatchToBattingTurn();
    expect(eng.state.batterCreaseX).toBe(0);
    expect(eng.state.movementLocked).toBe(false);
  });

  it("rejects move-batter from bowler with NOT_YOUR_TURN", () => {
    const eng = setupMatchToBattingTurn();
    // Bowler is seat 1, batsman is seat 0
    const res = eng.apply({ type: "move-batter", x: 0.3 }, 1);
    expect(res.ok).toBe(false);
    expect(res.error).toBe("NOT_YOUR_TURN");
    expect(eng.state.batterCreaseX).toBe(0);
  });

  it("allows batsman to move and updates batterCreaseX within bounds", () => {
    const eng = setupMatchToBattingTurn();
    const res = eng.apply({ type: "move-batter", x: 0.25 }, 0);
    expect(res.ok).toBe(true);
    expect(eng.state.batterCreaseX).toBeCloseTo(0.25);
    expect(res.events.some((e: any) => e.type === "batter-moved" && e.x === 0.25)).toBe(true);
  });

  it("clamps excessive coordinates to [-0.75, +0.75]", () => {
    const eng = setupMatchToBattingTurn();
    // Move to extreme right
    const resRight = eng.apply({ type: "move-batter", x: 1.5 }, 0);
    expect(resRight.ok).toBe(true);
    expect(eng.state.batterCreaseX).toBe(0.75);

    // Reset or move to extreme left
    const eng2 = setupMatchToBattingTurn();
    const resLeft = eng2.apply({ type: "move-batter", x: -2.0 }, 0);
    expect(resLeft.ok).toBe(true);
    expect(eng2.state.batterCreaseX).toBe(-0.75);
  });

  it("locks batter movement when lock-batter-movement is called", () => {
    const eng = setupMatchToBattingTurn();
    eng.apply({ type: "move-batter", x: 0.4 }, 0);
    expect(eng.state.batterCreaseX).toBeCloseTo(0.4);

    const lockRes = eng.apply({ type: "lock-batter-movement" }, 0);
    expect(lockRes.ok).toBe(true);
    expect(eng.state.movementLocked).toBe(true);
    expect(lockRes.events.some((e: any) => e.type === "movement-locked")).toBe(true);

    // Any further move-batter action must be rejected
    const nextMove = eng.apply({ type: "move-batter", x: -0.2 }, 0);
    expect(nextMove.ok).toBe(false);
    expect(nextMove.error).toBe("MOVEMENT_LOCKED");
    // Crease position remains at 0.4
    expect(eng.state.batterCreaseX).toBeCloseTo(0.4);
  });

  it("resets batterCreaseX and movementLocked upon delivery completion", () => {
    const eng = setupMatchToBattingTurn();
    // Bowler sets pitch target, locks target, bowls
    eng.apply({ type: "set-pitch-target", lateral: 0, length: 0.45 }, 1);
    eng.apply({ type: "lock-pitch-target" }, 1);
    const bowlRes = eng.apply({ type: "bowl", delivery: "fast", pitchTargetId: eng.state.pitchTarget!.targetId }, 1);
    expect(bowlRes.ok).toBe(true);
    // Batter moves
    eng.apply({ type: "move-batter", x: -0.3 }, 0);
    expect(eng.state.batterCreaseX).toBeCloseTo(-0.3);

    // Lock movement
    eng.apply({ type: "lock-batter-movement" }, 0);
    expect(eng.state.movementLocked).toBe(true);

    // Batsman hits shot
    eng.apply({
      type: "bat",
      shot: "straight",
      timing: "good",
      deliveryId: eng.state.activeDeliveryId!,
    }, 0);

    // After delivery completes, state resets for next delivery
    expect(eng.state.batterCreaseX).toBe(0);
    expect(eng.state.movementLocked).toBe(false);
  });
});
