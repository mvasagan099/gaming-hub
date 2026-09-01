import { describe, it, expect } from "vitest";
import { FruitNinjaEngine, COUNTDOWN_MS, MATCH_DURATION_MS, MAX_LIVES } from "..";
import type { FruitNinjaAction, FruitNinjaState, Target } from "..";

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

/** Deterministic RNG: consumes the given values, then repeats the last one. */
function rngOf(...values: number[]): () => number {
  let i = 0;
  return () => {
    const v = values[Math.min(i, values.length - 1)];
    i++;
    return v ?? 0.5;
  };
}

function setup(rng?: () => number, clock?: TestClock) {
  const c = clock ?? makeClock();
  const eng = new FruitNinjaEngine(players, rng ?? (() => 0.5), { now: c.now });
  return { eng, clock: c };
}

/** Advance the clock through the countdown and return the playing engine. */
function startPlaying(eng: FruitNinjaEngine, clock: TestClock): void {
  eng.tick(); // waiting -> countdown
  clock.set(COUNTDOWN_MS);
  eng.tick(); // countdown -> playing
  eng.tick(); // first playing tick (spawns the first wave)
}

/** Remove auto-spawned targets/queues so tests only see manually pushed targets. */
function silenceSpawns(eng: FruitNinjaEngine): void {
  eng.state.targets = [];
  eng.state.spawnQueue = [];
  eng.state.lastWaveAtMs = Number.MAX_SAFE_INTEGER;
}

/** Manual target with a trivial trajectory so slices are fully deterministic. */
function manualTarget(
  id: number,
  spawnTime: number,
  type: Target["type"] = "apple",
  x = 400,
  y = 400,
): Target {
  return {
    id,
    type,
    x,
    y,
    vx: 0,
    vy: 0,
    rotation: 0,
    spin: 0,
    spawnTime,
    expiresAt: spawnTime + 5000,
    slicedBy: [],
    missedBy: [],
    points: type === "apple" ? 10 : 0,
  };
}

function sliceAt(eng: FruitNinjaEngine, seat: number, t: number, pts: [number, number][]): ReturnType<typeof eng.apply> {
  const first = pts[0]!;
  eng.apply({ type: "slice-begin", x: first[0], y: first[1], time: t }, seat);
  for (const [x, y] of pts.slice(1, -1)) {
    eng.apply({ type: "slice-move", x, y, time: t }, seat);
  }
  const last = pts[pts.length - 1]!;
  return eng.apply({ type: "slice-end", x: last[0], y: last[1], time: t }, seat);
}

describe("FruitNinjaEngine lifecycle", () => {
  it("starts waiting with 3 lives and zero scores", () => {
    const { eng } = setup();
    const s = eng.state;
    expect(s.phase).toBe("waiting");
    expect(s.finished).toBe(false);
    expect(s.players.map((p) => p.lives)).toEqual([3, 3]);
    expect(s.scores).toEqual([0, 0]);
    expect(s.players[0].combos).toBe(0);
  });

  it("runs a 3s server-authoritative countdown before play starts", () => {
    const { eng, clock } = setup();
    const r1 = eng.tick();
    expect(r1.events.map((e) => e.type)).toContain("countdown-start");
    expect(eng.state.phase).toBe("countdown");
    expect(eng.state.matchStartedAtMs).toBeNull();

    clock.advance(COUNTDOWN_MS - 1);
    const r2 = eng.tick();
    expect(eng.state.phase).toBe("countdown");
    expect(r2.events).toEqual([]);

    clock.advance(1);
    const r3 = eng.tick();
    expect(eng.state.phase).toBe("playing");
    expect(eng.state.matchStartedAtMs).toBe(COUNTDOWN_MS);
    expect(r3.events.map((e) => e.type)).toContain("match-start");
  });

  it("rejects blade input outside the playing phase", () => {
    const { eng } = setup();
    const res = eng.apply({ type: "slice-begin", x: 400, y: 400, time: 0 }, 0);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/not in progress/i);
  });

  it("rejects malformed and out-of-range slice timestamps", () => {
    const { eng, clock } = setup();
    startPlaying(eng, clock);
    const t = clock.now();
    expect(eng.apply({ type: "slice-begin", x: Number.NaN, y: 400, time: t }, 0).ok).toBe(false);
    expect(eng.apply({ type: "slice-begin", x: 400, y: 400, time: t - 99999 }, 0).ok).toBe(false);
    expect(eng.apply({ type: "slice-begin", x: 400, y: 400, time: t }, 0).ok).toBe(true);
  });

  it("serializes a server clock reference and live match time", () => {
    const { eng, clock } = setup();
    startPlaying(eng, clock);
    const out = eng.serialize();
    expect(out.serverTimeMs).toBe(clock.now());
    expect(typeof out.matchRemainingMs).toBe("number");
  });
});

