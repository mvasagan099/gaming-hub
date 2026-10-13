import { describe, expect, it, vi } from "vitest";
import { TableTennisEngine } from "../src/table-tennis/engine";
import { tableTennisShot } from "../src/table-tennis/shots";

describe('Table Tennis return angles', () => {
  it('keeps edge and centered shots from becoming a flat repeating lane', () => {
    for (const direction of [-1, 1] as const) for (const y of [2, 28, 40, 200, 360, 372, 398]) {
      for (const slope of [-0.36, 0, 0.36]) {
        const x = direction === 1 ? 42 : 558;
        const shot = tableTennisShot(x, y, direction, 10, slope);
        const target = y + shot.vy * Math.abs((direction === 1 ? 600 - x : x) / shot.vx);
        expect(Math.abs(target - y)).toBeGreaterThanOrEqual(39.999);
        expect(target).toBeGreaterThanOrEqual(27.999);
        expect(target).toBeLessThanOrEqual(372.001);
        expect(Math.hypot(shot.vx, shot.vy)).toBeCloseTo(10);
      }
    }
  });
  it('preserves deliberate paddle angles when there is enough lateral travel', () => {
    const shot = tableTennisShot(42, 200, 1, 7, -0.2);
    expect(shot.vy / Math.abs(shot.vx)).toBeCloseTo(-0.2);
  });
  it.each([28, 372])('breaks a repeated edge rally with stationary paddles at %s', y => {
    const engine = new TableTennisEngine([{ userId: 'a', seat: 0 }, { userId: 'b', seat: 1 }]);
    engine.apply({ type: 'ready' }, 0); engine.apply({ type: 'ready' }, 1);
    engine.apply({ type: 'serve', angle: 0 }, engine.state.servingSeat);
    let state = { ...engine.state,
      players: engine.state.players.map(p => ({ ...p, paddleY: y === 28 ? 0 : 320, paddleVelocity: 0 })),
      ball: { ...engine.state.ball!, x: 30, y, vx: -5, vy: 0 },
    } as typeof engine.state;
    let lateralTravel = 0;
    for (let frame = 0; frame < 1000 && state.ball; frame++) {
      state = engine.simulatePhysics(state);
      if (state.ball) lateralTravel = Math.max(lateralTravel, Math.abs(state.ball.y - y));
    }
    expect(lateralTravel).toBeGreaterThan(40);
    expect(state.totalPointsPlayed).toBe(1);
    expect(state.rallyCount).toBeLessThan(10);
  });
});

