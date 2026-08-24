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
    height: number
  ): void {
    const scale = width / SNOOKER_TABLE_WIDTH;
    const { cloth, woodRail } = SNOOKER_VISUAL_CONFIG;

    ctx.save();

    // ── 1. Table Ground Drop Shadow ──────────────────────────────────────────
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.75)";
    ctx.shadowBlur = 32 * scale;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 16 * scale;

    const frameRadius = 24 * scale;
    ctx.fillStyle = woodRail.secondaryWood;
    ctx.beginPath();
    ctx.roundRect(0, 0, width, height, frameRadius);
    ctx.fill();
    ctx.restore();

    // ── 2. Polished Outer Wood Frame with Bevel ──────────────────────────────
    const woodGradient = ctx.createLinearGradient(0, 0, 0, height);
    woodGradient.addColorStop(0, woodRail.highlightWood);
    woodGradient.addColorStop(0.3, woodRail.primaryWood);
    woodGradient.addColorStop(0.7, woodRail.secondaryWood);
    woodGradient.addColorStop(1, woodRail.primaryWood);

    ctx.fillStyle = woodGradient;
    ctx.beginPath();
    ctx.roundRect(0, 0, width, height, frameRadius);
    ctx.fill();

    // Inner rail bevel stroke
    ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
    ctx.lineWidth = 2 * scale;
    ctx.stroke();

    // ── 3. Playing Bed Cloth (English Baize) with Overhead Spotlight ─────────
    const clothLeft = SNOOKER_CUSHION_MARGIN * scale;
    const clothTop = SNOOKER_CUSHION_MARGIN * scale;
    const clothWidth = width - clothLeft * 2;
    const clothHeight = height - clothTop * 2;

    const clothGrad = ctx.createRadialGradient(
      width / 2,
      height / 2,
      30 * scale,
      width / 2,
      height / 2,
      width * 0.65
    );
    clothGrad.addColorStop(0, cloth.bedHighlight);
    clothGrad.addColorStop(0.5, cloth.bedStart);
    clothGrad.addColorStop(1, cloth.bedEnd);

    ctx.fillStyle = clothGrad;
    ctx.fillRect(clothLeft, clothTop, clothWidth, clothHeight);

    // ── 4. Cushions / Rubber Bumpers (Subtle 3D Bevels) ───────────────────────
    ctx.fillStyle = cloth.cushionBase;

    // Top Cushion (Left & Right halves)
    ctx.fillRect(
      (SNOOKER_CUSHION_MARGIN + 24) * scale,
      clothTop,
      (SNOOKER_TABLE_WIDTH / 2 - SNOOKER_CUSHION_MARGIN - 36) * scale,
      6 * scale
    );
    ctx.fillRect(
      (SNOOKER_TABLE_WIDTH / 2 + 12) * scale,
      clothTop,
      (SNOOKER_TABLE_WIDTH / 2 - SNOOKER_CUSHION_MARGIN - 36) * scale,
      6 * scale
    );

    // Bottom Cushion (Left & Right halves)
    ctx.fillRect(
      (SNOOKER_CUSHION_MARGIN + 24) * scale,
      clothTop + clothHeight - 6 * scale,
      (SNOOKER_TABLE_WIDTH / 2 - SNOOKER_CUSHION_MARGIN - 36) * scale,
      6 * scale
    );
    ctx.fillRect(
      (SNOOKER_TABLE_WIDTH / 2 + 12) * scale,
      clothTop + clothHeight - 6 * scale,
      (SNOOKER_TABLE_WIDTH / 2 - SNOOKER_CUSHION_MARGIN - 36) * scale,
      6 * scale
    );

    // Left & Right Cushions
    ctx.fillRect(
      clothLeft,
      (SNOOKER_CUSHION_MARGIN + 24) * scale,
      6 * scale,
      (SNOOKER_TABLE_HEIGHT - SNOOKER_CUSHION_MARGIN * 2 - 48) * scale
    );
    ctx.fillRect(
      clothLeft + clothWidth - 6 * scale,
      (SNOOKER_CUSHION_MARGIN + 24) * scale,
      6 * scale,
      (SNOOKER_TABLE_HEIGHT - SNOOKER_CUSHION_MARGIN * 2 - 48) * scale
    );

    // ── 5. Snooker Table Markings: Baulk Line & The "D" ───────────────────────
    ctx.save();
    ctx.strokeStyle = cloth.markingLine;
    ctx.lineWidth = 1.5 * scale;

    // Baulk Line across width
    const baulkX = SNOOKER_BAULK_X * scale;
    ctx.beginPath();
    ctx.moveTo(baulkX, clothTop);
    ctx.lineTo(baulkX, clothTop + clothHeight);
    ctx.stroke();

    // The "D" Semicircle (D is drawn on the Baulk side, i.e., to the left of Baulk Line)
    const centerY = SNOOKER_TABLE_CENTER_Y * scale;
    const dRadius = SNOOKER_D_RADIUS * scale;
    ctx.beginPath();
    ctx.arc(baulkX, centerY, dRadius, Math.PI / 2, (3 * Math.PI) / 2); // Left semicircle
    ctx.stroke();

    // ── 6. Six Snooker Spots (Brown, Yellow, Green, Blue, Pink, Black) ───────
    const drawSpot = (x: number, y: number, label: string) => {
      const sx = x * scale;
      const sy = y * scale;

      // Spot cross/dot
      ctx.fillStyle = cloth.spotColor;
      ctx.beginPath();
      ctx.arc(sx, sy, 2.5 * scale, 0, Math.PI * 2);
      ctx.fill();

      // Subtle label
      ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
      ctx.font = `600 ${Math.round(8 * scale)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, sx, sy - 7 * scale);
    };

    drawSpot(SNOOKER_SPOTS.brown.x, SNOOKER_SPOTS.brown.y, "BROWN");
    drawSpot(SNOOKER_SPOTS.yellow.x, SNOOKER_SPOTS.yellow.y, "YELLOW");
    drawSpot(SNOOKER_SPOTS.green.x, SNOOKER_SPOTS.green.y, "GREEN");
    drawSpot(SNOOKER_SPOTS.blue.x, SNOOKER_SPOTS.blue.y, "BLUE");
    drawSpot(SNOOKER_SPOTS.pink.x, SNOOKER_SPOTS.pink.y, "PINK");
    drawSpot(SNOOKER_SPOTS.black.x, SNOOKER_SPOTS.black.y, "BLACK");

    ctx.restore();

    // ── 7. Six Deep Snooker Pockets with Brass Rim Plates ─────────────────────
    for (const pocket of SNOOKER_POCKETS) {
      const px = pocket.x * scale;
      const py = pocket.y * scale;
      const pr = pocket.radius * scale;

      // Deep dark pocket interior
      const pGrad = ctx.createRadialGradient(
        px,
        py,
        pr * 0.2,
        px,
        py,
        pr
      );
      pGrad.addColorStop(0, "#000000");
      pGrad.addColorStop(0.7, "#09090b");
      pGrad.addColorStop(1, "#18181b");

      ctx.fillStyle = pGrad;
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fill();

      // Polished Brass Pocket Plate
      ctx.strokeStyle = woodRail.brassPlate;
      ctx.lineWidth = 2.5 * scale;
      ctx.stroke();
    }

    ctx.restore();
  }
}
