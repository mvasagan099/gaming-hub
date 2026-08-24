import {
  SNOOKER_BALL_RADIUS,
  SNOOKER_TABLE_WIDTH,
  SNOOKER_PLAYABLE_LEFT,
  SNOOKER_PLAYABLE_RIGHT,
  SNOOKER_PLAYABLE_TOP,
  SNOOKER_PLAYABLE_BOTTOM,
  type SnookerBall,
} from "@gaming-hub/game-engine";
import { SNOOKER_VISUAL_CONFIG } from "../constants/SnookerVisualConfig";

export class SnookerCueRenderer {
  public static drawAimGuide(
    ctx: CanvasRenderingContext2D,
    cueBall: SnookerBall,
    balls: SnookerBall[],
    angle: number,
    tableWidth: number
  ): void {
    const scale = tableWidth / SNOOKER_TABLE_WIDTH;
    const cx = cueBall.x * scale;
    const cy = cueBall.y * scale;
    const r = SNOOKER_BALL_RADIUS * scale;
    const { aimGuide } = SNOOKER_VISUAL_CONFIG;

    // Raycast forward along angle to find first obstacle (ball or cushion)
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);

    let closestDist = 9999;
    let hitBall: SnookerBall | null = null;

    // 1. Raycast against object balls
    for (const b of balls) {
      if (b.type === "cue" || b.pocketed) continue;

      const bx = b.x * scale;
      const by = b.y * scale;

      const toBallX = bx - cx;
      const toBallY = by - cy;

      const proj = toBallX * dirX + toBallY * dirY;
      if (proj <= 0) continue; // Behind cue ball

      const perpX = toBallX - proj * dirX;
      const perpY = toBallY - proj * dirY;
      const perpDist = Math.hypot(perpX, perpY);

      const hitRadius = r * 2;
      if (perpDist < hitRadius) {
        const offset = Math.sqrt(hitRadius * hitRadius - perpDist * perpDist);
        const dist = proj - offset;

        if (dist > 0 && dist < closestDist) {
          closestDist = dist;
          hitBall = b;
        }
      }
    }

    // 2. Raycast against cushions if no closer ball hit
    if (closestDist === 9999) {
      const left = SNOOKER_PLAYABLE_LEFT * scale;
      const right = SNOOKER_PLAYABLE_RIGHT * scale;
      const top = SNOOKER_PLAYABLE_TOP * scale;
      const bottom = SNOOKER_PLAYABLE_BOTTOM * scale;

      let dX = 9999;
      let dY = 9999;

      if (dirX > 0) dX = (right - cx) / dirX;
      else if (dirX < 0) dX = (left - cx) / dirX;

      if (dirY > 0) dY = (bottom - cy) / dirY;
      else if (dirY < 0) dY = (top - cy) / dirY;

      closestDist = Math.min(dX, dY);
    }

    const impactX = cx + dirX * closestDist;
    const impactY = cy + dirY * closestDist;

    ctx.save();

