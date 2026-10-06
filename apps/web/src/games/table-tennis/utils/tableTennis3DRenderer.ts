import { TABLE_TENNIS_VISUAL_CONFIG, type CameraState, prefersReducedMotion } from '../constants/tableTennisVisualConfig';

export interface Point2D {
  x: number;
  y: number;
}

export interface CameraTransform {
  zoom: number;
  offsetX: number;
  offsetY: number;
}

export class TableTennis3DRenderer {
  private static isPortraitMode = false;
  private static currentCamera: CameraTransform = { zoom: 1.0, offsetX: 0, offsetY: 0 };
  private static ballSpinAngle = 0;

  /**
   * Updates and smooth-lerps the 3D broadcast camera based on match state.
   */
  static updateCamera(
    cameraState: CameraState,
    ball: { x: number; y: number; vx: number; vy: number; inPlay: boolean },
    dt: number
  ): CameraTransform {
    if (prefersReducedMotion()) {
      this.currentCamera = { zoom: 1.0, offsetX: 0, offsetY: 0 };
      return this.currentCamera;
    }

    const cfg = TABLE_TENNIS_VISUAL_CONFIG.camera;
    const target = cfg.states[cameraState] || cfg.states.RALLY;

    let targetOffsetX = target.offsetX;
    let targetOffsetY = target.offsetY;
    let targetZoom = target.zoom;

    // Fast shot subtle ball-tracking
    if (cameraState === 'BALL_FOLLOW' || (cameraState === 'RALLY' && ball.inPlay && Math.abs(ball.vx) > 7.5)) {
      const ballNormY = (ball.y - 200) / 200; // -1 (left) to +1 (right)
      targetOffsetX += ballNormY * cfg.maxTrackingOffset;
    }

    const lerpFactor = Math.min(1, dt * cfg.interpolationSpeed);
    this.currentCamera.zoom += (targetZoom - this.currentCamera.zoom) * lerpFactor;
    this.currentCamera.offsetX += (targetOffsetX - this.currentCamera.offsetX) * lerpFactor;
    this.currentCamera.offsetY += (targetOffsetY - this.currentCamera.offsetY) * lerpFactor;

    return this.currentCamera;
  }

  /**
   * Maps 2D logical coordinates (lx ∈ [0, 600], ly ∈ [0, 400], lz height)
   * to 3D End-to-End perspective screen coordinates.
   */
  static project(lx: number, ly: number, lz = 0): { x: number; y: number; scale: number; tableY: number } {
    const corners = this.isPortraitMode
      ? {
          topLeft:     { x: 135, y: 220 }, // Far Left
          topRight:    { x: 345, y: 220 }, // Far Right
          bottomRight: { x: 435, y: 640 }, // Near Right
          bottomLeft:  { x: 45,  y: 640 }, // Near Left
        }
      : TABLE_TENNIS_VISUAL_CONFIG.table.corners;
    const { logicalWidth, logicalHeight } = TABLE_TENNIS_VISUAL_CONFIG;

    // u ∈ [0, 1] across table width (left to right)
    const u = ly / logicalHeight;

    // v ∈ [0, 1] along table depth (0 = Far Baseline at top, 1 = Near Baseline at bottom)
    const v = 1 - lx / logicalWidth;

    // Bilinear interpolation across trapezoid
    const topX = corners.topLeft.x + (corners.topRight.x - corners.topLeft.x) * u;
    const topY = corners.topLeft.y + (corners.topRight.y - corners.topLeft.y) * u;
    const botX = corners.bottomLeft.x + (corners.bottomRight.x - corners.bottomLeft.x) * u;
    const botY = corners.bottomLeft.y + (corners.bottomRight.y - corners.bottomLeft.y) * u;

    const x = topX + (botX - topX) * v;
    const tableY = topY + (botY - topY) * v;
    const y = tableY - lz; // Lift with Z height

    // Perspective scale (objects in foreground at v=1 appear larger)
    const scale = (this.isPortraitMode ? 0.48 : 0.65) + v * (this.isPortraitMode ? 0.42 : 0.70);

    return { x, y, scale, tableY };
  }

  /**
   * Computes realistic parabolic bounce height (Z) for the ball during play.
   */
  static calculateBallZ(ball: { x: number; y: number; vx: number; vy: number; inPlay: boolean }): number {
    if (!ball.inPlay) return 14; // Rest height on paddle

    // Bounce at the middle of each half (150/450); crest above the net (300).
    // The old half-court modulo reset the height to 12 exactly at the net.
    const phase = Math.PI * ball.x / 300;
    const arc = TABLE_TENNIS_VISUAL_CONFIG.ball.maxApexHeight * Math.cos(phase) ** 2;
    return 12 + arc;
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
    particles: Array<{ x: number; y: number; color: string; life: number; maxLife: number }>,
    cameraState: CameraState = 'RALLY',
    dt = 0.016,
    isPortrait = false,
    nearColor: 'red' | 'blue' = 'red',
    farColor: 'red' | 'blue' = 'blue'
  ): void {
    this.isPortraitMode = isPortrait;
    const cfg = TABLE_TENNIS_VISUAL_CONFIG;
    const w = isPortrait ? 480 : cfg.canvasWidth;
    const h = isPortrait ? 800 : cfg.canvasHeight;

    // Update ball rotational spin angle
    if (ball.inPlay) {
      this.ballSpinAngle += (ball.vx + ball.vy) * 0.08;
    }

    // Update dynamic 3D camera
    const camera = this.updateCamera(cameraState, ball, dt);

    ctx.save();
    // Apply Camera Transform
    ctx.translate(w / 2 + camera.offsetX, h / 2 + camera.offsetY);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-w / 2, -h / 2);

