/**
 * High-Definition Realistic Human Cricketer Animation Renderer
 * Procedurally renders realistic, anatomically athletic human cricket player textures with:
 * - Natural human proportions, muscular curves, and dynamic athletic postures
 * - Multi-stop gradients for cylindrical 3D limb and torso lighting
 * - Molded competition batting pads with 3D cane ribs & knee rolls
 * - Aerodynamic helmet with titanium face grill & ear protection
 * - Pro split-finger batting gloves wrapped on English willow bat
 * - Complete animation suite: Idle stance & bat tap, backlift trigger,
 *   cover drive, straight punch, pull shot, lofted six, forward defense,
 *   running between wickets, dismissal reaction, and victory celebration.
 */

export class CricketPlayerRenderer {
  // ─────────────────────────────────────────────────────────────────────────────
  // COLOR PALETTE TOKENS
  // ─────────────────────────────────────────────────────────────────────────────
  private static readonly PALETTE = {
    skinLight: '#f6c49f',
    skinMid: '#e5a075',
    skinDark: '#c27848',
    skinShadow: '#8c4820',
    jerseyNavy: '#0f172a',
    jerseyBlue: '#1e40af',
    jerseyBright: '#2563eb',
    jerseyGold: '#fbbf24',
    jerseyTrim: '#38bdf8',
    whitePad: '#ffffff',
    padLight: '#f8fafc',
    padMid: '#e2e8f0',
    padDark: '#94a3b8',
    padRib: '#cbd5e1',
    woodLight: '#fef3c7',
    woodMid: '#fde68a',
    woodGrain: '#f59e0b',
    woodDark: '#b45309',
    gripBlue: '#0284c7',
    gripAccent: '#38bdf8',
    helmetShell: '#1e3a8a',
    helmetHighlight: '#3b82f6',
    helmetDark: '#0f172a',
    grillMetal: '#e2e8f0',
    grillShadow: '#64748b',
    shoesWhite: '#ffffff',
    shoesDark: '#0f172a',
    shoesCyan: '#0ea5e9',
    shadowColor: 'rgba(2, 6, 23, 0.65)',
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // BOWLER ANIMATION SUITE (160 × 260) — THIN & SLEEK STICK CRICKET POSTURE
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Helper to draw thin, athletic Stick Cricket bowler body
   */
  private static drawThinBowlerBody(
    ctx: CanvasRenderingContext2D,
    opts: {
      shadowCx?: number;
      shadowCy?: number;
      shadowRx?: number;
      // Head
      headX: number;
      headY: number;
      headTilt?: number;
      // Torso & Waist
      shoulderX: number;
      shoulderY: number;
      torsoW?: number;
      torsoH?: number;
      torsoLean?: number; // deg
      // Legs (Left & Right)
      lLegX1: number; lLegY1: number; lLegX2: number; lLegY2: number;
      rLegX1: number; rLegY1: number; rLegX2: number; rLegY2: number;
      lShoeX: number; lShoeY: number;
      rShoeX: number; rShoeY: number;
      // Non-bowling arm
      lArmX1: number; lArmY1: number; lArmX2: number; lArmY2: number;
      // Bowling arm
      rArmX1: number; rArmY1: number; rArmX2: number; rArmY2: number;
      // Ball position
      ballX?: number;
      ballY?: number;
    }
  ): void {
    // 1. Ground Shadow
    this.drawGroundShadow(ctx, opts.shadowCx || 80, opts.shadowCy || 248, opts.shadowRx || 30, 8);

    // 2. Spiked Shoes
    this.drawSpikeShoe(ctx, opts.lShoeX, opts.lShoeY, 24, 14);
    this.drawSpikeShoe(ctx, opts.rShoeX, opts.rShoeY, 24, 14);

    // 3. Athletic White Trousers (Thicker 22px width)
    const legG = ctx.createLinearGradient(60, 140, 100, 240);
    legG.addColorStop(0, '#f8fafc');
    legG.addColorStop(0.5, '#e2e8f0');
    legG.addColorStop(1, '#cbd5e1');
    ctx.fillStyle = legG;
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1.4;

    // Left Leg
    ctx.beginPath();
    ctx.moveTo(opts.lLegX1 - 11, opts.lLegY1);
    ctx.lineTo(opts.lLegX1 + 11, opts.lLegY1);
    ctx.lineTo(opts.lLegX2 + 11, opts.lLegY2);
    ctx.lineTo(opts.lLegX2 - 11, opts.lLegY2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Right Leg
    ctx.beginPath();
    ctx.moveTo(opts.rLegX1 - 11, opts.rLegY1);
    ctx.lineTo(opts.rLegX1 + 11, opts.rLegY1);
    ctx.lineTo(opts.rLegX2 + 11, opts.rLegY2);
    ctx.lineTo(opts.rLegX2 - 11, opts.rLegY2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 4. Crimson Jersey Torso (Thicker 38px width)
    ctx.save();
    ctx.translate(opts.shoulderX, opts.shoulderY);
    if (opts.torsoLean) {
      ctx.rotate((opts.torsoLean * Math.PI) / 180);
    }
    const tw = opts.torsoW || 38;
    const th = opts.torsoH || 62;

    const torsoG = ctx.createLinearGradient(-tw / 2, 0, tw / 2, th);
    torsoG.addColorStop(0, '#dc2626');
    torsoG.addColorStop(0.5, '#ef4444');
    torsoG.addColorStop(1, '#991b1b');
    ctx.fillStyle = torsoG;
    ctx.beginPath();
    ctx.roundRect(-tw / 2, 0, tw, th, [6, 6, 5, 5]);
    ctx.fill();

    // White V-neck collar & side piping
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(-6, 0); ctx.lineTo(0, 12); ctx.lineTo(6, 0);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-tw / 2 + 2, 4);
    ctx.lineTo(-tw / 2 + 2, th - 4);
    ctx.moveTo(tw / 2 - 2, 4);
    ctx.lineTo(tw / 2 - 2, th - 4);
    ctx.stroke();

    ctx.restore();

    // 5. Non-Bowling Arm (Thicker 11px)
    const armG = ctx.createLinearGradient(opts.lArmX1, opts.lArmY1, opts.lArmX2, opts.lArmY2);
    armG.addColorStop(0, '#dc2626');
    armG.addColorStop(0.6, '#f6c49f');
    armG.addColorStop(1, '#e5a075');
    ctx.strokeStyle = armG;
    ctx.lineWidth = 11;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(opts.lArmX1, opts.lArmY1);
    ctx.lineTo(opts.lArmX2, opts.lArmY2);
    ctx.stroke();

    // 6. Bowling Arm (Thicker 11px)
    const bArmG = ctx.createLinearGradient(opts.rArmX1, opts.rArmY1, opts.rArmX2, opts.rArmY2);
    bArmG.addColorStop(0, '#dc2626');
    bArmG.addColorStop(0.6, '#f6c49f');
    bArmG.addColorStop(1, '#e5a075');
    ctx.strokeStyle = bArmG;
    ctx.lineWidth = 11;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(opts.rArmX1, opts.rArmY1);
    ctx.lineTo(opts.rArmX2, opts.rArmY2);
    ctx.stroke();

    // 7. Cricket Ball (if present)
    if (opts.ballX !== undefined && opts.ballY !== undefined) {
      this.drawBall(ctx, opts.ballX, opts.ballY, 7.5);
    }

    // 8. Head & Cap
    this.drawHeadAndCap(ctx, opts.headX, opts.headY, opts.headTilt || 0);
  }

  /**
   * Frame 1: Bowler Idle / Ready at the Mark (Thin, sleek Stick Cricket figure)
   */
  static renderBowlerIdle(canvas: HTMLCanvasElement): void {
    canvas.width = 160;
    canvas.height = 260;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 160, 260);

    this.drawThinBowlerBody(ctx, {
      shadowCx: 80,
      shadowCy: 248,
      shadowRx: 26,
      headX: 80,
      headY: 46,
      headTilt: 0,
      shoulderX: 80,
      shoulderY: 76,
      torsoW: 20,
      torsoH: 58,
      lLegX1: 74, lLegY1: 134, lLegX2: 72, lLegY2: 234,
      rLegX1: 86, rLegY1: 134, rLegX2: 88, rLegY2: 234,
      lShoeX: 62, lShoeY: 234,
      rShoeX: 78, rShoeY: 234,
      lArmX1: 72, lArmY1: 82, lArmX2: 78, lArmY2: 110,
      rArmX1: 88, rArmY1: 82, rArmX2: 82, rArmY2: 110,
      ballX: 80,
      ballY: 110,
    });
  }

  /**
   * Frame 2: Bowler Run-Up Stride (Thin, sleek Stick Cricket figure)
   */
  static renderBowlerStride(canvas: HTMLCanvasElement): void {
    canvas.width = 160;
    canvas.height = 260;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 160, 260);

    this.drawThinBowlerBody(ctx, {
      shadowCx: 80,
      shadowCy: 248,
      shadowRx: 28,
      headX: 80,
      headY: 45,
      headTilt: 3,
      shoulderX: 80,
      shoulderY: 76,
      torsoW: 20,
      torsoH: 58,
      torsoLean: 6,
      lLegX1: 74, lLegY1: 134, lLegX2: 66, lLegY2: 232,
      rLegX1: 86, rLegY1: 134, rLegX2: 96, rLegY2: 228,
      lShoeX: 56, lShoeY: 232,
      rShoeX: 86, rShoeY: 228,
      lArmX1: 72, lArmY1: 82, lArmX2: 62, lArmY2: 114,
      rArmX1: 88, rArmY1: 82, rArmX2: 102, rArmY2: 110,
      ballX: 105,
      ballY: 110,
    });
  }