describe("TableTennisEngine - Winning Score and Time Management", () => {
  const p0 = { userId: "user-1", seat: 0 };
  const p1 = { userId: "user-2", seat: 1 };

  it("initializes a 2-player table tennis match", () => {
    const eng = new TableTennisEngine([p0, p1]);
    const state = eng.state;

    expect(state.finished).toBe(false);
    expect(state.players).toHaveLength(2);
    expect(state.players[0].seat).toBe(0);
    expect(state.players[1].seat).toBe(1);
    expect(state.players[0].score).toBe(0);
    expect(state.players[1].score).toBe(0);
  });

  it("handles 5-3 immediate Player 1 win", () => {
    const eng = new TableTennisEngine([p0, p1]);
    (eng as any).updateState({
      ...eng.state,
      players: [
        { ...eng.state.players[0], score: 4 },
        { ...eng.state.players[1], score: 3 },
      ],
    });
    const next = (eng as any).awardPoint(eng.state, 0, "miss");
    expect(next.players[0].score).toBe(5);
    expect(next.players[1].score).toBe(3);
    expect(next.finished).toBe(true);
    expect(next.winnerSeats).toEqual([0]);
    expect(next.endReason).toBe("SCORE_LIMIT_REACHED");
  });

  it("handles 5-4 continue (lead is only 1 point)", () => {
    const eng = new TableTennisEngine([p0, p1]);
    (eng as any).updateState({
      ...eng.state,
      players: [
        { ...eng.state.players[0], score: 4 },
        { ...eng.state.players[1], score: 4 },
      ],
    });
    const next = (eng as any).awardPoint(eng.state, 0, "miss");
    expect(next.players[0].score).toBe(5);
    expect(next.players[1].score).toBe(4);
    expect(next.finished).toBe(false);
  });

  it("handles 6-4 immediate win after 5-4 lead extension", () => {
    const eng = new TableTennisEngine([p0, p1]);
    (eng as any).updateState({
      ...eng.state,
      players: [
        { ...eng.state.players[0], score: 5 },
        { ...eng.state.players[1], score: 4 },
      ],
    });
    const next = (eng as any).awardPoint(eng.state, 0, "miss");
    expect(next.players[0].score).toBe(6);
    expect(next.players[1].score).toBe(4);
    expect(next.finished).toBe(true);
    expect(next.winnerSeats).toEqual([0]);
  });

  it("handles 5-5 and 6-5 deuce continue, and 7-5 win", () => {
    const eng = new TableTennisEngine([p0, p1]);
    (eng as any).updateState({
      ...eng.state,
      players: [
        { ...eng.state.players[0], score: 5 },
        { ...eng.state.players[1], score: 4 },
      ],
    });
    const res55 = (eng as any).awardPoint(eng.state, 1, "miss");
    expect(res55.players[0].score).toBe(5);
    expect(res55.players[1].score).toBe(5);
    expect(res55.finished).toBe(false);

    const res65 = (eng as any).awardPoint(res55, 0, "miss");
    expect(res65.players[0].score).toBe(6);
    expect(res65.players[1].score).toBe(5);
    expect(res65.finished).toBe(false);

    const res75 = (eng as any).awardPoint(res65, 0, "miss");
    expect(res75.players[0].score).toBe(7);
    expect(res75.players[1].score).toBe(5);
    expect(res75.finished).toBe(true);
    expect(res75.winnerSeats).toEqual([0]);
  });

  it("handles match timer expiration with Player 1 leading", () => {
    const eng = new TableTennisEngine([p0, p1]);
    (eng as any).updateState({
      ...eng.state,
      players: [
        { ...eng.state.players[0], score: 4 },
        { ...eng.state.players[1], score: 2 },
      ],
    });

    const res = (eng as any).onMatchTimerExpired(eng.state);
    expect(res.finished).toBe(true);
    expect(res.winnerSeats).toEqual([0]);
    expect(res.state.endReason).toBe("TIME_EXPIRED");
  });

  it("handles match timer expiration with Player 2 leading", () => {
    const eng = new TableTennisEngine([p0, p1]);
    (eng as any).updateState({
      ...eng.state,
      players: [
        { ...eng.state.players[0], score: 1 },
        { ...eng.state.players[1], score: 3 },
      ],
    });

    const res = (eng as any).onMatchTimerExpired(eng.state);
    expect(res.finished).toBe(true);
    expect(res.winnerSeats).toEqual([1]);
    expect(res.state.endReason).toBe("TIME_EXPIRED");
  });

  it("handles match timer expiration with equal score as draw", () => {
    const eng = new TableTennisEngine([p0, p1]);
    (eng as any).updateState({
      ...eng.state,
      players: [
        { ...eng.state.players[0], score: 3 },
        { ...eng.state.players[1], score: 3 },
      ],
    });

    const res = (eng as any).onMatchTimerExpired(eng.state);
    expect(res.finished).toBe(true);
    expect(res.winnerSeats).toEqual([]);
    expect(res.state.endReason).toBe("TIME_EXPIRED");
  });

  it("progressively increases ball speed on paddle touch and caps at 15.0", () => {
    const eng = new TableTennisEngine([p0, p1]);
    eng.apply({ type: "ready" }, 0);
    eng.apply({ type: "ready" }, 1);
    
    const serverSeat = eng.state.servingSeat;
    eng.apply({ type: 'ready' }, 0);
    eng.apply({ type: 'ready' }, 1);
    const serveRes = eng.apply({ type: "serve", angle: 0 }, serverSeat);
    expect(serveRes.ok).toBe(true);
    expect(serveRes.state.ball?.speed).toBe(5.0);
    expect(serveRes.state.ball?.touchCount).toBe(0);

    let state = serveRes.state;

    // Simulate 12 paddle touches (with 0.80 increase per touch, up to 14.6)
    for (let touch = 1; touch <= 12; touch++) {
      const isLeft = touch % 2 === 1;
      state = {
        ...state,
        ball: {
          ...state.ball!,
          x: isLeft ? 30 : 570,
          y: 200,
          vx: isLeft ? -5.0 : 5.0,
        },
      };
      state = eng.simulatePhysics(state);
      expect(state.ball?.touchCount).toBe(touch);
      expect(state.ball?.speed).toBeCloseTo(Math.min(5.0 + touch * 0.80, 15.0));
    }
    expect(state.ball?.touchCount).toBe(12);
    expect(state.ball?.speed).toBeCloseTo(14.6);

    // Continue to touch 15 (capped at max speed 15.0)
    for (let touch = 13; touch <= 15; touch++) {
      const isLeft = touch % 2 === 1;
      state = {
        ...state,
        ball: {
          ...state.ball!,
          x: isLeft ? 30 : 570,
          y: 200,
          vx: isLeft ? -5.0 : 5.0,
        },
      };
      state = eng.simulatePhysics(state);
      expect(state.ball?.touchCount).toBe(touch);
      expect(state.ball?.speed).toBe(15.0);
    }
    expect(state.ball?.touchCount).toBe(15);
    expect(state.ball?.speed).toBe(15.0);
  });

  it("resets speed to 5.0 and touchCount to 0 after point scored", () => {
    const eng = new TableTennisEngine([p0, p1]);
    const next = (eng as any).awardPoint(eng.state, 0, "miss");
    expect(next.ball).toBe(null);

    (eng as any).updateState(next);
    const serverSeat = next.servingSeat;
    eng.apply({ type: 'ready' }, 0);
    eng.apply({ type: 'ready' }, 1);
    const serveRes = eng.apply({ type: "serve", angle: 0 }, serverSeat);
    expect(serveRes.ok).toBe(true);
    expect(serveRes.state.ball?.speed).toBe(5.0);
    expect(serveRes.state.ball?.touchCount).toBe(0);
  });
});

