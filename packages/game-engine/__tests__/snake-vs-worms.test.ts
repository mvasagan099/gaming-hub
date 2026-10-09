import { describe, expect, it, vi } from "vitest";
import { SnakeVsWormsEngine } from "../src/snake-vs-worms/engine";
import { seededRandomSource } from '../src/rng';

describe("SnakeVsWormsEngine - Shared World Arena Architecture", () => {
  const p0 = { userId: "user-1", seat: 0 };
  const p1 = { userId: "user-2", seat: 1 };

  it("initializes 2-player match in 2000x2000 shared world with Snake (Seat 0, 300,600) and Worm (Seat 1, 300,1400)", () => {
    const eng = new SnakeVsWormsEngine([p0, p1]);
    const state = eng.state;

    expect(state.finished).toBe(false);
    expect(state.gridWidth).toBe(2000);
    expect(state.gridHeight).toBe(2000);
    expect(state.players).toHaveLength(8);
    expect(state.players.filter(p => p.playerId.startsWith('ai-'))).toHaveLength(6);
    expect(new Set(state.players.map(p => p.seat)).size).toBe(8);
    expect(state.players.every(p => p.body.length === 15)).toBe(true);

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
  it('starts a fixed three-minute match clock and ends a tied match as a draw', () => {
    let now = 1000;
    const engine = new SnakeVsWormsEngine([p0, p1], undefined, { now: () => now });
    engine.startMatchClock(); expect(engine.currentMatchDeadline).toBe(181000);
    now += 10000; expect(engine.serialize().matchRemainingMs).toBe(170000);
    expect(engine.currentMatchDeadline).toBe(181000);
    now = 181000; expect(engine.tick()).toMatchObject({ finished: true, winnerSeats: [] });
    expect(engine.state).toMatchObject({ gameStatus: 'finished', endReason: 'TIME_EXPIRED' });
  });
  it('freezes the match clock while paused and allows resignation while paused', () => {
    let now = 1000;
    const engine = new SnakeVsWormsEngine([p0, p1], undefined, { now: () => now });
    engine.startMatchClock(); engine.apply({ type: 'boost-start' }, 1);
    now += 10000; engine.apply({ type: 'pause' }, 0);
    const snapshot = engine.getStateSnapshot();
    now += 30000;
    expect(engine.tick().state).toEqual(snapshot);
    expect(engine.serialize().matchRemainingMs).toBe(170000);
    expect(engine.apply({ type: 'resume' }, 1).ok).toBe(true);
    expect(engine.currentMatchDeadline).toBe(211000);
    expect(engine.state.players[1].isBoosting).toBe(false);
    engine.apply({ type: 'pause' }, 0);
    expect(engine.apply({ type: 'resign' }, 1)).toMatchObject({ finished: true, winnerSeats: [0] });
    expect(engine.state.gameStatus).toBe('finished');
  });
  it('does not choose a winner by seat order when both heads hit the other body', () => {
    const engine = new SnakeVsWormsEngine([p0, p1]);
    engine.state.food = [];
    const [a, b] = engine.state.players;
    a.body = [{ x: 100, y: 100 }, { x: 100, y: 111 }, { x: 111, y: 111 }, { x: 122, y: 111 }];
    b.body = [{ x: 120, y: 120 }, { x: 120, y: 109 }, { x: 109, y: 109 }, { x: 98, y: 109 }];
    b.direction = b.targetDirection = 'left';
    expect(engine.tick()).toMatchObject({ finished: true, winnerSeats: [] });
    expect(engine.state.endReason).toBe('BOTH_ELIMINATED');
    expect(engine.state.players.slice(0, 2).map(p => p.kills)).toEqual([1, 1]);
  });
  it('reports equal head-to-head elimination as a draw', () => {
    const engine = new SnakeVsWormsEngine([p0, p1]);
    engine.state.players[0].body[0] = { x: 990, y: 1000 };
    engine.state.players[1].body[0] = { x: 1010, y: 1000 };
    engine.state.players[1].direction = engine.state.players[1].targetDirection = 'left';
    expect(engine.tick()).toMatchObject({ finished: true, winnerSeats: [] });
    expect(engine.state.endReason).toBe('BOTH_ELIMINATED');
  });
  it('preserves an earlier snapshot and rejects invalid controls and empty boost', () => {
    const engine = new SnakeVsWormsEngine([p0, p1]);
    const before = engine.serialize();
    expect(engine.apply({ type: 'direction', direction: 'up' }, 1).ok).toBe(true);
    expect(engine.state.players[1].targetDirection).toBe('up');
    expect((before.players as any[])[1].targetDirection).toBe('right');
    expect(engine.apply({ type: 'direction', direction: 'diagonal' } as any, 1).ok).toBe(false);
    expect(engine.apply({ type: 'boost-start' }, 5).ok).toBe(false);
    engine.state.players[1].boostEnergy = 0;
    expect(engine.apply({ type: 'boost-start' }, 1).ok).toBe(false);
  });
  it('keeps AI-style segment spacing through turns, growth and boost', () => {
    const engine = new SnakeVsWormsEngine([p0, p1]);
    engine.state.food = [];
    engine.state.players[0].pendingGrowth = 2;
    engine.apply({ type: 'direction', direction: 'up' }, 0);
    engine.apply({ type: 'boost-start' }, 0);
    for (let tick = 0; tick < 20; tick++) engine.tick();
    const body = engine.state.players[0].body;
    expect(body).toHaveLength(17);
    for (let i = 1; i < body.length; i++) {
      expect(Math.hypot(body[i].x - body[i - 1].x, body[i].y - body[i - 1].y)).toBeCloseTo(11);
    }
  });
  it('turns AI rivals away from walls and respawns eliminated rivals safely', () => {
    let now = 1000;
    const engine = new SnakeVsWormsEngine([p0, p1], undefined, { now: () => now });
    const bot = engine.state.players[2];
    bot.body[0] = { x: 1970, y: 1000 };
    bot.direction = bot.targetDirection = 'right';
    engine.tick();
    expect(engine.state.players[2].direction).not.toBe('right');
    engine.state.players[2].status = 'eliminated';
    engine.tick();
    now += 2501; engine.tick();
    const restored = engine.state.players[2];
    expect(restored.status).toBe('active');
    expect(restored.body).toHaveLength(15);
    expect(restored.isBoosting).toBe(false);
    expect(engine.state.players.slice(0, 2).every(p => Math.hypot(p.body[0].x - restored.body[0].x,
      p.body[0].y - restored.body[0].y) > 300)).toBe(true);
  });
  it('keeps bots outside human winner selection and gameplay seats', () => {
    const engine = new SnakeVsWormsEngine([p0, p1]);
    engine.state.players[2].score = 10000;
    engine.state.players[0].score = 50;
    expect(engine.apply({ type: 'boost-start' }, engine.state.players[2].seat).ok).toBe(false);
    expect(engine.handleTimeout('match').winnerSeats).toEqual([0]);
    const eliminated = new SnakeVsWormsEngine([p0, p1]);
    eliminated.state.players[1].status = 'eliminated';
    expect(eliminated.tick()).toMatchObject({ finished: true, winnerSeats: [0] });
    expect(eliminated.state.players.some(p => p.playerId.startsWith('ai-') && p.status === 'active')).toBe(true);
  });
  it.each(['resign', 'collision', 'timeout'] as const)('freezes the final timer after %s', ending => {
    let now = 1000;
    const engine = new SnakeVsWormsEngine([p0, p1], undefined, { now: () => now });
    engine.startMatchClock(); now += 10000;
    if (ending === 'resign') engine.apply({ type: 'resign' }, 1);
    if (ending === 'collision') {
      engine.state.players[1].body[0] = { x: 2000, y: 1400 }; engine.tick();
    }
    if (ending === 'timeout') engine.handleTimeout('match');
    const remaining = ending === 'timeout' ? 0 : 170000;
    expect(engine.serialize().matchRemainingMs).toBe(remaining);
    now += 20000; expect(engine.serialize().matchRemainingMs).toBe(remaining);
  });
  it('avoids stacking food when repeated random positions are already occupied', () => {
    const engine = new SnakeVsWormsEngine([p0, p1], () => 0.5);
    expect(engine.state.food).toHaveLength(1);
    expect(engine.state.food[0]).toMatchObject({ x: 1000, y: 1000 });
    engine.state.food = [];
    engine.state.players[0].body[0] = { x: 1000, y: 1000 };
    const occupied = (engine as any).findUnoccupiedPosition(engine.state.players, []);
    expect(occupied).toBeNull();
  });
  it.each([{ type: 'normal', score: 10, growth: 1, energy: 11 },
    { type: 'golden', score: 50, growth: 3, energy: 11 },
    { type: 'boost', score: 20, growth: 1, energy: 41 }] as const)('collects $type food with the correct rewards', item => {
    const engine = new SnakeVsWormsEngine([p0, p1]);
    engine.setRandomSource(() => 0.99);
    engine.state.players[0].boostEnergy = 10;
    engine.state.food = [{ id: 'food', x: 305, y: 600, type: item.type, score: item.score, growth: item.growth }];
    engine.tick();
    expect(engine.state.players[0]).toMatchObject({ score: item.score, foodCollected: 1,
      pendingGrowth: item.growth, boostEnergy: item.energy });
    for (let tick = 0; tick < item.growth; tick++) engine.tick();
    expect(engine.state.players[0].body).toHaveLength(15 + item.growth);
  });
  it.each([false, true])('resolves a three-snake head collision together with reversed order=%s', reversed => {
    const engine = new SnakeVsWormsEngine([p0, p1]);
    engine.setRandomSource(() => 0.99);
    engine.state.food = [];
    engine.state.players = engine.state.players.slice(0, 3);
    engine.state.players.forEach((p, i) => {
      p.body = Array.from({ length: i === 2 ? 8 : 15 }, (_, segment) => ({ x: 100 + i * 14 - segment * 11, y: 100 }));
      p.direction = p.targetDirection = 'right';
    });
    if (reversed) engine.state.players.reverse();
    expect(engine.tick()).toMatchObject({ finished: true, winnerSeats: [] });
    expect(engine.state.players.map(p => p.status)).toEqual(['eliminated', 'eliminated', 'eliminated']);
  });
  it('keeps the larger arena finite and bodies connected during sustained movement', () => {
    let now = 1000;
    const engine = new SnakeVsWormsEngine([p0, p1], seededRandomSource(42), { now: () => now });
    const before = engine.serialize();
    const directions = ['down', 'left', 'up', 'right'] as const;
    let ticks = 0;
    while (!engine.state.finished && ticks < 1000) {
      if (ticks % 20 === 0) for (const seat of [0, 1]) engine.apply({ type: 'direction', direction: directions[Math.floor(ticks / 20) % 4] }, seat);
      now += 16; engine.tick(); ticks++;
      if (ticks % 20 !== 0 && !engine.state.finished) continue;
      expect(new Set(engine.state.players.map(p => p.seat)).size).toBe(8);
      for (const p of engine.state.players.filter(p => p.status === 'active')) {
        expect(p.body.every(segment => Number.isFinite(segment.x) && Number.isFinite(segment.y))).toBe(true);
        for (let i = 1; i < p.body.length; i++) expect(Math.hypot(p.body[i].x - p.body[i - 1].x, p.body[i].y - p.body[i - 1].y)).toBeCloseTo(11);
      }
    }
    expect(ticks).toBeGreaterThan(100);
    expect(before.players[0].body[0]).toEqual({ x: 300, y: 600 });
    expect(engine.state.winnerSeats.every(seat => seat === 0 || seat === 1)).toBe(true);
  }, 15000);
});

describe('Snake vs Worms supported multiplayer player counts', () => {
  const players = Array.from({ length: 8 }, (_, seat) => ({ userId: `human-${seat}`, seat }));

  it.each([3, 4, 8])('spawns %i humans and bots without overlapping bodies or immediate eliminations', (count) => {
    const engine = new SnakeVsWormsEngine(players.slice(0, count), seededRandomSource(42));
    const entities = engine.state.players;
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        expect(entities[i].body.every(a => entities[j].body.every(b => Math.hypot(a.x - b.x, a.y - b.y) >= 30))).toBe(true);
      }
    }
    engine.tick();
    expect(engine.state.players.filter(p => !p.playerId.startsWith('ai-')).every(p => p.status === 'active')).toBe(true);
    expect(engine.finished).toBe(false);
  });

  it('considers every human seat for timeout scoring and excludes bots', () => {
    const engine = new SnakeVsWormsEngine(players, seededRandomSource(42));
    const snapshot = engine.getStateSnapshot();
    snapshot.players.forEach(p => { p.score = p.playerId.startsWith('ai-') ? 9999 : p.seat === 7 ? 500 : 0; });
    engine.restoreState(snapshot);
    expect(engine.handleTimeout('match').winnerSeats).toEqual([7]);
  });

  it('resolves a tie for the leading score by body length across all human seats', () => {
    const engine = new SnakeVsWormsEngine(players, seededRandomSource(42));
    const snapshot = engine.getStateSnapshot();
    snapshot.players[5].score = snapshot.players[7].score = 500;
    snapshot.players[7].body.push({ ...snapshot.players[7].body.at(-1)! });
    engine.restoreState(snapshot);
    expect(engine.handleTimeout('match').winnerSeats).toEqual([7]);
  });

  it('returns a draw when multiple human leaders have the same score and body length', () => {
    const engine = new SnakeVsWormsEngine(players, seededRandomSource(42));
    const snapshot = engine.getStateSnapshot();
    snapshot.players[5].score = snapshot.players[7].score = 500;
    engine.restoreState(snapshot);
    expect(engine.handleTimeout('match').winnerSeats).toEqual([]);
  });
});