  /**
   * Frame 3: Bowler Gather / Airborne Leap (Thin, sleek Stick Cricket figure)
   */
  static renderBowlerGather(canvas: HTMLCanvasElement): void {
    canvas.width = 160;
    canvas.height = 260;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 240, 260);

    this.drawThinBowlerBody(ctx, {
      shadowCx: 80,
      shadowCy: 252,
      shadowRx: 24,
      headX: 80,
      headY: 38,
      headTilt: -4,
      shoulderX: 80,
      shoulderY: 68,
      torsoW: 20,
      torsoH: 56,
      torsoLean: -4,
      lLegX1: 74, lLegY1: 124, lLegX2: 70, lLegY2: 206,
      rLegX1: 86, rLegY1: 124, rLegX2: 90, rLegY2: 208,
      lShoeX: 60, lShoeY: 206,
      rShoeX: 80, rShoeY: 208,
      lArmX1: 72, lArmY1: 72, lArmX2: 52, lArmY2: 38,
      rArmX1: 88, rArmY1: 72, rArmX2: 112, rArmY2: 44,
      ballX: 115,
      ballY: 39,
    });
  }

  /**
   * Frame 4: Bowler 12 O'Clock Overarm Release (Thin, sleek Stick Cricket figure)
   */
  static renderBowlerRelease(canvas: HTMLCanvasElement): void {
    canvas.width = 160;
    canvas.height = 260;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 160, 260);

    this.drawThinBowlerBody(ctx, {
      shadowCx: 80,
      shadowCy: 248,
      shadowRx: 30,
      headX: 80,
      headY: 46,
      headTilt: 2,
      shoulderX: 80,
      shoulderY: 76,
      torsoW: 20,
      torsoH: 58,
      torsoLean: 4,
      lLegX1: 74, lLegY1: 134, lLegX2: 66, lLegY2: 232,
      rLegX1: 86, rLegY1: 134, rLegX2: 94, rLegY2: 230,
      lShoeX: 56, lShoeY: 232,
      rShoeX: 84, rShoeY: 230,
      lArmX1: 72, lArmY1: 80, lArmX2: 64, lArmY2: 118,
      rArmX1: 88, rArmY1: 76, rArmX2: 92, rArmY2: 18,
      ballX: 92,
      ballY: 10,
    });
  }

  /**
   * Frame 5: Bowler Follow-Through (Thin, sleek Stick Cricket figure)
   */
  static renderBowlerFollowthrough(canvas: HTMLCanvasElement): void {
    canvas.width = 160;
    canvas.height = 260;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 160, 260);

    this.drawThinBowlerBody(ctx, {
      shadowCx: 72,
      shadowCy: 248,
      shadowRx: 30,
      headX: 68,
      headY: 66,
      headTilt: 10,
      shoulderX: 72,
      shoulderY: 96,
      torsoW: 20,
      torsoH: 56,
      torsoLean: 18,
      lLegX1: 66, lLegY1: 152, lLegX2: 62, lLegY2: 232,
      rLegX1: 78, rLegY1: 152, rLegX2: 104, rLegY2: 204,
      lShoeX: 52, lShoeY: 232,
      rShoeX: 94, rShoeY: 204,
      lArmX1: 64, lArmY1: 102, lArmX2: 30, lArmY2: 142,
      rArmX1: 80, rArmY1: 102, rArmX2: 86, rArmY2: 126,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // BATSMAN ANIMATION SUITE (240 × 300) — THIN & SLEEK STICK CRICKET POSTURE
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Backward compatibility entrypoint
   */
  static renderBatsman(canvas: HTMLCanvasElement): void {
    this.renderBatsmanStance(canvas);
  }

  /**
   * 1. Ready Batting Stance (Thin, sleek Stick Cricket side profile)
   */
  static renderBatsmanStance(canvas: HTMLCanvasElement): void {
    canvas.width = 240;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 240, 300);

    this.drawSideProfileBatsman(ctx, {
      shadowCx: 122,
      shadowCy: 286,
      shadowRx: 30,
      headX: 130,
      headY: 50,
      headTilt: 0,
      shoulderX: 124,
      shoulderY: 82,
      waistX: 116,
      waistY: 132,
      buttockX: 102,
      buttockY: 160,
      kneeX: 122,
      kneeY: 202,
      padX: 114,
      padY: 202,
      padW: 18,
      padH: 74,
      shoeX: 112,
      shoeY: 274,
      elbowX: 128,
      elbowY: 118,
      wristX: 130,
      wristY: 154,
      batHandleX: 132,
      batHandleY: 142,
      batToeX: 140,
      batToeY: 280,
    });
  }

  /**
   * 2. Stance Bat Tap (Micro bat lift & tap on turf)
   */
  static renderBatsmanTap(canvas: HTMLCanvasElement): void {
    canvas.width = 240;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 240, 300);

    this.drawSideProfileBatsman(ctx, {
      shadowCx: 122,
      shadowCy: 286,
      shadowRx: 30,
      headX: 130,
      headY: 49,
      headTilt: 0,
      shoulderX: 124,
      shoulderY: 81,
      waistX: 116,
      waistY: 131,
      buttockX: 102,
      buttockY: 159,
      kneeX: 122,
      kneeY: 202,
      padX: 114,
      padY: 202,
      padW: 18,
      padH: 74,
      shoeX: 112,
      shoeY: 274,
      elbowX: 128,
      elbowY: 116,
      wristX: 130,
      wristY: 148,
      batHandleX: 132,
      batHandleY: 136,
      batToeX: 142,
      batToeY: 266,
    });
  }

  /**
   * 3. Backlift Trigger Movement (High cocked bat behind hip)
   */
  static renderBatsmanBacklift(canvas: HTMLCanvasElement): void {
    canvas.width = 240;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 240, 300);

    this.drawSideProfileBatsman(ctx, {
      shadowCx: 122,
      shadowCy: 286,
      shadowRx: 32,
      headX: 130,
      headY: 48,
      headTilt: 1,
      shoulderX: 122,
      shoulderY: 80,
      waistX: 112,
      waistY: 134,
      buttockX: 98,
      buttockY: 162,
      kneeX: 120,
      kneeY: 204,
      padX: 112,
      padY: 204,
      padW: 18,
      padH: 72,
      shoeX: 110,
      shoeY: 274,
      elbowX: 116,
      elbowY: 108,
      wristX: 110,
      wristY: 128,
      batHandleX: 110,
      batHandleY: 120,
      batToeX: 74,
      batToeY: 18,
    });
  }

  /**
   * 4. Cover Drive / Off Drive — Forward Stride (Left Shot)
   */
  static renderBatsmanDriveStride(canvas: HTMLCanvasElement): void {
    canvas.width = 240;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 240, 300);

    this.drawSideProfileBatsman(ctx, {
      shadowCx: 128,
      shadowCy: 286,
      shadowRx: 38,
      headX: 136,
      headY: 52,
      headTilt: -2,
      shoulderX: 130,
      shoulderY: 84,
      waistX: 118,
      waistY: 138,
      buttockX: 100,
      buttockY: 164,
      kneeX: 132,
      kneeY: 204,
      padX: 124,
      padY: 204,
      padW: 19,
      padH: 72,
      shoeX: 122,
      shoeY: 274,
      elbowX: 134,
      elbowY: 122,
      wristX: 136,
      wristY: 154,
      batHandleX: 136,
      batHandleY: 146,
      batToeX: 164,
      batToeY: 276,
    });
  }

  /**
   * 5. Cover Drive — Sweet Spot Impact (Left Shot)
   */
  static renderBatsmanDriveImpact(canvas: HTMLCanvasElement): void {
    canvas.width = 240;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 240, 300);

    this.drawSideProfileBatsman(ctx, {
      shadowCx: 130,
      shadowCy: 286,
      shadowRx: 40,
      headX: 138,
      headY: 52,
      headTilt: -3,
      shoulderX: 132,
      shoulderY: 84,
      waistX: 118,
      waistY: 138,
      buttockX: 100,
      buttockY: 164,
      kneeX: 134,
      kneeY: 204,
      padX: 126,
      padY: 204,
      padW: 19,
      padH: 72,
      shoeX: 124,
      shoeY: 274,
      elbowX: 138,
      elbowY: 118,
      wristX: 142,
      wristY: 152,
      batHandleX: 142,
      batHandleY: 144,
      batToeX: 172,
      batToeY: 278,
      impactSpark: { x: 162, y: 250 },
    });
  }

  /**
   * 6. Cover Drive — High Follow-Through (Left Shot)
   */
  static renderBatsmanDriveFollow(canvas: HTMLCanvasElement): void {
    canvas.width = 240;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 240, 300);

    this.drawSideProfileBatsman(ctx, {
      shadowCx: 128,
      shadowCy: 286,
      shadowRx: 36,
      headX: 136,
      headY: 50,
      headTilt: -2,
      shoulderX: 130,
      shoulderY: 82,
      waistX: 118,
      waistY: 138,
      buttockX: 102,
      buttockY: 164,
      kneeX: 132,
      kneeY: 204,
      padX: 124,
      padY: 204,
      padW: 19,
      padH: 72,
      shoeX: 122,
      shoeY: 274,
      elbowX: 142,
      elbowY: 102,
      wristX: 152,
      wristY: 116,
      batHandleX: 152,
      batHandleY: 110,
      batToeX: 192,
      batToeY: 24,
    });
  }

  /**
   * 7. Straight Drive / Punch — Impact (Straight Shot)
   */
  static renderBatsmanStraightImpact(canvas: HTMLCanvasElement): void {
    canvas.width = 240;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 240, 300);

    this.drawSideProfileBatsman(ctx, {
      shadowCx: 124,
      shadowCy: 286,
      shadowRx: 32,
      headX: 132,
      headY: 50,
      headTilt: 0,
      shoulderX: 126,
      shoulderY: 82,
      waistX: 116,
      waistY: 134,
      buttockX: 102,
      buttockY: 162,
      kneeX: 124,
      kneeY: 202,
      padX: 116,
      padY: 202,
      padW: 18,
      padH: 74,
      shoeX: 114,
      shoeY: 274,
      elbowX: 132,
      elbowY: 122,
      wristX: 132,
      wristY: 154,
      batHandleX: 132,
      batHandleY: 146,
      batToeX: 136,
      batToeY: 282,
      impactSpark: { x: 134, y: 250 },
    });
  }

  /**
   * 8. Straight Drive — High Vertical Follow-Through (Straight Shot)
   */
  static renderBatsmanStraightFollow(canvas: HTMLCanvasElement): void {
    canvas.width = 240;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 240, 300);

    this.drawSideProfileBatsman(ctx, {
      shadowCx: 124,
      shadowCy: 286,
      shadowRx: 32,
      headX: 132,
      headY: 48,
      headTilt: 0,
      shoulderX: 126,
      shoulderY: 80,
      waistX: 116,
      waistY: 134,
      buttockX: 102,
      buttockY: 162,
      kneeX: 124,
      kneeY: 202,
      padX: 116,
      padY: 202,
      padW: 18,
      padH: 74,
      shoeX: 114,
      shoeY: 274,
      elbowX: 136,
      elbowY: 104,
      wristX: 140,
      wristY: 126,
      batHandleX: 140,
      batHandleY: 118,
      batToeX: 150,
      batToeY: 14,
    });
  }

  /**
   * 9. Pull Shot / Cut — Back Foot Shift Prep (Right Shot)
   */
  static renderBatsmanPullPrep(canvas: HTMLCanvasElement): void {
    canvas.width = 240;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 240, 300);

    this.drawSideProfileBatsman(ctx, {
      shadowCx: 118,
      shadowCy: 286,
      shadowRx: 32,
      headX: 132,
      headY: 48,
      headTilt: 2,
      shoulderX: 126,
      shoulderY: 80,
      waistX: 112,
      waistY: 132,
      buttockX: 98,
      buttockY: 160,
      kneeX: 118,
      kneeY: 202,
      padX: 110,
      padY: 202,
      padW: 18,
      padH: 74,
      shoeX: 108,
      shoeY: 274,
      elbowX: 116,
      elbowY: 96,
      wristX: 110,
      wristY: 114,
      batHandleX: 110,
      batHandleY: 106,
      batToeX: 68,
      batToeY: 22,
    });
  }

  /**
   * 10. Pull Shot — Horizontal Cross-Bat Impact (Right Shot)
   */
  static renderBatsmanPullImpact(canvas: HTMLCanvasElement): void {
    canvas.width = 240;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 240, 300);

    this.drawSideProfileBatsman(ctx, {
      shadowCx: 118,
      shadowCy: 286,
      shadowRx: 34,
      headX: 134,
      headY: 48,
      headTilt: 3,
      shoulderX: 128,
      shoulderY: 80,
      waistX: 114,
      waistY: 132,
      buttockX: 100,
      buttockY: 160,
      kneeX: 120,
      kneeY: 202,
      padX: 112,
      padY: 202,
      padW: 18,
      padH: 74,
      shoeX: 110,
      shoeY: 274,
      elbowX: 138,
      elbowY: 108,
      wristX: 144,
      wristY: 136,
      batHandleX: 144,
      batHandleY: 128,
      batToeX: 208,
      batToeY: 168,
      impactSpark: { x: 178, y: 156 },
    });
  }

  /**
   * 11. Pull Shot — Swivel Follow-Through (Right Shot)
   */
  static renderBatsmanPullFollow(canvas: HTMLCanvasElement): void {
    canvas.width = 240;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 240, 300);

    this.drawSideProfileBatsman(ctx, {
      shadowCx: 118,
      shadowCy: 286,
      shadowRx: 32,
      headX: 132,
      headY: 48,
      headTilt: 2,
      shoulderX: 126,
      shoulderY: 80,
      waistX: 114,
      waistY: 132,
      buttockX: 100,
      buttockY: 160,
      kneeX: 120,
      kneeY: 202,
      padX: 112,
      padY: 202,
      padW: 18,
      padH: 74,
      shoeX: 110,
      shoeY: 274,
      elbowX: 130,
      elbowY: 96,
      wristX: 124,
      wristY: 110,
      batHandleX: 124,
      batHandleY: 102,
      batToeX: 166,
      batToeY: 44,
    });
  }

  /**
   * 12. Lofted Slog — Deep Power Base (Up / Loft Shot)
   */
  static renderBatsmanLoftPrep(canvas: HTMLCanvasElement): void {
    canvas.width = 240;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 240, 300);

    this.drawSideProfileBatsman(ctx, {
      shadowCx: 122,
      shadowCy: 286,
      shadowRx: 34,
      headX: 130,
      headY: 56,
      headTilt: 1,
      shoulderX: 122,
      shoulderY: 88,
      waistX: 110,
      waistY: 140,
      buttockX: 96,
      buttockY: 168,
      kneeX: 122,
      kneeY: 212,
      padX: 114,
      padY: 212,
      padW: 19,
      padH: 64,
      shoeX: 112,
      shoeY: 274,
      elbowX: 122,
      elbowY: 130,
      wristX: 118,
      wristY: 158,
      batHandleX: 118,
      batHandleY: 150,
      batToeX: 96,
      batToeY: 274,
    });
  }

  /**
   * 13. Lofted Slog — Explosive Uppercut Impact (Up / Loft Shot)
   */
  static renderBatsmanLoftImpact(canvas: HTMLCanvasElement): void {
    canvas.width = 240;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 240, 300);

    this.drawSideProfileBatsman(ctx, {
      shadowCx: 124,
      shadowCy: 286,
      shadowRx: 36,
      headX: 132,
      headY: 50,
      headTilt: -1,
      shoulderX: 124,
      shoulderY: 82,
      waistX: 112,
      waistY: 136,
      buttockX: 98,
      buttockY: 164,
      kneeX: 124,
      kneeY: 206,
      padX: 116,
      padY: 206,
      padW: 19,
      padH: 70,
      shoeX: 114,
      shoeY: 274,
      elbowX: 134,
      elbowY: 114,
      wristX: 140,
      wristY: 140,
      batHandleX: 140,
      batHandleY: 132,
      batToeX: 192,
      batToeY: 216,
      impactSpark: { x: 172, y: 188, star: true },
    });
  }

  /**
   * 14. Lofted Slog — Skyward High Finish (Up / Loft Shot)
   */
  static renderBatsmanLoftFollow(canvas: HTMLCanvasElement): void {
    canvas.width = 240;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 240, 300);

    this.drawSideProfileBatsman(ctx, {
      shadowCx: 124,
      shadowCy: 286,
      shadowRx: 34,
      headX: 134,
      headY: 46,
      headTilt: -4,
      shoulderX: 126,
      shoulderY: 78,
      waistX: 116,
      waistY: 134,
      buttockX: 100,
      buttockY: 162,
      kneeX: 126,
      kneeY: 204,
      padX: 118,
      padY: 204,
      padW: 18,
      padH: 72,
      shoeX: 116,
      shoeY: 274,
      elbowX: 142,
      elbowY: 90,
      wristX: 154,
      wristY: 100,
      batHandleX: 154,
      batHandleY: 94,
      batToeX: 196,
      batToeY: 10,
    });
  }

  /**
   * 15. Forward Defensive Block (Soft hands, bat beside front pad)
   */
  static renderBatsmanDefend(canvas: HTMLCanvasElement): void {
    canvas.width = 240;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 240, 300);

    this.drawSideProfileBatsman(ctx, {
      shadowCx: 124,
      shadowCy: 286,
      shadowRx: 32,
      headX: 130,
      headY: 52,
      headTilt: 0,
      shoulderX: 124,
      shoulderY: 84,
      waistX: 114,
      waistY: 136,
      buttockX: 100,
      buttockY: 162,
      kneeX: 126,
      kneeY: 204,
      padX: 118,
      padY: 204,
      padW: 18,
      padH: 72,
      shoeX: 116,
      shoeY: 274,
      elbowX: 130,
      elbowY: 124,
      wristX: 126,
      wristY: 156,
      batHandleX: 126,
      batHandleY: 148,
      batToeX: 122,
      batToeY: 282,
    });
  }

  /**
   * 16. Wicket / Dismissal Reaction (Looking back at stumps in disbelief)
   */
  static renderBatsmanWicket(canvas: HTMLCanvasElement): void {
    canvas.width = 240;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 240, 300);

    this.drawSideProfileBatsman(ctx, {
      shadowCx: 120,
      shadowCy: 286,
      shadowRx: 30,
      headX: 122,
      headY: 52,
      headTilt: -8,
      shoulderX: 122,
      shoulderY: 86,
      waistX: 112,
      waistY: 136,
      buttockX: 98,
      buttockY: 162,
      kneeX: 120,
      kneeY: 204,
      padX: 112,
      padY: 204,
      padW: 18,
      padH: 72,
      shoeX: 110,
      shoeY: 274,
      elbowX: 116,
      elbowY: 132,
      wristX: 110,
      wristY: 164,
      batHandleX: 110,
      batHandleY: 156,
      batToeX: 126,
      batToeY: 282,
    });
  }

  /**
   * 17a. Running Between Wickets — Away / Up Pitch (Stride A, Rear View)
   */
  static renderBatsmanRunAway1(canvas: HTMLCanvasElement): void {
    canvas.width = 240;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 240, 300);

    this.drawGroundShadow(ctx, 120, 286, 28, 7);

    // Left Leg: Pumping Forward / Planted
    const leftLegG = ctx.createLinearGradient(106, 150, 118, 270);
    leftLegG.addColorStop(0, '#0284c7');
    leftLegG.addColorStop(1, '#0369a1');
    ctx.fillStyle = leftLegG;
    ctx.beginPath();
    ctx.roundRect(106, 150, 13, 114, [4, 4, 3, 3]);
    ctx.fill();
    this.drawSpikeShoe(ctx, 102, 264, 22, 14);

    // Right Leg: Kicking Back (Showing Spiked Sole)
    const rightLegG = ctx.createLinearGradient(122, 150, 134, 240);
    rightLegG.addColorStop(0, '#0284c7');
    rightLegG.addColorStop(1, '#0369a1');
    ctx.fillStyle = rightLegG;
    ctx.beginPath();
    ctx.roundRect(122, 150, 13, 85, [4, 4, 6, 6]);
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.roundRect(124, 230, 18, 12, 3);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    for (let s = 0; s < 3; s++) {
      ctx.fillRect(126 + s * 5, 232, 2, 4);
    }

    // Rear Torso (Cyan/Royal Blue Kit with White Jersey Number '18')
    const torsoG = ctx.createLinearGradient(108, 80, 132, 150);
    torsoG.addColorStop(0, '#0284c7');
    torsoG.addColorStop(0.5, '#0ea5e9');
    torsoG.addColorStop(1, '#0284c7');
    ctx.fillStyle = torsoG;
    ctx.beginPath();
    ctx.roundRect(108, 82, 24, 70, 6);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('18', 120, 122);

    // Left Arm (Pumping forward)
    ctx.fillStyle = '#0284c7';
    ctx.beginPath();
    ctx.roundRect(97, 86, 9, 32, 3);
    ctx.fill();
    ctx.fillStyle = '#f6c49f';
    ctx.fillRect(97, 116, 7, 16);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(95, 130, 11, 11, 3);
    ctx.fill();

    // Right Arm (Trailing back holding Bat)
    ctx.fillStyle = '#0284c7';
    ctx.beginPath();
    ctx.roundRect(134, 86, 9, 34, 3);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(134, 120, 11, 11, 3);
    ctx.fill();

    this.drawEnglishWillowBat(ctx, 138, 124, 140, 144, 166, 220, 176, 218, 150, 144, 5, 20);

    // Head / Back of Helmet
    const helmetG = ctx.createRadialGradient(120, 52, 2, 120, 52, 16);
    helmetG.addColorStop(0, '#38bdf8');
    helmetG.addColorStop(0.5, '#0284c7');
    helmetG.addColorStop(1, '#0c4a6e');
    ctx.fillStyle = helmetG;
    ctx.beginPath();
    ctx.arc(120, 52, 15, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(116, 62, 8, 5);
  }

  /**
   * 17b. Running Between Wickets — Away / Up Pitch (Stride B, Rear View)
   */
  static renderBatsmanRunAway2(canvas: HTMLCanvasElement): void {
    canvas.width = 240;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 240, 300);

    this.drawGroundShadow(ctx, 120, 286, 28, 7);

    // Right Leg: Pumping Forward / Planted
    const rightLegG = ctx.createLinearGradient(122, 150, 134, 270);
    rightLegG.addColorStop(0, '#0284c7');
    rightLegG.addColorStop(1, '#0369a1');
    ctx.fillStyle = rightLegG;
    ctx.beginPath();
    ctx.roundRect(122, 150, 13, 114, [4, 4, 3, 3]);
    ctx.fill();
    this.drawSpikeShoe(ctx, 118, 264, 22, 14);

    // Left Leg: Kicking Back (Showing Spiked Sole)
    const leftLegG = ctx.createLinearGradient(106, 150, 118, 240);
    leftLegG.addColorStop(0, '#0284c7');
    leftLegG.addColorStop(1, '#0369a1');
    ctx.fillStyle = leftLegG;
    ctx.beginPath();
    ctx.roundRect(106, 150, 13, 85, [4, 4, 6, 6]);
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.roundRect(98, 230, 18, 12, 3);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    for (let s = 0; s < 3; s++) {
      ctx.fillRect(100 + s * 5, 232, 2, 4);
    }

    // Rear Torso
    const torsoG = ctx.createLinearGradient(108, 80, 132, 150);
    torsoG.addColorStop(0, '#0284c7');
    torsoG.addColorStop(0.5, '#0ea5e9');
    torsoG.addColorStop(1, '#0284c7');
    ctx.fillStyle = torsoG;
    ctx.beginPath();
    ctx.roundRect(108, 82, 24, 70, 6);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('18', 120, 122);

    // Right Arm (Pumping forward)
    ctx.fillStyle = '#0284c7';
    ctx.beginPath();
    ctx.roundRect(134, 86, 9, 32, 3);
    ctx.fill();
    ctx.fillStyle = '#f6c49f';
    ctx.fillRect(134, 116, 7, 16);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(134, 130, 11, 11, 3);
    ctx.fill();

    // Left Arm (Trailing back holding Bat)
    ctx.fillStyle = '#0284c7';
    ctx.beginPath();
    ctx.roundRect(97, 86, 9, 34, 3);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(95, 120, 11, 11, 3);
    ctx.fill();

    this.drawEnglishWillowBat(ctx, 96, 124, 94, 144, 68, 220, 58, 218, 84, 144, 5, 20);

    // Head / Back of Helmet
    const helmetG = ctx.createRadialGradient(120, 52, 2, 120, 52, 16);
    helmetG.addColorStop(0, '#38bdf8');
    helmetG.addColorStop(0.5, '#0284c7');
    helmetG.addColorStop(1, '#0c4a6e');
    ctx.fillStyle = helmetG;
    ctx.beginPath();
    ctx.arc(120, 52, 15, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(116, 62, 8, 5);
  }

  /**
   * 18a. Running Between Wickets — Towards / Down Pitch (Stride A, Front View)
   */
  static renderBatsmanRunTowards1(canvas: HTMLCanvasElement): void {
    canvas.width = 240;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 240, 300);

    this.drawGroundShadow(ctx, 120, 286, 28, 7);

    // Left Leg: High Stride Pad Lift
    const pad1G = ctx.createLinearGradient(104, 170, 118, 255);
    pad1G.addColorStop(0, '#ffffff');
    pad1G.addColorStop(0.5, '#f8fafc');
    pad1G.addColorStop(1, '#cbd5e1');
    ctx.fillStyle = pad1G;
    ctx.beginPath();
    ctx.roundRect(104, 170, 15, 75, 4);
    ctx.fill();
    this.drawSpikeShoe(ctx, 100, 246, 22, 14);

    // Right Leg: Planted / Trailing Pad
    const pad2G = ctx.createLinearGradient(122, 190, 136, 274);
    pad2G.addColorStop(0, '#f1f5f9');
    pad2G.addColorStop(0.5, '#e2e8f0');
    pad2G.addColorStop(1, '#94a3b8');
    ctx.fillStyle = pad2G;
    ctx.beginPath();
    ctx.roundRect(122, 190, 15, 80, 4);
    ctx.fill();
    this.drawSpikeShoe(ctx, 118, 268, 22, 14);

    // Front Torso (Cyan/Royal Blue Kit with Sponsor & V-Neck)
    const torsoG = ctx.createLinearGradient(108, 80, 132, 150);
    torsoG.addColorStop(0, '#0284c7');
    torsoG.addColorStop(0.5, '#0ea5e9');
    torsoG.addColorStop(1, '#0284c7');
    ctx.fillStyle = torsoG;
    ctx.beginPath();
    ctx.roundRect(108, 82, 24, 70, 6);
    ctx.fill();

    // V-neck and team stripe
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(116, 82); ctx.lineTo(120, 94); ctx.lineTo(124, 82);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(112, 112, 16, 3);

    // Arms & Hands holding bat across chest in sprint
    ctx.fillStyle = '#0284c7';
    ctx.beginPath();
    ctx.roundRect(98, 88, 9, 36, 3);
    ctx.roundRect(132, 88, 9, 36, 3);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(106, 122, 11, 13, 3);
    ctx.roundRect(122, 122, 11, 13, 3);
    ctx.fill();

    this.drawEnglishWillowBat(ctx, 126, 126, 128, 148, 142, 230, 154, 226, 136, 146, 5, 20);

    // Head with front Helmet and Grill
    const helmetG = ctx.createRadialGradient(120, 52, 2, 120, 52, 16);
    helmetG.addColorStop(0, '#38bdf8');
    helmetG.addColorStop(0.5, '#0284c7');
    helmetG.addColorStop(1, '#0c4a6e');
    ctx.fillStyle = helmetG;
    ctx.beginPath();
    ctx.arc(120, 52, 15, 0, Math.PI * 2);
    ctx.fill();

    // Grill & Peak Visor
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(108, 48, 24, 4);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(112, 56); ctx.lineTo(128, 56);
    ctx.moveTo(114, 62); ctx.lineTo(126, 62);
    ctx.moveTo(120, 52); ctx.lineTo(120, 66);
    ctx.stroke();
  }

  /**
   * 18b. Running Between Wickets — Towards / Down Pitch (Stride B, Front View)
   */
  static renderBatsmanRunTowards2(canvas: HTMLCanvasElement): void {
    canvas.width = 240;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 240, 300);

    this.drawGroundShadow(ctx, 120, 286, 28, 7);

    // Right Leg: High Stride Pad Lift
    const pad2G = ctx.createLinearGradient(122, 170, 136, 255);
    pad2G.addColorStop(0, '#ffffff');
    pad2G.addColorStop(0.5, '#f8fafc');
    pad2G.addColorStop(1, '#cbd5e1');
    ctx.fillStyle = pad2G;
    ctx.beginPath();
    ctx.roundRect(122, 170, 15, 75, 4);
    ctx.fill();
    this.drawSpikeShoe(ctx, 118, 246, 22, 14);

    // Left Leg: Planted / Trailing Pad
    const pad1G = ctx.createLinearGradient(104, 190, 118, 274);
    pad1G.addColorStop(0, '#f1f5f9');
    pad1G.addColorStop(0.5, '#e2e8f0');
    pad1G.addColorStop(1, '#94a3b8');
    ctx.fillStyle = pad1G;
    ctx.beginPath();
    ctx.roundRect(104, 190, 15, 80, 4);
    ctx.fill();
    this.drawSpikeShoe(ctx, 100, 268, 22, 14);

    // Front Torso
    const torsoG = ctx.createLinearGradient(108, 80, 132, 150);
    torsoG.addColorStop(0, '#0284c7');
    torsoG.addColorStop(0.5, '#0ea5e9');
    torsoG.addColorStop(1, '#0284c7');
    ctx.fillStyle = torsoG;
    ctx.beginPath();
    ctx.roundRect(108, 82, 24, 70, 6);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(116, 82); ctx.lineTo(120, 94); ctx.lineTo(124, 82);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(112, 112, 16, 3);

    // Arms & Hands holding bat
    ctx.fillStyle = '#0284c7';
    ctx.beginPath();
    ctx.roundRect(98, 88, 9, 36, 3);
    ctx.roundRect(132, 88, 9, 36, 3);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(106, 122, 11, 13, 3);
    ctx.roundRect(122, 122, 11, 13, 3);
    ctx.fill();

    this.drawEnglishWillowBat(ctx, 114, 126, 112, 148, 98, 230, 86, 226, 104, 146, 5, 20);

    // Head with front Helmet and Grill
    const helmetG = ctx.createRadialGradient(120, 52, 2, 120, 52, 16);
    helmetG.addColorStop(0, '#38bdf8');
    helmetG.addColorStop(0.5, '#0284c7');
    helmetG.addColorStop(1, '#0c4a6e');
    ctx.fillStyle = helmetG;
    ctx.beginPath();
    ctx.arc(120, 52, 15, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(108, 48, 24, 4);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(112, 56); ctx.lineTo(128, 56);
    ctx.moveTo(114, 62); ctx.lineTo(126, 62);
    ctx.moveTo(120, 52); ctx.lineTo(120, 66);
    ctx.stroke();
  }

  /**
   * Aliases for backward compatibility
   */
  static renderBatsmanRun1(canvas: HTMLCanvasElement): void {
    this.renderBatsmanRunAway1(canvas);
  }

  static renderBatsmanRun2(canvas: HTMLCanvasElement): void {
    this.renderBatsmanRunAway2(canvas);
  }

  /**
   * 19. Victory / Milestone Celebration (Raising bat to crowd)
   */
  static renderBatsmanCelebrate(canvas: HTMLCanvasElement): void {
    canvas.width = 240;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 240, 300);

    this.drawSideProfileBatsman(ctx, {
      shadowCx: 120,
      shadowCy: 286,
      shadowRx: 30,
      headX: 128,
      headY: 48,
      headTilt: 0,
      shoulderX: 122,
      shoulderY: 80,
      waistX: 114,
      waistY: 134,
      buttockX: 100,
      buttockY: 160,
      kneeX: 122,
      kneeY: 204,
      padX: 114,
      padY: 204,
      padW: 18,
      padH: 72,
      shoeX: 112,
      shoeY: 274,
      elbowX: 140,
      elbowY: 60,
      wristX: 150,
      wristY: 40,
      batHandleX: 150,
      batHandleY: 34,
      batToeX: 154,
      batToeY: -68,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CORE SIDE-PROFILE BATSMAN RENDERER WITH THIN & SLEEK S-CURVE ANATOMY
  // ─────────────────────────────────────────────────────────────────────────────

  private static drawSideProfileBatsman(
    ctx: CanvasRenderingContext2D,
    p: {
      shadowCx: number;
      shadowCy: number;
      shadowRx: number;
      headX: number;
      headY: number;
      headTilt?: number;
      shoulderX: number;
      shoulderY: number;
      waistX: number;
      waistY: number;
      buttockX: number;
      buttockY: number;
      kneeX: number;
      kneeY: number;
      padX: number;
      padY: number;
      padW: number;
      padH: number;
      shoeX: number;
      shoeY: number;
      elbowX: number;
      elbowY: number;
      wristX: number;
      wristY: number;
      batHandleX: number;
      batHandleY: number;
      batToeX: number;
      batToeY: number;
      impactSpark?: { x: number; y: number; star?: boolean };
    }
  ): void {
    // 1. Ground Shadow (Thin, crisp oval)
    this.drawGroundShadow(ctx, p.shadowCx, p.shadowCy, p.shadowRx, 7);

    // 2. Rear Foot & Pad (Subtle slender depth)
    this.drawSpikeShoe(ctx, p.shoeX - 5, p.shoeY - 3, 24, 12);

    const rearPadG = ctx.createLinearGradient(p.padX - 5, p.padY - 3, p.padX + p.padW - 5, p.padY + p.padH);
    rearPadG.addColorStop(0, '#e2e8f0');
    rearPadG.addColorStop(0.5, '#cbd5e1');
    rearPadG.addColorStop(1, '#94a3b8');
    ctx.fillStyle = rearPadG;
    ctx.beginPath();
    ctx.roundRect(p.padX - 5, p.padY - 3, p.padW - 2, p.padH - 2, [4, 4, 3, 3]);
    ctx.fill();

    // 3. MAIN THIN & SLEEK S-CURVE BODY (Cyan / Royal Blue Kit)
    const bodyG = ctx.createLinearGradient(p.buttockX, p.buttockY, p.shoulderX + 10, p.shoulderY);
    bodyG.addColorStop(0, '#0284c7');
    bodyG.addColorStop(0.3, '#0ea5e9');
    bodyG.addColorStop(0.6, '#38bdf8');
    bodyG.addColorStop(1, '#0284c7');
    ctx.fillStyle = bodyG;

    ctx.beginPath();
    // Start at back of neck/shoulder (thin: width 14px)
    ctx.moveTo(p.shoulderX - 6, p.shoulderY);
    // Slender spine line curving into lower back
    ctx.bezierCurveTo(p.shoulderX - 8, p.shoulderY + 20, p.waistX - 6, p.waistY - 6, p.waistX - 4, p.waistY);
    // Subtle, sleek buttocks rear arch
    ctx.bezierCurveTo(p.buttockX, p.buttockY - 8, p.buttockX, p.buttockY + 10, p.buttockX + 6, p.buttockY + 18);
    // Slender hamstring curving down-forward into back of knee
    ctx.bezierCurveTo(p.buttockX + 10, p.buttockY + 24, p.kneeX - 8, p.kneeY - 10, p.kneeX - 4, p.kneeY);
    // Across knee cap to front knee (thin: width 12px)
    ctx.lineTo(p.kneeX + 8, p.kneeY - 2);
    // Front thigh curving up to waist/groin
    ctx.bezierCurveTo(p.kneeX + 6, p.kneeY - 16, p.waistX + 10, p.waistY + 12, p.waistX + 8, p.waistY + 4);
    // Front chest/belly curving up to front collar
    ctx.bezierCurveTo(p.waistX + 8, p.waistY - 14, p.shoulderX + 10, p.shoulderY + 12, p.shoulderX + 8, p.shoulderY - 2);
    ctx.closePath();
    ctx.fill();

    // Subtle dark waistband line
    ctx.strokeStyle = '#0369a1';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(p.waistX - 4, p.waistY);
    ctx.lineTo(p.waistX + 8, p.waistY + 4);
    ctx.stroke();

    // Athletic side stripe (crisp white piping)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(p.shoulderX - 3, p.shoulderY + 4);
    ctx.bezierCurveTo(p.shoulderX - 5, p.shoulderY + 22, p.waistX - 3, p.waistY - 2, p.buttockX + 4, p.buttockY + 14);
    ctx.stroke();

    // 4. FRONT BATTING PAD (Slender Molded 3D Shin Guard with Knee Roll)
    // Knee Roll Bolster
    const kneeG = ctx.createLinearGradient(p.padX, p.padY - 8, p.padX + p.padW, p.padY + 10);
    kneeG.addColorStop(0, '#ffffff');
    kneeG.addColorStop(0.5, '#f8fafc');
    kneeG.addColorStop(1, '#e2e8f0');
    ctx.fillStyle = kneeG;
    ctx.beginPath();
    ctx.roundRect(p.padX - 2, p.padY - 6, p.padW + 4, 16, [6, 6, 3, 3]);
    ctx.fill();

    // Knee roll horizontal bevel seam
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.moveTo(p.padX - 1, p.padY + 2);
    ctx.lineTo(p.padX + p.padW + 1, p.padY + 2);
    ctx.stroke();

    // Main Shin Pad Body (slender width: 18px)
    const padG = ctx.createLinearGradient(p.padX, p.padY, p.padX + p.padW, p.padY + p.padH);
    padG.addColorStop(0, '#ffffff');
    padG.addColorStop(0.4, '#f8fafc');
    padG.addColorStop(0.8, '#e2e8f0');
    padG.addColorStop(1, '#cbd5e1');
    ctx.fillStyle = padG;
    ctx.beginPath();
    ctx.roundRect(p.padX, p.padY + 8, p.padW, p.padH - 8, [3, 3, 4, 4]);
    ctx.fill();

    // Vertical Cylindrical Cane Ribs
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1.5;
    for (let r = 0; r < 3; r++) {
      const rx = p.padX + 3.5 + r * (p.padW / 3.2);
      ctx.beginPath();
      ctx.moveTo(rx, p.padY + 12);
      ctx.lineTo(rx, p.padY + p.padH - 3);
      ctx.stroke();
    }

    // Pad fastening straps with buckle clips
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(p.padX, p.padY + 26, p.padW, 2.5);
    ctx.fillRect(p.padX, p.padY + 48, p.padW, 2.5);
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(p.padX + 1, p.padY + 25, 3, 4.5);
    ctx.fillRect(p.padX + 1, p.padY + 47, 3, 4.5);

    // 5. Front Spiked Shoe (Slender 26px width)
    this.drawSpikeShoe(ctx, p.shoeX, p.shoeY, 26, 14);

    // 6. Arms & Batting Gloves (Slender & athletic)
    // Upper Arm Sleeve
    const sleeveG = ctx.createLinearGradient(p.shoulderX, p.shoulderY, p.elbowX, p.elbowY);
    sleeveG.addColorStop(0, '#0284c7');
    sleeveG.addColorStop(0.7, '#0ea5e9');
    sleeveG.addColorStop(1, '#0369a1');
    ctx.fillStyle = sleeveG;
    ctx.beginPath();
    ctx.roundRect(p.shoulderX - 3, p.shoulderY, 12, 34, 4);
    ctx.fill();

    // Forearm
    const skinG = ctx.createLinearGradient(p.elbowX, p.elbowY, p.wristX, p.wristY);
    skinG.addColorStop(0, '#f6c49f');
    skinG.addColorStop(0.6, '#e5a075');
    skinG.addColorStop(1, '#c27848');
    ctx.fillStyle = skinG;
    ctx.beginPath();
    ctx.roundRect(p.elbowX - 2, p.elbowY, 10, 28, 3);
    ctx.fill();

    // Batting Gloves (White split-finger pro gloves)
    const gloveG = ctx.createLinearGradient(p.wristX - 3, p.wristY, p.wristX + 15, p.wristY + 15);
    gloveG.addColorStop(0, '#ffffff');
    gloveG.addColorStop(0.6, '#f1f5f9');
    gloveG.addColorStop(1, '#0284c7');
    ctx.fillStyle = gloveG;
    ctx.beginPath();
    ctx.roundRect(p.wristX - 2, p.wristY, 15, 16, 4);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    for (let f = 0; f < 3; f++) {
      ctx.fillRect(p.wristX - 1, p.wristY + 2 + f * 4, 13, 2.5);
    }
    ctx.fillStyle = '#0284c7';
    ctx.fillRect(p.wristX + 1, p.wristY + 13, 10, 2);

    // 7. English Willow Bat (Slender blade)
    this.drawEnglishWillowBat(
      ctx,
      p.batHandleX, p.batHandleY,
      p.batHandleX + 1, p.batHandleY + 24,
      p.batToeX, p.batToeY,
      p.batToeX + 14, p.batToeY,
      p.batHandleX + 15, p.batHandleY + 24,
      6, 24
    );

    // 8. Impact Flash / Spark
    if (p.impactSpark) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.beginPath();
      ctx.arc(p.impactSpark.x, p.impactSpark.y, p.impactSpark.star ? 12 : 8, 0, Math.PI * 2);
      ctx.fill();
      if (p.impactSpark.star) {
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.arc(p.impactSpark.x, p.impactSpark.y, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 9. Head & Helmet (Facing straight down the pitch at bowler)
    this.drawBattingHelmetAndHead(ctx, p.headX, p.headY, p.headTilt || 0);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // NON-STRIKER PROCEDURAL RENDERING (160 × 260) — Thin Stick Cricket Style
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Render High-Definition Non-Striker at Bowler's Crease (160 × 260) — Thin Stick Cricket Style
   */
  /**
   * Render High-Definition Non-Striker at Bowler's Crease (160 × 260) — Balanced Stick Cricket Style
   */
  static renderNonStriker(canvas: HTMLCanvasElement): void {
    canvas.width = 160;
    canvas.height = 260;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 160, 260);

    // 1. Ground Shadow
    this.drawGroundShadow(ctx, 80, 248, 30, 8);

    // 2. Spiked Shoes
    this.drawSpikeShoe(ctx, 56, 234, 24, 14);
    this.drawSpikeShoe(ctx, 80, 234, 24, 14);

    // 3. Athletic White Trousers & Pads (16px width)
    const legG = ctx.createLinearGradient(60, 140, 100, 240);
    legG.addColorStop(0, '#f8fafc');
    legG.addColorStop(0.5, '#e2e8f0');
    legG.addColorStop(1, '#cbd5e1');
    ctx.fillStyle = legG;

    // Left Leg / Pad
    ctx.beginPath();
    ctx.roundRect(61, 140, 16, 94, 4);
    ctx.fill();

    // Right Leg / Pad
    ctx.beginPath();
    ctx.roundRect(83, 140, 16, 94, 4);
    ctx.fill();

    // Pad Ribs
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1.4;
    for (let r = 0; r < 2; r++) {
      ctx.beginPath();
      ctx.moveTo(65 + r * 5, 150); ctx.lineTo(65 + r * 5, 228);
      ctx.moveTo(87 + r * 5, 150); ctx.lineTo(87 + r * 5, 228);
      ctx.stroke();
    }

    // 4. Royal Blue Jersey Torso (28px width)
    const torsoG = ctx.createLinearGradient(66, 78, 94, 140);
    torsoG.addColorStop(0, '#0284c7');
    torsoG.addColorStop(0.5, '#0ea5e9');
    torsoG.addColorStop(1, '#0284c7');
    ctx.fillStyle = torsoG;
    ctx.beginPath();
    ctx.roundRect(66, 78, 28, 62, [5, 5, 4, 4]);
    ctx.fill();

    // V-neck collar & Gold Crest
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(75, 78); ctx.lineTo(80, 88); ctx.lineTo(85, 78);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(80, 98, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Grounded Bat on Left Side
    ctx.fillStyle = '#0284c7';
    ctx.beginPath();
    ctx.roundRect(46, 130, 7, 20, 2);
    ctx.fill();
    this.drawEnglishWillowBat(ctx, 46, 150, 44, 165, 38, 234, 32, 232, 50, 165, 5, 18);

    // Arms (Balanced 8px)
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';

    // Left Arm holding bat handle
    ctx.beginPath();
    ctx.moveTo(70, 84);
    ctx.lineTo(48, 132);
    ctx.stroke();

    // Right Arm resting at hip
    ctx.beginPath();
    ctx.moveTo(90, 84);
    ctx.lineTo(96, 114);
    ctx.stroke();

    // Glove holding bat handle
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(44, 128, 11, 11, 2);
    ctx.fill();

    // 5. Head & Cap
    this.drawHeadAndCap(ctx, 80, 46, 0);
  }

  /**
   * Render High-Definition Crouched Fielder (120 × 180) — Balanced Stick Cricket Style
   */
  static renderFielder(canvas: HTMLCanvasElement): void {
    canvas.width = 120;
    canvas.height = 180;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 120, 180);

    // 1. Ground Shadow
    this.drawGroundShadow(ctx, 60, 168, 26, 7);

    // 2. Spiked Shoes
    this.drawSpikeShoe(ctx, 42, 156, 20, 12);
    this.drawSpikeShoe(ctx, 58, 156, 20, 12);

    // 3. Athletic White Trousers (14px width)
    const legG = ctx.createLinearGradient(40, 98, 80, 156);
    legG.addColorStop(0, '#f8fafc');
    legG.addColorStop(0.5, '#e2e8f0');
    legG.addColorStop(1, '#cbd5e1');
    ctx.fillStyle = legG;

    // Left Leg
    ctx.beginPath();
    ctx.roundRect(44, 98, 14, 58, 3);
    ctx.fill();

    // Right Leg
    ctx.beginPath();
    ctx.roundRect(62, 98, 14, 58, 3);
    ctx.fill();

    // 4. Royal Blue Jersey Torso (26px width)
    const torsoG = ctx.createLinearGradient(47, 50, 73, 98);
    torsoG.addColorStop(0, '#0284c7');
    torsoG.addColorStop(0.5, '#0ea5e9');
    torsoG.addColorStop(1, '#0284c7');
    ctx.fillStyle = torsoG;
    ctx.beginPath();
    ctx.roundRect(47, 50, 26, 48, [4, 4, 3, 3]);
    ctx.fill();

    // V-neck collar & piping
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(55, 50); ctx.lineTo(60, 57); ctx.lineTo(65, 50);
    ctx.closePath();
    ctx.fill();

    // 5. Arms (7px) in athletic ready stance
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.moveTo(50, 56);
    ctx.lineTo(38, 80);
    ctx.lineTo(50, 96);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(70, 56);
    ctx.lineTo(82, 80);
    ctx.lineTo(70, 96);
    ctx.stroke();

    // Bare hands / gloves cupped at waist
    ctx.fillStyle = '#f6c49f';
    ctx.beginPath();
    ctx.arc(50, 96, 4.5, 0, Math.PI * 2);
    ctx.arc(70, 96, 4.5, 0, Math.PI * 2);
    ctx.fill();

    // 6. Head & Cap
    ctx.save();
    ctx.translate(60, 30);

    // Neck
    ctx.fillStyle = '#e5a075';
    ctx.fillRect(-5, 8, 10, 12);

    // Head
    const faceG = ctx.createRadialGradient(0, 0, 2, 0, 0, 13);
    faceG.addColorStop(0, '#f6c49f');
    faceG.addColorStop(0.6, '#e5a075');
    faceG.addColorStop(1, '#c27848');
    ctx.fillStyle = faceG;
    ctx.beginPath();
    ctx.arc(0, 0, 13, 0, Math.PI * 2);
    ctx.fill();

    // Cap
    const capG = ctx.createRadialGradient(0, -6, 2, 0, -6, 14);
    capG.addColorStop(0, '#38bdf8');
    capG.addColorStop(0.5, '#0284c7');
    capG.addColorStop(1, '#0369a1');
    ctx.fillStyle = capG;
    ctx.beginPath();
    ctx.arc(0, -4, 14, Math.PI, 0, false);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#0284c7';
    ctx.beginPath();
    ctx.ellipse(0, -4, 16, 5, 0, 0, Math.PI);
    ctx.fill();

    ctx.restore();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // HIGH-DEFINITION PROCEDURAL COMPONENT BUILDERS
  // ─────────────────────────────────────────────────────────────────────────────

  private static drawGroundShadow(
    ctx: CanvasRenderingContext2D,
    cx: number, cy: number, rx: number, ry: number
  ): void {
    const shadowG = ctx.createRadialGradient(cx, cy, 4, cx, cy, rx);
    shadowG.addColorStop(0, 'rgba(2, 6, 23, 0.75)');
    shadowG.addColorStop(0.5, 'rgba(2, 6, 23, 0.35)');
    shadowG.addColorStop(1, 'rgba(2, 6, 23, 0)');
    ctx.fillStyle = shadowG;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  private static drawSpikeShoe(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number
  ): void {
    // Ground sole
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.roundRect(x, y + h - 4, w, 4, [0, 0, 3, 3]);
    ctx.fill();

    // Spikes studs
    ctx.fillStyle = '#94a3b8';
    for (let s = 0; s < 4; s++) {
      ctx.fillRect(x + 4 + s * (w / 4.5), y + h - 1.5, 2, 2);
    }

    // Molded leather upper
    const shoeG = ctx.createLinearGradient(x, y, x, y + h);
    shoeG.addColorStop(0, '#ffffff');
    shoeG.addColorStop(0.6, '#f1f5f9');
    shoeG.addColorStop(1, '#cbd5e1');
    ctx.fillStyle = shoeG;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h - 3, [5, 8, 3, 3]);
    ctx.fill();

    // Subtle athletic heel counter
    ctx.fillStyle = '#0284c7';
    ctx.beginPath();
    ctx.roundRect(x, y + 2, 8, h - 6, [4, 0, 0, 2]);
    ctx.fill();

    // Laces
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let l = 0; l < 3; l++) {
      ctx.moveTo(x + 12 + l * 4, y + 3);
      ctx.lineTo(x + 12 + l * 4, y + 8);
    }
    ctx.stroke();
  }

  private static drawBattingLeg(
    ctx: CanvasRenderingContext2D,
    hipX: number, hipY: number,
    kneeX: number, kneeY: number,
    padX: number, padY: number,
    padW: number, padH: number,
    isRear: boolean
  ): void {
    // 1. Thigh in realistic athletic team trousers
    const thighG = ctx.createLinearGradient(hipX, hipY, kneeX, kneeY);
    if (isRear) {
      thighG.addColorStop(0, '#172554');
      thighG.addColorStop(0.3, '#1e3a8a');
      thighG.addColorStop(0.7, '#1e40af');
      thighG.addColorStop(1, '#0f172a');
    } else {
      thighG.addColorStop(0, '#1e40af');
      thighG.addColorStop(0.3, '#2563eb');
      thighG.addColorStop(0.7, '#3b82f6');
      thighG.addColorStop(1, '#1d4ed8');
    }
    ctx.fillStyle = thighG;

    const thighHalfW = isRear ? 9 : 11;
    const kneeHalfW = 12;

    ctx.beginPath();
    ctx.moveTo(hipX - thighHalfW, hipY);
    ctx.bezierCurveTo(hipX - thighHalfW - 2, hipY + 22, kneeX - kneeHalfW - 2, kneeY - 14, kneeX - kneeHalfW, kneeY);
    ctx.lineTo(kneeX + kneeHalfW, kneeY);
    ctx.bezierCurveTo(kneeX + kneeHalfW + 2, kneeY - 14, hipX + thighHalfW + 2, hipY + 22, hipX + thighHalfW, hipY);
    ctx.closePath();
    ctx.fill();

    // 2. Seamless Molded Knee Roll Bolster (contours knee cap)
    const kneeG = ctx.createLinearGradient(padX, padY - 12, padX + padW, padY + 12);
    kneeG.addColorStop(0, isRear ? '#e2e8f0' : '#ffffff');
    kneeG.addColorStop(0.5, isRear ? '#cbd5e1' : '#f8fafc');
    kneeG.addColorStop(1, isRear ? '#94a3b8' : '#e2e8f0');
    ctx.fillStyle = kneeG;

    // Top knee bolster
    ctx.beginPath();
    ctx.roundRect(padX - 1, padY - 10, padW + 2, 22, [8, 8, 4, 4]);
    ctx.fill();

    // Knee roll central seam & bevel
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(padX, padY + 1);
    ctx.lineTo(padX + padW, padY + 1);
    ctx.stroke();

    // 3. Molded 3D Shin Pad Body
    const padG = ctx.createLinearGradient(padX, padY, padX + padW, padY + padH);
    padG.addColorStop(0, isRear ? '#f1f5f9' : '#ffffff');
    padG.addColorStop(0.3, isRear ? '#e2e8f0' : '#f8fafc');
    padG.addColorStop(0.7, isRear ? '#cbd5e1' : '#e2e8f0');
    padG.addColorStop(1, isRear ? '#94a3b8' : '#cbd5e1');
    ctx.fillStyle = padG;

    ctx.beginPath();
    ctx.roundRect(padX, padY + 10, padW, padH - 10, [4, 4, 6, 6]);
    ctx.fill();

    // 4. Cylindrical Cane Ribs (Professional batting pad ribs)
    ctx.strokeStyle = isRear ? '#94a3b8' : '#cbd5e1';
    ctx.lineWidth = 2.0;
    const numRibs = isRear ? 4 : 5;
    for (let r = 0; r < numRibs; r++) {
      const rx = padX + 5 + r * (padW / (numRibs + 0.6));
      ctx.beginPath();
      ctx.moveTo(rx, padY + 14);
      ctx.lineTo(rx, padY + padH - 4);
      ctx.stroke();
    }

    // 5. Clean Navy Fastening Straps with Buckles
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(padX, padY + 28, padW, 3);
    ctx.fillRect(padX, padY + 48, padW, 3);
    // Silver buckle clips
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(padX + 2, padY + 27, 4, 5);
    ctx.fillRect(padX + 2, padY + 47, 4, 5);
  }

  private static drawWaistband(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number
  ): void {
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 4);
    ctx.fill();
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(x + 4, y + 2, w - 8, 2);
  }

  private static drawBattingTorso(
    ctx: CanvasRenderingContext2D,
    x1: number, y1: number,
    x2: number, y2: number,
    x3: number, y3: number,
    x4: number, y4: number
  ): void {
    const torsoG = ctx.createLinearGradient(x1, y1, x3, y3);
    torsoG.addColorStop(0, '#0f172a');
    torsoG.addColorStop(0.3, '#1e3a8a');
    torsoG.addColorStop(0.6, '#2563eb');
    torsoG.addColorStop(0.85, '#0284c7');
    torsoG.addColorStop(1, '#38bdf8');
    ctx.fillStyle = torsoG;

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.bezierCurveTo(x1 + 10, y1 - 25, x2 - 15, y2 + 15, x2, y2);
    ctx.lineTo(x3, y3);
    ctx.bezierCurveTo(x3 - 10, y3 + 25, x4 + 15, y4 - 15, x4, y4);
    ctx.closePath();
    ctx.fill();

    // White breathable side mesh panel
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(x1 + 12, y1 - 2);
    ctx.lineTo(x2 + 6, y2 + 4);
    ctx.lineTo(x2 + 12, y2 + 6);
    ctx.lineTo(x1 + 18, y1 - 1);
    ctx.closePath();
    ctx.fill();

    // Gold Team Crest on Left Chest
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(x3 - 14, y3 + 12, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  private static drawBattingArm(
    ctx: CanvasRenderingContext2D,
    shoulderX: number, shoulderY: number,
    elbowX: number, elbowY: number,
    wristX: number, wristY: number,
    gloveW: number, gloveH: number
  ): void {
    // Upper Arm (Jersey Sleeve)
    const sleeveG = ctx.createLinearGradient(shoulderX, shoulderY, elbowX, elbowY);
    sleeveG.addColorStop(0, '#1e3a8a');
    sleeveG.addColorStop(0.7, '#2563eb');
    sleeveG.addColorStop(1, '#0284c7');
    ctx.fillStyle = sleeveG;
    ctx.beginPath();
    ctx.roundRect(shoulderX - 4, shoulderY, 18, 38, 5);
    ctx.fill();

    // Muscular Forearm
    const armG = ctx.createLinearGradient(elbowX, elbowY, wristX, wristY);
    armG.addColorStop(0, '#f6c49f');
    armG.addColorStop(0.5, '#e5a075');
    armG.addColorStop(1, '#c27848');
    ctx.fillStyle = armG;
    ctx.beginPath();
    ctx.roundRect(elbowX - 2, elbowY, 16, 32, 4);
    ctx.fill();

    // Segmented Competition Batting Glove (Split finger sausage padding)
    const gloveG = ctx.createLinearGradient(wristX - 6, wristY, wristX + gloveW, wristY + gloveH);
    gloveG.addColorStop(0, '#ffffff');
    gloveG.addColorStop(0.5, '#e0f2fe');
    gloveG.addColorStop(1, '#0284c7');
    ctx.fillStyle = gloveG;
    ctx.beginPath();
    ctx.roundRect(wristX - 4, wristY, gloveW, gloveH, 6);
    ctx.fill();

    // Finger padding roll segments
    ctx.fillStyle = '#ffffff';
    for (let f = 0; f < 3; f++) {
      ctx.fillRect(wristX - 2, wristY + 4 + f * 5, gloveW - 4, 3.5);
    }
    // Cyan thumb guard & palm wrap
    ctx.fillStyle = '#0284c7';
    ctx.fillRect(wristX, wristY + gloveH - 4, gloveW - 8, 3);
  }

  private static drawEnglishWillowBat(
    ctx: CanvasRenderingContext2D,
    handleX: number, handleY: number,
    throatX: number, throatY: number,
    toeLeftX: number, toeLeftY: number,
    toeRightX: number, toeRightY: number,
    shoulderRightX: number, shoulderRightY: number,
    handleW: number, handleH: number
  ): void {
    // Rubber grip with diamond traction pattern
    ctx.fillStyle = '#0284c7';
    ctx.beginPath();
    ctx.roundRect(handleX - handleW / 2, handleY, handleW, handleH, 3);
    ctx.fill();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1;
    for (let g = 0; g < 4; g++) {
      ctx.beginPath();
      ctx.moveTo(handleX - handleW / 2, handleY + 4 + g * 6);
      ctx.lineTo(handleX + handleW / 2, handleY + 4 + g * 6);
      ctx.stroke();
    }

    // English Willow Blade (Natural honey grain gradient)
    const bladeG = ctx.createLinearGradient(throatX, throatY, toeRightX, toeRightY);
    bladeG.addColorStop(0, '#fef3c7');
    bladeG.addColorStop(0.3, '#fde68a');
    bladeG.addColorStop(0.7, '#f59e0b');
    bladeG.addColorStop(1, '#b45309');
    ctx.fillStyle = bladeG;

    ctx.beginPath();
    ctx.moveTo(throatX, throatY);
    ctx.lineTo(toeLeftX, toeLeftY);
    ctx.lineTo(toeRightX, toeRightY);
    ctx.lineTo(shoulderRightX, shoulderRightY);
    ctx.closePath();
    ctx.fill();

    // Willow Wood Grain Streaks
    ctx.strokeStyle = 'rgba(180, 83, 9, 0.40)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(throatX + 6, throatY + 8); ctx.lineTo(toeLeftX + 6, toeLeftY - 2);
    ctx.moveTo(throatX + 12, throatY + 8); ctx.lineTo(toeLeftX + 12, toeLeftY - 2);
    ctx.stroke();

    // Metallic Red Sponsor Sticker Badge
    ctx.fillStyle = '#f43f5e';
    ctx.beginPath();
    ctx.moveTo(throatX + 6, throatY + 16);
    ctx.lineTo(throatX + 18, throatY + 60);
    ctx.lineTo(throatX + 30, throatY + 60);
    ctx.lineTo(throatX + 18, throatY + 16);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(throatX + 10, throatY + 28, 12, 3);
    ctx.fillRect(throatX + 12, throatY + 36, 12, 3);

    // Hard rubber toe guard
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.moveTo(toeLeftX, toeLeftY);
    ctx.lineTo(toeRightX, toeRightY);
    ctx.lineTo(toeRightX - 2, toeRightY + 4);
    ctx.lineTo(toeLeftX - 2, toeLeftY + 4);
    ctx.closePath();
    ctx.fill();
  }

  private static drawBattingHelmetAndHead(
    ctx: CanvasRenderingContext2D,
    headX: number, headY: number,
    tilt: number
  ): void {
    ctx.save();
    ctx.translate(headX, headY);
    ctx.rotate((tilt * Math.PI) / 180);

    // Anatomical Neck
    const neckG = ctx.createLinearGradient(-8, 14, 8, 14);
    neckG.addColorStop(0, '#f6c49f');
    neckG.addColorStop(0.6, '#e5a075');
    neckG.addColorStop(1, '#c27848');
    ctx.fillStyle = neckG;
    ctx.beginPath();
    ctx.roundRect(-8, 12, 16, 22, 3);
    ctx.fill();

    // Composite Helmet Dome (Deep Glossy Team Navy)
    const helmetG = ctx.createRadialGradient(-2, -4, 4, 0, 0, 26);
    helmetG.addColorStop(0, '#3b82f6');
    helmetG.addColorStop(0.4, '#1e3a8a');
    helmetG.addColorStop(0.8, '#0f172a');
    helmetG.addColorStop(1, '#020617');
    ctx.fillStyle = helmetG;
    ctx.beginPath();
    ctx.arc(0, 0, 24, 0, Math.PI * 2);
    ctx.fill();

    // Specular Gloss Catchlight Arc
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.beginPath();
    ctx.ellipse(-4, -12, 14, 5, -0.3, 0, Math.PI * 2);
    ctx.fill();

    // Ear protection pad
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(-8, 6, 8, 0, Math.PI * 2);
    ctx.fill();

    // Face Profile facing bowler (forehead, nose, jaw)
    ctx.fillStyle = '#f6c49f';
    ctx.beginPath();
    ctx.roundRect(4, -2, 16, 22, 4);
    ctx.fill();

    // Focused Eye looking at bowler
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(12, 4, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(11, 3, 1, 1);

    // Helmet Sun Visor Peak (Extending forward)
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.roundRect(6, -7, 26, 8, [2, 6, 6, 2]);
    ctx.fill();

    // Titanium Face Protection Grill
    ctx.strokeStyle = '#ffffff';
    // Vertical connection struts
    ctx.moveTo(12, -2); ctx.lineTo(12, 20);
    ctx.moveTo(20, 1); ctx.lineTo(20, 14);
    ctx.stroke();

    // Chin strap
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-6, 8);
    ctx.lineTo(6, 22);
    ctx.stroke();

    ctx.restore();
  }

  private static drawShoes(
    ctx: CanvasRenderingContext2D,
    x1: number, y1: number,
    x2: number, y2: number,
    w: number, h: number
  ): void {
    this.drawSpikeShoe(ctx, x1, y1, w, h);
    this.drawSpikeShoe(ctx, x2, y2, w, h);
  }

  private static drawTrousers(
    ctx: CanvasRenderingContext2D,
    x1: number, y1: number, w1: number, h1: number,
    x2: number, y2: number, w2: number, h2: number
  ): void {
    const legGrad = this.getLegGrad(ctx, x1, y1, x2 + w2, y1);
    ctx.fillStyle = legGrad;
    ctx.beginPath();
    ctx.roundRect(x1, y1, w1, h1, 6);
    ctx.roundRect(x2, y2, w2, h2, 6);
    ctx.fill();
  }

  private static drawTorso(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number,
    tilt: number
  ): void {
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate((tilt * Math.PI) / 180);

    const jerseyGrad = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, -h / 2);
    jerseyGrad.addColorStop(0, '#991b1b');
    jerseyGrad.addColorStop(0.2, '#dc2626');
    jerseyGrad.addColorStop(0.5, '#ef4444');
    jerseyGrad.addColorStop(0.8, '#dc2626');
    jerseyGrad.addColorStop(1, '#7f1d1d');

    ctx.fillStyle = jerseyGrad;
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, 8);
    ctx.fill();

    ctx.restore();
  }

  private static drawHeadAndCap(
    ctx: CanvasRenderingContext2D,
    x: number, y: number,
    tilt: number
  ): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((tilt * Math.PI) / 180);

    // Thin neck
    const neckGrad = ctx.createLinearGradient(-5, 10, 5, 10);
    neckGrad.addColorStop(0, '#e5a075');
    neckGrad.addColorStop(1, '#c27848');
    ctx.fillStyle = neckGrad;
    ctx.fillRect(-5, 10, 10, 14);

    // Slender face
    const faceGrad = ctx.createRadialGradient(0, 0, 3, 0, 0, 14);
    faceGrad.addColorStop(0, '#f6c49f');
    faceGrad.addColorStop(0.6, '#e5a075');
    faceGrad.addColorStop(1, '#c27848');
    ctx.fillStyle = faceGrad;
    ctx.beginPath();
    ctx.arc(0, 0, 13, 0, Math.PI * 2);
    ctx.fill();

    // Stick Cricket Cap
    const capGrad = ctx.createRadialGradient(0, -7, 3, 0, -7, 15);
    capGrad.addColorStop(0, '#ef4444');
    capGrad.addColorStop(0.5, '#dc2626');
    capGrad.addColorStop(1, '#991b1b');
    ctx.fillStyle = capGrad;
    ctx.beginPath();
    ctx.arc(0, -4, 14, Math.PI, 0, false);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#7f1d1d';
    ctx.beginPath();
    ctx.ellipse(0, -4, 16, 5, 0, 0, Math.PI);
    ctx.fill();

    ctx.restore();
  }

  private static drawBall(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, radius: number
  ): void {
    const ballGrad = ctx.createRadialGradient(x - radius * 0.3, y - radius * 0.3, 1, x, y, radius);
    ballGrad.addColorStop(0, '#f87171');
    ballGrad.addColorStop(0.5, '#dc2626');
    ballGrad.addColorStop(0.9, '#991b1b');
    ballGrad.addColorStop(1, '#450a0a');

    ctx.fillStyle = ballGrad;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    // Stitched White Seam Line
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(x, y, radius * 0.9, radius * 0.3, Math.PI / 4, 0, Math.PI * 2);
    ctx.stroke();

    // Catchlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.beginPath();
    ctx.arc(x - radius * 0.35, y - radius * 0.35, radius * 0.25, 0, Math.PI * 2);
    ctx.fill();
  }

  private static getSkinGrad(
    ctx: CanvasRenderingContext2D,
    x1: number, y1: number, x2: number, y2: number
  ): CanvasGradient {
    const g = ctx.createLinearGradient(x1, y1, x2, y2);
    g.addColorStop(0, '#f6c49f');
    g.addColorStop(0.5, '#e5a075');
    g.addColorStop(1, '#c27848');
    return g;
  }

  private static getLegGrad(
    ctx: CanvasRenderingContext2D,
    x1: number, y1: number, x2: number, y2: number
  ): CanvasGradient {
    const g = ctx.createLinearGradient(x1, y1, x2, y2);
    g.addColorStop(0, '#f1f5f9');
    g.addColorStop(0.3, '#ffffff');
    g.addColorStop(0.8, '#e2e8f0');
    g.addColorStop(1, '#cbd5e1');
    return g;
  }
}
