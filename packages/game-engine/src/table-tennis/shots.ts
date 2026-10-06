/** Aim at an inset point on the far baseline, keeping normal shots on the table. */
export function tableTennisShot(
  x: number, y: number, direction: 1 | -1, speed: number, desiredSlope: number,
): { vx: number; vy: number } {
  const distance = Math.max(1, direction === 1 ? 600 - x : x);
  const targetY = Math.max(28, Math.min(372, y + desiredSlope * distance));
  const slope = (targetY - y) / distance;
  const vx = direction * speed / Math.hypot(1, slope);
  return { vx, vy: Math.abs(vx) * slope };
}