describe('Snake elapsed-time synchronization', () => {
  const create = () => new SnakeVsWormsEngine(
    [{ userId: 'a', seat: 0 }, { userId: 'b', seat: 1 }], seededRandomSource(731), { now: () => 1000 });
  it('preserves movement and boost accounting when six frames arrive in one delayed tick', () => {
    const regular = create(), delayed = create();
    regular.apply({ type: 'boost-start' }, 0); delayed.apply({ type: 'boost-start' }, 0);
    for (let i = 0; i < 6; i++) regular.tick();
    delayed.tick(100);
    expect(delayed.state.players).toEqual(regular.state.players);
    expect(delayed.state.food.map(({ id, ...food }) => food)).toEqual(regular.state.food.map(({ id, ...food }) => food));
  });
  it('preserves fractional physics time across checkpoint restoration', () => {
    const uninterrupted = create(), restored = create();
    uninterrupted.tick(8);
    restored.restoreState(uninterrupted.getStateSnapshot());
    uninterrupted.tick(9); restored.tick(9);
    expect(restored.state.players).toEqual(uninterrupted.state.players);
    expect(restored.state.physicsRemainderMs).toBeCloseTo(1 / 3);
  });
  it('bounds catch-up work after a long stall', () => {
    const bounded = create(), stalled = create();
    bounded.tick(250); stalled.tick(10000);
    expect(stalled.state.players).toEqual(bounded.state.players);
    expect(stalled.state.food.map(({ id, ...food }) => food)).toEqual(bounded.state.food.map(({ id, ...food }) => food));
  });
  it('copies the world once for a catch-up tick and preserves the prior state', () => {
    const engine = create();
    engine.startMatchClock();
    const prior = engine.state;
    const snapshot = structuredClone(prior);
    const copies = vi.spyOn(engine as unknown as { cloneState(state: unknown): unknown }, 'cloneState');
    engine.tick(100);
    expect(copies).toHaveBeenCalledOnce();
    expect(prior).toEqual(snapshot);
    expect(engine.state.stateVersion).toBe(prior.stateVersion + 6);
  });
  it('keeps standalone physics simulation detached from its input', () => {
    const engine = create();
    const prior = engine.state, snapshot = structuredClone(prior);
    const result = engine.simulatePhysics(prior);
    expect(prior).toEqual(snapshot);
    expect(result).not.toBe(prior);
    expect(result.players[0].body[0]).not.toEqual(prior.players[0].body[0]);
  });

});
