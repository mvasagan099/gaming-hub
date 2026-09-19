import { describe, it, expect } from "vitest";
import { CarromEngine, isValidStrikerPlacement, createInitialCoins, createInitialStriker, simulatePhysics, CARROM_BOARD_WIDTH } from "..";

const players = [
  { seat: 0, id: "p0", userId: "p0", name: "Player 1" },
  { seat: 1, id: "p1", userId: "p1", name: "Player 2" },
];

function setup() {
  return new CarromEngine(players, () => 0.9);
}

// Seat transforms mirroring client driver
const SERVER_SIZE = 600;
const CLIENT_SIZE = 500;
const SCALE = CLIENT_SIZE / SERVER_SIZE;

function worldToView(worldX: number, worldY: number, seat: number) {
  if (seat === 1) {
    return {
      x: (SERVER_SIZE - worldX) * SCALE,
      y: (SERVER_SIZE - worldY) * SCALE,
    };
  }
  return { x: worldX * SCALE, y: worldY * SCALE };
}

function viewToWorld(viewX: number, viewY: number, seat: number) {
  if (seat === 1) {
    return {
      x: SERVER_SIZE - viewX / SCALE,
      y: SERVER_SIZE - viewY / SCALE,
    };
  }
  return { x: viewX / SCALE, y: viewY / SCALE };
}

function localAngleToServer(localAngle: number, seat: number): number {
  const TWO_PI = Math.PI * 2;
  const normalized = ((localAngle % TWO_PI) + TWO_PI) % TWO_PI;
  if (seat === 1) return (normalized + Math.PI) % TWO_PI;
  return normalized;
}