describe('Table Tennis synchronization regressions', () => {
  const players = [{ userId: 'a', seat: 0 }, { userId: 'b', seat: 1 }];
  it('uses a three-minute deadline even with legacy ten-minute settings', () => {
    let now = 1000;
    const engine = new TableTennisEngine(players, undefined, {
      now: () => now,
      matchTimer: { matchDurationMs: 600000, warningThresholdMs: 30000 },
    });
    expect(engine.currentMatchDeadline).toBe(181000);
    now = 6500;
    expect(engine.currentMatchDeadline).toBe(181000);
    expect(engine.serialize().matchRemainingMs).toBe(174500);
    expect(engine.serialize().serverTimestamp).toBe(6500);
  });
  it('broadcasts consecutive points won by the same player, including the cleared ball', () => {
    const engine = new TableTennisEngine(players);
    for (let i = 0; i < 2; i++) {
      engine.apply({ type: 'ready' }, 0);
      engine.apply({ type: 'ready' }, 1);
      engine.apply({ type: 'serve', angle: 0 }, engine.state.servingSeat);
      (engine as any).updateState({ ...engine.state, ball: { ...engine.state.ball, x: 620, vx: 5 } });
      const result = engine.tick();
      expect(result.events).toContainEqual({ type: 'point-scored', winnerSeat: 0, reason: 'miss' });
      expect(result.state.ball).toBeNull();
    }
  });
});

describe('Table Tennis side exits', () => {
  it.each([{ y: 1, vy: -5, hitter: 0 }, { y: 399, vy: 5, hitter: 1 }])('ends a side exit without returning it into play ($y)', ({ y, vy, hitter }) => {
    const engine = new TableTennisEngine([{ userId: 'a', seat: 0 }, { userId: 'b', seat: 1 }]);
    engine.apply({ type: 'ready' }, 0);
    engine.apply({ type: 'ready' }, 1);
    engine.apply({ type: 'serve', angle: 0 }, engine.state.servingSeat);
    (engine as any).updateState({ ...engine.state, ball: { ...engine.state.ball, x: 300, y, vy, lastHitSeat: hitter } });
    const result = engine.tick();
    expect(result.state.ball).toBeNull();
    expect(result.state.phase).toBe('serve');
    expect(result.state.players[1 - hitter].score).toBe(1);
    expect(result.events).toContainEqual({ type: 'point-scored', winnerSeat: 1 - hitter, reason: 'out' });
    engine.tick();
    expect(engine.state.totalPointsPlayed).toBe(1);
  });
});

describe('Table Tennis assisted returns', () => {
  const players = [{ userId: 'a', seat: 0 }, { userId: 'b', seat: 1 }];
  it('keeps serves on the table from edge and center positions in both directions', () => {
    for (const seat of [0, 1]) for (const y of [0, 160, 320]) for (const angle of [-15, 0, 15]) {
      const engine = new TableTennisEngine(players);
      (engine as any).updateState({ ...engine.state, servingSeat: seat });
      engine.apply({ type: 'paddle-move', y }, seat);
      engine.apply({ type: 'ready' }, 0);
      engine.apply({ type: 'ready' }, 1);
      engine.apply({ type: 'serve', angle }, seat);
      let state = engine.state;
      for (let frame = 0; frame < 150 && state.ball; frame++) state = engine.simulatePhysics(state);
      expect(state.lastPointReason).not.toBe('out');
    }
  });
  it('keeps 90 edge/center paddle returns aimed within the opposite baseline', () => {
    for (const seat of [0, 1]) for (const y of [0, 160, 320]) {
      for (const offset of [-38, -20, 0, 20, 38]) for (const velocity of [-20, 0, 20]) {
        const engine = new TableTennisEngine(players);
        engine.apply({ type: 'ready' }, 0);
        engine.apply({ type: 'ready' }, 1);
        engine.apply({ type: 'serve', angle: 0 }, engine.state.servingSeat);
        const state = { ...engine.state,
          players: engine.state.players.map(p => p.seat === seat ? { ...p, paddleY: y, paddleVelocity: velocity } : p),
          ball: { ...engine.state.ball!, x: seat === 0 ? 30 : 570, y: y + 40 + offset, vx: seat === 0 ? -5 : 5, vy: 0 },
        };
        const result = engine.simulatePhysics(state);
        const ball = result.ball!;
        expect(ball.touchCount).toBe(1);
        const baselineY = ball.y + Math.abs((seat === 0 ? 600 - ball.x : ball.x) / ball.vx) * ball.vy;
        expect(baselineY).toBeGreaterThanOrEqual(27.999);
        expect(baselineY).toBeLessThanOrEqual(372.001);
        expect(Math.abs(baselineY - ball.y)).toBeGreaterThanOrEqual(39.999);
        expect(Math.hypot(ball.vx, ball.vy)).toBeCloseTo(ball.speed);
      }
    }
  });
  it('rejects invalid serve directions instead of corrupting the ball', () => {
    const engine = new TableTennisEngine(players);
    expect(engine.apply({ type: 'serve', angle: NaN }, engine.state.servingSeat).ok).toBe(false);
  });
});

