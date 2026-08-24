import { SNOOKER_VISUAL_CONFIG } from "../constants/SnookerVisualConfig";
import {
  SNOOKER_TABLE_WIDTH,
  SNOOKER_TABLE_HEIGHT,
  SNOOKER_POCKETS,
  SNOOKER_CUSHION_MARGIN,
  SNOOKER_BAULK_X,
  SNOOKER_D_RADIUS,
  SNOOKER_TABLE_CENTER_Y,
  SNOOKER_SPOTS,
} from "@gaming-hub/game-engine";

export class SnookerTableRenderer {
  public static drawTable(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    _is3D = true
  ): void {
    const scale = width / SNOOKER_TABLE_WIDTH;
    const { cloth, woodRail } = SNOOKER_VISUAL_CONFIG;

    ctx.save();

    // ── 1. Table Ground Drop Shadow ──────────────────────────────────────────
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.88)";
    ctx.shadowBlur = 36 * scale;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 16 * scale;

    const frameRadius = 24 * scale;
    ctx.fillStyle = woodRail.secondaryWood;
    ctx.beginPath();
    ctx.roundRect(0, 0, width, height, frameRadius);
    ctx.fill();
    ctx.restore();

    // ── 2. Polished Outer Mahogany Wood Frame with 3D Bevel ───────────────────
    const woodGradient = ctx.createLinearGradient(0, 0, 0, height);
    woodGradient.addColorStop(0, woodRail.highlightWood);
    woodGradient.addColorStop(0.12, woodRail.primaryWood);
    woodGradient.addColorStop(0.5, woodRail.secondaryWood);
    woodGradient.addColorStop(0.88, woodRail.primaryWood);
    woodGradient.addColorStop(1, woodRail.highlightWood);

    ctx.fillStyle = woodGradient;
    ctx.beginPath();
    ctx.roundRect(0, 0, width, height, frameRadius);
    ctx.fill();

    // Outer subtle gold trim border
    ctx.strokeStyle = "rgba(245, 158, 11, 0.22)";
    ctx.lineWidth = 1.8 * scale;
    ctx.stroke();

    // Inner rail shadow / recess
    ctx.strokeStyle = "rgba(0, 0, 0, 0.65)";
    ctx.lineWidth = 3 * scale;
    ctx.stroke();

    // ── 3. Mother-of-Pearl Rail Inlay Sights (Diamonds) ──────────────────────
    const drawDiamond = (x: number, y: number) => {
      const size = 3.2 * scale;
      ctx.save();
      ctx.fillStyle = "rgba(254, 243, 199, 0.85)";
      ctx.shadowColor = "rgba(255, 255, 255, 0.5)";
      ctx.shadowBlur = 4 * scale;
      ctx.beginPath();
      ctx.moveTo(x, y - size);
      ctx.lineTo(x + size, y);
      ctx.lineTo(x, y + size);
      ctx.lineTo(x - size, y);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };

    // Long rails (Top & Bottom sights)
    const longSightFractions = [0.25, 0.375, 0.625, 0.75];
    for (const f of longSightFractions) {
      drawDiamond(width * f, 14 * scale);
      drawDiamond(width * f, height - 14 * scale);
    }
    // Short rails (Left & Right sights)
    const shortSightFractions = [0.25, 0.5, 0.75];
    for (const f of shortSightFractions) {
      drawDiamond(14 * scale, height * f);
      drawDiamond(width - 14 * scale, height * f);
    }

    // ── 4. Playing Bed Cloth (3D Tournament English Baize) ───────────────────
    const clothLeft = SNOOKER_CUSHION_MARGIN * scale;
    const clothTop = SNOOKER_CUSHION_MARGIN * scale;
    const clothWidth = width - clothLeft * 2;
    const clothHeight = height - clothTop * 2;

