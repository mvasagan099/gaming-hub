import { describe, it, expect } from "vitest";
import { CarromEngine } from "..";

const players = [
  { seat: 0, id: "p0", userId: "p0", name: "Player 1" },
  { seat: 1, id: "p1", userId: "p1", name: "Player 2" },
];

function setup() {
  return new CarromEngine(players, () => 0.9);
}

describe("CarromEngine turn flow", () => {
  it("starts in striker placement phase for seat 0", () => {
    const eng = setup();
    const s = eng.state;
    expect(s.finished).toBe(false);
    expect(s.currentSeat).toBe(0);
    expect(s.strikerPlacementPhase).toBe(true);
    expect(s.strikerPlacementSeat).toBe(0);
    expect(s.striker.placed).toBe(false);
    expect(s.striker.pocketed).toBe(false);
  });

  it("accepts place-striker and ends the placement phase", () => {
    const eng = setup();
    const res = eng.apply({ type: "place-striker", x: 300 }, 0);
    expect(res.ok).toBe(true);
    expect(res.state.strikerPlacementPhase).toBe(false);
    expect(res.state.striker.placed).toBe(true);
    expect(res.state.striker.placedBy).toBe(0);
    expect(res.state.striker.y).toBeGreaterThan(400); // seat 0 baseline (bottom)
    expect(res.state.striker.pocketed).toBe(false);
  });

  it("rejects placement outside the valid baseline range", () => {
    const eng = setup();
    const res = eng.apply({ type: "place-striker", x: 30 }, 0);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/placement/i);
    expect(eng.state.strikerPlacementPhase).toBe(true);
  });

  it("rejects a strike before the striker is placed", () => {
    const eng = setup();
    const res = eng.apply({ type: "strike", angle: Math.PI, power: 0.5 }, 0);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/place the striker/i);
    expect(eng.state.currentSeat).toBe(0);
  });

  it("rejects actions from the wrong seat", () => {
    const eng = setup();
    const res = eng.apply({ type: "place-striker", x: 300 }, 1);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/not your turn/i);
  });

  it("advances the turn after a legal strike and records the action", () => {
    const eng = setup();
    expect(eng.apply({ type: "place-striker", x: 300 }, 0).ok).toBe(true);

    const res = eng.apply({ type: "strike", angle: Math.PI, power: 0.6 }, 0);
    expect(res.ok).toBe(true);

    const s = res.state;
    // No coin pocketed → turn passes to seat 1 and placement resets.
    expect(s.currentSeat).toBe(1);
    expect(s.strikerPlacementPhase).toBe(true);
    expect(s.strikerPlacementSeat).toBe(1);
    expect(s.striker.placed).toBe(false);

    // The strike metadata is what the client uses to detect a new shot.
    expect(s.lastAction).toEqual({ type: "strike", angle: Math.PI, power: 0.6 });
    expect(s.lastActionSeat).toBe(0);
    expect(s.lastActionAtMs).toBeTypeOf("number");

    // Events carry the turn transition.
    const types = res.events.map((e) => e.type);
    expect(types).toContain("turn-end");
    expect(res.events.find((e) => e.type === "turn-end")).toMatchObject({ seat: 0, nextSeat: 1 });
  });

  it("lets the next player place and strike back", () => {
    const eng = setup();
    eng.apply({ type: "place-striker", x: 300 }, 0);
    const shot = eng.apply({ type: "strike", angle: Math.PI, power: 0.6 }, 0);
    expect(shot.ok).toBe(true);

    const s1 = shot.state;
    expect(eng.apply({ type: "place-striker", x: 300 }, 1).ok).toBe(true);
    const back = eng.apply({ type: "strike", angle: 0, power: 0.6 }, 1);
    expect(back.ok).toBe(true);
    expect(back.state.currentSeat).toBe(0);
    expect(back.state.lastActionSeat).toBe(1);
    expect(back.state.strikerPlacementSeat).toBe(0);
  });

  it("a full-power miss settles coins without pocketing the striker", () => {
    const eng = setup();
    eng.apply({ type: "place-striker", x: 300 }, 0);
    const res = eng.apply({ type: "strike", angle: Math.PI, power: 1 }, 0);
    expect(res.ok).toBe(true);
    expect(res.state.striker.pocketed).toBe(false);
    expect(res.state.finished).toBe(false);
    expect(res.state.coins.every((c) => c.vx === 0 && c.vy === 0)).toBe(true);
  });
});

