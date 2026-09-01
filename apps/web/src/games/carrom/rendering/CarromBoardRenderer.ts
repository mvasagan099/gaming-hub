import { CARROM_VISUAL_CONFIG } from "../constants/CarromVisualConfig";

export class CarromBoardRenderer {
  /**
   * Draw the entire 3D Carrom Board including frame, brass corners,
   * maple playing surface, painted markings, corner arrows, and 3D deep pockets with nets.
   * All geometry is mathematically scaled to server 600x600 space.
   */
  public static drawBoard(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const scale = w / 600;
    const { colors } = CARROM_VISUAL_CONFIG;

    // Physical measurements (scaled)
    const sm = 33 * scale; // Frame bumper thickness: 27.5 in 500 space, 22 in 400 space
    const frameR = 34 * scale;
    const pMargin = 45 * scale; // Exact physics pocket center: 37.5 in 500 space, 30 in 400 space
    const pocketDrawRadius = 23 * scale; // Pocket hole visual radius: ~19 in 500 space, ~15 in 400 space
    const cutoutR = pocketDrawRadius + 4 * scale; // Corner bumper cutout radius

    const pockets = [
      { x: pMargin, y: pMargin, corner: "tl" as const },
      { x: w - pMargin, y: pMargin, corner: "tr" as const },
      { x: pMargin, y: h - pMargin, corner: "bl" as const },
      { x: w - pMargin, y: h - pMargin, corner: "br" as const },
    ];

    // ── 1. Tabletop Contact Drop Shadow ───────────────────────────────────────
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.70)";
    ctx.shadowBlur = 24 * scale;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 10 * scale;

