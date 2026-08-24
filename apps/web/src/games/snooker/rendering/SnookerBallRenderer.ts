import {
  SNOOKER_BALL_RADIUS,
  SNOOKER_TABLE_WIDTH,
  type SnookerBall,
} from "@gaming-hub/game-engine";

export class SnookerBallRenderer {
  public static drawBall(
    ctx: CanvasRenderingContext2D,
    ball: SnookerBall,
    tableWidth: number,
    isTargetOn = false
  ): void {
    if (ball.pocketed) return;

    const scale = tableWidth / SNOOKER_TABLE_WIDTH;
    const x = ball.x * scale;
    const y = ball.y * scale;
    const r = SNOOKER_BALL_RADIUS * scale;

    ctx.save();

    // ── 1. Ground Drop Shadow ────────────────────────────────────────────────
    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.42)";
    ctx.beginPath();
    ctx.ellipse(x + 1.2 * scale, y + 2.0 * scale, r * 1.05, r * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // ── 2. Legal Target Ball Aura Glow ───────────────────────────────────────
    if (isTargetOn) {
      ctx.save();
      ctx.shadowColor = "#38bdf8";
      ctx.shadowBlur = 10 * scale;
      ctx.strokeStyle = "rgba(56, 189, 248, 0.9)";
      ctx.lineWidth = 1.8 * scale;
      ctx.beginPath();
      ctx.arc(x, y, r + 1.5 * scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // ── 3. Base Ball Sphere (3D Shading) ─────────────────────────────────────
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.clip();

    const sphereGrad = ctx.createRadialGradient(
      x - r * 0.35,
      y - r * 0.35,
      r * 0.1,
      x,
      y,
      r
    );

    if (ball.type === "cue") {
      sphereGrad.addColorStop(0, "#ffffff");
      sphereGrad.addColorStop(0.65, "#f1f5f9");
      sphereGrad.addColorStop(1, "#94a3b8");
    } else if (ball.type === "black") {
      sphereGrad.addColorStop(0, "#3f3f46");
      sphereGrad.addColorStop(0.5, "#18181b");
      sphereGrad.addColorStop(1, "#000000");
    } else {
      sphereGrad.addColorStop(0, "#ffffff");
      sphereGrad.addColorStop(0.28, ball.color);
      sphereGrad.addColorStop(0.85, ball.color);
      sphereGrad.addColorStop(1, "#000000");
    }

    ctx.fillStyle = sphereGrad;
    ctx.fill();

    // ── 4. Specular Highlight Glare ──────────────────────────────────────────
    const specGrad = ctx.createRadialGradient(
      x - r * 0.38,
      y - r * 0.38,
      0,
      x - r * 0.38,
      y - r * 0.38,
      r * 0.45
    );
    specGrad.addColorStop(0, "rgba(255, 255, 255, 0.85)");
    specGrad.addColorStop(0.5, "rgba(255, 255, 255, 0.25)");
    specGrad.addColorStop(1, "rgba(255, 255, 255, 0)");

    ctx.fillStyle = specGrad;
    ctx.beginPath();
    ctx.arc(x - r * 0.38, y - r * 0.38, r * 0.45, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore(); // Restore clip

    ctx.restore();
  }
}
