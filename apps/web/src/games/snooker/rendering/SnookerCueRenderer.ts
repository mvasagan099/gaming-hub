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
import { Snooker3DCamera } from "./Snooker3DCamera";

export class SnookerCueRenderer {
  public static drawAimGuide(
    ctx: CanvasRenderingContext2D,
    cueBall: SnookerBall,
    balls: SnookerBall[],
    angle: number,
    tableWidth: number,
    is3D = true,
    tableHeight = tableWidth / 2
  ): void {
    const scale = tableWidth / SNOOKER_TABLE_WIDTH;
    const rawCx = cueBall.x * scale;
    const rawCy = cueBall.y * scale;
    const r = SNOOKER_BALL_RADIUS * scale;
    const { aimGuide } = SNOOKER_VISUAL_CONFIG;

    // Raycast forward along angle in 2D space to find exact impact point
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);

    let closestDist = 9999;
    let hitBall: SnookerBall | null = null;

    // 1. Raycast against object balls
    for (const b of balls) {
      if (b.type === "cue" || b.pocketed) continue;

      const bx = b.x * scale;
      const by = b.y * scale;

      const toBallX = bx - rawCx;
      const toBallY = by - rawCy;

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

      if (dirX > 0) dX = (right - rawCx) / dirX;
      else if (dirX < 0) dX = (left - rawCx) / dirX;

      if (dirY > 0) dY = (bottom - rawCy) / dirY;
      else if (dirY < 0) dY = (top - rawCy) / dirY;

      closestDist = Math.min(dX, dY);
    }

    const rawImpactX = rawCx + dirX * closestDist;
    const rawImpactY = rawCy + dirY * closestDist;

    // Project cue ball and impact point to 3D space
    const projCue = Snooker3DCamera.project(rawCx, rawCy, tableWidth, tableHeight, is3D);
    const projImpact = Snooker3DCamera.project(rawImpactX, rawImpactY, tableWidth, tableHeight, is3D);

    ctx.save();

