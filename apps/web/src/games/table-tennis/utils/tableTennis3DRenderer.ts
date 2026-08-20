import { TABLE_TENNIS_VISUAL_CONFIG } from '../constants/tableTennisVisualConfig';

export interface Point2D {
  x: number;
  y: number;
}

export class TableTennis3DRenderer {
  /**
   * Maps 2D logical coordinates [0..600, 0..400] to 3D perspective screen coordinates.
   */
  static project(lx: number, ly: number, lz = 0): { x: number; y: number; scale: number } {
    const { corners } = TABLE_TENNIS_VISUAL_CONFIG.table;
    const u = Math.max(0, Math.min(1, lx / TABLE_TENNIS_VISUAL_CONFIG.logicalWidth));
    const v = Math.max(0, Math.min(1, ly / TABLE_TENNIS_VISUAL_CONFIG.logicalHeight));

    // Bilinear interpolation across trapezoid
    const topX = corners.topLeft.x + (corners.topRight.x - corners.topLeft.x) * u;
    const topY = corners.topLeft.y + (corners.topRight.y - corners.topLeft.y) * u;
    const botX = corners.bottomLeft.x + (corners.bottomRight.x - corners.bottomLeft.x) * u;
    const botY = corners.bottomLeft.y + (corners.bottomRight.y - corners.bottomLeft.y) * u;

    const x = topX + (botX - topX) * v;
    const y = topY + (botY - topY) * v - lz; // Lift with Z height

    // Perspective scale (closer objects appear larger)
    const scale = 0.82 + v * 0.42;

    return { x, y, scale };
  }