describe('Table Tennis full match rules', () => {
  const players = [{ userId: 'a', seat: 0 }, { userId: 'b', seat: 1 }];
  it('waits for both ready players, enforces serving ownership, and rejects duplicate serves', () => {
    const engine = new TableTennisEngine(players);
    const server = engine.state.servingSeat;
    expect(engine.apply({ type: 'serve', angle: 0 }, server).ok).toBe(false);
    engine.apply({ type: 'ready' }, server);
    expect(engine.apply({ type: 'serve', angle: 0 }, server).ok).toBe(false);
    engine.apply({ type: 'ready' }, 1 - server);
    expect(engine.apply({ type: 'serve', angle: 0 }, 1 - server).ok).toBe(false);
    expect(engine.apply({ type: 'serve', angle: 0 }, server).ok).toBe(true);
    expect(engine.apply({ type: 'serve', angle: 0 }, server).ok).toBe(false);
  });
  it('marks a single-set match point and clears it on deuce', () => {
    const engine = new TableTennisEngine(players);
    engine.state.players[0].score = 3; engine.state.players[1].score = 3;
    const matchPoint = (engine as any).awardPoint(engine.state, 0, 'miss');
    expect(matchPoint.matchPointSeat).toBe(0);
    const deuce = (engine as any).awardPoint(matchPoint, 1, 'miss');
    expect(deuce.deuce).toBe(true); expect(deuce.matchPointSeat).toBeNull();
  });
  it('clears set scores and deuce when the next set starts', () => {
    const engine = new TableTennisEngine(players, undefined, { rules: { setsToWin: 2 } });
    engine.state.players[0].score = 5; engine.state.players[1].score = 4; engine.state.deuce = true;
    const state = (engine as any).awardPoint(engine.state, 0, 'miss');
    expect(state.finished).toBe(false); expect(state.players[0].setsWon).toBe(1);
    expect(state.setScores).toEqual([0, 0]); expect(state.deuce).toBe(false); expect(state.matchPointSeat).toBeNull();
  });
  it('resolves the timeout using actual sets won before current points', () => {
    const engine = new TableTennisEngine(players);
    engine.state.players[0].setsWon = 1; engine.state.players[1].score = 4;
    expect(engine.handleTimeout('match').winnerSeats).toEqual([0]);
  });
  it('holds the ball and clock during pause and resumes without a turn timer', () => {
    let now = 1000;
    const engine = new TableTennisEngine(players, undefined, { now: () => now });
    engine.apply({ type: 'ready' }, 0); engine.apply({ type: 'ready' }, 1);
    engine.apply({ type: 'serve', angle: 0 }, engine.state.servingSeat);
    now = 11000; expect(engine.apply({ type: 'pause' }, 0).ok).toBe(true);
    const ball = structuredClone(engine.state.ball);
    now = 61000; engine.tick(); expect(engine.state.ball).toEqual(ball);
    expect(engine.serialize().matchRemainingMs).toBe(170000);
    expect(engine.apply({ type: 'serve', angle: 0 }, engine.state.servingSeat).ok).toBe(false);
    expect(engine.apply({ type: 'resume' }, 0).ok).toBe(true);
    expect(engine.currentMatchDeadline).toBe(231000); expect(engine.currentClockDeadline).toBeNull();
    now += 1000; expect(engine.serialize().matchRemainingMs).toBe(169000);
    engine.tick(); expect(engine.state.ball).not.toEqual(ball);
  });
  it('rejects non-finite paddle positions and preserves the state', () => {
    const engine = new TableTennisEngine(players);
    const before = engine.serialize();
    for (const y of [NaN, Infinity, -Infinity]) expect(engine.apply({ type: 'paddle-move', y }, 0).ok).toBe(false);
    expect(engine.serialize()).toMatchObject({ players: before.players });
  });
  it('rejects actions after the match ends and finalizes timeouts once', () => {
    const engine = new TableTennisEngine(players);
    expect(engine.handleTimeout('match').finished).toBe(true);
    expect(engine.apply({ type: 'paddle-move', y: 0 }, 0).ok).toBe(false);
    expect(engine.handleTimeout('match').ok).toBe(false);
  });
  it('requires the opponent to accept a draw and stops the rally on agreement', () => {
    const engine = new TableTennisEngine(players);
    engine.apply({ type: 'ready' }, 0); engine.apply({ type: 'ready' }, 1);
    engine.apply({ type: 'serve', angle: 0 }, engine.state.servingSeat);
    expect(engine.apply({ type: 'draw-accept' }, 1).ok).toBe(false);
    expect(engine.apply({ type: 'draw-offer' }, 0).ok).toBe(true);
    expect(engine.apply({ type: 'draw-accept' }, 0).ok).toBe(false);
    expect(engine.apply({ type: 'draw-decline' }, 1).ok).toBe(true);
    expect(engine.state.finished).toBe(false);
    engine.apply({ type: 'draw-offer' }, 0);
    const result = engine.apply({ type: 'draw-accept' }, 1);
    expect(result.finished).toBe(true); expect(result.winnerSeats).toEqual([]);
    expect(result.state.phase).toBe('finished'); expect(result.state.ball).toBeNull();
    expect(engine.tick().events).toEqual([]);
  });
  it('allows resigning or agreeing a draw while paused, without accepting paddle input', () => {
    for (const ending of ['resign', 'draw-accept'] as const) {
      const engine = new TableTennisEngine(players);
      engine.apply({ type: 'pause' }, 0);
      expect(engine.apply({ type: 'paddle-move', y: 10 }, 0).ok).toBe(false);
      if (ending === 'draw-accept') expect(engine.apply({ type: 'draw-offer' }, 0).ok).toBe(true);
      const result = engine.apply({ type: ending }, 1);
      expect(result.finished).toBe(true);
      expect(result.winnerSeats).toEqual(ending === 'resign' ? [0] : []);
      expect(result.state.phase).toBe('finished'); expect(result.state.ball).toBeNull();
    }
  });
});


