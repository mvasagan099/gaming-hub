/** Aim at an inset point on the far baseline, keeping normal shots on the table. */
export function tableTennisShot(
  x: number, y: number, direction: 1 | -1, speed: number, desiredSlope: number,
): { vx: number; vy: number } {
  const distance = Math.max(1, direction === 1 ? 600 - x : x);
  let targetY = Math.max(28, Math.min(372, y + desiredSlope * distance));
  // Clamping an outward return to the same edge can erase all lateral motion.
  // Keep a modest angle, turning inward when that angle would leave the table.
  const minimumTravel = 40;
  if (Math.abs(targetY - y) < minimumTravel) {
    const lateralDirection = Math.sign(desiredSlope) || (y <= 200 ? 1 : -1);
    const angledTarget = y + lateralDirection * minimumTravel;
    targetY = angledTarget >= 28 && angledTarget <= 372
      ? angledTarget : y + (y <= 200 ? 1 : -1) * minimumTravel;
  }
  const slope = (targetY - y) / distance;
  const vx = direction * speed / Math.hypot(1, slope);
  return { vx, vy: Math.abs(vx) * slope };
}

export const NET_X = 300;
export const NET_HEIGHT = 34;
export const PADDLE_CONTACT_Z = 32;
export const TABLE_SURFACE_Z = 0;
export const TT_GRAVITY = 0.08;
export const GRAVITY = TT_GRAVITY;
export const BOUNCE_RESTITUTION = 0.78;

/**
 * Computes launch vertical velocity (vz) for a rally shot such that:
 * 1. The ball ascends towards the net and clears net height (NET_HEIGHT + margin).
 * 2. The ball does NOT bounce on the shooter's side.
 * 3. The ball lands and bounces first on the opponent's side of the table.
 */
export function computeRallyLaunchVz(x0: number, vx: number, direction: 1 | -1, speed: number): number {
  const distToNet = Math.max(1, direction === 1 ? NET_X - x0 : x0 - NET_X);
  const tNet = distToNet / Math.max(0.1, Math.abs(vx));
  const targetNetZ = Math.min(56, Math.max(46, 48 + (speed - 5.0) * 1.2));
  let vz = (targetNetZ - PADDLE_CONTACT_Z + 0.5 * GRAVITY * tNet * (tNet + 1)) / tNet;

  // Discrete trajectory landing estimation:
  // z(t) = PADDLE_CONTACT_Z + vz * t - 0.5 * GRAVITY * t * (t + 1) = 0
  const b = 0.5 * GRAVITY - vz;
  const disc = b * b + 2 * GRAVITY * PADDLE_CONTACT_Z;
  const tLand = (-b + Math.sqrt(Math.max(0, disc))) / GRAVITY;
  const xLand = x0 + direction * Math.abs(vx) * tLand;

  const maxLandingX = 520;
  const minLandingX = 80;

  if (direction === 1 && xLand > maxLandingX) {
    const tLandMax = (maxLandingX - x0) / Math.max(0.1, Math.abs(vx));
    const vzAdjusted = (0.5 * GRAVITY * tLandMax * (tLandMax + 1) - PADDLE_CONTACT_Z) / tLandMax;
    const zAtNet = PADDLE_CONTACT_Z + vzAdjusted * tNet - 0.5 * GRAVITY * tNet * (tNet + 1);
    if (zAtNet >= NET_HEIGHT + 1.5) {
      vz = vzAdjusted;
    }
  } else if (direction === -1 && xLand < minLandingX) {
    const tLandMax = (x0 - minLandingX) / Math.max(0.1, Math.abs(vx));
    const vzAdjusted = (0.5 * GRAVITY * tLandMax * (tLandMax + 1) - PADDLE_CONTACT_Z) / tLandMax;
    const zAtNet = PADDLE_CONTACT_Z + vzAdjusted * tNet - 0.5 * GRAVITY * tNet * (tNet + 1);
    if (zAtNet >= NET_HEIGHT + 1.5) {
      vz = vzAdjusted;
    }
  }

  return vz;
}

/**
 * Computes launch vertical velocity (vz) for a legal serve:
 * Lands on the server's own court first (~110px forward from paddle) before bouncing up and crossing the net.
 */
export function computeServeLaunchVz(x0: number, vx: number, direction: 1 | -1): number {
  const firstBounceDist = 110;
  const t1 = firstBounceDist / Math.max(0.1, Math.abs(vx));
  return (0.5 * GRAVITY * t1 * (t1 + 1) - PADDLE_CONTACT_Z) / t1;
}

