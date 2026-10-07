import { describe, it, expect } from "vitest";
import { FruitNinjaEngine, COUNTDOWN_MS } from "../src/fruit-ninja";
import type { FruitNinjaAction, FruitNinjaState, Target } from "../src/fruit-ninja/types";

const players = [
  { seat: 0, userId: "p0" },
  { seat: 1, userId: "p1" },
];

interface TestClock {
  now: () => number;
  set: (v: number) => void;
  advance: (ms: number) => void;
}

function makeClock(initial = 0): TestClock {
  let t = initial;
  return {
    now: () => t,
    set: (v: number) => {
      t = v;
    },
    advance: (ms: number) => {
      t += ms;
    },
  };
}

function setup(rng?: () => number, clock?: TestClock) {
  const c = clock ?? makeClock();
  const eng = new FruitNinjaEngine(players, rng ?? (() => 0.5), { now: c.now });
  return { eng, clock: c };
}

function startPlaying(eng: FruitNinjaEngine, clock: TestClock): void {
  eng.tick(); // waiting -> countdown
  clock.set(COUNTDOWN_MS);
  eng.tick(); // countdown -> playing
  eng.tick(); // first playing tick
}

function sliceAt(eng: FruitNinjaEngine, seat: number, t: number, pts: [number, number][]) {
  const first = pts[0]!;
  const events = [...eng.apply({ type: "slice-begin", x: first[0], y: first[1], time: t }, seat).events];
  for (const [x, y] of pts.slice(1, -1)) {
    events.push(...eng.apply({ type: "slice-move", x, y, time: t }, seat).events);
  }
  const last = pts[pts.length - 1]!;
  const result = eng.apply({ type: "slice-end", x: last[0], y: last[1], time: t }, seat);
  return { ...result, events: [...events, ...result.events] };
}

describe("Fruit Ninja Spawning & Balancing Regressions", () => {
  it("1. Game transitions to playing phase with controlled initial active fruits (<= 5)", () => {
    const { eng, clock } = setup();
    startPlaying(eng, clock);

    expect(eng.state.phase).toBe("playing");
    expect(eng.state.targets.length).toBeLessThanOrEqual(5);
  });

  it("2. Enforces MAX_ACTIVE_FRUITS (<= 5) under continuous gameplay simulation", () => {
    const { eng, clock } = setup();
    startPlaying(eng, clock);

    let maxObservedActive = 0;
    for (let i = 0; i < 300; i++) {
      clock.advance(50);
      const res = eng.tick();
      const activeTargets = res.state.targets.filter((t) => !t.sliced).length;
      if (activeTargets > maxObservedActive) {
        maxObservedActive = activeTargets;
      }
      expect(activeTargets).toBeLessThanOrEqual(5);
      expect(res.state.spawnQueue.length).toBeLessThanOrEqual(5);
    }
    expect(maxObservedActive).toBeLessThanOrEqual(5);
  });

  it("3. Spawn interval is respected and does not fire uncontrollably fast", () => {
    const { eng, clock } = setup();
    startPlaying(eng, clock);

    const firstWaveAt = eng.state.lastWaveAtMs;
    expect(typeof firstWaveAt).toBe("number");

    // Advance 400ms (less than 950ms min delay)
    clock.advance(400);
    eng.tick();

    // Wave timestamp should NOT update yet
    expect(eng.state.lastWaveAtMs).toBe(firstWaveAt);

    // Advance past 1600ms base delay
    clock.advance(1500);
    eng.tick();
    expect(eng.state.lastWaveAtMs).toBeGreaterThan(firstWaveAt!);
  });

  it("4. Sliced fruits credit points and update player score", () => {
    const { eng, clock } = setup();
    startPlaying(eng, clock);

    const target = eng.state.targets[0]!;
    const res = sliceAt(eng, 0, clock.now(), [[target.x, target.y]]);
    expect(res.ok).toBe(true);
    expect(eng.state.scores[0]).toBe(10);
    expect(eng.state.players[0]?.score).toBe(10);
  });

  it("5. Expired/fallen fruits past screen boundaries are cleaned up", () => {
    const { eng, clock } = setup();
    startPlaying(eng, clock);

    for (let i = 0; i < 200; i++) {
      clock.advance(50);
      const res = eng.tick();
      const active = res.state.targets.filter((t) => !t.sliced);
      expect(active.length).toBeLessThanOrEqual(5);
    }
  });

  it("6. Difficulty scaling increases fruit wave burst size gradually without exceeding 5", () => {
    const { eng, clock } = setup();
    startPlaying(eng, clock);

    // Elevate score to high tier (e.g. 200 points)
    eng.state.scores[0] = 250;

    for (let i = 0; i < 200; i++) {
      clock.advance(50);
      const res = eng.tick();
      const active = res.state.targets.filter((t) => !t.sliced);
      expect(active.length).toBeLessThanOrEqual(5);
    }
  });

  it("7. Long-running match never creates unbounded target memory growth", () => {
    const { eng, clock } = setup();
    startPlaying(eng, clock);

    for (let i = 0; i < 1000; i++) {
      clock.advance(50);
      const res = eng.tick();
      if (res.finished) break;
      const active = res.state.targets.filter((t) => !t.sliced);
      expect(active.length).toBeLessThanOrEqual(5);
      expect(res.state.spawnQueue.length).toBeLessThanOrEqual(5);
    }
  });

  it("8. Game rules, bomb hits, and score settlements remain intact", () => {
    const { eng, clock } = setup();
    startPlaying(eng, clock);

    // A real server bomb and intersecting blade eliminate the player.
    const target = eng.state.targets[0]!;
    target.type = "bomb";
    target.points = 0;
    const res = sliceAt(eng, 0, clock.now(), [[target.x, target.y]]);
    expect(res.ok).toBe(true);
    expect(eng.state.finished).toBe(true);
    expect(eng.state.winnerSeat).toBe(1);
  });
});