describe("FruitNinjaEngine slicing", () => {
  it("scores +10 when a sweep hits a fruit trajectory", () => {
    const { eng, clock } = setup();
    startPlaying(eng, clock);
    silenceSpawns(eng);
    const t = clock.now();
    eng.state.targets.push(manualTarget(1, t));

    const res = sliceAt(eng, 0, t + 100, [[400, 410], [400, 390]]);
    expect(res.ok).toBe(true);
    expect(res.events.map((e) => e.type)).toContain("fruit-sliced");
    expect(eng.state.players[0].score).toBe(10);
    expect(eng.state.scores).toEqual([10, 0]);
    expect(eng.state.targets[0]!.slicedBy).toEqual([0]);
  });

  it("rejects a sweep that never crossed the fruit", () => {
    const { eng, clock } = setup();
    startPlaying(eng, clock);
    silenceSpawns(eng);
    const t = clock.now();
    eng.state.targets.push(manualTarget(1, t));

    const res = sliceAt(eng, 0, t + 100, [[100, 100], [120, 120]]);
    expect(res.ok).toBe(true);
    expect(res.events).toEqual([]);
    expect(eng.state.players[0].score).toBe(0);
  });

  it("cannot slice a fruit that already expired", () => {
    const { eng, clock } = setup();
    startPlaying(eng, clock);
    silenceSpawns(eng);
    const t = clock.now();
    const tg = manualTarget(1, t);
    tg.expiresAt = t + 1000;
    eng.state.targets.push(tg);

    clock.set(t + 2000);
    const res = sliceAt(eng, 0, t + 1500, [[400, 400]]);
    expect(res.ok).toBe(true);
    expect(res.events.map((e) => e.type)).not.toContain("fruit-sliced");
    expect(eng.state.players[0].score).toBe(0);
  });

  it("requires an open sweep before slice-move / slice-end", () => {
    const { eng, clock } = setup();
    startPlaying(eng, clock);
    const t = clock.now();
    expect(eng.apply({ type: "slice-move", x: 400, y: 400, time: t }, 0).ok).toBe(false);
    expect(eng.apply({ type: "slice-end", x: 400, y: 400, time: t }, 0).ok).toBe(false);
  });

  it("awards combo bonuses and tracks the longest combo", () => {
    const { eng, clock } = setup();
    startPlaying(eng, clock);
    silenceSpawns(eng);
    const t = clock.now();
    eng.state.targets.push(manualTarget(1, t, "apple", 400, 400));
    eng.state.targets.push(manualTarget(2, t, "apple", 400, 300));
    eng.state.targets.push(manualTarget(3, t, "apple", 400, 150));

    // First sweep slices two fruits within the combo window (combo 1 -> 2).
    const r1 = sliceAt(eng, 0, t + 100, [[400, 410], [400, 350], [400, 290]]);
    expect(r1.events.filter((e) => e.type === "fruit-sliced")).toHaveLength(2);

    // Second sweep completes a 3-chain: combo-bonus of 30 is awarded.
    const r2 = sliceAt(eng, 0, t + 250, [[400, 210]]);
    expect(r2.events.map((e) => e.type)).toContain("combo-bonus");
    const bonus = r2.events.find((e) => e.type === "combo-bonus") as { bonus?: number };
    expect(bonus.bonus).toBe(30);

    expect(eng.state.players[0].score).toBe(60); // 3 * 10 + 30
    expect(eng.state.players[0].longestCombo).toBe(3);
    expect(eng.state.players[0].combos).toBe(0); // reset after bonus
  });
});

