import { CARROM_VISUAL_CONFIG } from "../constants/CarromVisualConfig";

export interface RenderableCoin {
  id: string;
  type: "white" | "black" | "queen" | "striker";
  x: number;
  y: number;
  radius: number;
  active: boolean;
  pocketed?: boolean;
  spin?: number;
  pocketing?: {
    scale: number;
    alpha: number;
    px: number;
    py: number;
  };
}

export class CarromPieceRenderer {
  /**
   * Draw an individual 3D Carrom piece (Ivory, Ebony, Queen, or Striker)
   * with directional lighting, physical edge thickness, rotating notches, and contact shadow.
   */
  public static drawCoin(
    ctx: CanvasRenderingContext2D,
    coin: RenderableCoin,
    isCurrentShooterWhite: boolean,
    isMyTurn: boolean,
    isTurnActive: boolean
  ): void {
    const { x, y, radius: r, type } = coin;

    if (coin.pocketing) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, coin.pocketing.alpha);
      ctx.translate(coin.x, coin.y);
      ctx.scale(coin.pocketing.scale, coin.pocketing.scale);

      // Deep pocket depth shadow
      ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
      ctx.beginPath();
      ctx.arc(0, 3, r * 0.95, 0, Math.PI * 2);
      ctx.fill();

      this.drawCoinBody(ctx, 0, 0, r, type, isCurrentShooterWhite, isMyTurn, isTurnActive, coin);
      ctx.restore();
      return;
    }

    // ── Realistic 3D Directional Contact Drop Shadow (Top-Left Light Source) ──
    const dpr = ctx.getTransform().a || 1;
    const logicalW = ctx.canvas.width / dpr;
    const logicalH = ctx.canvas.height / dpr;
    const scale = logicalW / 600;
    const sm = 33 * scale;
    const drawX = Math.max(sm + r, Math.min(logicalW - sm - r, x));
    const drawY = Math.max(sm + r, Math.min(logicalH - sm - r, y));

    ctx.save();
    const shadowOffset = type === "striker" ? 3.8 : 2.6;
    ctx.fillStyle = "rgba(12, 6, 2, 0.42)";
    ctx.beginPath();
    ctx.arc(drawX + shadowOffset * 0.75, drawY + shadowOffset, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    this.drawCoinBody(ctx, drawX, drawY, r, type, isCurrentShooterWhite, isMyTurn, isTurnActive, coin);
  }

  private static drawCoinBody(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    type: string,
    isCurrentShooterWhite: boolean,
    isMyTurn: boolean,
    isTurnActive: boolean,
    coin: RenderableCoin
  ): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(coin.spin || 0);

    const { colors } = CARROM_VISUAL_CONFIG;

    if (type === "striker") {
      // ══════════════════════════════════════════════════════════════════════
      // STRIKER: Pure White 3D Tournament Disc with Silver Bevel & Pearl Core
      // ══════════════════════════════════════════════════════════════════════

      // 1. 3D Cylindrical Bottom Edge Shadow
      ctx.fillStyle = "rgba(15, 23, 42, 0.55)";
      ctx.beginPath();
      ctx.arc(0, 2.2, r, 0, Math.PI * 2);
      ctx.fill();

      // 2. Main Pure White / Ivory Pearl Body
      const grad = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.05, 0, 0, r);
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(0.40, "#f8fafc");
      grad.addColorStop(0.75, "#e2e8f0");
      grad.addColorStop(1, "#cbd5e1");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();

      // Outer Beveled Silver Rim
      ctx.strokeStyle = "rgba(71, 85, 105, 0.70)";
      ctx.lineWidth = 2.0;
      ctx.stroke();

      // Inner Concentric Silver Ring
      ctx.strokeStyle = "rgba(148, 163, 184, 0.65)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.74, 0, Math.PI * 2);
      ctx.stroke();

      // 8 Precision Radial Alignment Notches (Rotate with physical spin!)
      ctx.strokeStyle = "rgba(100, 116, 139, 0.60)";
      ctx.lineWidth = 1.3;
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI * 2) / 8;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * (r * 0.46), Math.sin(a) * (r * 0.46));
        ctx.lineTo(Math.cos(a) * (r * 0.70), Math.sin(a) * (r * 0.70));
        ctx.stroke();
      }

      // Mid Concentric Ring
      ctx.strokeStyle = "rgba(148, 163, 184, 0.55)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.44, 0, Math.PI * 2);
      ctx.stroke();

      // Pearl White Center Core
      const coreGrad = ctx.createRadialGradient(-1, -1, 1, 0, 0, r * 0.28);
      coreGrad.addColorStop(0, "#ffffff");
      coreGrad.addColorStop(0.6, "#f1f5f9");
      coreGrad.addColorStop(1, "#94a3b8");
      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.28, 0, Math.PI * 2);
      ctx.fill();

      // Center Pin Point
      ctx.fillStyle = "#64748b";
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.08, 0, Math.PI * 2);
      ctx.fill();

      // Specular Top-Left Glint
      ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
      ctx.beginPath();
      ctx.arc(-r * 0.35, -r * 0.35, r * 0.24, 0, Math.PI * 2);
      ctx.fill();

    } else if (type === "queen") {
      // ══════════════════════════════════════════════════════════════════════
      // QUEEN: Fully Solid Red 3D Tournament Piece (Clean & Vibrant)
      // ══════════════════════════════════════════════════════════════════════

      // 1. 3D Cylindrical Bottom Edge Shadow
      ctx.fillStyle = "rgba(76, 5, 25, 0.85)";
      ctx.beginPath();
      ctx.arc(0, 2.0, r, 0, Math.PI * 2);
      ctx.fill();

      // 2. Fully Red 3D Gradient Sphere
      const qg = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.05, 0, 0, r);
      qg.addColorStop(0, "#ff3b3b");
      qg.addColorStop(0.35, "#dc2626");
      qg.addColorStop(0.75, "#991b1b");
      qg.addColorStop(1, "#7f1d1d");
      ctx.fillStyle = qg;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();

      // Deep Crimson Rim Border
      ctx.strokeStyle = "#7f1d1d";
      ctx.lineWidth = 1.4;
      ctx.stroke();

      // Concentric Carved Wood Groove Ring
      ctx.strokeStyle = "rgba(127, 29, 29, 0.50)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.65, 0, Math.PI * 2);
      ctx.stroke();

      // Inner Raised Red Platform
      const innerGrad = ctx.createRadialGradient(-r * 0.2, -r * 0.2, 1, 0, 0, r * 0.45);
      innerGrad.addColorStop(0, "#ff4d4d");
      innerGrad.addColorStop(1, "#b91c1c");
      ctx.fillStyle = innerGrad;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.48, 0, Math.PI * 2);
      ctx.fill();

      // Center Red Pin Dot
      ctx.fillStyle = "#7f1d1d";
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.16, 0, Math.PI * 2);
      ctx.fill();

      // Top Specular Highlight
      ctx.fillStyle = "rgba(255, 255, 255, 0.65)";
      ctx.beginPath();
      ctx.arc(-r * 0.32, -r * 0.32, r * 0.25, 0, Math.PI * 2);
      ctx.fill();

    } else {
      // ══════════════════════════════════════════════════════════════════════
      // WHITE / BLACK TOURNAMENT CARROM PIECES (3D Beveled Wooden Finish)
      // ══════════════════════════════════════════════════════════════════════
      const isW = type === "white";

      // 1. 3D Cylindrical Bottom Edge Shadow
      ctx.fillStyle = isW ? "rgba(110, 65, 20, 0.55)" : "rgba(2, 6, 23, 0.85)";
      ctx.beginPath();
      ctx.arc(0, 1.8, r, 0, Math.PI * 2);
      ctx.fill();

      // 2. Gradients & Palettes
      const outerGrad = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.05, 0, 0, r);
      if (isW) {
        outerGrad.addColorStop(0, colors.ivoryTop);
        outerGrad.addColorStop(0.35, colors.ivoryMid);
        outerGrad.addColorStop(0.75, colors.ivoryShade);
        outerGrad.addColorStop(1, colors.ivoryRim);
      } else {
        outerGrad.addColorStop(0, colors.ebonyTop);
        outerGrad.addColorStop(0.35, colors.ebonyMid);
        outerGrad.addColorStop(0.75, colors.ebonyShade);
        outerGrad.addColorStop(1, colors.ebonyRim);
      }
      ctx.fillStyle = outerGrad;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();

      // Rim Border
      ctx.strokeStyle = isW ? colors.ivoryRim : colors.ebonyRim;
      ctx.lineWidth = 1.4;
      ctx.stroke();

      // Concentric Carved Wood Groove Ring
      const grooveCol = isW ? "rgba(160, 110, 55, 0.60)" : "rgba(203, 213, 225, 0.35)";
      ctx.strokeStyle = grooveCol;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.65, 0, Math.PI * 2);
      ctx.stroke();

      // 6 Radial Carved Wood Notches (Rotate with spin!)
      ctx.strokeStyle = grooveCol;
      ctx.lineWidth = 1.2;
      for (let k = 0; k < 6; k++) {
        const a = (k * Math.PI * 2) / 6;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * (r * 0.32), Math.sin(a) * (r * 0.32));
        ctx.lineTo(Math.cos(a) * (r * 0.62), Math.sin(a) * (r * 0.62));
        ctx.stroke();
      }

      // Inner Raised Center Platform
      const innerGrad = ctx.createRadialGradient(-r * 0.2, -r * 0.2, 1, 0, 0, r * 0.45);
      if (isW) {
        innerGrad.addColorStop(0, "#fffbf2");
        innerGrad.addColorStop(1, "#eed2aa");
      } else {
        innerGrad.addColorStop(0, "#475569");
        innerGrad.addColorStop(1, "#0f172a");
      }
      ctx.fillStyle = innerGrad;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.48, 0, Math.PI * 2);
      ctx.fill();

      // Center Pin Dot
      ctx.fillStyle = isW ? "#451a03" : "#e2e8f0";
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.16, 0, Math.PI * 2);
      ctx.fill();

      // Gloss Specular Reflection
      ctx.fillStyle = isW ? "rgba(255, 255, 255, 0.8)" : "rgba(255, 255, 255, 0.25)";
      ctx.beginPath();
      ctx.arc(-r * 0.32, -r * 0.32, r * 0.25, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}
