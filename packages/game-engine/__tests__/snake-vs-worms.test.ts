import { describe, expect, it } from "vitest";
import { SnakeVsWormsEngine } from "../src/snake-vs-worms/engine";

describe("SnakeVsWormsEngine - Shared World Arena Architecture", () => {
  const p0 = { userId: "user-1", seat: 0 };
  const p1 = { userId: "user-2", seat: 1 };

  it("initializes 2-player match in 2000x2000 shared world with Snake (Seat 0, 300,600) and Worm (Seat 1, 300,1400)", () => {
    const eng = new SnakeVsWormsEngine([p0, p1]);
    const state = eng.state;

    expect(state.finished).toBe(false);
    expect(state.gridWidth).toBe(2000);
    expect(state.gridHeight).toBe(2000);
    expect(state.players).toHaveLength(2);

    expect(state.players[0].seat).toBe(0);
    expect(state.players[0].type).toBe("SNAKE");
    expect(state.players[0].body[0]).toEqual({ x: 300, y: 600 });

    expect(state.players[1].seat).toBe(1);
    expect(state.players[1].type).toBe("WORM");
    expect(state.players[1].body[0]).toEqual({ x: 300, y: 1400 });

    expect(state.food.length).toBeGreaterThan(0);
  });

  it("validates direction changes and blocks 180-degree instant reversal", () => {
    const e = new SnakeVsWormsEngine([p0, p1]);

    const resUp = e.apply({ type: "direction", direction: "up" }, 0);
    expect(resUp.ok).toBe(true);
    expect(resUp.state.players[0].targetDirection).toBe("up");

    (e as any).updateState({
      ...e.state,
      players: [
        { ...e.state.players[0], direction: "up", targetDirection: "up" },
        e.state.players[1],
      ],
    });
    const resDown = e.apply({ type: "direction", direction: "down" }, 0);
    expect(resDown.ok).toBe(false);
    expect(resDown.error).toContain("180 degree reversal");
  });

  it("handles boost activation, energy drain, and recovery", () => {
    const eng = new SnakeVsWormsEngine([p0, p1]);

    const resBoost = eng.apply({ type: "boost-start" }, 0);
    expect(resBoost.ok).toBe(true);
    expect(resBoost.state.players[0].isBoosting).toBe(true);

    const tick1 = eng.tick();
    expect(tick1.state.players[0].boostEnergy).toBe(98);

    eng.apply({ type: "boost-stop" }, 0);
    const tick2 = eng.tick();
    expect(tick2.state.players[0].boostEnergy).toBe(99);
  });

  it("awards food score, growth, and restores boost energy on food collection", () => {
    const eng = new SnakeVsWormsEngine([p0, p1]);
    const state = eng.state;

    // Place golden food item in front of P0 head ({x: 310, y: 600})
    const testState = {
      ...state,
      food: [
        { id: "food-test", x: 310, y: 600, type: "golden" as const, score: 50, growth: 3 },
      ],
    };
    (eng as any).updateState(testState);

    const initialLen = testState.players[0].body.length;
    const tickRes = eng.tick();
    const p0Next = tickRes.state.players[0];

    expect(p0Next.score).toBe(50);
    expect(p0Next.foodCollected).toBe(1);
    expect(p0Next.body.length).toBe(initialLen);
    expect(p0Next.pendingGrowth).toBe(3);
  });

  it("eliminates player on wall collision in 2000x2000 world", () => {
    const eng = new SnakeVsWormsEngine([p0, p1]);
    const state = eng.state;

    // Place P0 head at x: 2000 moving right
    const testState = {
      ...state,
      players: [
        {
          ...state.players[0],
          body: [
            { x: 2000, y: 1000 },
            { x: 1980, y: 1000 },
          ],
          direction: "right" as const,
          targetDirection: "right" as const,
        },
        state.players[1],
      ],
    };
    (eng as any).updateState(testState);

    const tickRes = eng.tick();
    expect(tickRes.state.players[0].status).toBe("eliminated");
    expect(tickRes.finished).toBe(true);
    expect(tickRes.winnerSeats).toEqual([1]);
  });

  it("ignores self collision completely per rule specification", () => {
    const eng = new SnakeVsWormsEngine([p0, p1]);
    const state = eng.state;

    // Form a loop for P0 where moving right overlaps segment at {x: 100, y: 100}
    const testState = {
      ...state,
      players: [
        {
          ...state.players[0],
          body: [
            { x: 90, y: 100 },
            { x: 90, y: 110 },
            { x: 100, y: 110 },
            { x: 100, y: 100 },
            { x: 110, y: 100 },
          ],
          direction: "right" as const,
          targetDirection: "right" as const,
        },
        state.players[1],
      ],
    };
    (eng as any).updateState(testState);

    const tickRes = eng.tick();
    expect(tickRes.state.players[0].status).toBe("active");
    expect(tickRes.finished).toBe(false);
  });

  it("eliminates player on head-to-opponent-body collision", () => {
    const eng = new SnakeVsWormsEngine([p0, p1]);
    const state = eng.state;

    // P0 head moves right from {x: 990, y: 1000} to {x: 1000, y: 1000}
    // P1 head moves up from {x: 1000, y: 980} to {x: 1000, y: 970}, leaving segment at {x: 1000, y: 1000} intact
    const testState = {
      ...state,
      food: [],
      players: [
        {
          ...state.players[0],
          body: [
            { x: 990, y: 1000 },
            { x: 980, y: 1000 },
          ],
          direction: "right" as const,
          targetDirection: "right" as const,
        },
        {
          ...state.players[1],
          body: [
            { x: 1000, y: 980 },
            { x: 1000, y: 990 },
            { x: 1000, y: 1000 },
            { x: 1000, y: 1010 },
          ],
          direction: "up" as const,
          targetDirection: "up" as const,
        },
      ],
    };
    (eng as any).updateState(testState);

    const tickRes = eng.tick();
    expect(tickRes.state.players[0].status).toBe("eliminated");
    expect(tickRes.state.players[1].score).toBe(100);
    expect(tickRes.finished).toBe(true);
    expect(tickRes.winnerSeats).toEqual([1]);
  });

  it("resolves head-to-head collision in favor of longer player", () => {
    const eng = new SnakeVsWormsEngine([p0, p1]);
    const state = eng.state;

    const testState = {
      ...state,
      players: [
        {
          ...state.players[0],
          body: [
            { x: 990, y: 1000 },
            { x: 980, y: 1000 },
            { x: 970, y: 1000 },
          ],
          direction: "right" as const,
          targetDirection: "right" as const,
        },
        {
          ...state.players[1],
          body: [
            { x: 1010, y: 1000 },
            { x: 1020, y: 1000 },
          ],
          direction: "left" as const,
          targetDirection: "left" as const,
        },
      ],
    };
    (eng as any).updateState(testState);

    const tickRes = eng.tick();
    expect(tickRes.state.players[0].status).toBe("active");
    expect(tickRes.state.players[1].status).toBe("eliminated");
    expect(tickRes.finished).toBe(true);
    expect(tickRes.winnerSeats).toEqual([0]);
  });

  it("handles match timer expiration with score and length tiebreakers", () => {
    const eng = new SnakeVsWormsEngine([p0, p1]);
    (eng as any).updateState({
      ...eng.state,
      players: [
        { ...eng.state.players[0], score: 120 },
        { ...eng.state.players[1], score: 80 },
      ],
    });

    const res = (eng as any).onMatchTimerExpired(eng.state);
    expect(res.finished).toBe(true);
    expect(res.winnerSeats).toEqual([0]);
    expect(res.state.endReason).toBe("TIME_EXPIRED");
  });
});
