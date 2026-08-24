import {
  SNOOKER_TABLE_WIDTH,
  SNOOKER_TABLE_HEIGHT,
  SNOOKER_BALL_RADIUS,
  SNOOKER_POCKETS,
  SNOOKER_CUSHION_MARGIN,
  SNOOKER_PLAYABLE_LEFT,
  SNOOKER_PLAYABLE_RIGHT,
  SNOOKER_PLAYABLE_TOP,
  SNOOKER_PLAYABLE_BOTTOM,
  SNOOKER_SPOTS,
  SNOOKER_BALL_VALUES,
  type SnookerBall,
  type SnookerBallType,
  type SnookerPieceKeyframe,
  type SnookerTrajectoryKeyframe,
} from "./types";

export const SNOOKER_MAX_SHOT_SPEED = 24.0;
export const SNOOKER_TABLE_FRICTION = 0.989;
export const SNOOKER_MIN_VELOCITY = 0.04;
export const SNOOKER_BALL_RESTITUTION = 0.96;
export const SNOOKER_CUSHION_RESTITUTION = 0.82;
export const SNOOKER_SUB_STEPS = 6;
export const SNOOKER_MAX_SIMULATION_STEPS = 900;

export interface SnookerSimulationResult {
  balls: SnookerBall[];
  keyframes: SnookerTrajectoryKeyframe[];
  pocketedBallIds: string[];
  firstBallHit: SnookerBall | null;
  cueBallPocketed: boolean;
  totalCollisions: number;
}

export function createInitialSnookerSetup(): SnookerBall[] {
  const balls: SnookerBall[] = [];
  const r = SNOOKER_BALL_RADIUS;

  // 1. White Cue Ball (Starts inside the "D")
  balls.push({
    id: "ball-cue",
    type: "cue",
    color: "#ffffff",
    points: 0,
    homeSpot: null,
    x: 145,
    y: 240,
    vx: 0,
    vy: 0,
    spinX: 0,
    spinY: 0,
    pocketed: false,
    pocketIndex: null,
    pocketedAtTurn: null,
  });

  // 2. Six Colored Balls on designated spots
  const colors: Array<{ type: SnookerBallType; color: string; spot: { x: number; y: number } }> = [
    { type: "yellow", color: "#eab308", spot: SNOOKER_SPOTS.yellow },
    { type: "green", color: "#16a34a", spot: SNOOKER_SPOTS.green },
    { type: "brown", color: "#854d0e", spot: SNOOKER_SPOTS.brown },
    { type: "blue", color: "#2563eb", spot: SNOOKER_SPOTS.blue },
    { type: "pink", color: "#ec4899", spot: SNOOKER_SPOTS.pink },
    { type: "black", color: "#09090b", spot: SNOOKER_SPOTS.black },
  ];

  for (const c of colors) {
    balls.push({
      id: `ball-${c.type}`,
      type: c.type,
      color: c.color,
      points: SNOOKER_BALL_VALUES[c.type],
      homeSpot: { ...c.spot },
      x: c.spot.x,
      y: c.spot.y,
      vx: 0,
      vy: 0,
      spinX: 0,
      spinY: 0,
      pocketed: false,
      pocketIndex: null,
      pocketedAtTurn: null,
    });
  }

  // 3. Fifteen Red Balls in Standard Triangle Pack behind Pink Spot
  // Apex of red pack is immediately behind Pink spot (Pink is at x = 680, y = 240)
  const apexX = SNOOKER_SPOTS.pink.x + r * 2 + 2; // ~699
  const apexY = SNOOKER_SPOTS.pink.y; // 240
  const rowSpacing = r * Math.sqrt(3) + 0.5;

  let redIndex = 1;
  for (let row = 0; row < 5; row++) {
    const rowX = apexX + row * rowSpacing;
    const startY = apexY - row * r;

    for (let col = 0; col <= row; col++) {
      const rowY = startY + col * (r * 2 + 0.5);
      balls.push({
        id: `ball-red-${redIndex++}`,
        type: "red",
        color: "#dc2626",
        points: 1,
        homeSpot: null,
        x: rowX,
        y: rowY,
        vx: 0,
        vy: 0,
        spinX: 0,
        spinY: 0,
        pocketed: false,
        pocketIndex: null,
        pocketedAtTurn: null,
      });
    }
  }

  return balls;
}