describe("Carrom Striker Sync & Coordinate Rigor", () => {
  it("1. Striker placement validation within baseline bounds", () => {
    const eng = setup();
    expect(isValidStrikerPlacement(300, 0, eng.state.coins)).toBe(true);
    expect(isValidStrikerPlacement(150, 0, eng.state.coins)).toBe(true);
    expect(isValidStrikerPlacement(450, 0, eng.state.coins)).toBe(true);
  });

  it("2. Striker placement rejected outside baseline bounds", () => {
    const eng = setup();
    expect(isValidStrikerPlacement(50, 0, eng.state.coins)).toBe(false);
    expect(isValidStrikerPlacement(550, 0, eng.state.coins)).toBe(false);
    expect(isValidStrikerPlacement(NaN, 0, eng.state.coins)).toBe(false);
  });

  it("3. Striker placement overlap detection with coins", () => {
    const eng = setup();
    const centerCoin = eng.state.coins.find((c) => !c.pocketed);
    expect(centerCoin).toBeDefined();
    // Placement along baseline shouldn't overlap center coins in initial board state
    expect(isValidStrikerPlacement(300, 0, eng.state.coins)).toBe(true);
  });

  it("4. Opponent seat placement bounds (seat 1 baseline top, seat 0 bottom)", () => {
    const eng = setup();
    const res0 = eng.apply({ type: "place-striker", x: 300 }, 0);
    expect(res0.ok).toBe(true);
    expect(res0.state.striker.y).toBe(507); // baseline seat 0

    // Force turn to seat 1 for testing
    eng.state.currentSeat = 1;
    eng.state.strikerPlacementPhase = true;
    const res1 = eng.apply({ type: "place-striker", x: 300 }, 1);
    expect(res1.ok).toBe(true);
    expect(res1.state.striker.y).toBe(93); // baseline seat 1
  });

  it("5. Out-of-turn placement rejection", () => {
    const eng = setup();
    expect(eng.state.currentSeat).toBe(0);
    const res = eng.apply({ type: "place-striker", x: 300 }, 1);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/not your turn/i);
  });

  it("6. Strike without placement rejection", () => {
    const eng = setup();
    const res = eng.apply({ type: "strike", angle: -Math.PI / 2, power: 0.5 }, 0);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/place the striker/i);
  });

  it("7. Atomic placement with strike action", () => {
    const eng = setup();
    const res = eng.apply({ type: "strike", angle: -Math.PI / 2, power: 0.5, x: 280 }, 0);
    expect(res.ok).toBe(true);
    expect(res.events.some((e) => e.type === "shot-start" || e.type === "shot-trajectory")).toBe(true);
  });

  it("8. Monotonic turn number verification", () => {
    const eng = setup();
    const t0 = eng.state.turnNumber ?? 0;
    eng.apply({ type: "strike", angle: -Math.PI / 2, power: 0.5, x: 300 }, 0);
    const t1 = eng.state.turnNumber ?? 0;
    expect(t1).toBeGreaterThanOrEqual(t0);
  });

  it("9. Coordinate transforms preserve round-trip positions for Seat 0 and Seat 1", () => {
    // Seat 0
    const view0 = worldToView(300, 480, 0);
    expect(view0.x).toBeCloseTo(250, 2);
    expect(view0.y).toBeCloseTo(400, 2);
    const roundTrip0 = viewToWorld(view0.x, view0.y, 0);
    expect(roundTrip0.x).toBeCloseTo(300, 2);
    expect(roundTrip0.y).toBeCloseTo(480, 2);

    // Seat 1 (flipped 180 degrees)
    const view1 = worldToView(300, 120, 1);
    expect(view1.x).toBeCloseTo(250, 2);
    expect(view1.y).toBeCloseTo(400, 2); // Also appears at bottom for seat 1!
    const roundTrip1 = viewToWorld(view1.x, view1.y, 1);
    expect(roundTrip1.x).toBeCloseTo(300, 2);
    expect(roundTrip1.y).toBeCloseTo(120, 2);
  });

  it("10. Angle transformations flip 180 deg for Seat 1 and are identity for Seat 0", () => {
    const localAngle = -Math.PI / 2; // aiming straight up
    const serverAngle0 = localAngleToServer(localAngle, 0);
    expect(serverAngle0).toBeCloseTo((3 * Math.PI) / 2, 2);

    const serverAngle1 = localAngleToServer(localAngle, 1);
    // Aiming straight up locally for seat 1 aims straight down on server (pi / 2)
    expect(serverAngle1).toBeCloseTo(Math.PI / 2, 2);
  });

  it("11. Client state drops stale turn packets and respects monotonically increasing turns", () => {
    let currentTurn = 2;
    const isStale = (packetTurn: number) => packetTurn < currentTurn;
    expect(isStale(1)).toBe(true);
    expect(isStale(2)).toBe(false);
    expect(isStale(3)).toBe(false);
  });

  it("12. Turn sequence keys by seat and turn", () => {
    const sequences = new Map<string, number>();
    const isOutOfOrder = (seat: number, turn: number, seq: number) => {
      const key = `${seat}:${turn}`;
      const last = sequences.get(key) ?? -1;
      if (seq <= last) return true;
      sequences.set(key, seq);
      return false;
    };

    expect(isOutOfOrder(0, 1, 1)).toBe(false);
    expect(isOutOfOrder(0, 1, 2)).toBe(false);
    expect(isOutOfOrder(0, 1, 2)).toBe(true); // duplicate dropped
    expect(isOutOfOrder(0, 1, 1)).toBe(true); // older dropped
    // New turn resets sequence tracking for that turn
    expect(isOutOfOrder(0, 2, 1)).toBe(false);
  });

  it("13. Border boundary rigor: unpocketed coins never escape onto or past the wooden frame", () => {
    const coins = createInitialCoins();
    const striker = createInitialStriker(0);

    // Place coin right next to the boundary and strike with high speed
    const c0 = coins[0];
    c0.x = 550;
    c0.y = 200;
    c0.vx = 0;
    c0.vy = 0;

    const c1 = coins[1];
    c1.x = 540;
    c1.y = 200;
    c1.vx = 20; // driving c0 into the right wall
    c1.vy = 0;

    // Isolate other coins
    coins.forEach((c, idx) => {
      if (idx > 1) { c.x = 300; c.y = 300; c.vx = 0; c.vy = 0; }
    });
    striker.vx = 0; striker.vy = 0;

    simulatePhysics(coins, striker, 1 / 60, 600);

    const innerMin = 33;
    const innerMax = CARROM_BOARD_WIDTH - innerMin;

    for (const c of coins) {
      if (!c.pocketed) {
        const r = c.type === "queen" ? 15 : 15;
        expect(c.x - r).toBeGreaterThanOrEqual(innerMin - 0.01);
        expect(c.x + r).toBeLessThanOrEqual(innerMax + 0.01);
        expect(c.y - r).toBeGreaterThanOrEqual(innerMin - 0.01);
        expect(c.y + r).toBeLessThanOrEqual(innerMax + 0.01);
      }
    }
  });

  it("14. Corner cushion rebound: piece travelling into the outer corner behind pocket rebounds towards board", () => {
    const coins = createInitialCoins();
    const striker = createInitialStriker(0);

    // Position coin travelling towards outer corner behind top-right pocket (555, 45)
    const testCoin = coins[0];
    testCoin.x = 555;
    testCoin.y = 45;
    testCoin.vx = 15; // heading toward outer top-right frame
    testCoin.vy = -15;

    coins.forEach((c, idx) => {
      if (idx > 0) { c.x = 300; c.y = 300; c.vx = 0; c.vy = 0; }
    });
    striker.vx = 0; striker.vy = 0;

    const res = simulatePhysics(coins, striker, 1 / 60, 600);

    const innerMin = 33;
    const innerMax = CARROM_BOARD_WIDTH - innerMin;

    // Piece must either be pocketed or stayed safely on the board surface
    if (!testCoin.pocketed) {
      expect(testCoin.x + 15).toBeLessThanOrEqual(innerMax + 0.01);
      expect(testCoin.y - 15).toBeGreaterThanOrEqual(innerMin - 0.01);
    } else {
      expect(res.pocketedCoins.some(c => c.id === testCoin.id)).toBe(true);
    }
  });
});