describe('Table Tennis elapsed-time physics', () => {
  function rally() {
    const engine = new TableTennisEngine([{ userId: 'a', seat: 0 }, { userId: 'b', seat: 1 }], () => 0.5);
    engine.apply({ type: 'ready' }, 0); engine.apply({ type: 'ready' }, 1);
    engine.apply({ type: 'serve', angle: 0 }, engine.state.servingSeat);
    return engine;
  }
  it('preserves rally speed when persistence delays a callback by 100ms', () => {
    const regular = rally(), delayed = rally();
    for (let i = 0; i < 6; i++) regular.tick();
    delayed.tick(100);
    expect(delayed.state.ball).toEqual(regular.state.ball);
    expect(delayed.state.totalPointsPlayed).toBe(regular.state.totalPointsPlayed);
  });
  it('uses collision-safe substeps through a delayed paddle contact', () => {
    const regular = rally(), delayed = rally();
    const state = { ...regular.state, ball: { ...regular.state.ball!, x: 50, y: 200, vx: -10, vy: 0 } };
    regular.restoreState(structuredClone(state)); delayed.restoreState(structuredClone(state));
    for (let i = 0; i < 9; i++) regular.tick();
    delayed.tick(150);
    expect(delayed.state.ball).toEqual(regular.state.ball);
    expect(delayed.state.ball!.vx).toBeGreaterThan(0);
  });
  it('retains fractional physics time across a checkpoint and bounds long stalls', () => {
    const regular = rally(), restored = rally();
    regular.tick(10); restored.restoreState(regular.persistenceState());
    regular.tick(10); restored.tick(10);
    expect(restored.state.ball).toEqual(regular.state.ball);
    const long = rally(), bounded = rally();
    long.tick(5000); bounded.tick(250);
    expect(long.state.ball).toEqual(bounded.state.ball);
  });
});


describe('Table Tennis catch-up copying', () => {
  function rally() {
    const engine = new TableTennisEngine([{ userId: 'a', seat: 0 }, { userId: 'b', seat: 1 }], undefined, { now: () => 1000 });
    engine.apply({ type: 'ready' }, 0); engine.apply({ type: 'ready' }, 1);
    engine.apply({ type: 'serve', angle: 0 }, engine.state.servingSeat);
    return engine;
  }
  it('copies a delayed rally once while preserving its original snapshot', () => {
    const engine = rally(), prior = engine.state, snapshot = structuredClone(engine.state);
    const copies = vi.spyOn(engine as unknown as { cloneState(state: unknown): unknown }, 'cloneState');
    engine.tick(100);
    expect(copies).toHaveBeenCalledOnce();
    expect(prior).toEqual(snapshot);
    expect(engine.state.ball!.x).not.toBe(prior.ball!.x);
  });
  it('retains standalone simulation immutability and fractional frame recovery', () => {
    const engine = rally(), prior = engine.state, snapshot = structuredClone(engine.state);
    expect(engine.simulatePhysics(prior)).not.toBe(prior);
    expect(prior).toEqual(snapshot);
    const regular = rally(), delayed = rally();
    // Use identical canonical serve state so random serve variation cannot affect comparison.
    delayed.restoreState(regular.getStateSnapshot());
    for (let i = 0; i < 6; i++) regular.tick();
    delayed.tick(100);
    expect(delayed.state.ball).toEqual(regular.state.ball);
    const before = structuredClone(delayed.state);
    delayed.tick(0);
    expect(before).toEqual(delayed.state);
  });
});