    // Draw Laser Aim Line
    ctx.strokeStyle = aimGuide.primaryColor;
    ctx.lineWidth = 1.5 * scale;
    ctx.setLineDash([6 * scale, 4 * scale]);
    ctx.beginPath();
    ctx.moveTo(cx + dirX * r, cy + dirY * r);
    ctx.lineTo(impactX, impactY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw Ghost Ball at Impact Point
    ctx.strokeStyle = aimGuide.ghostBallBorder;
    ctx.fillStyle = aimGuide.ghostBallColor;
    ctx.lineWidth = 1.5 * scale;
    ctx.beginPath();
    ctx.arc(impactX, impactY, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // If hitting an object ball, draw the predicted target ball deflection path
    if (hitBall) {
      const bx = hitBall.x * scale;
      const by = hitBall.y * scale;
      const normalX = bx - impactX;
      const normalY = by - impactY;
      const normalDist = Math.hypot(normalX, normalY);

      if (normalDist > 0.01) {
        const nx = normalX / normalDist;
        const ny = normalY / normalDist;

        ctx.strokeStyle = aimGuide.targetBallLine;
        ctx.lineWidth = 2 * scale;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + nx * 60 * scale, by + ny * 60 * scale);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  public static drawCue(
    ctx: CanvasRenderingContext2D,
    cueBall: SnookerBall,
    angle: number,
    power: number,
    tableWidth: number
  ): void {
    const scale = tableWidth / SNOOKER_TABLE_WIDTH;
    const cx = cueBall.x * scale;
    const cy = cueBall.y * scale;
    const r = SNOOKER_BALL_RADIUS * scale;
    const { cueStick } = SNOOKER_VISUAL_CONFIG;

    // Pullback offset based on normalized power (0 to 1)
    const pullback = (14 + power * 55) * scale;
    const cueLength = 260 * scale;
    const tipWidth = 4.0 * scale;
    const buttWidth = 9.5 * scale;

    ctx.save();
    ctx.translate(cx, cy);
    // Rotate opposite to shot angle
    ctx.rotate(angle + Math.PI);

    // ── 1. Cue Stick Drop Shadow ─────────────────────────────────────────────
    ctx.save();
    ctx.shadowColor = cueStick.shadowColor;
    ctx.shadowBlur = 10 * scale;
    ctx.shadowOffsetY = 6 * scale;

    ctx.fillStyle = cueStick.woodBase;
    ctx.beginPath();
    ctx.moveTo(r + pullback, -tipWidth / 2);
    ctx.lineTo(r + pullback + cueLength, -buttWidth / 2);
    ctx.lineTo(r + pullback + cueLength, buttWidth / 2);
    ctx.lineTo(r + pullback, tipWidth / 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // ── 2. Ash Wood Shaft Gradient ───────────────────────────────────────────
    const shaftGrad = ctx.createLinearGradient(0, -buttWidth / 2, 0, buttWidth / 2);
    shaftGrad.addColorStop(0, "#fef3c7");
    shaftGrad.addColorStop(0.35, cueStick.woodBase);
    shaftGrad.addColorStop(0.85, cueStick.woodGrain);
    shaftGrad.addColorStop(1, "#78350f");

    ctx.fillStyle = shaftGrad;
    ctx.beginPath();
    ctx.moveTo(r + pullback, -tipWidth / 2);
    ctx.lineTo(r + pullback + cueLength, -buttWidth / 2);
    ctx.lineTo(r + pullback + cueLength, buttWidth / 2);
    ctx.lineTo(r + pullback, tipWidth / 2);
    ctx.closePath();
    ctx.fill();

    // ── 3. Ebony Butt Section ────────────────────────────────────────────────
    const wrapStart = r + pullback + cueLength * 0.6;
    const wrapEnd = r + pullback + cueLength * 0.98;
    ctx.fillStyle = cueStick.ebonyButt;
    ctx.beginPath();
    ctx.moveTo(wrapStart, -buttWidth * 0.4);
    ctx.lineTo(wrapEnd, -buttWidth * 0.49);
    ctx.lineTo(wrapEnd, buttWidth * 0.49);
    ctx.lineTo(wrapStart, buttWidth * 0.4);
    ctx.closePath();
    ctx.fill();

    // ── 4. Brass Ferrule & Blue Chalked Tip ───────────────────────────────────
    // Brass Ferrule
    ctx.fillStyle = cueStick.ferruleColor;
    ctx.fillRect(r + pullback, -tipWidth / 2, 5 * scale, tipWidth);

    // Chalked Tip
    ctx.fillStyle = cueStick.tipColor;
    ctx.beginPath();
    ctx.arc(r + pullback, 0, tipWidth / 2, Math.PI / 2, (3 * Math.PI) / 2);
    ctx.fill();

    ctx.restore();
  }
}
