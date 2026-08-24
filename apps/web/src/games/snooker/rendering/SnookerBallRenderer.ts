import {
  SNOOKER_BALL_RADIUS,
  SNOOKER_TABLE_WIDTH,
  type SnookerBall,
} from "@gaming-hub/game-engine";
import { Snooker3DCamera } from "./Snooker3DCamera";

export class SnookerBallRenderer {
  public static drawBall(
    ctx: CanvasRenderingContext2D,
    ball: SnookerBall,
    tableWidth: number,
    _isTargetOn = false,
    is3D = true,
    tableHeight = tableWidth / 2
  ): void {
    // Potted balls are dropped inside the leather net box below the table bed
    if (ball.pocketed) return;

    const baseScale = tableWidth / SNOOKER_TABLE_WIDTH;
    const rawX = ball.x * baseScale;
    const rawY = ball.y * baseScale;

    // 3D Perspective Projection
    const proj = Snooker3DCamera.project(rawX, rawY, tableWidth, tableHeight, is3D);
    const x = proj.x;
    const y = proj.y;
    const r = SNOOKER_BALL_RADIUS * baseScale * (is3D ? proj.scale : 1.0);

    ctx.save();

    // ── 1. Ground Drop Shadow (Directional 3D Soft Shadow) ─────────────────
    ctx.fillStyle = "rgba(0, 0, 0, 0.48)";
    ctx.beginPath();
    ctx.ellipse(
      x + 1.4 * baseScale * proj.scale,
      y + (is3D ? 2.8 : 2.0) * baseScale * proj.scale,
      r * 1.08,
      r * (is3D ? 0.65 : 0.7),
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();

    // ── 2. Base Ball Sphere (Realistic 3D Phenolic Resin Shading) ─────────────
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);

    const sphereGrad = ctx.createRadialGradient(
      x - r * 0.35,
      y - r * 0.35,
      r * 0.08,
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
      sphereGrad.addColorStop(0.25, ball.color);
      sphereGrad.addColorStop(0.85, ball.color);
      sphereGrad.addColorStop(1, "#000000");
    }

    ctx.fillStyle = sphereGrad;
    ctx.fill();

    // ── 3. High-Gloss Specular Glare (Overhead Stadium Spotlight) ──────────
    const specGrad = ctx.createRadialGradient(
      x - r * 0.38,
      y - r * 0.38,
      0,
      x - r * 0.38,
      y - r * 0.38,
      r * 0.48
    );
    specGrad.addColorStop(0, "rgba(255, 255, 255, 0.88)");
    specGrad.addColorStop(0.45, "rgba(255, 255, 255, 0.28)");
    specGrad.addColorStop(1, "rgba(255, 255, 255, 0)");

    ctx.fillStyle = specGrad;
    ctx.beginPath();
    ctx.arc(x - r * 0.38, y - r * 0.38, r * 0.48, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}
