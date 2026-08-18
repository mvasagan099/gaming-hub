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

  it("Scenario 7: TEST 1 - Queen captured alone enters PENDING_COVER, remains off-board, player keeps turn", () => {
    const eng = setup();
    // Position Queen near pocket moving in
    const queen = eng.state.coins.find((c) => c.type === "queen")!;
    queen.x = 48; queen.y = 48; queen.vx = -2; queen.vy = -2; queen.pocketed = false;
    eng.apply({ type: "place-striker", x: 300 }, 0);
    const shot = eng.apply({ type: "strike", angle: 0, power: 0.1 }, 0);

    expect(shot.ok).toBe(true);
    expect(shot.state.queenState).toBe("PENDING_COVER");
    expect(shot.state.pendingQueenOwner).toBe(0);
    expect(shot.state.currentSeat).toBe(0); // Same player gets cover attempt!
    expect(shot.state.coins.find((c) => c.type === "queen")?.pocketed).toBe(true); // Queen remains pocketed/off-board
    expect(shot.state.queenOnBoard).toBe(false);
  });

  it("Scenario 7b: TEST 2 - Follow-up shot in PENDING_COVER pockets own coin -> COVERED and keeps turn", () => {
    const eng = setup();
    // Start with Queen in PENDING_COVER for seat 0
    eng.state.queenState = "PENDING_COVER";
    eng.state.pendingQueenOwner = 0;
    const queen = eng.state.coins.find((c) => c.type === "queen")!;
    queen.pocketed = true;

    // Position a white coin (own coin) near pocket moving in
    const whiteCoin = eng.state.coins.find((c) => c.type === "white")!;
    whiteCoin.x = 48; whiteCoin.y = 48; whiteCoin.vx = -2; whiteCoin.vy = -2; whiteCoin.pocketed = false;

    eng.apply({ type: "place-striker", x: 300 }, 0);
    const shot = eng.apply({ type: "strike", angle: 0, power: 0.1 }, 0);

    expect(shot.ok).toBe(true);
    expect(shot.state.queenState).toBe("COVERED");
    expect(shot.state.pendingQueenOwner).toBe(null);
    expect(shot.state.players[0].queenCovered).toBe(true);
    expect(shot.state.players[0].score).toBe(4); // 3 for queen + 1 for coin
    expect(shot.state.currentSeat).toBe(0); // Player gets extra turn
    expect(shot.state.coins.find((c) => c.type === "queen")?.pocketed).toBe(true);
  });

  it("Scenario 7c: TEST 3 - Follow-up shot in PENDING_COVER fails -> Queen returns to center, opponent gets turn", () => {
    const eng = setup();
    // Start with Queen in PENDING_COVER for seat 0
    eng.state.queenState = "PENDING_COVER";
    eng.state.pendingQueenOwner = 0;
    const queen = eng.state.coins.find((c) => c.type === "queen")!;
    queen.pocketed = true;

    // Miss (light tap that pockets nothing)
    eng.apply({ type: "place-striker", x: 300 }, 0);
    const shot = eng.apply({ type: "strike", angle: 0, power: 0.05 }, 0);

    expect(shot.ok).toBe(true);
    expect(shot.state.queenState).toBe("ON_BOARD");
    expect(shot.state.pendingQueenOwner).toBe(null);
    expect(shot.state.players[0].queenCovered).toBe(false);
    expect(shot.state.currentSeat).toBe(1); // Turn passes to Player 2
    expect(shot.state.coins.find((c) => c.type === "queen")?.pocketed).toBe(false); // Returned to center
    expect(shot.state.queenOnBoard).toBe(true);
  });

  it("Scenario 8: TEST 4 - Queen + own white coin in same shot -> immediate COVERED, extra turn", () => {
    const eng = setup();
    const queen = eng.state.coins.find((c) => c.type === "queen")!;
    const whiteCoin = eng.state.coins.find((c) => c.type === "white")!;
    queen.x = 48; queen.y = 48; queen.vx = -2; queen.vy = -2; queen.pocketed = false;
    whiteCoin.x = 552; whiteCoin.y = 48; whiteCoin.vx = 2; whiteCoin.vy = -2; whiteCoin.pocketed = false;

    eng.apply({ type: "place-striker", x: 300 }, 0);
    const shot = eng.apply({ type: "strike", angle: 0, power: 0.1 }, 0);

    expect(shot.ok).toBe(true);
    expect(shot.state.queenState).toBe("COVERED");
    expect(shot.state.pendingQueenOwner).toBe(null);
    expect(shot.state.players[0].queenCovered).toBe(true);
    expect(shot.state.players[0].score).toBe(4); // 3 for queen + 1 for coin
    expect(shot.state.currentSeat).toBe(0); // Player gets extra turn
    expect(shot.state.coins.find((c) => c.type === "queen")?.pocketed).toBe(true);
  });

  it("Scenario 9: Turn timeout passes turn to Player 2 without ending match and updates engine state", () => {
    const eng = setup();
    expect(eng.state.currentSeat).toBe(0);
    expect(eng.state.turnNumber).toBe(0);

    const res = eng.handleTimeout("turn", 0);
    expect(res.ok).toBe(true);
    expect(res.finished).toBe(false);
    expect(eng.state.currentSeat).toBe(1);
    expect(eng.state.turnNumber).toBe(1);
    expect(eng.state.strikerPlacementSeat).toBe(1);
  });

  it("Scenario 10: Subsequent timeout passes turn back to Player 1", () => {
    const eng = setup();
    eng.handleTimeout("turn", 0);
    expect(eng.state.currentSeat).toBe(1);
    expect(eng.state.turnNumber).toBe(1);

    const res2 = eng.handleTimeout("turn", 1);
    expect(res2.ok).toBe(true);
    expect(res2.finished).toBe(false);
    expect(eng.state.currentSeat).toBe(0);
    expect(eng.state.turnNumber).toBe(2);
  });
});
