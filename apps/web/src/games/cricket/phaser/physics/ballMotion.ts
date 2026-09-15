/** Bound catch-up after a stalled frame, and keep fast deliveries collision-safe. */
export function simulationSteps(deltaMs: number): { steps: number; dt: number } {
  const seconds = Number.isFinite(deltaMs) ? Math.min(0.1, Math.max(0, deltaMs / 1000)) : 0;
  const steps = Math.ceil(seconds * 240);
  return { steps, dt: steps ? seconds / steps : 0 };
}

/** Preserve the original 60 Hz drag at any refresh rate. */
export function shotDrag(height: number, dt: number): number {
  return Math.pow((height <= 5 ? 0.3 : 0.8) * Math.pow(0.985, 60), dt);
}

/** Fraction along a swept segment at which it crosses a depth plane. */
export function planeCrossing(from: number, to: number, plane: number): number | null {
  if (from === to) return null;
  const fraction = (plane - from) / (to - from);
  return fraction >= 0 && fraction <= 1 ? fraction : null;
}

/** Positive before contact in either camera orientation. */
export function contactDistance(depth: number, sweetSpot: number, velocityY: number): number {
  return (sweetSpot - depth) * Math.sign(velocityY);
}

/** Buffer only taps within 60ms of the outer contact region, never late taps. */
export function shotBufferDelay(distance: number, speed: number): number | null {
  if (distance <= 140 || speed <= 0) return null;
  const delay = (distance - 140) / speed;
  return delay <= 0.06 ? delay : null;
}

/** Predict a short intercept using the same drag, gravity and bounce as a hit. */
export function predictShot(x: number, depth: number, height: number, vx: number, vy: number, vz: number, seconds: number) {
  const steps = Math.ceil(Math.max(0, Math.min(seconds, 0.5)) * 120);
  const dt = steps ? Math.min(seconds, 0.5) / steps : 0;
  for (let i = 0; i < steps; i++) {
    const drag = shotDrag(height, dt);
    vx *= drag;
    vy *= drag;
    x += vx * dt;
    depth += vy * dt;
    vz -= 600 * dt;
    height += vz * dt;
    if (height < 0) {
      height = 0;
      vz = Math.abs(vz) > 30 ? Math.abs(vz) * 0.4 : 0;
    }
  }
  return { x, depth };
}
