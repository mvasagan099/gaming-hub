import {
  CARROM_BOARD_WIDTH,
  CARROM_BOARD_HEIGHT,
  POCKET_RADIUS,
  STRIKER_RADIUS,
  COIN_RADIUS,
  QUEEN_RADIUS,
  POCKETS,
  BASE_LINE_Y,
  BASE_LINE_X_START,
  BASE_LINE_X_END,
  type CarromCoin,
  type CarromStriker,
  type CoinType,
  type CarromTrajectoryKeyframe,
} from "./types";

export { BASE_LINE_Y } from "./types";
export const FRICTION = 0.985;
export const MIN_VELOCITY = 0.05;
export const MAX_VELOCITY = 800;
export const RESTITUTION = 0.9;
export const COIN_RESTITUTION = 0.8;
export const STRIKER_MASS = 2;
export const COIN_MASS = 1;

export function createInitialCoins(): CarromCoin[] {
  const coins: CarromCoin[] = [];
  const centerX = CARROM_BOARD_WIDTH / 2;
  const centerY = CARROM_BOARD_HEIGHT / 2;
  const d = COIN_RADIUS * 2; // 30 (center-to-center distance for touching coins)

  const positions: { x: number; y: number }[] = [
    { x: centerX, y: centerY }, // Queen (center)
  ];

  // Ring 1: 6 coins around Queen touching Queen and touching adjacent neighbors
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI * 2) / 6;
    positions.push({
      x: centerX + Math.cos(angle) * d,
      y: centerY + Math.sin(angle) * d,
    });
  }

  // Ring 2: 12 coins in authentic hexagonal close packing (6 corner coins at 2*d and 6 edge coins at d*sqrt(3))
  const cornerDist = d * 2; // 60
  const edgeDist = d * Math.sqrt(3); // ~51.9615
  for (let i = 0; i < 6; i++) {
    const cornerAngle = (i * Math.PI * 2) / 6;
    const edgeAngle = cornerAngle + Math.PI / 6;

    // Corner coin
    positions.push({
      x: centerX + Math.cos(cornerAngle) * cornerDist,
      y: centerY + Math.sin(cornerAngle) * cornerDist,
    });

    // Edge coin
    positions.push({
      x: centerX + Math.cos(edgeAngle) * edgeDist,
      y: centerY + Math.sin(edgeAngle) * edgeDist,
    });
  }

  const types: CoinType[] = [
    "queen",
    // Ring 1 (6 coins alternating)
    "white", "black", "white", "black", "white", "black",
    // Ring 2 (12 coins alternating)
    "black", "white", "black", "white", "black", "white", "black", "white", "black", "white", "black", "white",
  ];

  for (let i = 0; i < positions.length && i < types.length; i++) {
    coins.push({
      id: `coin-${i}`,
      x: positions[i].x,
      y: positions[i].y,
      vx: 0,
      vy: 0,
      type: types[i],
      pocketed: false,
      pocketedBy: null,
      pocketedAtTurn: null,
    });
  }

  return coins;
}

export function createInitialStriker(seat: number = 0): CarromStriker {
  return {
    x: CARROM_BOARD_WIDTH / 2,
    y: seat === 0 ? BASE_LINE_Y : 93,
    vx: 0,
    vy: 0,
    placed: false,
    pocketed: false,
    placedBy: seat,
  };
}

export function isValidStrikerPlacement(x: number, seat: number, coins: CarromCoin[] = []): boolean {
  if (typeof x !== "number" || isNaN(x)) return false;
  // Allow striker center anywhere between the left circle center (BASE_LINE_X_START = 129)
  // and right circle center (BASE_LINE_X_END = 471), with 2px tolerance for float rounding.
  if (x < BASE_LINE_X_START - 2 || x > BASE_LINE_X_END + 2) return false;

  // The striker may not overlap any active coin (server-authoritative rule).
  const y = seat === 0 ? BASE_LINE_Y : 93;
  for (const coin of coins) {
    if (coin.pocketed) continue;
    const r = coin.type === "queen" ? QUEEN_RADIUS : COIN_RADIUS;
    if (Math.hypot(coin.x - x, coin.y - y) < STRIKER_RADIUS + r + 1) return false;
  }
  return true;
}

