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
} from "./types";

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
  const radius = COIN_RADIUS * 2.5;

  const positions: { x: number; y: number }[] = [
    { x: centerX, y: centerY },
  ];

  const ring1Radius = radius;
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI * 2) / 6;
    positions.push({
      x: centerX + Math.cos(angle) * ring1Radius,
      y: centerY + Math.sin(angle) * ring1Radius,
    });
  }

  const ring2Radius = radius * 2;
  for (let i = 0; i < 12; i++) {
    const angle = (i * Math.PI * 2) / 12;
    positions.push({
      x: centerX + Math.cos(angle) * ring2Radius,
      y: centerY + Math.sin(angle) * ring2Radius,
    });
  }

  const types: CoinType[] = [
    "queen",
    "white", "white", "white", "white", "white", "white", "white", "white",
    "black", "black", "black", "black", "black", "black", "black", "black", "black",
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

export function createInitialStriker(): CarromStriker {
  return {
    x: CARROM_BOARD_WIDTH / 2,
    y: BASE_LINE_Y,
    vx: 0,
    vy: 0,
    placed: false,
    pocketed: false,
    placedBy: null,
  };
}

export function isValidStrikerPlacement(x: number, _seat: number): boolean {
  const margin = STRIKER_RADIUS + 5;
  return x >= BASE_LINE_X_START + margin && x <= BASE_LINE_X_END - margin;
}

export function checkPocketCollision(x: number, y: number, radius: number): number | null {
  for (let i = 0; i < POCKETS.length; i++) {
    const pocket = POCKETS[i];
    const dx = x - pocket.x;
    const dy = y - pocket.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance <= radius + POCKET_RADIUS * 0.7) {
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
  let newX = x;
  let newY = y;
  let newVx = vx;
  let newVy = vy;

  if (newX - radius <= 0) {
    newX = radius;
    newVx = Math.abs(newVx) * RESTITUTION;
  } else if (newX + radius >= CARROM_BOARD_WIDTH) {
    newX = CARROM_BOARD_WIDTH - radius;
    newVx = -Math.abs(newVx) * RESTITUTION;
  }

  if (newY - radius <= 0) {
    newY = radius;
    newVy = Math.abs(newVy) * RESTITUTION;
  } else if (newY + radius >= CARROM_BOARD_HEIGHT) {
    newY = CARROM_BOARD_HEIGHT - radius;
    newVy = -Math.abs(newVy) * RESTITUTION;
  }

  return { x: newX, y: newY, vx: newVx, vy: newVy };
}

export function checkCircleCollision(
  x1: number,
  y1: number,
  vx1: number,
  vy1: number,
  r1: number,
  m1: number,
  x2: number,
  y2: number,
  vx2: number,
  vy2: number,
  r2: number,
  m2: number,
): { x1: number; y1: number; vx1: number; vy1: number; x2: number; y2: number; vx2: number; vy2: number } | null {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const minDistance = r1 + r2;

  if (distance >= minDistance || distance === 0) return null;

  const nx = dx / distance;
  const ny = dy / distance;

  const dvx = vx1 - vx2;
  const dvy = vy1 - vy2;
  const dvn = dvx * nx + dvy * ny;

  if (dvn >= 0) return null;

  const restitution = m1 === STRIKER_MASS ? RESTITUTION : COIN_RESTITUTION;
  const impulse = (2 * m1 * m2 * dvn) / (m1 + m2) * restitution;

  const ix = impulse * nx;
  const iy = impulse * ny;

  let newVx1 = vx1 - ix / m1;
  let newVy1 = vy1 - iy / m1;
  let newVx2 = vx2 + ix / m2;
  let newVy2 = vy2 + iy / m2;

  const overlap = minDistance - distance;
  const totalMass = m1 + m2;
  let newX1 = x1 - nx * overlap * (m2 / totalMass);
  let newY1 = y1 - ny * overlap * (m2 / totalMass);
  let newX2 = x2 + nx * overlap * (m1 / totalMass);
  let newY2 = y2 + ny * overlap * (m1 / totalMass);

  return {
    x1: newX1,
    y1: newY1,
    vx1: newVx1,
    vy1: newVy1,
    x2: newX2,
    y2: newY2,
    vx2: newVx2,
    vy2: newVy2,
  };
}

export function applyFriction(vx: number, vy: number, dt: number = 1): { vx: number; vy: number } {
  const speed = Math.sqrt(vx * vx + vy * vy);
  if (speed < MIN_VELOCITY) return { vx: 0, vy: 0 };

  const newSpeed = speed * Math.pow(FRICTION, dt);
  if (newSpeed < MIN_VELOCITY) return { vx: 0, vy: 0 };

  const ratio = newSpeed / speed;
  return { vx: vx * ratio, vy: vy * ratio };
}

export function simulatePhysics(
  coins: CarromCoin[],
  striker: CarromStriker,
  dt: number = 1 / 60,
  steps: number = 60,
): { pocketedCoins: CarromCoin[]; pocketedStriker: boolean; events: any[] } {
  const events: any[] = [];
  let pocketedStriker = false;
  const pocketedCoins: CarromCoin[] = [];

  for (let step = 0; step < steps; step++) {
    let allStopped = true;

    if (!striker.pocketed && (striker.vx !== 0 || striker.vy !== 0)) {
      allStopped = false;
      striker.x += striker.vx * dt;
      striker.y += striker.vy * dt;

      const wallResult = checkWallCollision(striker.x, striker.y, striker.vx, striker.vy, STRIKER_RADIUS);
      striker.x = wallResult.x;
      striker.y = wallResult.y;
      striker.vx = wallResult.vx;
      striker.vy = wallResult.vy;

      const pocketIndex = checkPocketCollision(striker.x, striker.y, STRIKER_RADIUS);
      if (pocketIndex !== null) {
        striker.pocketed = true;
        striker.vx = 0;
        striker.vy = 0;
        pocketedStriker = true;
        events.push({ type: "striker-pocketed", pocketIndex });
        continue;
      }

      const friction = applyFriction(striker.vx, striker.vy, dt);
      striker.vx = friction.vx;
      striker.vy = friction.vy;
    }

    for (const coin of coins) {
      if (coin.pocketed || (coin.vx === 0 && coin.vy === 0)) continue;
      allStopped = false;

      coin.x += coin.vx * dt;
      coin.y += coin.vy * dt;

      const wallResult = checkWallCollision(coin.x, coin.y, coin.vx, coin.vy, COIN_RADIUS);
      coin.x = wallResult.x;
      coin.y = wallResult.y;
      coin.vx = wallResult.vx;
      coin.vy = wallResult.vy;

      const pocketIndex = checkPocketCollision(coin.x, coin.y, COIN_RADIUS);
      if (pocketIndex !== null) {
        coin.pocketed = true;
        coin.vx = 0;
        coin.vy = 0;
        pocketedCoins.push(coin);
        events.push({ type: "coin-pocketed", coinId: coin.id, coinType: coin.type, pocketIndex });
        continue;
      }

      const friction = applyFriction(coin.vx, coin.vy, dt);
      coin.vx = friction.vx;
      coin.vy = friction.vy;
    }

    for (let i = 0; i < coins.length; i++) {
      if (coins[i].pocketed) continue;
      for (let j = i + 1; j < coins.length; j++) {
        if (coins[j].pocketed) continue;
        const collision = checkCircleCollision(
          coins[i].x, coins[i].y, coins[i].vx, coins[i].vy, COIN_RADIUS, COIN_MASS,
          coins[j].x, coins[j].y, coins[j].vx, coins[j].vy, COIN_RADIUS, COIN_MASS,
        );
        if (collision) {
          coins[i].x = collision.x1;
          coins[i].y = collision.y1;
          coins[i].vx = collision.vx1;
          coins[i].vy = collision.vy1;
          coins[j].x = collision.x2;
          coins[j].y = collision.y2;
          coins[j].vx = collision.vx2;
          coins[j].vy = collision.vy2;
        }
      }
    }

    if (!striker.pocketed && (striker.vx !== 0 || striker.vy !== 0)) {
      for (const coin of coins) {
        if (coin.pocketed) continue;
        const collision = checkCircleCollision(
          striker.x, striker.y, striker.vx, striker.vy, STRIKER_RADIUS, STRIKER_MASS,
          coin.x, coin.y, coin.vx, coin.vy, COIN_RADIUS, COIN_MASS,
        );
        if (collision) {
          striker.x = collision.x1;
          striker.y = collision.y1;
          striker.vx = collision.vx1;
          striker.vy = collision.vy1;
          coin.x = collision.x2;
          coin.y = collision.y2;
          coin.vx = collision.vx2;
          coin.vy = collision.vy2;
        }
      }
    }

    if (allStopped) break;
  }

  return { pocketedCoins, pocketedStriker, events };
}

export function calculateScore(
  pocketedCoins: CarromCoin[],
  playerColor: CoinType,
  queenPocketed: boolean,
  queenCovered: boolean,
): { score: number; queenPocketed: boolean; queenCovered: boolean } {
  let score = 0;
  let newQueenPocketed = queenPocketed;
  let newQueenCovered = queenCovered;

  for (const coin of pocketedCoins) {
    if (coin.type === "queen") {
      newQueenPocketed = true;
      score += 3;
    } else if (coin.type === playerColor) {
      score += 1;
      if (newQueenPocketed && !newQueenCovered) {
        newQueenCovered = true;
        score += 3;
      }
    } else {
      score += 1;
    }
  }

  return { score, queenPocketed: newQueenPocketed, queenCovered: newQueenCovered };
}

export function checkWinCondition(
  coins: CarromCoin[],
  players: { seat: number; color: CoinType; score: number; queenPocketed: boolean; queenCovered: boolean }[],
): { winner: number | null; isDraw: boolean } {
  const whiteCoins = coins.filter(c => !c.pocketed && c.type === "white").length;
  const blackCoins = coins.filter(c => !c.pocketed && c.type === "black").length;
  const queenOnBoard = coins.some(c => !c.pocketed && c.type === "queen");

  if (whiteCoins === 0 && blackCoins === 0 && !queenOnBoard) {
    if (players[0].score > players[1].score) return { winner: 0, isDraw: false };
    if (players[1].score > players[0].score) return { winner: 1, isDraw: false };
    return { winner: null, isDraw: true };
  }

  if (whiteCoins === 0 && !queenOnBoard) {
    return { winner: 1, isDraw: false };
  }
  if (blackCoins === 0 && !queenOnBoard) {
    return { winner: 0, isDraw: false };
  }

  return { winner: null, isDraw: false };
}