describe("FruitNinjaEngine misses and lives", () => {
  it("charges a miss to each seat exactly once when a fruit expires", () => {
    const { eng, clock } = setup();
    startPlaying(eng, clock);
    silenceSpawns(eng);
    const t = clock.now();
    eng.state.targets.push(manualTarget(1, t));

    clock.set(t + 6000);
    const events = eng.tick().events;
    expect(events.map((e) => e.type)).toContain("target-expired");
    const misses = events.filter((e) => e.type === "target-missed");
    expect(misses).toHaveLength(2); // both seats
    expect(eng.state.players[0].lives).toBe(MAX_LIVES - 1);
    expect(eng.state.players[1].lives).toBe(MAX_LIVES - 1);

    // The same target is never charged again.
    const again = eng.tick().events;
    expect(again.filter((e) => e.type === "target-missed")).toHaveLength(0);
  });

  it("eliminates a player when lives hit zero and hands the win to the opponent", () => {
    const { eng, clock } = setup();
    startPlaying(eng, clock);
    silenceSpawns(eng);

    // Three expiry events cost every seat all three lives; the first player
    // to reach zero (seat 0) is eliminated.
    for (let wave = 0; wave < 3; wave++) {
      const t = clock.now();
      eng.state.targets.push(manualTarget(100 + wave, t));
      clock.set(t + 6000);
      eng.tick();
    }

    expect(eng.state.finished).toBe(true);
    expect(eng.state.endReason).toBe("player_eliminated");
    expect(eng.state.winnerSeats).toEqual([1]);
    expect(eng.state.players[0].eliminated).toBe(true);
  });

  it("bomb hit eliminates instantly without touching lives or score", () => {
    const { eng, clock } = setup(rngOf(0.5, 0.05, 0.5, 0.5, 0.5, 0.5, 0.5));
    startPlaying(eng, clock);
    const t = clock.now();
    const bomb = eng.state.targets[0];
    expect(bomb).toBeDefined();
    expect(bomb.type).toBe("bomb");

    // Slice the bomb exactly on its (continuous) trajectory midpoint.
    const mid = (bomb.spawnTime + bomb.expiresAt) / 2;
    const dt = (mid - bomb.spawnTime) / 1000;
    const cx = bomb.x + bomb.vx * dt;
    const cy = bomb.y + bomb.vy * dt + 0.5 * 350 * dt * dt;

    const res = sliceAt(eng, 0, mid, [[cx, cy]]);
    expect(res.events.map((e) => e.type)).toContain("bomb-hit");
    expect(eng.state.finished).toBe(true);
    expect(eng.state.endReason).toBe("bomb_elimination");
    expect(eng.state.winnerSeats).toEqual([1]);
    expect(eng.state.players[0].lives).toBe(MAX_LIVES); // unaffected
    expect(eng.state.players[0].score).toBe(0);
  });

  it("slicing a life target restores a life up to the cap", () => {
    const { eng, clock } = setup(rngOf(0.5, 0.17, 0.5, 0.5, 0.5, 0.5, 0.5));
    startPlaying(eng, clock);
    const life = eng.state.targets[0];
    expect(life.type).toBe("life");

    // Both seats already lost one life.
    eng.state.players[0].lives = 2;
    eng.state.players[1].lives = 2;

    const mid = (life.spawnTime + life.expiresAt) / 2;
    const dt = (mid - life.spawnTime) / 1000;
    const cx = life.x + life.vx * dt;
    const cy = life.y + life.vy * dt + 0.5 * 350 * dt * dt;

    const res = sliceAt(eng, 0, mid, [[cx, cy]]);
    expect(res.events.map((e) => e.type)).toContain("life-gained");
    expect(eng.state.players[0].lives).toBe(3);
  });
});

describe("FruitNinjaEngine match resolution", () => {
  it("declares a draw when the timer expires with equal scores", () => {
    const { eng, clock } = setup();
    startPlaying(eng, clock);
    clock.set(clock.now() + MATCH_DURATION_MS + 100);
    const res = eng.tick();
    expect(res.finished).toBe(true);
    expect(eng.state.endReason).toBe("timer_expired");
    expect(eng.state.winnerSeats).toEqual([]);
    expect(res.winnerSeats).toEqual([]);
  });

  it("awards the higher score on timer expiry", () => {
    const { eng, clock } = setup();
    startPlaying(eng, clock);
    eng.state.scores[1] = 50;
    eng.state.players[1].score = 50;
    clock.set(clock.now() + MATCH_DURATION_MS + 100);
    const res = eng.tick();
    expect(res.finished).toBe(true);
    expect(eng.state.winnerSeats).toEqual([1]);
  });

  it("handles an explicit match timeout the same way", () => {
    const { eng, clock } = setup();
    startPlaying(eng, clock);
    eng.state.scores[0] = 20;
    const res = eng.handleTimeout("match");
    expect(res.ok).toBe(true);
    expect(res.state.winnerSeats).toEqual([0]);
    expect(res.state.endReason).toBe("timer_expired");
  });

  it("resign ends the match with the opponent winning", () => {
    const { eng, clock } = setup();
    startPlaying(eng, clock);
    const res = eng.apply({ type: "resign" }, 1);
    expect(res.ok).toBe(true);
    expect(res.state.finished).toBe(true);
    expect(res.state.winnerSeats).toEqual([0]);
  });
});
