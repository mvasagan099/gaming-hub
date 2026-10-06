/** One logical playfield for the server, cannon, aim guide and solo renderer. */
export const BUBBLE_SHOOTER_GEOMETRY = {
  radius: 16,
  cols: 12,
  canvasWidth: 384,
  canvasHeight: 580,
  shooterX: 192,
  shooterY: 544,
  speed: 1200,
  shotStep: 1 / 240,
} as const;

export function bubbleGridX(row: number, col: number): number {
  const { radius } = BUBBLE_SHOOTER_GEOMETRY;
  return (Math.abs(row % 2) === 0 ? radius : radius * 2) + col * radius * 2;
}

export function bubbleGridY(row: number, topOffset: number): number {
  const { radius } = BUBBLE_SHOOTER_GEOMETRY;
  return radius + (row + topOffset) * radius * Math.sqrt(3);
}

/** Deterministic collision path; the client uses it only for presentation. */
export function traceBubbleShot(
  grid: ReadonlyArray<{ row: number; col: number }>, topOffset: number, angle: number,
) {
  const { radius, canvasWidth, shooterX, shooterY, speed, shotStep } = BUBBLE_SHOOTER_GEOMETRY;
  let x: number = shooterX;
  let y: number = shooterY;
  let vx = Math.cos(angle) * speed;
  const vy = Math.sin(angle) * speed;
  const points: { x: number; y: number }[] = [{ x, y }];
  for (let i = 0; i < 4000; i++) {
    x += vx * shotStep;
    y += vy * shotStep;
    if (x - radius < 0 || x + radius > canvasWidth) {
      x = Math.max(radius, Math.min(canvasWidth - radius, x));
      vx *= -1;
      points.push({ x, y });
    }
    if (y - radius < 0) { y = radius; break; }
    if (grid.some(b => Math.hypot(x - bubbleGridX(b.row, b.col), y - bubbleGridY(b.row, topOffset)) < radius * 2 - 2)) break;
  }
  points.push({ x, y });
  return { x, y, points };
}