    const clothGrad = ctx.createRadialGradient(
      width / 2,
      height / 2,
      35 * scale,
      width / 2,
      height / 2,
      width * 0.58
    );
    clothGrad.addColorStop(0, cloth.bedHighlight);
    clothGrad.addColorStop(0.5, cloth.bedStart);
    clothGrad.addColorStop(1, cloth.bedEnd);

    ctx.fillStyle = clothGrad;
    ctx.fillRect(clothLeft, clothTop, clothWidth, clothHeight);

    // ── 5. Snooker Table Markings: Baulk Line & The "D" ───────────────────────
    ctx.save();
    ctx.strokeStyle = cloth.markingLine;
    ctx.lineWidth = 1.5 * scale;

    const baulkX = SNOOKER_BAULK_X * scale;
    const centerY = SNOOKER_TABLE_CENTER_Y * scale;
    const dRadius = SNOOKER_D_RADIUS * scale;

    // Baulk Line across width
    ctx.beginPath();
    ctx.moveTo(baulkX, clothTop);
    ctx.lineTo(baulkX, clothTop + clothHeight);
    ctx.stroke();

    // The "D" Semicircle on Baulk side (left)
    ctx.beginPath();
    ctx.arc(baulkX, centerY, dRadius, Math.PI / 2, (3 * Math.PI) / 2);
    ctx.stroke();

    // ── 6. Six Snooker Spots (Brown, Yellow, Green, Blue, Pink, Black) ───────
    const drawSpot = (x: number, y: number) => {
      const sx = x * scale;
      const sy = y * scale;

      ctx.fillStyle = cloth.spotColor;
      ctx.beginPath();
      ctx.arc(sx, sy, 2.2 * scale, 0, Math.PI * 2);
      ctx.fill();
    };

    drawSpot(SNOOKER_SPOTS.brown.x, SNOOKER_SPOTS.brown.y);
    drawSpot(SNOOKER_SPOTS.yellow.x, SNOOKER_SPOTS.yellow.y);
    drawSpot(SNOOKER_SPOTS.green.x, SNOOKER_SPOTS.green.y);
    drawSpot(SNOOKER_SPOTS.blue.x, SNOOKER_SPOTS.blue.y);
    drawSpot(SNOOKER_SPOTS.pink.x, SNOOKER_SPOTS.pink.y);
    drawSpot(SNOOKER_SPOTS.black.x, SNOOKER_SPOTS.black.y);
    ctx.restore();

    // ── 7. Rubber Cushions with Angled Snooker Jaws & 3D Shading ─────────────
    const drawCushionPolygon = (
      points: { x: number; y: number }[],
      noseA: { x: number; y: number },
      noseB: { x: number; y: number }
    ) => {
      ctx.save();

      const cGrad = ctx.createLinearGradient(points[0].x, points[0].y, noseA.x, noseA.y);
      cGrad.addColorStop(0, cloth.cushionBase);
      cGrad.addColorStop(0.6, cloth.cushionHighlight);
      cGrad.addColorStop(1, cloth.cushionBase);

      ctx.fillStyle = cGrad;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.closePath();
      ctx.fill();

      // Cushion Nose Specular Highlight Edge
      ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
      ctx.lineWidth = 1.2 * scale;
      ctx.beginPath();
      ctx.moveTo(noseA.x, noseA.y);
      ctx.lineTo(noseB.x, noseB.y);
      ctx.stroke();

      ctx.restore();
    };

    const cDepth = 10 * scale;

    // Top-Left Cushion
    drawCushionPolygon(
      [
        { x: 44 * scale, y: clothTop },
        { x: 54 * scale, y: clothTop + cDepth },
        { x: width / 2 - 18 * scale, y: clothTop + cDepth },
        { x: width / 2 - 10 * scale, y: clothTop },
      ],
      { x: 54 * scale, y: clothTop + cDepth },
      { x: width / 2 - 18 * scale, y: clothTop + cDepth }
    );