/**
 * "Due owed" rule: after a striker foul, one of the fouler's own pocketed coins
 * returns to the board near the center (avoiding overlap with active coins).
 * Returns the returned coin, or null when the fouler has no pocketed coin left.
 */
export function placeCoinSafelyNearCenter(coin: CarromCoin, coins: CarromCoin[]): void {
  const centerX = CARROM_BOARD_WIDTH / 2;
  const centerY = CARROM_BOARD_HEIGHT / 2;
  const radius = coin.type === "queen" ? QUEEN_RADIUS : COIN_RADIUS;

  let centerFree = true;
  for (const other of coins) {
    if (other === coin || other.pocketed) continue;
    const otherR = other.type === "queen" ? QUEEN_RADIUS : COIN_RADIUS;
    if (Math.hypot(other.x - centerX, other.y - centerY) < radius + otherR + 2) {
      centerFree = false;
      break;
    }
  }

  if (centerFree) {
    coin.x = centerX;
    coin.y = centerY;
    return;
  }

  for (let r = 20; r <= 100; r += 15) {
    for (let i = 0; i < 12; i++) {
      const angle = (i * Math.PI * 2) / 12;
      const x = centerX + Math.cos(angle) * r;
      const y = centerY + Math.sin(angle) * r;
      let overlaps = false;
      for (const other of coins) {
        if (other === coin || other.pocketed) continue;
        const otherR = other.type === "queen" ? QUEEN_RADIUS : COIN_RADIUS;
        if (Math.hypot(other.x - x, other.y - y) < radius + otherR + 2) {
          overlaps = true;
          break;
        }
      }
      if (!overlaps) {
        coin.x = x;
        coin.y = y;
        return;
      }
    }
  }

  coin.x = centerX;
  coin.y = centerY;
}

export function returnOneOwnCoin(
  coins: CarromCoin[],
  seat: number,
  rng: () => number = Math.random,
): CarromCoin | null {
  const color: CoinType = seat === 0 ? "white" : "black";
  const pocketedOwn = coins.filter(c => c.type === color && c.pocketed);
  if (pocketedOwn.length === 0) return null;

  const coin = pocketedOwn[pocketedOwn.length - 1];
  coin.pocketed = false;
  coin.pocketedBy = null;
  coin.pocketedAtTurn = null;
  coin.vx = 0;
  coin.vy = 0;

  placeCoinSafelyNearCenter(coin, coins);
  return coin;
}



export const POCKET_CAPTURE_RADIUS = 24;

export function checkPocketCollision(x: number, y: number, _vx: number = 0, _vy: number = 0, _radius: number = COIN_RADIUS): number | null {
  for (let i = 0; i < POCKETS.length; i++) {
    const pocket = POCKETS[i];
    const dx = pocket.x - x;
    const dy = pocket.y - y;
    if (dx * dx + dy * dy <= POCKET_CAPTURE_RADIUS * POCKET_CAPTURE_RADIUS) {
      return i;
    }
  }
  return null;
}

export function checkWallCollision(
  x: number,
  y: number,
  vx: number,
  vy: number,
  radius: number,
): { x: number; y: number; vx: number; vy: number } {
  const innerMin = 33;
  const innerMax = CARROM_BOARD_WIDTH - innerMin;
  let newX = x;
  let newY = y;
  let newVx = vx;
  let newVy = vy;
  const wallRestitution = radius >= STRIKER_RADIUS ? 0.75 : 0.70;

  if (newX - radius < innerMin) {
    newX = innerMin + radius;
    newVx = Math.abs(newVx) * wallRestitution;
  } else if (newX + radius > innerMax) {
    newX = innerMax - radius;
    newVx = -Math.abs(newVx) * wallRestitution;
  }

  if (newY - radius < innerMin) {
    newY = innerMin + radius;
    newVy = Math.abs(newVy) * wallRestitution;
  } else if (newY + radius > innerMax) {
    newY = innerMax - radius;
    newVy = -Math.abs(newVy) * wallRestitution;
  }

  return { x: newX, y: newY, vx: newVx, vy: newVy };
}

