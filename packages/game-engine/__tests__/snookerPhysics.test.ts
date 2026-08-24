import { describe, it, expect } from "vitest";
import {
  createInitialSnookerSetup,
  simulateSnookerShot,
  SNOOKER_TABLE_WIDTH,
  SNOOKER_TABLE_HEIGHT,
  SNOOKER_BALL_RADIUS,
} from "../src/snooker";

describe("Snooker Physics Simulation", () => {
  it("initializes 22-ball snooker setup correctly (1 cue + 15 reds + 6 colors)", () => {
    const balls = createInitialSnookerSetup();
    expect(balls.length).toBe(22);

    const cue = balls.find((b) => b.type === "cue");
    expect(cue).toBeDefined();

    const reds = balls.filter((b) => b.type === "red");
    expect(reds.length).toBe(15);

    const colors = ["yellow", "green", "brown", "blue", "pink", "black"];
    for (const c of colors) {
      expect(balls.some((b) => b.type === c)).toBe(true);
    }
  });

  it("simulates elastic ball-to-ball collision with snooker balls", () => {
    const cue = {
      id: "ball-cue",
      type: "cue" as const,
      color: "#ffffff",
      points: 0,
      homeSpot: null,
      x: 300,
      y: 240,
      vx: 0,
      vy: 0,
      spinX: 0,
      spinY: 0,
      pocketed: false,
      pocketIndex: null,
      pocketedAtTurn: null,
    };
    const target = {
      id: "ball-red-1",
      type: "red" as const,
      color: "#dc2626",
      points: 1,
      homeSpot: null,
      x: 350,
      y: 240,
      vx: 0,
      vy: 0,
      spinX: 0,
      spinY: 0,
      pocketed: false,
      pocketIndex: null,
      pocketedAtTurn: null,
    };

    // Shoot cue ball directly right into target ball
    const sim = simulateSnookerShot([cue, target], { angle: 0, power: 0.8 });
    expect(sim.totalCollisions).toBeGreaterThan(0);
    expect(sim.firstBallHit?.id).toBe("ball-red-1");

    const finalTarget = sim.balls.find((b) => b.id === "ball-red-1");
    expect(finalTarget?.x).toBeGreaterThan(350);
  });

  it("simulates cushion rail rebound", () => {
    const cue = {
      id: "ball-cue",
      type: "cue" as const,
      color: "#ffffff",
      points: 0,
      homeSpot: null,
      x: 480,
      y: 100,
      vx: 0,
      vy: 0,
      spinX: 0,
      spinY: 0,
      pocketed: false,
      pocketIndex: null,
      pocketedAtTurn: null,
    };

    // Shoot directly up toward top cushion (y=0)
    const sim = simulateSnookerShot([cue], { angle: -Math.PI / 2, power: 0.6 });
    const finalCue = sim.balls.find((b) => b.id === "ball-cue");
    expect(finalCue).toBeDefined();
    // After bouncing off top rail, final y position should be in the table area
    expect(finalCue?.y).toBeGreaterThan(30);
  });

  it("detects pocketing when ball enters pocket threshold", () => {
    const cue = {
      id: "ball-cue",
      type: "cue" as const,
      color: "#ffffff",
      points: 0,
      homeSpot: null,
      x: 80,
      y: 80,
      vx: 0,
      vy: 0,
      spinX: 0,
      spinY: 0,
      pocketed: false,
      pocketIndex: null,
      pocketedAtTurn: null,
    };
    const ball = {
      id: "ball-red-1",
      type: "red" as const,
      color: "#dc2626",
      points: 1,
      homeSpot: null,
      x: 50,
      y: 50,
      vx: 0,
      vy: 0,
      spinX: 0,
      spinY: 0,
      pocketed: false,
      pocketIndex: null,
      pocketedAtTurn: null,
    };

    // Shoot toward top-left corner pocket at (26, 26)
    const angle = Math.atan2(26 - 80, 26 - 80);
    const sim = simulateSnookerShot([cue, ball], { angle, power: 0.6 });
    expect(sim.pocketedBallIds.length).toBeGreaterThan(0);
  });
});
