import { describe, expect, it, vi } from "vitest";
import { BubbleShooterEngine } from "../src/bubble-shooter/engine";
import { BUBBLE_SHOOTER_GEOMETRY, bubbleGridX, bubbleGridY, traceBubbleShot } from "../src/bubble-shooter/geometry";

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

  it("matches the solo playfield geometry and keeps every bubble inside it", () => {
    const state = new BubbleShooterEngine([p0, p1]).state;
    expect(BUBBLE_SHOOTER_GEOMETRY).toMatchObject({ radius: 16, cols: 12, canvasWidth: 384, canvasHeight: 580, shooterY: 544 });
    for (const player of state.players) {
      expect(player.grid.filter(b => b.row === 0)).toHaveLength(12);
      for (const b of player.grid) expect(bubbleGridX(b.row, b.col) + 16).toBeLessThanOrEqual(384);
    }
  });

  it("does not create a turn deadline or eliminate idle players after ten seconds", () => {
    let now = 0;
    const eng = new BubbleShooterEngine([p0, p1], undefined, { now: () => now });
    eng.apply({ type: 'shoot', angle: -Math.PI / 2 }, 1);
    now = 11_000;
    expect(eng.currentClockDeadline).toBeNull();
    expect(eng.state.turnTimerConfig).toBeNull();
    expect(eng.state.finished).toBe(false);
    expect(eng.apply({ type: 'shoot', angle: -Math.PI / 2 }, 0).ok).toBe(true);
  });

  it("cycles the displayed preview into the cannon and records a unique shot sequence", () => {
    const eng = new BubbleShooterEngine([p0, p1]);
    const preview = structuredClone(eng.state.players[0].queuedBubble);
    eng.apply({ type: 'shoot', angle: -Math.PI / 2 }, 0);
    expect(eng.state.players[0].nextBubble).toEqual(preview);
    expect(eng.state.players[0].lastShot!.sequence).toBe(1);
    eng.apply({ type: 'shoot', angle: -Math.PI / 2 }, 1);
    expect(eng.state.players[1].lastShot!.sequence).toBe(2);
    expect(eng.state.players[0].lastShot!.sequence).toBe(1);
  });

  it("keeps a ceiling shot at its impact x instead of snapping it into the left corner", () => {
    const path = traceBubbleShot([], 0, -Math.PI / 2);
    expect(path.x).toBeCloseTo(BUBBLE_SHOOTER_GEOMETRY.shooterX);
    expect(path.y).toBe(BUBBLE_SHOOTER_GEOMETRY.radius);
    const eng = new BubbleShooterEngine([p0, p1]);
    eng.state.players[0].grid = [];
    eng.state.players[0].nextBubble = { color: '#fff', type: 'normal' };
    const result = eng.apply({ type: 'shoot', angle: -Math.PI / 2 }, 0);
    expect(result.ok).toBe(true);
    expect(result.state.players[0].lastShot!.col).toBeGreaterThan(0);
  });

  it("removes detached bubbles from the authoritative grid after popping their support", () => {
    const eng = new BubbleShooterEngine([p0, p1]);
    const red = '#fb7185';
    const blue = '#818cf8';
    eng.state.players[0].grid = [
      { row: 0, col: 4, color: red, type: 'normal' },
      { row: 0, col: 5, color: red, type: 'normal' },
      { row: 1, col: 4, color: red, type: 'normal' },
      { row: 2, col: 4, color: blue, type: 'normal' },
      { row: 3, col: 3, color: blue, type: 'normal' },
      { row: 3, col: 4, color: blue, type: 'normal' },
      { row: 0, col: 11, color: '#34d399', type: 'normal' },
    ];
    eng.state.players[0].nextBubble = { color: red, type: 'normal' };
    vi.spyOn(eng as any, 'simulateShot').mockReturnValue({ x: bubbleGridX(1, 5), y: bubbleGridY(1, 0) });
    const result = eng.apply({ type: 'shoot', angle: -Math.PI / 2 }, 0);
    expect(result.ok).toBe(true);
    expect(result.state.players[0].lastShot).toMatchObject({ matchedCount: 4, droppedCount: 3 });
    expect(result.state.players[0].grid).toEqual([{ row: 0, col: 11, color: '#34d399', type: 'normal' }]);
  });
});