export function checkCircleCollision(
  x1: number, y1: number, vx1: number, vy1: number, r1: number, m1: number,
  x2: number, y2: number, vx2: number, vy2: number, r2: number, m2: number,
): { x1: number; y1: number; vx1: number; vy1: number; x2: number; y2: number; vx2: number; vy2: number } | null {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const minDist = r1 + r2;

  if (dist >= minDist || dist === 0) return null;

  const nx = dx / dist;
  const ny = dy / dist;
  const dvx = vx1 - vx2;
  const dvy = vy1 - vy2;
  const dvn = dvx * nx + dvy * ny;

  if (dvn <= 0) return null;

  const isStriker = m1 === STRIKER_MASS || m2 === STRIKER_MASS;
  const restitution = isStriker ? 0.90 : 0.82;
  const jImpulse = -(2 * m1 * m2 * dvn) / (m1 + m2) * restitution;

  const newVx1 = vx1 + (jImpulse * nx) / m1;
  const newVy1 = vy1 + (jImpulse * ny) / m1;
  const newVx2 = vx2 - (jImpulse * nx) / m2;
  const newVy2 = vy2 - (jImpulse * ny) / m2;

  const overlap = minDist - dist;
  const totalMass = m1 + m2;
  const newX1 = x1 - nx * overlap * (m2 / totalMass);
  const newY1 = y1 - ny * overlap * (m2 / totalMass);
  const newX2 = x2 + nx * overlap * (m1 / totalMass);
  const newY2 = y2 + ny * overlap * (m1 / totalMass);

  return { x1: newX1, y1: newY1, vx1: newVx1, vy1: newVy1, x2: newX2, y2: newY2, vx2: newVx2, vy2: newVy2 };
}

export function applyFriction(vx: number, vy: number, dt: number = 1): { vx: number; vy: number } {
  const speed = Math.sqrt(vx * vx + vy * vy);
  if (speed < MIN_VELOCITY) return { vx: 0, vy: 0 };
  const frictionFactor = Math.pow(FRICTION, dt);
  return { vx: vx * frictionFactor, vy: vy * frictionFactor };
}