    // Top-Right Cushion
    drawCushionPolygon(
      [
        { x: width / 2 + 10 * scale, y: clothTop },
        { x: width / 2 + 18 * scale, y: clothTop + cDepth },
        { x: width - 54 * scale, y: clothTop + cDepth },
        { x: width - 44 * scale, y: clothTop },
      ],
      { x: width / 2 + 18 * scale, y: clothTop + cDepth },
      { x: width - 54 * scale, y: clothTop + cDepth }
    );

    // Bottom-Left Cushion
    drawCushionPolygon(
      [
        { x: 44 * scale, y: height - clothTop },
        { x: 54 * scale, y: height - clothTop - cDepth },
        { x: width / 2 - 18 * scale, y: height - clothTop - cDepth },
        { x: width / 2 - 10 * scale, y: height - clothTop },
      ],
      { x: 54 * scale, y: height - clothTop - cDepth },
      { x: width / 2 - 18 * scale, y: height - clothTop - cDepth }
    );

    // Bottom-Right Cushion
    drawCushionPolygon(
      [
        { x: width / 2 + 10 * scale, y: height - clothTop },
        { x: width / 2 + 18 * scale, y: height - clothTop - cDepth },
        { x: width - 54 * scale, y: height - clothTop - cDepth },
        { x: width - 44 * scale, y: height - clothTop },
      ],
      { x: width / 2 + 18 * scale, y: height - clothTop - cDepth },
      { x: width - 54 * scale, y: height - clothTop - cDepth }
    );

    // Left Cushion
    drawCushionPolygon(
      [
        { x: clothLeft, y: 44 * scale },
        { x: clothLeft + cDepth, y: 54 * scale },
        { x: clothLeft + cDepth, y: height - 54 * scale },
        { x: clothLeft, y: height - 44 * scale },
      ],
      { x: clothLeft + cDepth, y: 54 * scale },
      { x: clothLeft + cDepth, y: height - 54 * scale }
    );

    // Right Cushion
    drawCushionPolygon(
      [
        { x: width - clothLeft, y: 44 * scale },
        { x: width - clothLeft - cDepth, y: 54 * scale },
        { x: width - clothLeft - cDepth, y: height - 54 * scale },
        { x: width - clothLeft, y: height - 44 * scale },
      ],
      { x: width - clothLeft - cDepth, y: 54 * scale },
      { x: width - clothLeft - cDepth, y: height - 54 * scale }
    );

    // ── 8. Six Flush 3D Recessed Pockets with Brass Collars ───────────────────
    for (const pocket of SNOOKER_POCKETS) {
      const px = pocket.x * scale;
      const py = pocket.y * scale;
      const pr = pocket.radius * scale;

      ctx.save();

      // Outer Metallic Brass Collar Rim (Flush Radius)
      const brassGrad = ctx.createRadialGradient(
        px,
        py,
        pr * 0.7,
        px,
        py,
        pr * 1.05
      );
      brassGrad.addColorStop(0, "#d97706");
      brassGrad.addColorStop(0.5, "#fef3c7");
      brassGrad.addColorStop(1, "#78350f");

      ctx.fillStyle = brassGrad;
      ctx.beginPath();
      ctx.arc(px, py, pr * 1.05, 0, Math.PI * 2);
      ctx.fill();

      // Inner Deep Black Pocket Hole
      ctx.fillStyle = "#070a0e";
      ctx.beginPath();
      ctx.arc(px, py, pr * 0.9, 0, Math.PI * 2);
      ctx.fill();

      // Inner Pocket Net Shadow
      const netGrad = ctx.createRadialGradient(
        px,
        py,
        0,
        px,
        py,
        pr * 0.9
      );
      netGrad.addColorStop(0, "rgba(0,0,0,1)");
      netGrad.addColorStop(0.7, "rgba(0,0,0,0.85)");
      netGrad.addColorStop(1, "rgba(245, 158, 11, 0.3)");

      ctx.fillStyle = netGrad;
      ctx.beginPath();
      ctx.arc(px, py, pr * 0.9, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    ctx.restore();
  }
}
