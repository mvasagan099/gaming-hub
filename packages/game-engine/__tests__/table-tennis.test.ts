import { describe, expect, it } from "vitest";
import { TableTennisEngine } from "../src/table-tennis/engine";

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

  it("progressively increases ball speed on paddle touch and caps at 12.0", () => {
    const eng = new TableTennisEngine([p0, p1]);
    eng.apply({ type: "ready" }, 0);
    eng.apply({ type: "ready" }, 1);
    
    const serverSeat = eng.state.servingSeat;
    const serveRes = eng.apply({ type: "serve", angle: 0 }, serverSeat);
    expect(serveRes.ok).toBe(true);
    expect(serveRes.state.ball?.speed).toBe(5.0);
    expect(serveRes.state.ball?.touchCount).toBe(0);

    let state = serveRes.state;

    // Simulate 10 paddle touches
    for (let touch = 1; touch <= 10; touch++) {
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
      expect(state.ball?.speed).toBe(5.0 + touch * 0.5);
    }
    expect(state.ball?.touchCount).toBe(10);
    expect(state.ball?.speed).toBe(10.0);

    // Continue to touch 15 (capped at max speed 12.0)
    for (let touch = 11; touch <= 15; touch++) {
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
      expect(state.ball?.speed).toBe(Math.min(5.0 + touch * 0.5, 12.0));
    }
    expect(state.ball?.touchCount).toBe(15);
    expect(state.ball?.speed).toBe(12.0);
  });

  it("resets speed to 5.0 and touchCount to 0 after point scored", () => {
    const eng = new TableTennisEngine([p0, p1]);
    const next = (eng as any).awardPoint(eng.state, 0, "miss");
    expect(next.ball).toBe(null);

    (eng as any).updateState(next);
    const serverSeat = next.servingSeat;
    const serveRes = eng.apply({ type: "serve", angle: 0 }, serverSeat);
    expect(serveRes.ok).toBe(true);
    expect(serveRes.state.ball?.speed).toBe(5.0);
    expect(serveRes.state.ball?.touchCount).toBe(0);
  });
});

describe('Table Tennis synchronization regressions', () => {
  const players = [{ userId: 'a', seat: 0 }, { userId: 'b', seat: 1 }];
  it('arms a fixed server deadline and serializes the actual configured remaining time', () => {
    let now = 1000;
    const engine = new TableTennisEngine(players, undefined, {
      now: () => now,
      matchTimer: { matchDurationMs: 600000, warningThresholdMs: 30000 },
    });
    expect(engine.currentMatchDeadline).toBe(601000);
    now = 6500;
    expect(engine.currentMatchDeadline).toBe(601000);
    expect(engine.serialize().matchRemainingMs).toBe(594500);
    expect(engine.serialize().serverTimestamp).toBe(6500);
  });
  it('broadcasts consecutive points won by the same player, including the cleared ball', () => {
    const engine = new TableTennisEngine(players);
    for (let i = 0; i < 2; i++) {
      engine.apply({ type: 'serve', angle: 0 }, engine.state.servingSeat);
      (engine as any).updateState({ ...engine.state, ball: { ...engine.state.ball, x: 620, vx: 5 } });
      const result = engine.tick();
      expect(result.events).toContainEqual({ type: 'point-scored', winnerSeat: 0, reason: 'miss' });
      expect(result.state.ball).toBeNull();
    }
  });
});