export function simulateSnookerShot(
  initialBalls: SnookerBall[],
  params: { angle: number; power: number; spinX?: number; spinY?: number }
): SnookerSimulationResult {
  // Deep clone balls to avoid mutating input state
  const balls: SnookerBall[] = initialBalls.map((b) => ({ ...b }));
  const cueBall = balls.find((b) => b.type === "cue" && !b.pocketed);

  if (cueBall) {
    const speed = Math.max(0.05, Math.min(1.0, params.power)) * SNOOKER_MAX_SHOT_SPEED;
    cueBall.vx = Math.cos(params.angle) * speed;
    cueBall.vy = Math.sin(params.angle) * speed;
    cueBall.spinX = params.spinX ? Math.max(-1, Math.min(1, params.spinX)) : 0;
    cueBall.spinY = params.spinY ? Math.max(-1, Math.min(1, params.spinY)) : 0;
  }

  const keyframes: SnookerTrajectoryKeyframe[] = [];
  const pocketedBallIds: string[] = [];
  let firstBallHit: SnookerBall | null = null;
  let totalCollisions = 0;
  let frameCounter = 0;

  const recordKeyframe = () => {
    const pieces: SnookerPieceKeyframe[] = balls.map((b) => ({
      id: b.id,
      x: b.x,
      y: b.y,
      pocketed: b.pocketed,
      pocketIndex: b.pocketIndex,
    }));
    keyframes.push({ frame: frameCounter++, pieces });
  };

  recordKeyframe();

  for (let step = 0; step < SNOOKER_MAX_SIMULATION_STEPS; step++) {
    for (let sub = 0; sub < SNOOKER_SUB_STEPS; sub++) {
      // 1. Position integration and friction
      for (const b of balls) {
        if (b.pocketed) continue;

        b.x += b.vx / SNOOKER_SUB_STEPS;
        b.y += b.vy / SNOOKER_SUB_STEPS;

        // Apply cue ball english / spin curvature
        if (b.type === "cue" && (b.spinX !== 0 || b.spinY !== 0)) {
          b.vx += (b.spinX * 0.03 * Math.sign(b.vy)) / SNOOKER_SUB_STEPS;
          b.vy += (b.spinY * 0.03 * Math.sign(b.vx)) / SNOOKER_SUB_STEPS;
          b.spinX *= 0.998;
          b.spinY *= 0.998;
        }

        const frictionFactor = Math.pow(SNOOKER_TABLE_FRICTION, 1 / SNOOKER_SUB_STEPS);
        b.vx *= frictionFactor;
        b.vy *= frictionFactor;

        if (Math.hypot(b.vx, b.vy) < SNOOKER_MIN_VELOCITY) {
          b.vx = 0;
          b.vy = 0;
        }
      }

      // 2. Pocket detection and suction
      for (const b of balls) {
        if (b.pocketed) continue;

        for (let pIdx = 0; pIdx < SNOOKER_POCKETS.length; pIdx++) {
          const pocket = SNOOKER_POCKETS[pIdx];
          const dist = Math.hypot(b.x - pocket.x, b.y - pocket.y);

          // Gravitational suction toward pocket throat
          if (dist < pocket.radius + 6) {
            const pull = 0.35 / SNOOKER_SUB_STEPS;
            b.vx += ((pocket.x - b.x) / dist) * pull;
            b.vy += ((pocket.y - b.y) / dist) * pull;
          }

          // Full pocket drop
          if (dist < pocket.radius - 2) {
            b.pocketed = true;
            b.pocketIndex = pIdx;
            b.vx = 0;
            b.vy = 0;
            if (!pocketedBallIds.includes(b.id)) {
              pocketedBallIds.push(b.id);
            }
            break;
          }
        }
      }

      // 3. Ball-to-Ball Collisions (Elastic 2D Impulses)
      for (let i = 0; i < balls.length; i++) {
        const b1 = balls[i];
        if (b1.pocketed) continue;

        for (let j = i + 1; j < balls.length; j++) {
          const b2 = balls[j];
          if (b2.pocketed) continue;

          const dx = b2.x - b1.x;
          const dy = b2.y - b1.y;
          const dist = Math.hypot(dx, dy);
          const minDist = SNOOKER_BALL_RADIUS * 2;

          if (dist < minDist && dist > 0.0001) {
            totalCollisions++;

            // Track first ball contacted by the cue ball
            if (!firstBallHit) {
              if (b1.type === "cue") firstBallHit = b2;
              else if (b2.type === "cue") firstBallHit = b1;
            }

            // Positional overlap resolution
            const overlap = minDist - dist;
            const nx = dx / dist;
            const ny = dy / dist;

            b1.x -= nx * overlap * 0.5;
            b1.y -= ny * overlap * 0.5;
            b2.x += nx * overlap * 0.5;
            b2.y += ny * overlap * 0.5;

            // Elastic impulse response along normal
            const kx = b1.vx - b2.vx;
            const ky = b1.vy - b2.vy;
            const p = 2 * (nx * kx + ny * ky) / 2; // Equal mass

            if (p > 0) {
              const impulse = p * SNOOKER_BALL_RESTITUTION;
              b1.vx -= nx * impulse;
              b1.vy -= ny * impulse;
              b2.vx += nx * impulse;
              b2.vy += ny * impulse;
            }
          }
        }
      }

      // 4. Cushion Rail Reflections
      for (const b of balls) {
        if (b.pocketed) continue;

        // Skip cushion check if ball is entering pocket throat
        let nearPocket = false;
        for (const pocket of SNOOKER_POCKETS) {
          if (Math.hypot(b.x - pocket.x, b.y - pocket.y) < pocket.radius + 8) {
            nearPocket = true;
            break;
          }
        }
        if (nearPocket) continue;

        // Left cushion
        if (b.x < SNOOKER_PLAYABLE_LEFT) {
          b.x = SNOOKER_PLAYABLE_LEFT;
          b.vx = -b.vx * SNOOKER_CUSHION_RESTITUTION;
        }
        // Right cushion
        if (b.x > SNOOKER_PLAYABLE_RIGHT) {
          b.x = SNOOKER_PLAYABLE_RIGHT;
          b.vx = -b.vx * SNOOKER_CUSHION_RESTITUTION;
        }
        // Top cushion
        if (b.y < SNOOKER_PLAYABLE_TOP) {
          b.y = SNOOKER_PLAYABLE_TOP;
          b.vy = -b.vy * SNOOKER_CUSHION_RESTITUTION;
        }
        // Bottom cushion
        if (b.y > SNOOKER_PLAYABLE_BOTTOM) {
          b.y = SNOOKER_PLAYABLE_BOTTOM;
          b.vy = -b.vy * SNOOKER_CUSHION_RESTITUTION;
        }
      }
    }

    // Record keyframe every 2 steps for fluid 60fps rendering
    if (step % 2 === 0) {
      recordKeyframe();
    }

    // Early termination if all balls have come to rest
    const isMoving = balls.some((b) => !b.pocketed && (b.vx !== 0 || b.vy !== 0));
    if (!isMoving) {
      recordKeyframe();
      break;
    }
  }

  const cueBallPocketed = balls.some((b) => b.type === "cue" && b.pocketed);

  return {
    balls,
    keyframes,
    pocketedBallIds,
    firstBallHit,
    cueBallPocketed,
    totalCollisions,
  };
}
