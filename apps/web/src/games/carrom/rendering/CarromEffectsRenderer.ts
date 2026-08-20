export interface PowderParticle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  color: string;
}

export interface FloatingPop {
  id: number;
  text: string;
  color: string;
  x: number;
  y: number;
  alpha: number;
  scale: number;
}

export interface Ripple {
  id: number;
  x: number;
  y: number;
  r: number;
  maxR: number;
  alpha: number;
  color: string;
}

export class CarromEffectsRenderer {
  /**
   * Draw the aiming guide line, collision ghost striker, and dynamic power arc.
   */
  public static drawAimGuide(
    ctx: CanvasRenderingContext2D,
    striker: { x: number; y: number; radius: number },
    dragAim: { sx: number; sy: number; ex: number; ey: number; power: number },
    coins: Array<{ x: number; y: number; radius: number; active: boolean; pocketing?: unknown; type: string }>
  ): void {
    const { sx, sy, ex, ey, power } = dragAim;
    const dx = sx - ex;
    const dy = sy - ey;
    const pullDist = Math.hypot(dx, dy);
    if (pullDist <= 5) return;

    const dirX = dx / pullDist;
    const dirY = dy / pullDist;

    let lineEndX = striker.x + dirX * 380;
    let lineEndY = striker.y + dirY * 380;
    let hitCoin: { x: number; y: number; radius: number } | null = null;
    let hitGhostX = 0, hitGhostY = 0;

    // Raycast against all active coins on the board
    for (const c of coins) {
      if (c.type === "striker" || !c.active || c.pocketing) continue;
      const combR = striker.radius + c.radius;
      const vx = c.x - striker.x;
      const vy = c.y - striker.y;
      const t = vx * dirX + vy * dirY;
      if (t <= 0) continue;
      const perpSq = vx * vx + vy * vy - t * t;
      if (perpSq >= combR * combR) continue;
      const d = t - Math.sqrt(combR * combR - perpSq);
      const gx = striker.x + dirX * d;
      const gy = striker.y + dirY * d;
      if (d > 0 && d < Math.hypot(lineEndX - striker.x, lineEndY - striker.y)) {
        lineEndX = gx;
        lineEndY = gy;
        hitCoin = c;
        hitGhostX = gx;
        hitGhostY = gy;
      }
    }

    ctx.save();
    // Color gradient based on power: Cyan (low) -> Amber (mid) -> Crimson (max)
    const rCol = Math.round(56 + power * 190);
    const gCol = Math.round(189 - power * 120);
    const bCol = Math.round(248 - power * 180);
    const lineStyleStr = `rgba(${rCol}, ${gCol}, ${bCol}, 0.95)`;

    // 1. Dotted Trajectory Line
    ctx.strokeStyle = lineStyleStr;
    ctx.lineWidth = 2.0;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(striker.x, striker.y);
    ctx.lineTo(lineEndX, lineEndY);
    ctx.stroke();
    ctx.setLineDash([]);

    // 2. Ghost Striker Preview at Collision Point
    if (hitCoin) {
      ctx.strokeStyle = "rgba(56, 189, 248, 0.75)";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(hitGhostX, hitGhostY, striker.radius, 0, Math.PI * 2);
      ctx.stroke();

      // Ghost Center Crosshair
      ctx.beginPath();
      ctx.moveTo(hitGhostX - 4, hitGhostY);
      ctx.lineTo(hitGhostX + 4, hitGhostY);
      ctx.moveTo(hitGhostX, hitGhostY - 4);
      ctx.lineTo(hitGhostX, hitGhostY + 4);
      ctx.stroke();

      // Deflection trajectory arrow from hit coin
      const impactDx = hitCoin.x - hitGhostX;
      const impactDy = hitCoin.y - hitGhostY;
      const impactDist = Math.hypot(impactDx, impactDy);
      if (impactDist > 0.1) {
        const impactDirX = impactDx / impactDist;
        const impactDirY = impactDy / impactDist;
        ctx.strokeStyle = "rgba(250, 204, 21, 0.85)";
        ctx.lineWidth = 1.8;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(hitCoin.x, hitCoin.y);
        ctx.lineTo(hitCoin.x + impactDirX * 45, hitCoin.y + impactDirY * 45);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // 3. Dynamic Circular Power Arc around Striker
    const arcRadius = striker.radius + 7;
    ctx.strokeStyle = lineStyleStr;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    const aimAngle = Math.atan2(dirY, dirX);
    ctx.arc(striker.x, striker.y, arcRadius, aimAngle - Math.PI * 0.35 * power, aimAngle + Math.PI * 0.35 * power);
    ctx.stroke();

    ctx.restore();
  }

  /**
   * Draw powder dust particles on canvas.
   */
  public static drawParticles(ctx: CanvasRenderingContext2D, particles: PowderParticle[]): void {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.94;
      p.vy *= 0.94;
      p.alpha -= 0.04;
      if (p.alpha <= 0) {
        particles.splice(i, 1);
        continue;
      }
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  /**
   * Draw pocket ripples on canvas.
   */
  public static drawRipples(ctx: CanvasRenderingContext2D, ripples: Ripple[]): void {
    for (let i = ripples.length - 1; i >= 0; i--) {
      const rip = ripples[i];
      rip.r += 1.2;
      rip.alpha -= 0.035;
      if (rip.alpha <= 0 || rip.r >= rip.maxR) {
        ripples.splice(i, 1);
        continue;
      }
      ctx.save();
      ctx.strokeStyle = rip.color;
      ctx.globalAlpha = Math.max(0, rip.alpha);
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(rip.x, rip.y, rip.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
}