  /**
   * Draws the complete 3D Table Tennis arena, table, net, paddles, and ball.
   */
  static renderScene(
    ctx: CanvasRenderingContext2D,
    p1Y: number,
    p1Vy: number,
    p2Y: number,
    p2Vy: number,
    ball: { x: number; y: number; vx: number; vy: number; inPlay: boolean },
    trail: Array<{ x: number; y: number }>,
    particles: Array<{ x: number; y: number; color: string; life: number; maxLife: number }>
  ): void {
    const cfg = TABLE_TENNIS_VISUAL_CONFIG;
    const w = cfg.canvasWidth;
    const h = cfg.canvasHeight;

    // ── 1. Sports Arena Floor & Stadium Lighting ──
    const bgGrad = ctx.createRadialGradient(w / 2, h / 2 - 40, 60, w / 2, h / 2, 440);
    bgGrad.addColorStop(0, '#0f172a');
    bgGrad.addColorStop(0.6, '#090d16');
    bgGrad.addColorStop(1, '#020617');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // Soft overhead floodlight cone
    const floodGrad = ctx.createRadialGradient(w / 2, 80, 20, w / 2, 280, 320);
    floodGrad.addColorStop(0, 'rgba(56, 189, 248, 0.08)');
    floodGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = floodGrad;
    ctx.fillRect(0, 0, w, h);

    // Subtle arena court floor lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.025)';
    ctx.lineWidth = 1;
    for (let y = 140; y < h; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // ── 2. Table Floor Shadow ──
    const { corners, thickness } = cfg.table;
    ctx.fillStyle = cfg.table.floorShadowColor;
    ctx.beginPath();
    ctx.moveTo(corners.topLeft.x - 10, corners.topLeft.y + 60);
    ctx.lineTo(corners.topRight.x + 10, corners.topRight.y + 60);
    ctx.lineTo(corners.bottomRight.x + 30, corners.bottomRight.y + 50);
    ctx.lineTo(corners.bottomLeft.x - 30, corners.bottomLeft.y + 50);
    ctx.closePath();
    ctx.filter = 'blur(12px)';
    ctx.fill();
    ctx.filter = 'none';

    // ── 3. Table Steel Tubular Legs ──
    const legs = [
      { x: corners.topLeft.x + 25, y: corners.topLeft.y + thickness, h: 54 },
      { x: corners.topRight.x - 25, y: corners.topRight.y + thickness, h: 54 },
      { x: corners.bottomLeft.x + 35, y: corners.bottomLeft.y + thickness, h: 46 },
      { x: corners.bottomRight.x - 35, y: corners.bottomRight.y + thickness, h: 46 },
    ];

    legs.forEach((leg) => {
      // Leg shadow
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(leg.x - 3, leg.y, 8, leg.h);

      // Steel leg tube
      const legGrad = ctx.createLinearGradient(leg.x - 4, 0, leg.x + 4, 0);
      legGrad.addColorStop(0, '#475569');
      legGrad.addColorStop(0.5, '#64748b');
      legGrad.addColorStop(1, '#334155');
      ctx.fillStyle = legGrad;
      ctx.beginPath();
      ctx.roundRect(leg.x - 4, leg.y, 8, leg.h, 2);
      ctx.fill();
    });

    // ── 4. Table 3D Wooden Apron (Thickness) ──
    // Front edge apron
    const frontApronGrad = ctx.createLinearGradient(0, corners.bottomLeft.y, 0, corners.bottomLeft.y + thickness);
    frontApronGrad.addColorStop(0, '#172554');
    frontApronGrad.addColorStop(1, '#0f172a');
    ctx.fillStyle = frontApronGrad;
    ctx.beginPath();
    ctx.moveTo(corners.bottomLeft.x, corners.bottomLeft.y);
    ctx.lineTo(corners.bottomRight.x, corners.bottomRight.y);
    ctx.lineTo(corners.bottomRight.x, corners.bottomRight.y + thickness);
    ctx.lineTo(corners.bottomLeft.x, corners.bottomLeft.y + thickness);
    ctx.closePath();
    ctx.fill();

    // Left edge apron
    ctx.fillStyle = cfg.table.apronSideColor;
    ctx.beginPath();
    ctx.moveTo(corners.topLeft.x, corners.topLeft.y);
    ctx.lineTo(corners.bottomLeft.x, corners.bottomLeft.y);
    ctx.lineTo(corners.bottomLeft.x, corners.bottomLeft.y + thickness);
    ctx.lineTo(corners.topLeft.x, corners.topLeft.y + thickness * 0.8);
    ctx.closePath();
    ctx.fill();

    // Right edge apron
    ctx.fillStyle = '#0f2347';
    ctx.beginPath();
    ctx.moveTo(corners.topRight.x, corners.topRight.y);
    ctx.lineTo(corners.bottomRight.x, corners.bottomRight.y);
    ctx.lineTo(corners.bottomRight.x, corners.bottomRight.y + thickness);
    ctx.lineTo(corners.topRight.x, corners.topRight.y + thickness * 0.8);
    ctx.closePath();
    ctx.fill();

    // ── 5. Table Surface (Deep Tournament Blue) ──
    const surfGrad = ctx.createLinearGradient(0, corners.topLeft.y, 0, corners.bottomLeft.y);
    surfGrad.addColorStop(0, '#1d4ed8');
    surfGrad.addColorStop(0.4, '#2563eb');
    surfGrad.addColorStop(1, '#1e40af');
    ctx.fillStyle = surfGrad;
    ctx.beginPath();
    ctx.moveTo(corners.topLeft.x, corners.topLeft.y);
    ctx.lineTo(corners.topRight.x, corners.topRight.y);
    ctx.lineTo(corners.bottomRight.x, corners.bottomRight.y);
    ctx.lineTo(corners.bottomLeft.x, corners.bottomLeft.y);
    ctx.closePath();
    ctx.fill();

    // Surface beveled outer edge
    ctx.strokeStyle = '#60a5fa';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // ── 6. Tournament White Lines ──
    // Outer white boundary lines (slightly inset)
    const pTL = TableTennis3DRenderer.project(12, 10);
    const pTR = TableTennis3DRenderer.project(588, 10);
    const pBR = TableTennis3DRenderer.project(588, 390);
    const pBL = TableTennis3DRenderer.project(12, 390);

    ctx.strokeStyle = cfg.table.lineColor;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(pTL.x, pTL.y);
    ctx.lineTo(pTR.x, pTR.y);
    ctx.lineTo(pBR.x, pBR.y);
    ctx.lineTo(pBL.x, pBL.y);
    ctx.closePath();
    ctx.stroke();

    // Center longitudinal service line (divides halves)
    const pCL_Top = TableTennis3DRenderer.project(12, 200);
    const pCL_Bot = TableTennis3DRenderer.project(588, 200);
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(pCL_Top.x, pCL_Top.y);
    ctx.lineTo(pCL_Bot.x, pCL_Bot.y);
    ctx.stroke();

    // ── 7. 3D Net ──
    const netLX = 300;
    const netTop = TableTennis3DRenderer.project(netLX, 0);
    const netBot = TableTennis3DRenderer.project(netLX, 400);
    const netH = cfg.net.height;

    // Left & right steel net clamp posts
    const postGrad = ctx.createLinearGradient(netTop.x - 4, 0, netTop.x + 4, 0);
    postGrad.addColorStop(0, '#64748b');
    postGrad.addColorStop(1, '#1e293b');
    ctx.fillStyle = postGrad;

    // Top post
    ctx.fillRect(netTop.x - 4, netTop.y - netH - 4, 8, netH + 8);
    // Bottom post
    ctx.fillRect(netBot.x - 4, netBot.y - netH - 4, 8, netH + 8);

    // Translucent Net Mesh
    ctx.fillStyle = cfg.net.meshColor;
    ctx.beginPath();
    ctx.moveTo(netTop.x, netTop.y);
    ctx.lineTo(netBot.x, netBot.y);
    ctx.lineTo(netBot.x, netBot.y - netH);
    ctx.lineTo(netTop.x, netTop.y - netH);
    ctx.closePath();
    ctx.fill();

    // Net mesh grid pattern
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 6; i++) {
      const hOffset = (netH / 7) * i;
      ctx.beginPath();
      ctx.moveTo(netTop.x, netTop.y - hOffset);
      ctx.lineTo(netBot.x, netBot.y - hOffset);
      ctx.stroke();
    }

    // Top white tape
    ctx.strokeStyle = cfg.net.topTapeColor;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(netTop.x, netTop.y - netH);
    ctx.lineTo(netBot.x, netBot.y - netH);
    ctx.stroke();

    // ── 8. 3D Paddles ──
    // Player 1 Paddle (Left, Red rubber)
    TableTennis3DRenderer.drawPaddle(ctx, 24, p1Y, p1Vy, 'p1');

    // Player 2 / Opponent Paddle (Right, Dark Slate/Blue rubber)
    TableTennis3DRenderer.drawPaddle(ctx, 576, p2Y, p2Vy, 'p2');

    // ── 9. Particle Sparks ──
    particles.forEach((p) => {
      ctx.save();
      ctx.globalAlpha = p.life / p.maxLife;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // ── 10. 3D Celluloid Ball with Dynamic Table Shadow ──
    if (ball.inPlay) {
      // Calculate parabolic height arc z above table
      const distFromCenter = Math.abs(ball.x - 300) / 300;
      const ballZ = Math.max(2, (1.0 - Math.pow(distFromCenter, 1.8)) * 28 + Math.sin(Date.now() * 0.01) * 2);

      // 1. Table contact shadow
      const projShadow = TableTennis3DRenderer.project(ball.x, ball.y, 0);
      const shadowScale = projShadow.scale * (1.0 - Math.min(0.5, ballZ / 60));
      const shadowAlpha = Math.max(0.12, 0.45 - (ballZ / 80));

      ctx.save();
      ctx.fillStyle = `rgba(0, 0, 0, ${shadowAlpha})`;
      ctx.beginPath();
      ctx.ellipse(projShadow.x, projShadow.y, 7 * shadowScale, 3.5 * shadowScale, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 2. Ball Motion Trail
      if (trail.length > 1) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let i = 0; i < trail.length; i++) {
          const tp = TableTennis3DRenderer.project(trail[i]!.x, trail[i]!.y, ballZ * (i / trail.length));
          if (i === 0) ctx.moveTo(tp.x, tp.y);
          else ctx.lineTo(tp.x, tp.y);
        }
        ctx.stroke();
        ctx.restore();
      }

      // 3. Volumetric 3D Ball Sphere
      const projBall = TableTennis3DRenderer.project(ball.x, ball.y, ballZ);
      const r = cfg.ballRadius * projBall.scale * 1.35;

      ctx.save();
      // Spherical Radial Gradient (315° Studio Light)
      const lx = projBall.x - r * 0.35;
      const ly = projBall.y - r * 0.35;
      const ballGrad = ctx.createRadialGradient(lx, ly, 1, projBall.x, projBall.y, r);
      ballGrad.addColorStop(0, '#ffffff'); // Catchlight
      ballGrad.addColorStop(0.35, '#f8fafc');
      ballGrad.addColorStop(0.8, '#cbd5e1'); // Ambient shading
      ballGrad.addColorStop(1, '#94a3b8');   // Occlusion rim
      ctx.fillStyle = ballGrad;
      ctx.beginPath();
      ctx.arc(projBall.x, projBall.y, r, 0, Math.PI * 2);
      ctx.fill();

      // Specular glint
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.beginPath();
      ctx.arc(lx, ly, r * 0.28, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  /**
   * Renders a physical 3D table tennis paddle with wood blade, rubber face, handle, and shadow.
   */
  static drawPaddle(
    ctx: CanvasRenderingContext2D,
    lx: number,
    ly: number,
    vy: number,
    player: 'p1' | 'p2'
  ): void {
    const centerY = ly + 40;
    const proj = TableTennis3DRenderer.project(lx, centerY, 8);
    const scale = proj.scale;

    const rubberColor = player === 'p1' ? '#ef4444' : '#1e293b';
    const rimColor = player === 'p1' ? '#991b1b' : '#0f172a';

    ctx.save();
    ctx.translate(proj.x, proj.y);

    // Tilt paddle slightly based on vertical speed
    const tilt = Math.max(-0.25, Math.min(0.25, (vy || 0) * 0.04));
    ctx.rotate(tilt);

    // 1. Soft Paddle Contact Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
    ctx.beginPath();
    ctx.ellipse(3, 16 * scale, 9 * scale, 30 * scale, 0, 0, Math.PI * 2);
    ctx.fill();

    // 2. Wooden Handle
    const handleH = 26 * scale;
    const handleW = 7 * scale;
    const handleY = 22 * scale;

    const handleGrad = ctx.createLinearGradient(-handleW / 2, 0, handleW / 2, 0);
    handleGrad.addColorStop(0, '#78350f');
    handleGrad.addColorStop(0.4, '#b45309');
    handleGrad.addColorStop(1, '#92400e');
    ctx.fillStyle = handleGrad;
    ctx.beginPath();
    ctx.roundRect(-handleW / 2, handleY, handleW, handleH, 3);
    ctx.fill();

    // Grip Tape Band
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-handleW / 2, handleY + handleH * 0.3, handleW, handleH * 0.35);

    // 3. Multi-Ply Wood Blade Rim
    const bladeRadiusX = 8 * scale;
    const bladeRadiusY = 28 * scale;

    ctx.fillStyle = '#d97706';
    ctx.beginPath();
    ctx.ellipse(0, 0, bladeRadiusX + 1.5, bladeRadiusY + 1.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // 4. Textured Rubber Face
    const rubGrad = ctx.createLinearGradient(-bladeRadiusX, 0, bladeRadiusX, 0);
    rubGrad.addColorStop(0, rimColor);
    rubGrad.addColorStop(0.35, rubberColor);
    rubGrad.addColorStop(0.7, rubberColor);
    rubGrad.addColorStop(1, rimColor);
    ctx.fillStyle = rubGrad;
    ctx.beginPath();
    ctx.ellipse(0, 0, bladeRadiusX, bladeRadiusY, 0, 0, Math.PI * 2);
    ctx.fill();

    // 5. Specular highlight curve
    ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.beginPath();
    ctx.ellipse(-bladeRadiusX * 0.3, -bladeRadiusY * 0.3, bladeRadiusX * 0.45, bladeRadiusY * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}
