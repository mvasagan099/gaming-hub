import { describe, expect, it } from "vitest";
import { BubbleShooterEngine } from "../src/bubble-shooter/engine";

describe("BubbleShooterEngine", () => {
  const p0 = { userId: "user-1", seat: 0 };
  const p1 = { userId: "user-2", seat: 1 };

  it("initializes a 2-player multiplayer match", () => {
    const eng = new BubbleShooterEngine([p0, p1]);
    const state = eng.state;

    expect(state.finished).toBe(false);
    expect(state.players).toHaveLength(2);
    expect(state.players[0].seat).toBe(0);
    expect(state.players[1].seat).toBe(1);
    expect(state.players[0].grid.length).toBeGreaterThan(0);
    expect(state.players[1].grid.length).toBeGreaterThan(0);
  });

  it("processes a valid upward shot", () => {
    const eng = new BubbleShooterEngine([p0, p1]);
    const res = eng.apply({ type: "shoot", angle: -Math.PI / 2 }, 0);

    expect(res.ok).toBe(true);
    expect(res.state.players[0].lastShot).not.toBeNull();
    expect(res.state.players[0].shotsFired).toBe(1);
  });

  it("rejects invalid downward shots", () => {
    const eng = new BubbleShooterEngine([p0, p1]);
    const res = eng.apply({ type: "shoot", angle: Math.PI / 4 }, 0);

    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/aim upward/i);
  });

  it("resets combo on a missed shot", () => {
    const eng = new BubbleShooterEngine([p0, p1]);
    eng.state.players[0].combo = 3;

    // Force next bubble to be non-matching normal bubble
    eng.state.players[0].nextBubble = { color: "#ffffff", type: "normal" };

    const res = eng.apply({ type: "shoot", angle: -Math.PI / 2 }, 0);
    expect(res.ok).toBe(true);
    expect(res.state.players[0].combo).toBe(0);
  });

  it("declares highest score player as winner on match timeout", () => {
    const eng = new BubbleShooterEngine([p0, p1]);
    eng.state.players[0].score = 500;
    eng.state.players[1].score = 200;

    const res = eng.handleTimeout("match");
    expect(res.ok).toBe(true);
    expect(res.finished).toBe(true);
    expect(res.winnerSeats).toEqual([0]);
  });
});