    // ── 1. Stadium Backdrop & Arena Lighting ──
    this.renderArenaBackground(ctx, w, h);

    // ── 2. Table Legs & Floor Contact Shadow ──
    this.renderTableUnderstructure(ctx, cfg);

    // ── 3. Table 3D Apron & Playing Surface ──
    this.renderTableSurface(ctx, cfg);

    // ── 4. Far Opponent Paddle & Hand (Drawn Behind Net) ──
    const p2CenterY = p2Y + cfg.paddleHeight / 2;
    this.drawFarPaddle(ctx, 580, p2CenterY, p2Vy, farColor);

    // ── 5. Horizontal 3D Woven Net ──
    this.renderHorizontalNet(ctx, cfg);

    // ── 6. 3D Ball & Dynamic Shadow ──
    this.renderBall(ctx, ball, trail);

    // ── 7. Near Player Paddle & Forearm (Foreground) ──
    const p1CenterY = p1Y + cfg.paddleHeight / 2;
    this.drawNearPaddle(ctx, 20, p1CenterY, p1Vy, ball, nearColor);

    // ── 8. Particle Sparks & Hit Effects ──
    this.renderParticles(ctx, particles);

    ctx.restore();
  }

  private static cachedArenaCanvas: HTMLCanvasElement | null = null;
  private static cachedArenaSize = { w: 0, h: 0, isPortrait: false };

  /**
   * Generates and caches a high-detail realistic tournament arena background
   * featuring rich hardwood parquet flooring, perspective planks, wood grain fibers,
   * staggered butt joints, baseboard molding, and arena LED ribbon banner.
   */
  private static getArenaBackgroundCanvas(w: number, h: number): HTMLCanvasElement {
    if (
      this.cachedArenaCanvas &&
      this.cachedArenaSize.w === w &&
      this.cachedArenaSize.h === h &&
      this.cachedArenaSize.isPortrait === this.isPortraitMode
    ) {
      return this.cachedArenaCanvas;
    }

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;

    const horizonY = this.isPortraitMode ? 225 : 195;
    const vpX = w / 2;
    const vpY = this.isPortraitMode ? 70 : 55; // Vanishing point for floor perspective

    // ── 1. Stadium Backdrop Wall ──
    const wallGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
    wallGrad.addColorStop(0, '#060a12');
    wallGrad.addColorStop(0.5, '#0b111e');
    wallGrad.addColorStop(0.85, '#131b2e');
    wallGrad.addColorStop(1, '#0e1626');
    ctx.fillStyle = wallGrad;
    ctx.fillRect(0, 0, w, horizonY);

    // Arena Acoustic Wall Slat Panels
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.025)';
    ctx.lineWidth = 1;
    for (let y = 12; y < horizonY; y += 14) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Horizontal Arena LED / Banner Ribbon Strip
    const bannerY = horizonY - (this.isPortraitMode ? 40 : 45);
    const bannerH = this.isPortraitMode ? 22 : 26;
    const bannerGrad = ctx.createLinearGradient(0, bannerY, 0, bannerY + bannerH);
    bannerGrad.addColorStop(0, '#091524');
    bannerGrad.addColorStop(0.5, '#1b3453');
    bannerGrad.addColorStop(1, '#091524');
    ctx.fillStyle = bannerGrad;
    ctx.fillRect(0, bannerY, w, bannerH);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, bannerY, w, bannerH);

    // Arena sponsor / court branding text on ribbon
    ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      this.isPortraitMode ? '• WORLD TABLE TENNIS • ITTF ARENA •' : '• WORLD TABLE TENNIS CHAMPIONSHIP • ITTF PRO ARENA •',
      w / 2,
      bannerY + (this.isPortraitMode ? 15 : 17)
    );

    // ── 2. Arena Baseboard Molding & Transition Trim ──
    const trimY = horizonY - 6;
    const trimH = 12;
    const trimGrad = ctx.createLinearGradient(0, trimY, 0, trimY + trimH);
    trimGrad.addColorStop(0, '#1a0d05');
    trimGrad.addColorStop(0.4, '#381c0c');
    trimGrad.addColorStop(1, '#110903');
    ctx.fillStyle = trimGrad;
    ctx.fillRect(0, trimY, w, trimH);

    // Baseboard shadow onto floor
    const trimShadow = ctx.createLinearGradient(0, horizonY, 0, horizonY + 8);
    trimShadow.addColorStop(0, 'rgba(0, 0, 0, 0.70)');
    trimShadow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = trimShadow;
    ctx.fillRect(0, horizonY, w, 8);

    // ── 3. Realistic Hardwood Sports Parquet Flooring ──
    // Base wood under-tone
    const baseFloorGrad = ctx.createLinearGradient(0, horizonY, 0, h);
    baseFloorGrad.addColorStop(0, '#4a250f');
    baseFloorGrad.addColorStop(0.4, '#6b3614');
    baseFloorGrad.addColorStop(0.8, '#854318');
    baseFloorGrad.addColorStop(1, '#572b0f');
    ctx.fillStyle = baseFloorGrad;
    ctx.fillRect(0, horizonY, w, h - horizonY);

    // Realistic Individual Wood Planks in Perspective
    const plankTones = [
      '#4e270d', '#582c0f', '#643212', '#723915', '#804018',
      '#5c2e10', '#693513', '#773c16', '#874419', '#6e3714',
      '#49240c', '#53290e', '#603011', '#7b3e17', '#8e481b'
    ];

    const plankCount = 38;
    const botSpan = w + 450;
    const botStart = -225;
    const plankBotW = botSpan / plankCount;

    for (let i = 0; i < plankCount; i++) {
      const bx1 = botStart + i * plankBotW;
      const bx2 = bx1 + plankBotW;

      // Project top x to horizon vanishing point
      const tx1 = vpX + (bx1 - vpX) * ((horizonY - vpY) / (h - vpY));
      const tx2 = vpX + (bx2 - vpX) * ((horizonY - vpY) / (h - vpY));

      // Hash index for stable, authentic variation across planks
      const hash = Math.abs(Math.sin(i * 127.1 + 311.7)) * 10000;
      const toneIndex = Math.floor(hash) % plankTones.length;
      const plankColor = plankTones[toneIndex]!;

      // Draw plank trapezoid
      ctx.fillStyle = plankColor;
      ctx.beginPath();
      ctx.moveTo(tx1, horizonY);
      ctx.lineTo(tx2, horizonY);
      ctx.lineTo(bx2, h);
      ctx.lineTo(bx1, h);
      ctx.closePath();
      ctx.fill();

      // Subtle fine wood grain fibers inside each plank
      ctx.save();
      ctx.clip(); // Clip inside current plank trapezoid

      const numGrains = 4 + Math.floor((hash * 3) % 4);
      for (let g = 0; g < numGrains; g++) {
        const grainOffset = (g + 0.5) / numGrains;
        const gbx = bx1 + (bx2 - bx1) * grainOffset;
        const gtx = tx1 + (tx2 - tx1) * grainOffset;
        const curve = ((hash * (g + 1)) % 12) - 6;

        ctx.strokeStyle = g % 2 === 0 ? 'rgba(0, 0, 0, 0.12)' : 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 1 + (g % 2) * 0.5;
        ctx.beginPath();
        ctx.moveTo(gtx, horizonY);
        ctx.quadraticCurveTo((gtx + gbx) / 2 + curve, (horizonY + h) / 2, gbx, h);
        ctx.stroke();
      }

      // Staggered horizontal butt-joint seams across this plank
      const numSeams = 3 + Math.floor((hash * 7) % 3);
      for (let s = 1; s <= numSeams; s++) {
        const seamT = (s / (numSeams + 1)) + (((hash * s) % 10) - 5) * 0.02;
        const sy = horizonY + (h - horizonY) * seamT;
        const sx1 = tx1 + (bx1 - tx1) * seamT;
        const sx2 = tx2 + (bx2 - tx2) * seamT;

        // Seam shadow line
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.40)';
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(sx1, sy);
        ctx.lineTo(sx2, sy);
        ctx.stroke();

        // Seam bevel light reflection
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(sx1, sy + 1);
        ctx.lineTo(sx2, sy + 1);
        ctx.stroke();
      }

      ctx.restore();

      // Longitudinal Plank Separation Groove (Dark gap + light bevel)
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(tx1, horizonY);
      ctx.lineTo(bx1, h);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(tx1 + 0.8, horizonY);
      ctx.lineTo(bx1 + 0.8, h);
      ctx.stroke();
    }

    // ── 4. Polished Varnish Gloss & Specular Sheen ──
    const varnishGrad = ctx.createLinearGradient(0, horizonY, 0, h);
    varnishGrad.addColorStop(0, 'rgba(0, 0, 0, 0.35)');
    varnishGrad.addColorStop(0.3, 'rgba(255, 255, 255, 0.07)');
    varnishGrad.addColorStop(0.7, 'rgba(255, 255, 255, 0.03)');
    varnishGrad.addColorStop(1, 'rgba(0, 0, 0, 0.28)');
    ctx.fillStyle = varnishGrad;
    ctx.fillRect(0, horizonY, w, h - horizonY);

    // Warm Golden Amber Ambient Tint
    const amberGrad = ctx.createRadialGradient(w / 2, 340, 60, w / 2, 340, 430);
    amberGrad.addColorStop(0, 'rgba(245, 158, 11, 0.09)');
    amberGrad.addColorStop(0.7, 'rgba(217, 119, 6, 0.025)');
    amberGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = amberGrad;
    ctx.fillRect(0, horizonY, w, h - horizonY);

    // Perimeter Vignette Shadow
    const vignetteGrad = ctx.createRadialGradient(w / 2, h / 2, 220, w / 2, h / 2, w / 2 + 120);
    vignetteGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignetteGrad.addColorStop(0.75, 'rgba(0, 0, 0, 0.25)');
    vignetteGrad.addColorStop(1, 'rgba(0, 0, 0, 0.60)');
    ctx.fillStyle = vignetteGrad;
    ctx.fillRect(0, 0, w, h);

    this.cachedArenaCanvas = canvas;
    this.cachedArenaSize = { w, h, isPortrait: this.isPortraitMode };
    return canvas;
  }

  /**
   * Renders the tournament stadium wall, realistic hardwood floor, and arena floodlighting.
   */
  private static renderArenaBackground(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const { arena } = TABLE_TENNIS_VISUAL_CONFIG;

    // 1. Draw Cached Ultra-Realistic Hardwood Arena Floor & Wall
    ctx.drawImage(this.getArenaBackgroundCanvas(w, h), 0, 0);

    // 2. Overhead Dynamic Stadium Spotlight Cone
    const spotGrad = ctx.createRadialGradient(w / 2, 70, 40, w / 2, 320, 420);
    spotGrad.addColorStop(0, arena.spotlight);
    spotGrad.addColorStop(0.6, 'rgba(56, 189, 248, 0.025)');
    spotGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = spotGrad;
    ctx.fillRect(0, 0, w, h);

    // 3. Soft Table Reflection on Polished Floor
    const reflGrad = ctx.createRadialGradient(w / 2, 340, 30, w / 2, 340, 220);
    reflGrad.addColorStop(0, 'rgba(2, 132, 199, 0.12)');
    reflGrad.addColorStop(0.6, 'rgba(3, 105, 161, 0.04)');
    reflGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = reflGrad;
    ctx.fillRect(0, 200, w, h - 200);
  }

  /**
   * Renders the table understructure, tubular steel legs, and floor contact shadow.
   */
  private static renderTableUnderstructure(ctx: CanvasRenderingContext2D, cfg: typeof TABLE_TENNIS_VISUAL_CONFIG): void {
    const corners = this.isPortraitMode
      ? {
          topLeft:     { x: 135, y: 220 },
          topRight:    { x: 345, y: 220 },
          bottomRight: { x: 435, y: 640 },
          bottomLeft:  { x: 45,  y: 640 },
        }
      : cfg.table.corners;
    const thickness = cfg.table.thickness;

    // 1. Floor Contact Drop Shadow
    ctx.save();
    ctx.fillStyle = cfg.table.floorShadowColor;
    ctx.beginPath();
    ctx.moveTo(corners.topLeft.x - 24, corners.topLeft.y + 70);
    ctx.lineTo(corners.topRight.x + 24, corners.topRight.y + 70);
    ctx.lineTo(corners.bottomRight.x + 45, corners.bottomRight.y + 60);
    ctx.lineTo(corners.bottomLeft.x - 45, corners.bottomLeft.y + 60);
    ctx.closePath();
    ctx.filter = 'blur(18px)';
    ctx.fill();
    ctx.filter = 'none';
    ctx.restore();

    // 2. Tubular Steel Legs with Support Bars
    const legs = [
      // Back Left Leg
      { x: corners.topLeft.x + 24, y: corners.topLeft.y + thickness, h: 58, scale: 0.65 },
      // Back Right Leg
      { x: corners.topRight.x - 24, y: corners.topRight.y + thickness, h: 58, scale: 0.65 },
      // Front Left Leg
      { x: corners.bottomLeft.x + 36, y: corners.bottomLeft.y + thickness, h: 52, scale: 1.1 },
      // Front Right Leg
      { x: corners.bottomRight.x - 36, y: corners.bottomRight.y + thickness, h: 52, scale: 1.1 },
      // Center Net Support Struts
      { x: (corners.topLeft.x + corners.bottomLeft.x) / 2 + 10, y: (corners.topLeft.y + corners.bottomLeft.y) / 2 + thickness, h: 55, scale: 0.85 },
      { x: (corners.topRight.x + corners.bottomRight.x) / 2 - 10, y: (corners.topRight.y + corners.bottomRight.y) / 2 + thickness, h: 55, scale: 0.85 },
    ];

    legs.forEach((leg) => {
      const legW = 8 * leg.scale;

      // Leg floor shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.fillRect(leg.x - legW / 2 + 2, leg.y + leg.h - 4, legW * 1.5, 6);

      // Steel tube gradient
      const lg = ctx.createLinearGradient(leg.x - legW / 2, 0, leg.x + legW / 2, 0);
      lg.addColorStop(0, '#334155');
      lg.addColorStop(0.4, '#64748b');
      lg.addColorStop(1, '#1e293b');
      ctx.fillStyle = lg;
      ctx.beginPath();
      ctx.roundRect(leg.x - legW / 2, leg.y, legW, leg.h, 2);
      ctx.fill();

      // Foot caster / base pad
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(leg.x - legW / 2 - 1, leg.y + leg.h - 4, legW + 2, 4);
    });

    // Crossbar support between front legs
    const fL = legs[2]!;
    const fR = legs[3]!;
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(fL.x, fL.y + 24);
    ctx.lineTo(fR.x, fR.y + 24);
    ctx.stroke();
  }

  /**
   * Renders the 3D wooden table apron and competition matte blue playing surface with crisp white markings.
   */
  private static renderTableSurface(ctx: CanvasRenderingContext2D, cfg: typeof TABLE_TENNIS_VISUAL_CONFIG): void {
    const corners = this.isPortraitMode
      ? {
          topLeft:     { x: 135, y: 220 },
          topRight:    { x: 345, y: 220 },
          bottomRight: { x: 435, y: 640 },
          bottomLeft:  { x: 45,  y: 640 },
        }
      : cfg.table.corners;
    const thickness = cfg.table.thickness;

    // ── 1. Front Edge Apron (Thickness facing the camera) ──
    const frontApronGrad = ctx.createLinearGradient(0, corners.bottomLeft.y, 0, corners.bottomLeft.y + thickness);
    frontApronGrad.addColorStop(0, cfg.table.apronColor);
    frontApronGrad.addColorStop(0.6, cfg.table.apronSideColor);
    frontApronGrad.addColorStop(1, '#031926');
    ctx.fillStyle = frontApronGrad;
    ctx.beginPath();
    ctx.moveTo(corners.bottomLeft.x, corners.bottomLeft.y);
    ctx.lineTo(corners.bottomRight.x, corners.bottomRight.y);
    ctx.lineTo(corners.bottomRight.x, corners.bottomRight.y + thickness);
    ctx.lineTo(corners.bottomLeft.x, corners.bottomLeft.y + thickness);
    ctx.closePath();
    ctx.fill();

    // Metallic bottom edge trim
    ctx.strokeStyle = cfg.table.trimColor;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(corners.bottomLeft.x, corners.bottomLeft.y + thickness);
    ctx.lineTo(corners.bottomRight.x, corners.bottomRight.y + thickness);
    ctx.stroke();

    // ── 2. Left Edge Apron ──
    ctx.fillStyle = cfg.table.apronSideColor;
    ctx.beginPath();
    ctx.moveTo(corners.topLeft.x, corners.topLeft.y);
    ctx.lineTo(corners.bottomLeft.x, corners.bottomLeft.y);
    ctx.lineTo(corners.bottomLeft.x, corners.bottomLeft.y + thickness);
    ctx.lineTo(corners.topLeft.x, corners.topLeft.y + thickness * 0.65);
    ctx.closePath();
    ctx.fill();

    // ── 3. Right Edge Apron ──
    ctx.fillStyle = '#062033';
    ctx.beginPath();
    ctx.moveTo(corners.topRight.x, corners.topRight.y);
    ctx.lineTo(corners.bottomRight.x, corners.bottomRight.y);
    ctx.lineTo(corners.bottomRight.x, corners.bottomRight.y + thickness);
    ctx.lineTo(corners.topRight.x, corners.topRight.y + thickness * 0.65);
    ctx.closePath();
    ctx.fill();

    // ── 4. Table Surface (ITTF Competition Matte Blue) ──
    const surfGrad = ctx.createLinearGradient(0, corners.topLeft.y, 0, corners.bottomLeft.y);
    surfGrad.addColorStop(0, cfg.table.surfaceBaseColor); // Deep background blue
    surfGrad.addColorStop(0.35, cfg.table.surfaceMidColor); // Rich mid blue
    surfGrad.addColorStop(0.75, cfg.table.surfaceTopColor); // Keylit foreground blue
    surfGrad.addColorStop(1, cfg.table.surfaceMidColor);
    ctx.fillStyle = surfGrad;
    ctx.beginPath();
    ctx.moveTo(corners.topLeft.x, corners.topLeft.y);
    ctx.lineTo(corners.topRight.x, corners.topRight.y);
    ctx.lineTo(corners.bottomRight.x, corners.bottomRight.y);
    ctx.lineTo(corners.bottomLeft.x, corners.bottomLeft.y);
    ctx.closePath();
    ctx.fill();

    // Subtle matte surface grain
    ctx.strokeStyle = cfg.table.surfaceGrain;
    ctx.lineWidth = 1;
    for (let gy = corners.topLeft.y + 6; gy < corners.bottomLeft.y; gy += 10) {
      ctx.beginPath();
      ctx.moveTo(corners.topLeft.x, gy);
      ctx.lineTo(corners.topRight.x, gy);
      ctx.stroke();
    }

    // Beveled table perimeter rim highlight
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // ── 5. Painted Competition White Lines ──
    const pTL = this.project(596, 4);
    const pTR = this.project(596, 396);
    const pBR = this.project(4, 396);
    const pBL = this.project(4, 4);

    ctx.strokeStyle = cfg.table.lineColor;
    ctx.lineWidth = cfg.table.lineWidth;
    ctx.beginPath();
    ctx.moveTo(pTL.x, pTL.y);
    ctx.lineTo(pTR.x, pTR.y);
    ctx.lineTo(pBR.x, pBR.y);
    ctx.lineTo(pBL.x, pBL.y);
    ctx.closePath();
    ctx.stroke();

    // Center longitudinal service divide line
    const pCenterFar = this.project(596, 200);
    const pCenterNear = this.project(4, 200);
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(pCenterFar.x, pCenterFar.y);
    ctx.lineTo(pCenterNear.x, pCenterNear.y);
    ctx.stroke();
  }

  /**
   * Renders the horizontal 3D woven net across the middle of the table (lx = 300).
   */
  private static renderHorizontalNet(ctx: CanvasRenderingContext2D, cfg: typeof TABLE_TENNIS_VISUAL_CONFIG): void {
    const netLX = 300; // Halfway down table length
    const netLeft = this.project(netLX, 0);
    const netRight = this.project(netLX, 400);
    const netH = cfg.net.height;
    const overhang = cfg.net.overhang;

    const x1 = netLeft.x - overhang;
    const y1 = netLeft.y;
    const x2 = netRight.x + overhang;
    const y2 = netRight.y;

    // 1. Steel Net Clamp Posts
    const postW = 6;
    // Left post
    const postLGrad = ctx.createLinearGradient(x1 - postW / 2, 0, x1 + postW / 2, 0);
    postLGrad.addColorStop(0, '#475569');
    postLGrad.addColorStop(0.5, cfg.net.postTopColor);
    postLGrad.addColorStop(1, cfg.net.postColor);
    ctx.fillStyle = postLGrad;
    ctx.beginPath();
    ctx.roundRect(x1 - postW / 2, y1 - netH - 4, postW, netH + 10, 2);
    ctx.fill();

    // Right post
    const postRGrad = ctx.createLinearGradient(x2 - postW / 2, 0, x2 + postW / 2, 0);
    postRGrad.addColorStop(0, '#475569');
    postRGrad.addColorStop(0.5, cfg.net.postTopColor);
    postRGrad.addColorStop(1, cfg.net.postColor);
    ctx.fillStyle = postRGrad;
    ctx.beginPath();
    ctx.roundRect(x2 - postW / 2, y2 - netH - 4, postW, netH + 10, 2);
    ctx.fill();

    // Post top caps
    ctx.fillStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.arc(x1, y1 - netH - 4, 3.5, 0, Math.PI * 2);
    ctx.arc(x2, y2 - netH - 4, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // 2. Translucent Net Mesh
    const meshGrad = ctx.createLinearGradient(0, y1 - netH, 0, y1);
    meshGrad.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
    meshGrad.addColorStop(0.7, 'rgba(203, 213, 225, 0.35)');
    meshGrad.addColorStop(1, 'rgba(148, 163, 184, 0.25)');
    ctx.fillStyle = meshGrad;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x2, y2 - netH);
    ctx.lineTo(x1, y1 - netH);
    ctx.closePath();
    ctx.fill();

    // Woven Net Mesh Grid Lines
    ctx.strokeStyle = cfg.net.meshLineColor;
    ctx.lineWidth = 1;

    // Horizontal cords
    for (let i = 1; i <= 5; i++) {
      const hOffset = (netH / 6) * i;
      ctx.beginPath();
      ctx.moveTo(x1, y1 - hOffset);
      ctx.lineTo(x2, y2 - hOffset);
      ctx.stroke();
    }

    // Vertical cords
    const numVertLines = 26;
    for (let j = 1; j < numVertLines; j++) {
      const t = j / numVertLines;
      const bx = x1 + (x2 - x1) * t;
      const by = y1 + (y2 - y1) * t;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx, by - netH);
      ctx.stroke();
    }

    // 3. Top White Cord Tape (Crisp white binding)
    ctx.strokeStyle = cfg.net.topTapeColor;
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(x1, y1 - netH);
    ctx.lineTo(x2, y2 - netH);
    ctx.stroke();

    // 4. Bottom Net Tape (Anchored along table)
    ctx.strokeStyle = cfg.net.bottomTapeColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  /**
   * Renders the 3D ball, its dynamic height loft, rotational spin, and contact drop shadow.
   */
  private static renderBall(
    ctx: CanvasRenderingContext2D,
    ball: { x: number; y: number; vx: number; vy: number; inPlay: boolean },
    trail: Array<{ x: number; y: number }>
  ): void {
    const { ball: ballCfg } = TABLE_TENNIS_VISUAL_CONFIG;
    const ballZ = this.calculateBallZ(ball);
    const { x, y, scale, tableY } = this.project(ball.x, ball.y, ballZ);
    const ballR = Math.max(4, TABLE_TENNIS_VISUAL_CONFIG.ballRadius * scale);

    // ── 1. Motion Trail (Subtle speed blur) ──
    if (ball.inPlay && trail.length > 1) {
      ctx.save();
      for (let i = 0; i < trail.length; i++) {
        const pt = trail[i]!;
        const pz = this.calculateBallZ({ ...ball, x: pt.x, y: pt.y });
        const proj = this.project(pt.x, pt.y, pz);
        const alpha = (i / trail.length) * 0.32;
        const trailR = ballR * (0.5 + (i / trail.length) * 0.5);

        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.beginPath();
        ctx.arc(proj.x, proj.y, trailR, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // ── 2. Table Surface Contact Drop Shadow ──
    ctx.save();
    const shadowScale = Math.max(0.4, 1 - ballZ / 120);
    const shadowR = ballR * 1.3 * shadowScale;
    const shadowAlpha = Math.max(0.15, 0.45 * shadowScale);

    ctx.fillStyle = `rgba(0, 0, 0, ${shadowAlpha})`;
    ctx.beginPath();
    ctx.ellipse(x, tableY, shadowR * 1.4, shadowR * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // ── 3. 3D Matte White Competition Poly Ball ──
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(this.ballSpinAngle);

    const ballGrad = ctx.createRadialGradient(
      -ballR * 0.35,
      -ballR * 0.35,
      ballR * 0.1,
      0,
      0,
      ballR
    );
    ballGrad.addColorStop(0, ballCfg.highlightColor);
    ballGrad.addColorStop(0.45, ballCfg.midColor);
    ballGrad.addColorStop(0.85, '#cbd5e1');
    ballGrad.addColorStop(1, ballCfg.shadowColor);

    ctx.fillStyle = ballGrad;
    ctx.beginPath();
    ctx.arc(0, 0, ballR, 0, Math.PI * 2);
    ctx.fill();

    // Subtle matte seam / logo mark that rotates with spin
    ctx.strokeStyle = 'rgba(100, 116, 139, 0.20)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, ballR * 0.65, -Math.PI / 4, Math.PI / 4);
    ctx.stroke();

    // Specular Glint Highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.beginPath();
    ctx.arc(-ballR * 0.35, -ballR * 0.35, ballR * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /**
   * Renders the Near Player's 3D paddle and holding forearm/hand in the foreground.
   */
  private static drawNearPaddle(
    ctx: CanvasRenderingContext2D,
    lx: number,
    ly: number,
    vy: number,
    ball: { x: number; y: number; vx: number; vy: number; inPlay: boolean },
    color: 'red' | 'blue' = 'red'
  ): void {
    const { paddles } = TABLE_TENNIS_VISUAL_CONFIG;
    const { x, y, scale } = this.project(lx, ly, 15);
    const s = scale * 1.30; // Foreground scale

    ctx.save();
    ctx.translate(x, y);

    // Dynamic swing tilt angle based on movement and ball proximity
    let tiltAngle = (vy / 20) * 0.16;
    if (ball.inPlay && ball.x < 100) {
      tiltAngle += (ball.y < ly ? -0.20 : 0.20);
    }
    ctx.rotate(tiltAngle);

    // ── 1. Paddle & Arm Floor Drop Shadow ──
    ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
    ctx.beginPath();
    ctx.ellipse(12 * s, 50 * s, 30 * s, 12 * s, 0.2, 0, Math.PI * 2);
    ctx.fill();

    // ── 2. Rendered Player Forearm & Hand ──
    const armW = 16 * s;
    const armH = 75 * s;
    const armY = 32 * s;

    // Player Forearm
    const armGrad = ctx.createLinearGradient(-armW / 2, armY, armW / 2, armY + armH);
    armGrad.addColorStop(0, paddles.skinHighlight);
    armGrad.addColorStop(0.5, paddles.skinMid);
    armGrad.addColorStop(1, paddles.skinShadow);
    ctx.fillStyle = armGrad;
    ctx.beginPath();
    ctx.roundRect(-armW / 2, armY, armW, armH, 8 * s);
    ctx.fill();

    // Athletic Wristband
    ctx.fillStyle = paddles.skinWristband;
    ctx.beginPath();
    ctx.roundRect(-armW / 2 - 1, armY + 24 * s, armW + 2, 14 * s, 3 * s);
    ctx.fill();

    // Hand Knuckles gripping handle
    const handGrad = ctx.createRadialGradient(0, armY + 6 * s, 2, 0, armY + 6 * s, 12 * s);
    handGrad.addColorStop(0, paddles.skinHighlight);
    handGrad.addColorStop(0.7, paddles.skinMid);
    handGrad.addColorStop(1, paddles.skinShadow);
    ctx.fillStyle = handGrad;
    ctx.beginPath();
    ctx.ellipse(0, armY + 6 * s, 10 * s, 12 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    // ── 3. Flared Wooden Handle ──
    const handleW = 13 * s;
    const handleH = 40 * s;
    const handleY = 16 * s;

    const handleGrad = ctx.createLinearGradient(-handleW / 2, 0, handleW / 2, 0);
    handleGrad.addColorStop(0, paddles.woodHandleDark);
    handleGrad.addColorStop(0.3, paddles.woodHandleTop);
    handleGrad.addColorStop(0.7, paddles.woodHandleBase);
    handleGrad.addColorStop(1, paddles.woodHandleDark);
    ctx.fillStyle = handleGrad;
    ctx.beginPath();
    ctx.roundRect(-handleW / 2, handleY, handleW, handleH, 4 * s);
    ctx.fill();

    // Handle Grip Wrap Stripe
    ctx.fillStyle = paddles.gripTape;
    ctx.fillRect(-handleW / 2 + 2, handleY + 6 * s, handleW - 4, 18 * s);
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(-handleW / 2 + 3, handleY + 12 * s, handleW - 6, 4 * s);

    // ── 4. Plywood Blade Edge Layer ──
    const bladeR = 27 * s;
    ctx.fillStyle = paddles.woodBlade;
    ctx.beginPath();
    ctx.ellipse(0, 0, bladeR + 1.6, bladeR * 1.15 + 1.6, 0, 0, Math.PI * 2);
    ctx.fill();

    // ── 5. Tournament Rubber Face (Red for P1, Blue for P2) ──
    const rubberGrad = ctx.createRadialGradient(
      -bladeR * 0.3,
      -bladeR * 0.3,
      bladeR * 0.1,
      0,
      0,
      bladeR * 1.1
    );
    if (color === 'blue') {
      rubberGrad.addColorStop(0, paddles.p2RubberTop);
      rubberGrad.addColorStop(0.4, paddles.p2RubberMid);
      rubberGrad.addColorStop(0.8, paddles.p2RubberDark);
      rubberGrad.addColorStop(1, paddles.p2Rim);
    } else {
      rubberGrad.addColorStop(0, paddles.p1RubberTop);
      rubberGrad.addColorStop(0.4, paddles.p1RubberMid);
      rubberGrad.addColorStop(0.8, paddles.p1RubberDark);
      rubberGrad.addColorStop(1, paddles.p1Rim);
    }
    ctx.fillStyle = rubberGrad;
    ctx.beginPath();
    ctx.ellipse(0, 0, bladeR, bladeR * 1.15, 0, 0, Math.PI * 2);
    ctx.fill();

    // Rubber Edge Rim Border
    ctx.strokeStyle = color === 'blue' ? paddles.p2Rim : paddles.p1Rim;
    ctx.lineWidth = 2.4 * s;
    ctx.stroke();

    // Pimpled Rubber Micro Texture
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    for (let rk = -bladeR * 0.7; rk <= bladeR * 0.7; rk += 6 * s) {
      ctx.beginPath();
      ctx.moveTo(-bladeR * 0.6, rk);
      ctx.lineTo(bladeR * 0.6, rk);
      ctx.stroke();
    }

    // Top Glossy Specular Reflection
    ctx.fillStyle = 'rgba(255, 255, 255, 0.40)';
    ctx.beginPath();
    ctx.ellipse(-bladeR * 0.3, -bladeR * 0.35, bladeR * 0.45, bladeR * 0.28, -Math.PI / 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  /**
   * Renders the Far Opponent's 3D paddle and hand in the background.
   */
  private static drawFarPaddle(
    ctx: CanvasRenderingContext2D,
    lx: number,
    ly: number,
    vy: number,
    color: 'red' | 'blue' = 'blue'
  ): void {
    const { paddles } = TABLE_TENNIS_VISUAL_CONFIG;
    const { x, y, scale } = this.project(lx, ly, 12);
    const s = scale * 1.05; // Background scale

    ctx.save();
    ctx.translate(x, y);

    // Opponent paddle dynamic tilt
    const tiltAngle = (vy / 20) * 0.12;
    ctx.rotate(tiltAngle);

    // ── 1. Contact Drop Shadow ──
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.beginPath();
    ctx.ellipse(4 * s, 30 * s, 20 * s, 7 * s, 0.1, 0, Math.PI * 2);
    ctx.fill();

    // ── 2. Opponent Hand Silhouette ──
    const armW = 12 * s;
    const armH = 35 * s;
    const armY = 16 * s;
    ctx.fillStyle = paddles.skinMid;
    ctx.beginPath();
    ctx.roundRect(-armW / 2, armY, armW, armH, 4 * s);
    ctx.fill();

    // ── 3. Handle ──
    const handleW = 9 * s;
    const handleH = 26 * s;
    const handleY = 10 * s;
    ctx.fillStyle = paddles.woodHandleBase;
    ctx.beginPath();
    ctx.roundRect(-handleW / 2, handleY, handleW, handleH, 3 * s);
    ctx.fill();

    // ── 4. Tournament Rubber Face (Blue for P2, Red for P1) ──
    const bladeR = 20 * s;
    ctx.fillStyle = paddles.woodBlade;
    ctx.beginPath();
    ctx.ellipse(0, 0, bladeR + 1.2, bladeR * 1.15 + 1.2, 0, 0, Math.PI * 2);
    ctx.fill();

    const rubberGrad = ctx.createRadialGradient(
      -bladeR * 0.3,
      -bladeR * 0.3,
      bladeR * 0.1,
      0,
      0,
      bladeR * 1.1
    );
    if (color === 'red') {
      rubberGrad.addColorStop(0, paddles.p1RubberTop);
      rubberGrad.addColorStop(0.4, paddles.p1RubberMid);
      rubberGrad.addColorStop(0.8, paddles.p1RubberDark);
      rubberGrad.addColorStop(1, paddles.p1Rim);
    } else {
      rubberGrad.addColorStop(0, paddles.p2RubberTop);
      rubberGrad.addColorStop(0.4, paddles.p2RubberMid);
      rubberGrad.addColorStop(0.8, paddles.p2RubberDark);
      rubberGrad.addColorStop(1, paddles.p2Rim);
    }
    ctx.fillStyle = rubberGrad;
    ctx.beginPath();
    ctx.ellipse(0, 0, bladeR, bladeR * 1.15, 0, 0, Math.PI * 2);
    ctx.fill();

    // Rim Border
    ctx.strokeStyle = color === 'red' ? paddles.p1Rim : paddles.p2Rim;
    ctx.lineWidth = 1.6 * s;
    ctx.stroke();

    // Specular Highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.beginPath();
    ctx.ellipse(-bladeR * 0.3, -bladeR * 0.35, bladeR * 0.4, bladeR * 0.22, -Math.PI / 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  /**
   * Renders hit particle sparks.
   */
  private static renderParticles(
    ctx: CanvasRenderingContext2D,
    particles: Array<{ x: number; y: number; color: string; life: number; maxLife: number }>
  ): void {
    particles.forEach((p) => {
      ctx.save();
      ctx.globalAlpha = p.life / p.maxLife;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }
}
