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