export function simulatePhysics(
  coins: CarromCoin[],
  striker: CarromStriker,
  dt: number = 1 / 60,
  steps: number = 600,
): {
  pocketedCoins: CarromCoin[];
  pocketedStriker: boolean;
  events: any[];
  keyframes: CarromTrajectoryKeyframe[];
} {
  const events: any[] = [];
  let pocketedStriker = false;
  const pocketedCoins: CarromCoin[] = [];
  const keyframes: CarromTrajectoryKeyframe[] = [];

  const innerMin = 33; // 22 * 1.5
  const innerMax = CARROM_BOARD_WIDTH - innerMin; // 567

  // 12 sub-steps per frame step (same as client)
  const maxSubSteps = 12;
  const subDt = dt / maxSubSteps;
  const frictionPerSubstep = Math.pow(0.985, subDt * 60);

  // Combine all active entities into a single array for physics integration
  type Body = {
    id: string;
    isStriker: boolean;
    x: number;
    y: number;
    vx: number;
    vy: number;
    radius: number;
    mass: number;
    pocketed: boolean;
    pocketIndex?: number;
    coinObj?: CarromCoin;
  };

  const allBodies: Body[] = [];
  if (!striker.pocketed) {
    allBodies.push({
      id: "striker",
      isStriker: true,
      x: striker.x,
      y: striker.y,
      vx: striker.vx,
      vy: striker.vy,
      radius: STRIKER_RADIUS,
      mass: STRIKER_MASS,
      pocketed: false,
    });
  }

  for (const c of coins) {
    if (!c.pocketed) {
      const r = c.type === "queen" ? QUEEN_RADIUS : COIN_RADIUS;
      allBodies.push({
        id: c.id,
        isStriker: false,
        x: c.x,
        y: c.y,
        vx: c.vx,
        vy: c.vy,
        radius: r,
        mass: COIN_MASS,
        pocketed: false,
        coinObj: c,
      });
    }
  }

  const resolveWall = (b: Body) => {
    if (b.pocketed) return;
    const r = b.radius;
    const wallRestitution = b.isStriker ? 0.75 : 0.70;

    // 1. Corner pocket corner-cushion bounce:
    // Authentic carrom boards have a solid corner bumper behind the pocket cutout.
    // If a piece heads into the corner pocket region beyond the pocket center towards the outer corner,
    // the corner cushion rim rebounds it back toward the pocket/board.
    for (const p of POCKETS) {
      const dx = b.x - p.x;
      const dy = b.y - p.y;
      
      const isCornerDir = (p.x < CARROM_BOARD_WIDTH / 2 ? dx < 0 : dx > 0) &&
                          (p.y < CARROM_BOARD_HEIGHT / 2 ? dy < 0 : dy > 0);
                          
      if (!isCornerDir) continue;

      const distSq = dx * dx + dy * dy;
      const cornerLimitSq = 28 * 28;
      
      if (distSq > cornerLimitSq) {
        const dist = Math.sqrt(distSq);
        const cornerLimit = 28;
        const nx = dx / dist;
        const ny = dy / dist;
        b.x = p.x + nx * cornerLimit;
        b.y = p.y + ny * cornerLimit;
        const vn = b.vx * nx + b.vy * ny;
        if (vn > 0) {
          b.vx -= (1 + wallRestitution) * vn * nx;
          b.vy -= (1 + wallRestitution) * vn * ny;
        }
      }
    }

    // 2. Straight perimeter walls
    // Crossing the straight innerMin/innerMax boundary is only permitted if the piece is within
    // the pocket capture radius (where it is immediately pocketed).
    const inCaptureZone = checkPocketCollision(b.x, b.y) !== null;

    if (!inCaptureZone) {
      if (b.x - r < innerMin) {
        b.x = innerMin + r;
        b.vx = Math.abs(b.vx) * wallRestitution;
      } else if (b.x + r > innerMax) {
        b.x = innerMax - r;
        b.vx = -Math.abs(b.vx) * wallRestitution;
      }

      if (b.y - r < innerMin) {
        b.y = innerMin + r;
        b.vy = Math.abs(b.vy) * wallRestitution;
      } else if (b.y + r > innerMax) {
        b.y = innerMax - r;
        b.vy = -Math.abs(b.vy) * wallRestitution;
      }
    }
  };

  const recordKeyframe = (f: number) => {
    const pieces = allBodies.map((b) => {
      const r = b.radius;
      const clampedX = b.pocketed ? b.x : Math.max(innerMin + r, Math.min(innerMax - r, b.x));
      const clampedY = b.pocketed ? b.y : Math.max(innerMin + r, Math.min(innerMax - r, b.y));
      return {
        id: b.id,
        x: Math.round(clampedX * 100) / 100,
        y: Math.round(clampedY * 100) / 100,
        pocketed: b.pocketed,
        pocketIndex: b.pocketIndex ?? null,
      };
    });
    keyframes.push({ frame: f, pieces });
  };

  // Record initial state at frame 0
  recordKeyframe(0);

  const processedPocketCoins = new Set<string>();

  let settledFrame = 0;
  for (let frame = 0; frame < steps; frame++) {
    let anyMoving = false;

    for (let sub = 0; sub < maxSubSteps; sub++) {
      // 1. Position integration & wall collision for active bodies
      for (const b of allBodies) {
        if (b.pocketed || (b.vx === 0 && b.vy === 0)) continue;

        b.x += b.vx * (subDt * 60);
        b.y += b.vy * (subDt * 60);

        resolveWall(b);

        // Friction
        b.vx *= frictionPerSubstep;
        b.vy *= frictionPerSubstep;

        if (Math.abs(b.vx) < 0.05) b.vx = 0;
        if (Math.abs(b.vy) < 0.05) b.vy = 0;

        if (b.vx !== 0 || b.vy !== 0) anyMoving = true;
      }

      // 2. Circle-circle collisions
      for (let i = 0; i < allBodies.length; i++) {
        for (let j = i + 1; j < allBodies.length; j++) {
          const b1 = allBodies[i];
          const b2 = allBodies[j];
          if (b1.pocketed || b2.pocketed) continue;

          const dx = b2.x - b1.x;
          const dy = b2.y - b1.y;
          const distanceSquared = dx * dx + dy * dy;
          const minDist = b1.radius + b2.radius;

          if (distanceSquared < minDist * minDist && distanceSquared > 0) {
            const dist = Math.sqrt(distanceSquared);
            const nx = dx / dist;
            const ny = dy / dist;

            const dvx = b1.vx - b2.vx;
            const dvy = b1.vy - b2.vy;
            const dvn = dvx * nx + dvy * ny;

            if (dvn > 0) {
              const restitution = (b1.isStriker || b2.isStriker) ? 0.90 : 0.82;
              const jImpulse = -(2 * b1.mass * b2.mass * dvn) / (b1.mass + b2.mass) * restitution;

              b1.vx += (jImpulse * nx) / b1.mass;
              b1.vy += (jImpulse * ny) / b1.mass;
              b2.vx -= (jImpulse * nx) / b2.mass;
              b2.vy -= (jImpulse * ny) / b2.mass;
            }

            const overlap = minDist - dist;
            const totalMass = b1.mass + b2.mass;
            b1.x -= nx * overlap * (b2.mass / totalMass);
            b1.y -= ny * overlap * (b2.mass / totalMass);
            b2.x += nx * overlap * (b1.mass / totalMass);
            b2.y += ny * overlap * (b1.mass / totalMass);

            // CRITICAL: Re-apply wall collision so overlap push cannot force pieces into or through cushions
            resolveWall(b1);
            resolveWall(b2);
          }
        }
      }

      // 3. Pocket collisions (strictly once per piece)
      for (let i = 0; i < allBodies.length; i++) {
        const b = allBodies[i];
        if (b.pocketed || processedPocketCoins.has(b.id)) continue;

        const pocketIdx = checkPocketCollision(b.x, b.y, b.vx, b.vy, b.radius);
        if (pocketIdx !== null) {
          processedPocketCoins.add(b.id);
          b.pocketed = true;
          b.pocketIndex = pocketIdx;
          b.vx = 0;
          b.vy = 0;

          if (b.isStriker) {
            striker.pocketed = true;
            striker.x = b.x;
            striker.y = b.y;
            striker.vx = 0;
            striker.vy = 0;
            pocketedStriker = true;
            events.push({
              id: `striker-pocketed-${pocketIdx}-${frame + 1}`,
              type: "striker-pocketed",
              coinId: "striker",
              coinType: "striker",
              pocketIndex: pocketIdx,
              frame: frame + 1,
            });
          } else if (b.coinObj) {
            b.coinObj.pocketed = true;
            b.coinObj.x = b.x;
            b.coinObj.y = b.y;
            b.coinObj.vx = 0;
            b.coinObj.vy = 0;
            pocketedCoins.push(b.coinObj);
            events.push({
              id: `coin-pocketed-${b.coinObj.id}-${pocketIdx}-${frame + 1}`,
              type: "coin-pocketed",
              coinId: b.coinObj.id,
              coinType: b.coinObj.type,
              pocketIndex: pocketIdx,
              frame: frame + 1,
            });
          }
        }
      }
    }

    if (anyMoving && frame % 2 === 0) {
      recordKeyframe(frame + 1);
    }

    if (!anyMoving) {
      settledFrame = frame + 1;
      break;
    }
  }

  // Record final settled keyframe
  recordKeyframe(settledFrame || steps);

  // Update final position & velocity on source objects (strictly constrained to legal board surface)
  for (const b of allBodies) {
    if (!b.pocketed) {
      const r = b.radius;
      b.x = Math.max(innerMin + r, Math.min(innerMax - r, b.x));
      b.y = Math.max(innerMin + r, Math.min(innerMax - r, b.y));
    }
    if (b.isStriker) {
      striker.x = b.x;
      striker.y = b.y;
      striker.vx = b.vx;
      striker.vy = b.vy;
    } else if (b.coinObj) {
      b.coinObj.x = b.x;
      b.coinObj.y = b.y;
      b.coinObj.vx = b.vx;
      b.coinObj.vy = b.vy;
    }
  }

  return { pocketedCoins, pocketedStriker, events, keyframes };
}