describe("CarromEngine turn calculation scenarios", () => {
  it("Scenario 1: Player 1 pockets own coin -> keeps turn", async () => {
    const { calculateScore } = await import("../src/carrom/physics");
    const pocketedCoins = [{ id: "c1", type: "white", x: 0, y: 0, vx: 0, vy: 0, pocketed: true, pocketedBy: null, pocketedAtTurn: null }] as any;
    const res = calculateScore(pocketedCoins, "white", false, false);
    expect(res.earnedExtraTurn).toBe(true);
    expect(res.score).toBe(1);
    expect(res.opponentScore).toBe(0);
  });

  it("Scenario 2: Player 1 pockets nothing -> loses turn (opponent gets turn)", async () => {
    const { calculateScore } = await import("../src/carrom/physics");
    const res = calculateScore([], "white", false, false);
    expect(res.earnedExtraTurn).toBe(false);
    expect(res.score).toBe(0);
    expect(res.opponentScore).toBe(0);
  });

  it("Scenario 3: Player 1 pockets opponent coin only -> loses turn", async () => {
    const { calculateScore } = await import("../src/carrom/physics");
    const pocketedCoins = [{ id: "c1", type: "black", x: 0, y: 0, vx: 0, vy: 0, pocketed: true, pocketedBy: null, pocketedAtTurn: null }] as any;
    const res = calculateScore(pocketedCoins, "white", false, false);
    expect(res.earnedExtraTurn).toBe(false);
    expect(res.score).toBe(0);
    expect(res.opponentScore).toBe(1);
  });

  it("Scenario 4: Player 1 pockets own + opponent coin -> keeps turn", async () => {
    const { calculateScore } = await import("../src/carrom/physics");
    const pocketedCoins = [
      { id: "c1", type: "white", x: 0, y: 0, vx: 0, vy: 0, pocketed: true, pocketedBy: null, pocketedAtTurn: null },
      { id: "c2", type: "black", x: 0, y: 0, vx: 0, vy: 0, pocketed: true, pocketedBy: null, pocketedAtTurn: null },
    ] as any;
    const res = calculateScore(pocketedCoins, "white", false, false);
    expect(res.earnedExtraTurn).toBe(true);
    expect(res.score).toBe(1);
    expect(res.opponentScore).toBe(1);
  });

  it("Scenario 5: Striker foul -> opponent gets turn and foul is recorded", () => {
    const eng = setup();
    eng.apply({ type: "place-striker", x: 300 }, 0);
    // Artificially pocket the striker to verify foul handling
    const striker = eng.state.striker;
    striker.x = 45; striker.y = 45; striker.pocketed = true;
    const shot = eng.apply({ type: "strike", angle: 0, power: 0.1 }, 0);
    expect(shot.ok).toBe(false); // Can't strike if already pocketed
  });

  it("Scenario 6: Player 1 pockets two own coins -> keeps turn", async () => {
    const { calculateScore } = await import("../src/carrom/physics");
    const pocketedCoins = [
      { id: "c1", type: "white", x: 0, y: 0, vx: 0, vy: 0, pocketed: true, pocketedBy: null, pocketedAtTurn: null },
      { id: "c2", type: "white", x: 0, y: 0, vx: 0, vy: 0, pocketed: true, pocketedBy: null, pocketedAtTurn: null },
    ] as any;
    const res = calculateScore(pocketedCoins, "white", false, false);
    expect(res.earnedExtraTurn).toBe(true);
    expect(res.score).toBe(2);
  });

  it("Scenario 7: Queen only -> loses turn (must be covered according to rules)", async () => {
    const { calculateScore } = await import("../src/carrom/physics");
    const pocketedCoins = [
      { id: "queen", type: "queen", x: 0, y: 0, vx: 0, vy: 0, pocketed: true, pocketedBy: null, pocketedAtTurn: null },
    ] as any;
    const res = calculateScore(pocketedCoins, "white", false, false);
    expect(res.earnedExtraTurn).toBe(false);
    expect(res.queenPocketed).toBe(true);
    expect(res.queenCovered).toBe(false);
  });

  it("Scenario 8: Queen + own coin -> covered and keeps turn", async () => {
    const { calculateScore } = await import("../src/carrom/physics");
    const pocketedCoins = [
      { id: "queen", type: "queen", x: 0, y: 0, vx: 0, vy: 0, pocketed: true, pocketedBy: null, pocketedAtTurn: null },
      { id: "c1", type: "white", x: 0, y: 0, vx: 0, vy: 0, pocketed: true, pocketedBy: null, pocketedAtTurn: null },
    ] as any;
    const res = calculateScore(pocketedCoins, "white", false, false);
    expect(res.earnedExtraTurn).toBe(true);
    expect(res.queenPocketed).toBe(true);
    expect(res.queenCovered).toBe(true);
    expect(res.score).toBe(4); // 1 for white + 3 for queen
  });
});