    // Outer walnut frame silhouette
    ctx.fillStyle = colors.frameBase;
    ctx.beginPath();
    ctx.moveTo(frameR, 0);
    ctx.lineTo(w - frameR, 0);
    ctx.quadraticCurveTo(w, 0, w, frameR);
    ctx.lineTo(w, h - frameR);
    ctx.quadraticCurveTo(w, h, w - frameR, h);
    ctx.lineTo(frameR, h);
    ctx.quadraticCurveTo(0, h, 0, h - frameR);
    ctx.lineTo(0, frameR);
    ctx.quadraticCurveTo(0, 0, frameR, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // ── 2. Beveled Wood Texture on Outer Frame ────────────────────────────────
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(frameR, 0);
    ctx.lineTo(w - frameR, 0);
    ctx.quadraticCurveTo(w, 0, w, frameR);
    ctx.lineTo(w, h - frameR);
    ctx.quadraticCurveTo(w, h, w - frameR, h);
    ctx.lineTo(frameR, h);
    ctx.quadraticCurveTo(0, h, 0, h - frameR);
    ctx.lineTo(0, frameR);
    ctx.quadraticCurveTo(0, 0, frameR, 0);
    ctx.closePath();
    ctx.clip();

    // Directional light gradient across the wooden frame
    const frameGrad = ctx.createLinearGradient(0, 0, w, h);
    frameGrad.addColorStop(0, colors.frameTop);
    frameGrad.addColorStop(0.5, colors.frameBase);
    frameGrad.addColorStop(1, colors.frameDark);
    ctx.fillStyle = frameGrad;
    ctx.fill();

    // Wood grain fibers on outer frame
    ctx.strokeStyle = "rgba(255, 255, 255, 0.03)";
    ctx.lineWidth = 1.2;
    for (let gy = 4; gy < h; gy += 7 * scale) {
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(w, gy);
      ctx.stroke();
    }

    // Outer top bevel highlight
    ctx.strokeStyle = colors.frameHighlight;
    ctx.lineWidth = 1.8 * scale;
    ctx.stroke();

    // ── 3. Brass Metallic Corner Brackets / Caps ─────────────────────────────
    const brassSize = 36 * scale;
    const cornerPositions = [
      { x: 0, y: 0, rx: 1, ry: 1 },
      { x: w, y: 0, rx: -1, ry: 1 },
      { x: 0, y: h, rx: 1, ry: -1 },
      { x: w, y: h, rx: -1, ry: -1 },
    ];

    cornerPositions.forEach(({ x, y, rx, ry }) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(rx, ry);

      const bg = ctx.createLinearGradient(0, 0, brassSize, brassSize);
      bg.addColorStop(0, colors.brassHighlight);
      bg.addColorStop(0.5, colors.brassBase);
      bg.addColorStop(1, colors.brassDark);
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(brassSize, 0);
      ctx.lineTo(brassSize * 0.65, brassSize * 0.65);
      ctx.lineTo(0, brassSize);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = colors.brassDark;
      ctx.lineWidth = 1;
      ctx.stroke();

      // Rivet Screw
      ctx.fillStyle = colors.brassRivet;
      ctx.beginPath();
      ctx.arc(brassSize * 0.42, brassSize * 0.42, 2.5 * scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = colors.brassHighlight;
      ctx.beginPath();
      ctx.arc(brassSize * 0.42 - 0.7, brassSize * 0.42 - 0.7, 1.0 * scale, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    });

    ctx.restore();

    // ── 4. Polished Maple Playing Surface ─────────────────────────────────────
    // The surface fills the inside of the frame with a smooth radial gradient
    const surfGrad = ctx.createRadialGradient(w / 2, h / 2, 40 * scale, w / 2, h / 2, w * 0.65);
    surfGrad.addColorStop(0, colors.surfaceCenter);
    surfGrad.addColorStop(0.65, colors.surfaceMid);
    surfGrad.addColorStop(1, colors.surfaceEdge);
    ctx.fillStyle = surfGrad;
    ctx.fillRect(sm, sm, w - sm * 2, h - sm * 2);

    // ── 5. Inner Wooden Bumper with Corner Pocket Cutout Arcs ──────────────────
    // Authentic carrom boards have the bumper follow the perimeter and curve around each pocket
    ctx.save();
    ctx.beginPath();

    // Top edge
    ctx.moveTo(pMargin + cutoutR * Math.SQRT1_2, sm);
    ctx.lineTo(w - (pMargin + cutoutR * Math.SQRT1_2), sm);

    // Top-Right pocket cutout arc
    ctx.arc(w - pMargin, pMargin, cutoutR, -Math.PI / 2 + Math.PI / 4, 0 + Math.PI / 4, false);

    // Right edge
    ctx.lineTo(w - sm, h - (pMargin + cutoutR * Math.SQRT1_2));

    // Bottom-Right pocket cutout arc
    ctx.arc(w - pMargin, h - pMargin, cutoutR, 0 + Math.PI / 4, Math.PI / 2 + Math.PI / 4, false);

    // Bottom edge
    ctx.lineTo(pMargin + cutoutR * Math.SQRT1_2, h - sm);

    // Bottom-Left pocket cutout arc
    ctx.arc(pMargin, h - pMargin, cutoutR, Math.PI / 2 + Math.PI / 4, Math.PI + Math.PI / 4, false);

    // Left edge
    ctx.lineTo(sm, pMargin + cutoutR * Math.SQRT1_2);

    // Top-Left pocket cutout arc
    ctx.arc(pMargin, pMargin, cutoutR, Math.PI + Math.PI / 4, Math.PI * 1.5 + Math.PI / 4, false);

    ctx.closePath();

    // Inner shadow on playing surface from the raised bumper
    ctx.strokeStyle = colors.frameInnerShadow;
    ctx.lineWidth = 3.5 * scale;
    ctx.stroke();

    // Dark crisp inner rebound line
    ctx.strokeStyle = colors.surfaceMarkingDark;
    ctx.lineWidth = 2.2 * scale;
    ctx.stroke();
    ctx.restore();

    // ── 6. 3D Deep Corner Pockets with Woven Net ──────────────────────────────
    pockets.forEach((p) => {
      // 1. Deep Pocket Cavity (Layer 1: Shadow)
      ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
      ctx.beginPath();
      ctx.arc(p.x, p.y, pocketDrawRadius + 3.5 * scale, 0, Math.PI * 2);
      ctx.fill();

      // 2. Multi-stop Deep Hole Cavity Gradient
      const pg = ctx.createRadialGradient(p.x - 2 * scale, p.y - 2 * scale, 1, p.x, p.y, pocketDrawRadius);
      pg.addColorStop(0, colors.pocketDepthMid);
      pg.addColorStop(0.55, colors.pocketDepthDark);
      pg.addColorStop(1, "#000000");
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.arc(p.x, p.y, pocketDrawRadius, 0, Math.PI * 2);
      ctx.fill();

      // 3. Woven Net Mesh Pattern inside cavity
      ctx.save();
      ctx.beginPath();
      ctx.arc(p.x, p.y, pocketDrawRadius - 1.5 * scale, 0, Math.PI * 2);
      ctx.clip();
      ctx.strokeStyle = colors.pocketNetLine;
      ctx.lineWidth = 0.9 * scale;

      const netStep = 5.5 * scale;
      for (let offset = -pocketDrawRadius; offset <= pocketDrawRadius; offset += netStep) {
        ctx.beginPath();
        ctx.moveTo(p.x + offset - pocketDrawRadius, p.y - pocketDrawRadius);
        ctx.lineTo(p.x + offset + pocketDrawRadius, p.y + pocketDrawRadius);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(p.x + offset + pocketDrawRadius, p.y - pocketDrawRadius);
        ctx.lineTo(p.x + offset - pocketDrawRadius, p.y + pocketDrawRadius);
        ctx.stroke();
      }
      ctx.restore();

      // 4. Polished Metallic Rim Highlight Ring
      ctx.strokeStyle = colors.pocketRim;
      ctx.lineWidth = 1.8 * scale;
      ctx.beginPath();
      ctx.arc(p.x, p.y, pocketDrawRadius, 0, Math.PI * 2);
      ctx.stroke();
    });

    // ── 7. Painted Carrom Markings ─────────────────────────────────────────────
    this.drawMarkings(ctx, w, h, scale);
  }

  /**
   * Draw authoritative carrom markings (baseline tracks, red end circles, center mandala, corner arrows).
   */
  private static drawMarkings(ctx: CanvasRenderingContext2D, w: number, h: number, scale: number): void {
    const { colors } = CARROM_VISUAL_CONFIG;
    const dark = colors.surfaceMarkingDark;
    const surfaceColor = colors.surfaceMid;

    // Baselines — double-line capsule tracks with gradient red end circles
    const capsuleHalf = 10 * scale; // ~8.3 in 500 space, ~6.6 in 400 space
    const capStart = 129 * scale;   // 107.5 in 500 space, 86 in 400 space
    const capEnd = 471 * scale;     // 392.5 in 500 space, 314 in 400 space
    const capY1 = 93 * scale;       // 77.5 in 500 space, 62 in 400 space (top)
    const capY2 = 507 * scale;      // 422.5 in 500 space, 338 in 400 space (bottom)
    const capRedR = 11 * scale;     // ~9.2 in 500 space, ~7.3 in 400 space

    function drawCapsuleTrack(ax: number, ay: number, bx: number, by: number, isVert: boolean) {
      ctx.fillStyle = surfaceColor;
      ctx.strokeStyle = dark;

      // Track interior
      ctx.beginPath();
      if (!isVert) {
        ctx.rect(ax, ay - capsuleHalf, bx - ax, capsuleHalf * 2);
      } else {
        ctx.rect(ax - capsuleHalf, ay, capsuleHalf * 2, by - ay);
      }
      ctx.fill();

      // Top / Left border line
      ctx.lineWidth = 2.0 * scale;
      ctx.beginPath();
      if (!isVert) {
        ctx.moveTo(ax, ay - capsuleHalf);
        ctx.lineTo(bx, ay - capsuleHalf);
      } else {
        ctx.moveTo(ax - capsuleHalf, ay);
        ctx.lineTo(ax - capsuleHalf, by);
      }
      ctx.stroke();

      // Bottom / Right border line
      ctx.lineWidth = 2.0 * scale;
      ctx.beginPath();
      if (!isVert) {
        ctx.moveTo(ax, ay + capsuleHalf);
        ctx.lineTo(bx, ay + capsuleHalf);
      } else {
        ctx.moveTo(ax + capsuleHalf, ay);
        ctx.lineTo(ax + capsuleHalf, by);
      }
      ctx.stroke();

      // End arcs
      ctx.lineWidth = 1.8 * scale;
      ctx.beginPath();
      if (!isVert) {
        ctx.arc(ax, ay, capsuleHalf, -Math.PI / 2, Math.PI / 2, true);
        ctx.arc(bx, ay, capsuleHalf, Math.PI / 2, -Math.PI / 2, true);
      } else {
        ctx.arc(ax, ay, capsuleHalf, -Math.PI, 0, true);
        ctx.arc(ax, by, capsuleHalf, 0, Math.PI, true);
      }
      ctx.stroke();

      // Red Circles at the ends of baseline track
      [[ax, ay], [bx, by]].forEach(([rcx, rcy]) => {
        const rg = ctx.createRadialGradient(rcx - 2 * scale, rcy - 2 * scale, 1, rcx, rcy, capRedR);
        rg.addColorStop(0, "#f87171");
        rg.addColorStop(0.5, "#dc2626");
        rg.addColorStop(1, "#991b1b");
        ctx.fillStyle = rg;
        ctx.strokeStyle = dark;
        ctx.lineWidth = 1.8 * scale;
        ctx.beginPath();
        ctx.arc(rcx, rcy, capRedR, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });
    }

    drawCapsuleTrack(capStart, capY1, capEnd, capY1, false); // top horizontal
    drawCapsuleTrack(capStart, capY2, capEnd, capY2, false); // bottom horizontal
    drawCapsuleTrack(capY1, capStart, capY1, capEnd, true);  // left vertical
    drawCapsuleTrack(capY2, capStart, capY2, capEnd, true);  // right vertical

    // ── Center Mandala Pattern ────────────────────────────────────────────────
    const cx = w / 2;
    const cy = h / 2;

    // Outer red circle
    const rOuter = 75 * scale;
    ctx.strokeStyle = dark;
    ctx.lineWidth = 1.8 * scale;
    ctx.beginPath();
    ctx.arc(cx, cy, rOuter, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "#b91c1c";
    ctx.beginPath();
    ctx.arc(cx, cy, rOuter - 1, 0, Math.PI * 2);
    ctx.fill();

    // Middle cream ring
    const rMid = 58 * scale;
    ctx.fillStyle = surfaceColor;
    ctx.beginPath();
    ctx.arc(cx, cy, rMid, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = dark;
    ctx.lineWidth = 1.4 * scale;
    ctx.beginPath();
    ctx.arc(cx, cy, rMid, 0, Math.PI * 2);
    ctx.stroke();

    // 8 Radial Gold Star Rays in Mandala
    ctx.strokeStyle = "rgba(217, 119, 6, 0.8)";
    ctx.lineWidth = 1.3 * scale;
    for (let k = 0; k < 8; k++) {
      const angle = (k * Math.PI * 2) / 8;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * (38 * scale), cy + Math.sin(angle) * (38 * scale));
      ctx.lineTo(cx + Math.cos(angle) * (rMid - 1), cy + Math.sin(angle) * (rMid - 1));
      ctx.stroke();
    }

    // Black ring
    const rBlack = 44 * scale;
    ctx.fillStyle = "#1a0808";
    ctx.beginPath();
    ctx.arc(cx, cy, rBlack, 0, Math.PI * 2);
    ctx.fill();

    // Inner cream ring
    const rInner = 36 * scale;
    ctx.fillStyle = surfaceColor;
    ctx.beginPath();
    ctx.arc(cx, cy, rInner, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = dark;
    ctx.lineWidth = 1.2 * scale;
    ctx.beginPath();
    ctx.arc(cx, cy, rInner, 0, Math.PI * 2);
    ctx.stroke();

    // Red center circle
    const rCenter = 11 * scale;
    const centerGrad = ctx.createRadialGradient(cx - 2 * scale, cy - 2 * scale, 1, cx, cy, rCenter);
    centerGrad.addColorStop(0, "#f87171");
    centerGrad.addColorStop(1, "#991b1b");
    ctx.fillStyle = centerGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, rCenter, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = dark;
    ctx.lineWidth = 1 * scale;
    ctx.stroke();

    // Center pin dot
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.arc(cx, cy, 3.5 * scale, 0, Math.PI * 2);
    ctx.fill();
  }
}