/**
 * Calculates the result of a shot for turn and score purposes.
 *
 * Turn table (per user spec):
 *   - Own coin pocketed                → extra turn (keep turn)
 *   - Only opponent coin pocketed       → no extra turn (opponent gets turn)
 *   - Striker pocketed                  → foul (handled in engine, not here)
 *   - Queen pocketed + own coin covered → extra turn + queen is covered
 *   - Queen pocketed alone              → extra turn to COVER it on the next shot;
 *                                         if the cover shot pockets no own coin the
 *                                         queen returns to the board (queenNeedsReturn)
 *   - Nothing pocketed                  → no extra turn (opponent gets turn)
 */
export function calculateScore(
  pocketedCoins: CarromCoin[],
  playerColor: CoinType,
  _queenAlreadyPocketed: boolean = false,
  _queenAlreadyCovered: boolean = false,
): {
  score: number;
  opponentScore: number;
  earnedExtraTurn: boolean;
  pocketedOwnColor: boolean;
  pocketedOpponentColor: boolean;
  pocketedQueenThisShot: boolean;
} {
  let score = 0;
  let opponentScore = 0;

  const pocketedQueenThisShot = pocketedCoins.some((c) => c.type === "queen");
  const ownCoinPocketedThisShot = pocketedCoins.some((c) => c.type === playerColor);
  const pocketedOpponentColor = pocketedCoins.some((c) => c.type !== playerColor && c.type !== "queen");

  for (const coin of pocketedCoins) {
    if (coin.type === playerColor) {
      score += 1;
    } else if (coin.type !== "queen") {
      opponentScore += 1;
    }
  }

  const earnedExtraTurn = ownCoinPocketedThisShot || pocketedQueenThisShot;

  return {
    score,
    opponentScore,
    earnedExtraTurn,
    pocketedOwnColor: ownCoinPocketedThisShot,
    pocketedOpponentColor,
    pocketedQueenThisShot,
  };
}