describe('Table Tennis 3D Trajectory, Bounce Logic & Rules Regression', () => {
  const players = [{ userId: 'a', seat: 0 }, { userId: 'b', seat: 1 }];

  it('Player 1 normal shot clears net, bounces first on opponent half, and never bounces on shooter half', () => {
    const engine = new TableTennisEngine(players);
    engine.apply({ type: 'ready' }, 0);
    engine.apply({ type: 'ready' }, 1);

    // Setup rally ball hitting P0 paddle at x=38
    let state = {
      ...engine.state,
      phase: 'rally' as const,
      players: [
        { ...engine.state.players[0], paddleY: 160 },
        { ...engine.state.players[1], paddleY: 160 },
      ],
      ball: {
        x: 30,
        y: 200,
        z: 32,
        vx: -5.0,
        vy: 0,
        vz: 0,
        speed: 6.0,
        touchCount: 1,
        served: false,
        servedBySeat: 0,
        lastHitSeat: 1,
        bounceCount: 1,
        inPlay: true,
        spin: 0,
        lastHitter: 1,
        ballSide: 0 as const,
        netCrossed: true,
        bounceCountAfterHit: 1,
        currentRallyState: 'rally' as const,
      },
    };

    // Simulate physics through P0 paddle hit
    state = engine.simulatePhysics(state);
    expect(state.ball).not.toBeNull();
    const ball = state.ball!;
    expect(ball.lastHitter).toBe(0);
    expect(ball.lastHitSeat).toBe(0);
    expect(ball.vx).toBeGreaterThan(0); // Traveling toward P1
    expect(ball.netCrossed).toBe(false);
    expect(ball.bounceCountAfterHit).toBe(0);
    expect(ball.currentRallyState).toBe('rally');

    let crossedNet = false;
    let netHeightObserved = 0;
    let bounceCountOnP0Side = 0;
    let bounceCountOnP1Side = 0;
    let firstBounceX = -1;

    for (let frame = 0; frame < 150 && state.ball && state.ball.inPlay; frame++) {
      const prevX = state.ball.x;
      const prevZ = state.ball.z;
      state = engine.simulatePhysics(state);
      if (!state.ball) break;

      // Net crossing check
      if (prevX < 300 && state.ball.x >= 300) {
        crossedNet = true;
        netHeightObserved = (prevZ + state.ball.z) / 2;
      }

      // Check for bounce (z <= 0)
      if (state.ball.z <= 0.05 && prevZ > state.ball.z) {
        if (state.ball.lastHitter === 0) {
          if (state.ball.x < 300) {
            bounceCountOnP0Side++;
          } else {
            bounceCountOnP1Side++;
            if (firstBounceX === -1) firstBounceX = state.ball.x;
            break;
          }
        }
      }
    }

    // REQUIRED CHECKS:
    expect(crossedNet).toBe(true);
    expect(netHeightObserved).toBeGreaterThan(34); // Cleared net of height 34
    expect(bounceCountOnP0Side).toBe(0); // MUST NOT bounce on shooter's side!
    expect(bounceCountOnP1Side).toBeGreaterThanOrEqual(1); // Bounced on opponent's side!
    expect(firstBounceX).toBeGreaterThan(300); // Landed beyond the net on opponent half
    expect(firstBounceX).toBeLessThan(560); // Landed inside table
  });

  it('Player 2 normal shot clears net, bounces first on opponent half, and never bounces on shooter half', () => {
    const engine = new TableTennisEngine(players);
    engine.apply({ type: 'ready' }, 0);
    engine.apply({ type: 'ready' }, 1);

    // Setup rally ball hitting P1 paddle at x=570
    let state = {
      ...engine.state,
      phase: 'rally' as const,
      players: [
        { ...engine.state.players[0], paddleY: 160 },
        { ...engine.state.players[1], paddleY: 160 },
      ],
      ball: {
        x: 570,
        y: 200,
        z: 32,
        vx: 5.0,
        vy: 0,
        vz: 0,
        speed: 6.0,
        touchCount: 2,
        served: false,
        servedBySeat: 0,
        lastHitSeat: 0,
        bounceCount: 1,
        inPlay: true,
        spin: 0,
        lastHitter: 0,
        ballSide: 1 as const,
        netCrossed: true,
        bounceCountAfterHit: 1,
        currentRallyState: 'rally' as const,
      },
    };

    // Simulate physics through P1 paddle hit
    state = engine.simulatePhysics(state);
    expect(state.ball).not.toBeNull();
    const ball = state.ball!;
    expect(ball.lastHitter).toBe(1);
    expect(ball.lastHitSeat).toBe(1);
    expect(ball.vx).toBeLessThan(0); // Traveling toward P0
    expect(ball.netCrossed).toBe(false);
    expect(ball.bounceCountAfterHit).toBe(0);
    expect(ball.currentRallyState).toBe('rally');

    let crossedNet = false;
    let netHeightObserved = 0;
    let bounceCountOnP1Side = 0;
    let bounceCountOnP0Side = 0;
    let firstBounceX = -1;

    for (let frame = 0; frame < 150 && state.ball && state.ball.inPlay; frame++) {
      const prevX = state.ball.x;
      const prevZ = state.ball.z;
      state = engine.simulatePhysics(state);
      if (!state.ball) break;

      if (prevX > 300 && state.ball.x <= 300) {
        crossedNet = true;
        netHeightObserved = (prevZ + state.ball.z) / 2;
      }

      if (state.ball.z <= 0.05 && prevZ > state.ball.z) {
        if (state.ball.lastHitter === 1) {
          if (state.ball.x > 300) {
            bounceCountOnP1Side++;
          } else {
            bounceCountOnP0Side++;
            if (firstBounceX === -1) firstBounceX = state.ball.x;
            break;
          }
        }
      }
    }

    // REQUIRED CHECKS:
    expect(crossedNet).toBe(true);
    expect(netHeightObserved).toBeGreaterThan(34); // Cleared net
    expect(bounceCountOnP1Side).toBe(0); // MUST NOT bounce on shooter's side!
    expect(bounceCountOnP0Side).toBeGreaterThanOrEqual(1); // Bounced on opponent's side!
    expect(firstBounceX).toBeLessThan(300); // Landed on Player 0's half
    expect(firstBounceX).toBeGreaterThan(40); // Landed inside table
  });

  it('gentle shot (min speed 5.0) stays on table, clears net, and lands on opponent side', () => {
    const engine = new TableTennisEngine(players);
    engine.apply({ type: 'ready' }, 0);
    engine.apply({ type: 'ready' }, 1);

    let state = {
      ...engine.state,
      phase: 'rally' as const,
      ball: {
        x: 30,
        y: 200,
        z: 32,
        vx: -5.0,
        vy: 0,
        vz: 0,
        speed: 5.0,
        touchCount: 0,
        served: false,
        servedBySeat: 0,
        lastHitSeat: 1,
        bounceCount: 0,
        inPlay: true,
        spin: 0,
        lastHitter: 1,
        ballSide: 0 as const,
        netCrossed: true,
        bounceCountAfterHit: 1,
        currentRallyState: 'rally' as const,
      },
    };

    state = engine.simulatePhysics(state);
    let bouncedOnOpponentSide = false;
    let netHeight = 0;

    for (let f = 0; f < 120 && state.ball && state.ball.inPlay; f++) {
      const prevX = state.ball.x;
      state = engine.simulatePhysics(state);
      if (!state.ball) break;
      if (prevX < 300 && state.ball.x >= 300) {
        netHeight = state.ball.z;
      }
      if (state.ball.z <= 0.05 && state.ball.x > 300) {
        bouncedOnOpponentSide = true;
        break;
      }
    }

    expect(netHeight).toBeGreaterThan(34);
    expect(bouncedOnOpponentSide).toBe(true);
  });

  it('powerful shot (max speed 15.0) clears net and stays within opponent baseline', () => {
    const engine = new TableTennisEngine(players);
    engine.apply({ type: 'ready' }, 0);
    engine.apply({ type: 'ready' }, 1);

    let state = {
      ...engine.state,
      phase: 'rally' as const,
      ball: {
        x: 30,
        y: 200,
        z: 32,
        vx: -15.0,
        vy: 0,
        vz: 0,
        speed: 14.5,
        touchCount: 14,
        served: false,
        servedBySeat: 0,
        lastHitSeat: 1,
        bounceCount: 0,
        inPlay: true,
        spin: 0,
        lastHitter: 1,
        ballSide: 0 as const,
        netCrossed: true,
        bounceCountAfterHit: 1,
        currentRallyState: 'rally' as const,
      },
    };

    state = engine.simulatePhysics(state);
    expect(state.ball!.speed).toBe(15.0);
    let bouncedOnOpponentSide = false;
    let landingX = 0;

    for (let f = 0; f < 100 && state.ball && state.ball.inPlay; f++) {
      state = engine.simulatePhysics(state);
      if (!state.ball) break;
      if (state.ball.z <= 0.05 && state.ball.x > 300) {
        bouncedOnOpponentSide = true;
        landingX = state.ball.x;
        break;
      }
    }

    expect(bouncedOnOpponentSide).toBe(true);
    expect(landingX).toBeLessThanOrEqual(560); // In bounds
    expect(landingX).toBeGreaterThan(300); // Past net
  });

  it('net collision: ball hitting net below net height awards point with reason net', () => {
    const engine = new TableTennisEngine(players);
    engine.apply({ type: 'ready' }, 0);
    engine.apply({ type: 'ready' }, 1);

    // Ball traveling right toward net at x=298 with z=20 (below net height 34)
    (engine as any).updateState({
      ...engine.state,
      phase: 'rally',
      ball: {
        x: 295,
        y: 200,
        z: 20,
        vx: 8,
        vy: 0,
        vz: -0.5,
        speed: 8,
        touchCount: 1,
        served: false,
        servedBySeat: 0,
        lastHitSeat: 0,
        bounceCount: 0,
        inPlay: true,
        spin: 0,
        lastHitter: 0,
        ballSide: 0,
        netCrossed: false,
        bounceCountAfterHit: 0,
        currentRallyState: 'rally',
      },
    });

    const result = engine.tick();
    expect(result.events).toContainEqual({
      type: 'point-scored',
      winnerSeat: 1, // Opponent gets point
      reason: 'net',
    });
    expect(result.state.ball).toBeNull();
  });

  it('invalid rally shot: bouncing on shooter side before crossing net awards point to opponent', () => {
    const engine = new TableTennisEngine(players);
    engine.apply({ type: 'ready' }, 0);
    engine.apply({ type: 'ready' }, 1);

    // Ball shot by P0, but descending onto P0 own half at x=150
    (engine as any).updateState({
      ...engine.state,
      phase: 'rally',
      ball: {
        x: 148,
        y: 200,
        z: 0.5,
        vx: 5,
        vy: 0,
        vz: -2.0, // landing on table on shooter half
        speed: 5,
        touchCount: 1,
        served: false,
        servedBySeat: 0,
        lastHitSeat: 0,
        bounceCount: 0,
        inPlay: true,
        spin: 0,
        lastHitter: 0,
        ballSide: 0,
        netCrossed: false,
        bounceCountAfterHit: 0,
        currentRallyState: 'rally',
      },
    });

    const result = engine.tick();
    expect(result.events).toContainEqual({
      type: 'point-scored',
      winnerSeat: 1, // Opponent gets point for illegal rally shot
      reason: 'miss',
    });
    expect(result.state.ball).toBeNull();
  });

  it('opponent miss: double bounce on opponent half awards point to shooter', () => {
    const engine = new TableTennisEngine(players);
    engine.apply({ type: 'ready' }, 0);
    engine.apply({ type: 'ready' }, 1);

    // Ball already bounced once on P1 side (bounceCountAfterHit = 1), now landing again
    (engine as any).updateState({
      ...engine.state,
      phase: 'rally',
      ball: {
        x: 480,
        y: 200,
        z: 0.5,
        vx: 3,
        vy: 0,
        vz: -1.5,
        speed: 5,
        touchCount: 1,
        served: false,
        servedBySeat: 0,
        lastHitSeat: 0,
        bounceCount: 1,
        inPlay: true,
        spin: 0,
        lastHitter: 0,
        ballSide: 1,
        netCrossed: true,
        bounceCountAfterHit: 1,
        currentRallyState: 'rally',
      },
    });

    const result = engine.tick();
    expect(result.events).toContainEqual({
      type: 'point-scored',
      winnerSeat: 0, // Shooter gets point because opponent missed return
      reason: 'miss',
    });
    expect(result.state.ball).toBeNull();
  });

  it('valid official serve: bounces on server side first, clears net, and bounces on receiver side', () => {
    const engine = new TableTennisEngine(players);
    (engine as any).updateState({ ...engine.state, servingSeat: 0 });
    engine.apply({ type: 'ready' }, 0);
    engine.apply({ type: 'ready' }, 1);

    const serveResult = engine.apply({ type: 'serve', angle: 0 }, 0);
    expect(serveResult.ok).toBe(true);
    let state = serveResult.state;
    expect(state.ball!.currentRallyState).toBe('serve');
    expect(state.ball!.lastHitter).toBe(0);

    let firstBounceX = -1;
    let netCleared = false;
    let secondBounceX = -1;

    for (let f = 0; f < 100 && state.ball && state.ball.inPlay; f++) {
      const prevX = state.ball.x;
      const prevBounce = state.ball.bounceCountAfterHit;
      state = engine.simulatePhysics(state);
      if (!state.ball) break;

      if (prevBounce === 0 && state.ball.bounceCountAfterHit === 1) {
        firstBounceX = state.ball.x;
      }
      if (prevX < 300 && state.ball.x >= 300) {
        netCleared = true;
      }
      if (prevBounce === 1 && state.ball.bounceCountAfterHit === 2) {
        secondBounceX = state.ball.x;
      }
    }

    // Official serve requirements:
    expect(firstBounceX).toBeGreaterThan(0);
    expect(firstBounceX).toBeLessThan(300); // 1st bounce on server's own half
    expect(netCleared).toBe(true); // Cleared the net
    expect(secondBounceX).toBeGreaterThan(300); // 2nd bounce on receiver's half
    expect(secondBounceX).toBeLessThan(560);
  });
});