    // ── 1. Laser Aim Line (Primary Cue Ball Trajectory) ────────────────────
    ctx.strokeStyle = aimGuide.primaryColor;
    ctx.lineWidth = 1.6 * scale * projCue.scale;
    ctx.setLineDash([6 * scale, 4 * scale]);
    ctx.beginPath();
    ctx.moveTo(projCue.x + dirX * r * projCue.scale, projCue.y + dirY * r * projCue.scale);
    ctx.lineTo(projImpact.x, projImpact.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // ── 2. Ghost Ball at Point of Impact ──────────────────────────────────
    ctx.strokeStyle = aimGuide.ghostBallBorder;
    ctx.fillStyle = aimGuide.ghostBallColor;
    ctx.lineWidth = 1.5 * scale * projImpact.scale;
    ctx.beginPath();
    ctx.arc(projImpact.x, projImpact.y, r * projImpact.scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // ── 3. Realistic Collision Trajectories (Object Ball & Cue Deflection) ──
    if (hitBall) {
      const hx = hitBall.x * scale;
      const hy = hitBall.y * scale;

      // Normal vector from Cue Ball impact center to Object Ball center
      let nX = hx - rawImpactX;
      let nY = hy - rawImpactY;
      const nLen = Math.hypot(nX, nY);

      if (nLen > 0) {
        nX /= nLen;
        nY /= nLen;

        // A. Object Ball Target Path (Gold Dashed Line extending from Object Ball)
        const targetLineLen = 60 * scale;
        const rawObjTargetX = hx + nX * targetLineLen;
        const rawObjTargetY = hy + nY * targetLineLen;

        const projObjStart = Snooker3DCamera.project(hx, hy, tableWidth, tableHeight, is3D);
        const projObjEnd = Snooker3DCamera.project(rawObjTargetX, rawObjTargetY, tableWidth, tableHeight, is3D);

        ctx.strokeStyle = aimGuide.targetBallLine; // Gold dashed target line
        ctx.lineWidth = 1.5 * scale * projImpact.scale;
        ctx.setLineDash([5 * scale, 3 * scale]);
        ctx.beginPath();
        ctx.moveTo(projObjStart.x, projObjStart.y);
        ctx.lineTo(projObjEnd.x, projObjEnd.y);
        ctx.stroke();
        ctx.setLineDash([]);

        // B. Cue Ball 90-Degree Tangent Deflection Line (White Dashed Line for Cut Shots)
        const dot = dirX * nX + dirY * nY; // Cut angle projection
        let tanX = dirX - nX * dot;
        let tanY = dirY - nY * dot;
        const tanLen = Math.hypot(tanX, tanY);

        // Only render tangent line if cut shot is off-center (> 4% cut)
        if (tanLen > 0.04) {
          tanX /= tanLen;
          tanY /= tanLen;

          const cueDeflectLen = 45 * scale * Math.min(1.0, tanLen * 2.0);
          const rawCueDeflectX = rawImpactX + tanX * cueDeflectLen;
          const rawCueDeflectY = rawImpactY + tanY * cueDeflectLen;

          const projCueDeflect = Snooker3DCamera.project(rawCueDeflectX, rawCueDeflectY, tableWidth, tableHeight, is3D);

          ctx.strokeStyle = "rgba(255, 255, 255, 0.65)";
          ctx.lineWidth = 1.2 * scale * projImpact.scale;
          ctx.setLineDash([3 * scale, 3 * scale]);
          ctx.beginPath();
          ctx.moveTo(projImpact.x, projImpact.y);
          ctx.lineTo(projCueDeflect.x, projCueDeflect.y);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }

    ctx.restore();
  }

  public static drawCue(
    ctx: CanvasRenderingContext2D,
    cueBall: SnookerBall,
    angle: number,
    power: number,
    tableWidth: number,
    strikeProgress = 0,
    is3D = true,
    tableHeight = tableWidth / 2
  ): void {
    const scale = tableWidth / SNOOKER_TABLE_WIDTH;
    const rawCx = cueBall.x * scale;
    const rawCy = cueBall.y * scale;
    const r = SNOOKER_BALL_RADIUS * scale;
    const { cueStick } = SNOOKER_VISUAL_CONFIG;

    // Backward unit vector along reverse aim line
    const backX = -Math.cos(angle);
    const backY = -Math.sin(angle);

    // Carrom pull distance calculation
    const baseOffset = r + 6 * scale;
    const maxPull = 70 * scale;
    const pullDistance = baseOffset + power * maxPull * (1 - strikeProgress);

    const cueLength = 320 * scale;
    const tipRadius = 2.5 * scale;
    const buttRadius = 5.5 * scale;

    const rawTipX = rawCx + backX * pullDistance;
    const rawTipY = rawCy + backY * pullDistance;
    const rawButtX = rawCx + backX * (pullDistance + cueLength);
    const rawButtY = rawCy + backY * (pullDistance + cueLength);

    const projTip = Snooker3DCamera.project(rawTipX, rawTipY, tableWidth, tableHeight, is3D);
    const projButt = Snooker3DCamera.project(rawButtX, rawButtY, tableWidth, tableHeight, is3D);

    const perpX = -Math.sin(angle);
    const perpY = Math.cos(angle);

    ctx.save();

    // ── 1. 3D Cue Drop Shadow on Cloth Bed ──────────────────────────────────
    const shadowOffset = 6 * scale * projTip.scale;
    ctx.fillStyle = cueStick.shadowColor;
    ctx.beginPath();
    ctx.moveTo(
      projTip.x + perpX * tipRadius * projTip.scale + shadowOffset,
      projTip.y + perpY * tipRadius * projTip.scale + shadowOffset
    );
    ctx.lineTo(
      projTip.x - perpX * tipRadius * projTip.scale + shadowOffset,
      projTip.y - perpY * tipRadius * projTip.scale + shadowOffset
    );
    ctx.lineTo(
      projButt.x - perpX * buttRadius * projButt.scale + shadowOffset,
      projButt.y - perpY * buttRadius * projButt.scale + shadowOffset
    );
    ctx.lineTo(
      projButt.x + perpX * buttRadius * projButt.scale + shadowOffset,
      projButt.y + perpY * buttRadius * projButt.scale + shadowOffset
    );
    ctx.closePath();
    ctx.fill();

    // ── 2. Polished Ash Wood Cue Stick ──────────────────────────────────────
    const cueGrad = ctx.createLinearGradient(projTip.x, projTip.y, projButt.x, projButt.y);
    cueGrad.addColorStop(0, cueStick.tipColor);
    cueGrad.addColorStop(0.04, cueStick.ferruleColor); // Brass Ferrule
    cueGrad.addColorStop(0.08, cueStick.woodBase); // Ash Shaft
    cueGrad.addColorStop(0.65, cueStick.woodGrain); // Wood grain transition
    cueGrad.addColorStop(1.0, cueStick.ebonyButt); // Ebony Butt

    ctx.fillStyle = cueGrad;
    ctx.beginPath();
    ctx.moveTo(projTip.x + perpX * tipRadius * projTip.scale, projTip.y + perpY * tipRadius * projTip.scale);
    ctx.lineTo(projTip.x - perpX * tipRadius * projTip.scale, projTip.y - perpY * tipRadius * projTip.scale);
    ctx.lineTo(projButt.x - perpX * buttRadius * projButt.scale, projButt.y - perpY * buttRadius * projButt.scale);
    ctx.lineTo(projButt.x + perpX * buttRadius * projButt.scale, projButt.y + perpY * buttRadius * projButt.scale);
    ctx.closePath();
    ctx.fill();

    // Outer subtle outline & specular highlight edge
    ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
    ctx.lineWidth = 0.8 * scale;
    ctx.stroke();

    ctx.restore();
  }
}