export function checkWinCondition(
  coins: CarromCoin[],
  players: { seat: number; color: CoinType; score: number; queenPocketed: boolean; queenCovered: boolean }[],
): { winner: number | null; isDraw: boolean } {
  if (!coins || coins.length === 0) {
    return { winner: null, isDraw: false };
  }

  const totalWhite = coins.filter((c) => c.type === "white").length;
  const totalBlack = coins.filter((c) => c.type === "black").length;

  // A match cannot be won if coins have not been loaded or initialized
  if (totalWhite < 9 || totalBlack < 9) {
    return { winner: null, isDraw: false };
  }

  const whiteCoinsRemaining = coins.filter((c) => !c.pocketed && c.type === "white").length;
  const blackCoinsRemaining = coins.filter((c) => !c.pocketed && c.type === "black").length;

  const player0 = players.find((p) => p.seat === 0);
  const player1 = players.find((p) => p.seat === 1);

  // Player 1 (seat 0, white) wins ONLY when whiteCoinsRemaining === 0 AND player0.queenCovered === true
  if (whiteCoinsRemaining === 0 && player0?.queenCovered === true) {
    return { winner: 0, isDraw: false };
  }

  // Player 2 (seat 1, black) wins ONLY when blackCoinsRemaining === 0 AND player1.queenCovered === true
  if (blackCoinsRemaining === 0 && player1?.queenCovered === true) {
    return { winner: 1, isDraw: false };
  }

  return { winner: null, isDraw: false };
}
