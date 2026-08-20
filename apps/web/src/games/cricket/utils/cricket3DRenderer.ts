/**
 * Procedural 3D Cricket Renderer.
 * Renders realistic 3D stadium, pitch, players, volumetric cricket ball with seam,
 * 3D wooden bat and stumps, impact particles, and dynamic broadcast banners.
 */

import { CRICKET_VISUAL_CONFIG } from '../constants/cricketVisualConfig';

export interface Point2D {
  x: number;
  y: number;
}

export interface CricketBallRenderState {
  x: number;
  y: number;
  z: number; // height above pitch
  spinAngle: number;
  isHit: boolean;
  trail: Point2D[];
}

export interface WicketState {
  isHit: boolean;
  timeSinceHit: number;
  bail1: { x: number; y: number; vx: number; vy: number; rot: number };
  bail2: { x: number; y: number; vx: number; vy: number; rot: number };
  stumpTilt: number[];
}

export class Cricket3DRenderer {
  /**
   * Draw the entire 3D Stadium Bowl & Atmosphere
   */
  static drawStadium(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    animTime: number,
    team1Score: number,
    team2Score: number,
    overs: string
  ): void {
    const horizon = CRICKET_VISUAL_CONFIG.horizonY;

    // ── 1. Sky & Atmospheric Gradient ──
    const skyGrad = ctx.createLinearGradient(0, 0, 0, horizon);
    skyGrad.addColorStop(0, '#020617');
    skyGrad.addColorStop(0.6, '#0f172a');
    skyGrad.addColorStop(1, '#1e293b');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, width, horizon);

    // Subtle Stars in upper sky
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    for (let i = 0; i < 40; i++) {
      const sx = (Math.sin(i * 99 + 1) * 0.5 + 0.5) * width;
      const sy = (Math.cos(i * 37 + 2) * 0.5 + 0.5) * (horizon - 70);
      const sr = (i % 3 === 0 ? 1.5 : 1);
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fill();
    }

    // ── 2. Stadium Architecture (Tiered Stands) ──
    const standTopY = horizon - 95;
    const standHeight = 95;

    // Tier 1 Backing
    ctx.fillStyle = '#0b1329';
    ctx.fillRect(0, standTopY, width, standHeight);

    // Grandstand Tier Seating Lines
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.5)';
    ctx.lineWidth = 1.5;
    for (let r = 0; r < 5; r++) {
      const lineY = standTopY + 18 + r * 15;
      ctx.beginPath();
      ctx.moveTo(0, lineY);
      ctx.lineTo(width, lineY);
      ctx.stroke();
    }

    // ── 3. Animated Crowd Silhouettes & Camera Flashes ──
    const crowdColors = ['#f43f5e', '#3b82f6', '#eab308', '#a855f7', '#10b981', '#ffffff', '#cbd5e1'];
    for (let i = 0; i < 90; i++) {
      const cx = (i / 90) * width + Math.sin(i * 12) * 3;
      const cy = standTopY + 22 + (i % 4) * 16 + Math.sin(animTime * 4 + i) * 1.5;
      const color = crowdColors[i % crowdColors.length]!;

      // Head & Torso
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillRect(cx - 3, cy + 3, 6, 6);
    }

    // Occasional Stadium Camera Flash
    const flashIndex = Math.floor((animTime * 5) % 15);
    if (flashIndex < 3) {
      const fx = (Math.sin(animTime * 17) * 0.4 + 0.5) * width;
      const fy = standTopY + 15 + Math.random() * 45;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.beginPath();
      ctx.arc(fx, fy, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // ── 4. LED Sponsor Ribbon Banner ──
    const ribbonY = horizon - 20;
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, ribbonY, width, 20);

    // Glowing Top/Bottom Border
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, ribbonY);
    ctx.lineTo(width, ribbonY);
    ctx.moveTo(0, horizon);
    ctx.lineTo(width, horizon);
    ctx.stroke();

    // Scrolling Sponsor Text
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const sponsorText = '★ PREMIER CRICKET LEAGUE ★ GAMING HUB CHAMPIONSHIP ★ CRICKET 3D ARENA ★';
    const textOffset = (animTime * 45) % 400;
    ctx.fillText(sponsorText, 20 - textOffset, ribbonY + 10);
    ctx.fillText(sponsorText, 420 - textOffset, ribbonY + 10);
    ctx.fillText(sponsorText, 820 - textOffset, ribbonY + 10);

    // ── 5. Stadium Electronic Scoreboard Jumbotron (Left/Right) ──
    const drawJumbotron = (jx: number, jy: number) => {
      ctx.fillStyle = '#020617';
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 2;
      ctx.fillRect(jx, jy, 130, 48);
      ctx.strokeRect(jx, jy, 130, 48);

      ctx.fillStyle = '#f59e0b';
      ctx.font = 'black 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`T1: ${team1Score} | T2: ${team2Score}`, jx + 65, jy + 18);
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 9px monospace';
      ctx.fillText(`OVERS: ${overs}`, jx + 65, jy + 34);
    };
    drawJumbotron(width / 2 - 65, standTopY - 5);

    // ── 6. 4-Corner High-Intensity Floodlight Towers ──
    const drawTower = (lx: number, ly: number, targetX: number) => {
      // Light Beams (Atmospheric Cones)
      const beamGrad = ctx.createRadialGradient(lx, ly, 10, targetX, horizon + 160, 260);
      beamGrad.addColorStop(0, 'rgba(255, 255, 255, 0.28)');
      beamGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.08)');
      beamGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');

      ctx.fillStyle = beamGrad;
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(targetX - 180, horizon + 300);
      ctx.lineTo(targetX + 180, horizon + 300);
      ctx.closePath();
      ctx.fill();

      // Steel Light Bank Frame
      ctx.fillStyle = '#334155';
      ctx.fillRect(lx - 22, ly - 8, 44, 16);

      // Glowing Light Bulbs
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 18;
      for (let b = 0; b < 6; b++) {
        ctx.beginPath();
        ctx.arc(lx - 16 + b * 6.5, ly, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
    };

    drawTower(110, 45, width * 0.35);
    drawTower(width - 110, 45, width * 0.65);
  }

  /**
   * Draw the 3D Outfield & Trapezoidal Dirt Pitch
   */
  static drawPitch(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const horizon = CRICKET_VISUAL_CONFIG.horizonY;
    const { pitchTopW, pitchBotW, pitchTopY, pitchBotY } = CRICKET_VISUAL_CONFIG;
    const centerX = width / 2;

    // ── 1. Outfield Grass with Professional Lawn Stripes ──
    const stripeH = CRICKET_VISUAL_CONFIG.outfield.stripeHeight;
    for (let y = horizon; y < height; y += stripeH) {
      const isDark = Math.floor((y - horizon) / stripeH) % 2 === 0;
      ctx.fillStyle = isDark
        ? CRICKET_VISUAL_CONFIG.outfield.stripeDark
        : CRICKET_VISUAL_CONFIG.outfield.stripeLight;
      ctx.fillRect(0, y, width, stripeH);
    }

    // ── 2. Boundary Rope & 30-Yard Circle ──
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, horizon);
    ctx.lineTo(width, horizon);
    ctx.stroke();

    // 30-Yard Oval Marker
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.ellipse(centerX, (pitchTopY + pitchBotY) / 2, width * 0.42, (pitchBotY - pitchTopY) * 0.65, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // ── 3. Realistic 3D Trapezoidal Pitch ──
    const pitchGrad = ctx.createLinearGradient(centerX, pitchTopY, centerX, pitchBotY);
    pitchGrad.addColorStop(0, '#9a3412');
    pitchGrad.addColorStop(0.5, '#b45309');
    pitchGrad.addColorStop(1, '#d97706');

    ctx.fillStyle = pitchGrad;
    ctx.beginPath();
    ctx.moveTo(centerX - pitchTopW / 2, pitchTopY);
    ctx.lineTo(centerX + pitchTopW / 2, pitchTopY);
    ctx.lineTo(centerX + pitchBotW / 2, pitchBotY);
    ctx.lineTo(centerX - pitchBotW / 2, pitchBotY);
    ctx.closePath();
    ctx.fill();

    // Subtle Pitch Wear Texture & Footmarks
    ctx.fillStyle = 'rgba(120, 53, 15, 0.35)';
    for (let f = 0; f < 12; f++) {
      const fy = pitchTopY + 30 + f * 24;
      const progress = (fy - pitchTopY) / (pitchBotY - pitchTopY);
      const curW = pitchTopW + (pitchBotW - pitchTopW) * progress;
      const fx = centerX + (Math.sin(f * 45) * 0.35) * (curW / 2);
      ctx.beginPath();
      ctx.ellipse(fx, fy, 10 + progress * 8, 4 + progress * 3, Math.sin(f), 0, Math.PI * 2);
      ctx.fill();
    }

    // ── 4. Creases (Popping & Bowling Lines) ──
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3.5;

    // Bowler's Crease (Top)
    ctx.beginPath();
    ctx.moveTo(centerX - pitchTopW / 2 - 12, pitchTopY + 18);
    ctx.lineTo(centerX + pitchTopW / 2 + 12, pitchTopY + 18);
    ctx.stroke();

    // Batsman's Crease (Bottom Popping Crease)
    ctx.beginPath();
    ctx.moveTo(centerX - pitchBotW / 2 + 25, pitchBotY - 45);
    ctx.lineTo(centerX + pitchBotW / 2 - 25, pitchBotY - 45);
    ctx.stroke();

    // Return Creases
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(centerX - pitchBotW / 2 + 45, pitchBotY - 70);
    ctx.lineTo(centerX - pitchBotW / 2 + 45, pitchBotY);
    ctx.moveTo(centerX + pitchBotW / 2 - 45, pitchBotY - 70);
    ctx.lineTo(centerX + pitchBotW / 2 - 45, pitchBotY);
    ctx.stroke();
  }

  /**
   * Draw 3D Volumetric Stumps & Bails with dynamic hit animation
   */
  static drawStumps(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    scale: number,
    wicketState?: WicketState
  ): void {
    const isWicket = wicketState?.isHit ?? false;
    const time = wicketState?.timeSinceHit ?? 0;

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);

    // Stumps contact shadow
    ctx.fillStyle = 'rgba(2, 6, 23, 0.6)';
    ctx.beginPath();
    ctx.ellipse(0, 2, 18, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    const stumpPositions = [-10, 0, 10];

    // Draw 3 Stumps
    for (let s = 0; s < 3; s++) {
      const sx = stumpPositions[s]!;
      const tilt = isWicket ? (wicketState?.stumpTilt[s] ?? 0) * Math.min(1, time * 3) : 0;

      ctx.save();
      ctx.translate(sx, 0);
      ctx.rotate(tilt);

      // Stump 3D Cylinder
      const stumpGrad = ctx.createLinearGradient(-3, 0, 3, 0);
      stumpGrad.addColorStop(0, '#ca8a04');
      stumpGrad.addColorStop(0.4, '#fef08a');
      stumpGrad.addColorStop(1, '#a16207');

      ctx.fillStyle = stumpGrad;
      ctx.fillRect(-3, -48, 6, 48);

      // Stump Top Tip
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.ellipse(0, -48, 3, 1.5, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    // Draw Bails
    if (!isWicket) {
      // Intact Bails resting on top
      ctx.fillStyle = '#fef08a';
      ctx.strokeStyle = '#ca8a04';
      ctx.lineWidth = 1;

      // Left Bail
      ctx.fillRect(-11, -51, 10, 3);
      ctx.strokeRect(-11, -51, 10, 3);

      // Right Bail
      ctx.fillRect(1, -51, 10, 3);
      ctx.strokeRect(1, -51, 10, 3);
    } else {
      // Flying Bails in 3D physics arcs
      const b1 = wicketState?.bail1;
      const b2 = wicketState?.bail2;

      if (b1) {
        ctx.save();
        ctx.translate(b1.x, b1.y);
        ctx.rotate(b1.rot);
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(-5, -1.5, 10, 3);
        ctx.restore();
      }

      if (b2) {
        ctx.save();
        ctx.translate(b2.x, b2.y);
        ctx.rotate(b2.rot);
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(-5, -1.5, 10, 3);
        ctx.restore();
      }
    }

    ctx.restore();
  }

  /**
   * Draw Volumetric 3D Cricket Ball with Rotating Seam & Height Shadow
   */
  static drawBall(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    z: number,
    spinAngle: number,
    scale: number,
    trail: Point2D[]
  ): void {
    ctx.save();

    // ── 1. Pitch Ground Shadow ──
    const shadowScale = Math.max(0.4, scale * (1 - z * 0.0025));
    const shadowAlpha = Math.max(0.15, 0.65 - z * 0.004);
    const shadowY = y + z * 0.85;

    ctx.fillStyle = `rgba(2, 6, 23, ${shadowAlpha})`;
    ctx.beginPath();
    ctx.ellipse(x, shadowY, 9 * shadowScale, 4 * shadowScale, 0, 0, Math.PI * 2);
    ctx.fill();

    // ── 2. Speed Trail for fast balls ──
    if (trail && trail.length > 1) {
      for (let t = 1; t < trail.length; t++) {
        const pt = trail[t]!;
        const prevPt = trail[t - 1]!;
        const tAlpha = (t / trail.length) * 0.35;

        ctx.strokeStyle = `rgba(248, 113, 113, ${tAlpha})`;
        ctx.lineWidth = (t / trail.length) * 6 * scale;
        ctx.beginPath();
        ctx.moveTo(prevPt.x, prevPt.y);
        ctx.lineTo(pt.x, pt.y);
        ctx.stroke();
      }
    }

    // ── 3. 3D Volumetric Leather Ball ──
    const ballRadius = CRICKET_VISUAL_CONFIG.ball.radius * scale;
    const ballGrad = ctx.createRadialGradient(
      x - ballRadius * 0.3,
      y - ballRadius * 0.3,
      ballRadius * 0.1,
      x,
      y,
      ballRadius
    );
    ballGrad.addColorStop(0, '#f87171');
    ballGrad.addColorStop(0.6, '#dc2626');
    ballGrad.addColorStop(1, '#7f1d1d');

    ctx.fillStyle = ballGrad;
    ctx.beginPath();
    ctx.arc(x, y, ballRadius, 0, Math.PI * 2);
    ctx.fill();

    // ── 4. Stitched Seam Line with 3D Rotation ──
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(spinAngle);

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(1, 1.6 * scale);
    ctx.beginPath();
    ctx.ellipse(0, 0, ballRadius * 0.95, ballRadius * 0.28, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Seam Stitch dots
    ctx.fillStyle = '#ffffff';
    for (let s = -3; s <= 3; s++) {
      const dotX = (s / 3.5) * ballRadius * 0.85;
      ctx.beginPath();
      ctx.arc(dotX, 0, 0.9 * scale, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // ── 5. Specular Catchlight ──
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.beginPath();
    ctx.arc(x - ballRadius * 0.35, y - ballRadius * 0.35, ballRadius * 0.22, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  /**
   * Draw Modern Volumetric 3D Batsman & Wooden Bat
   */
  static drawBatsman(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    shotType: 'stance' | 'straight' | 'left' | 'right' | 'up',
    swingProgress: number,
    teamColor: string
  ): void {
    ctx.save();
    ctx.translate(x, y);

    // Ground Contact Shadow
    ctx.fillStyle = 'rgba(2, 6, 23, 0.65)';
    ctx.beginPath();
    ctx.ellipse(0, 8, 38, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    // Calculate Bat Rotation based on Shot Type & Progress
    let batAngle = 0.2; // Stance backlift
    let torsoOffset = 0;

    if (shotType === 'straight') {
      batAngle = -0.4 + Math.sin(swingProgress * Math.PI) * 1.8;
      torsoOffset = Math.sin(swingProgress * Math.PI) * 12;
    } else if (shotType === 'left') {
      batAngle = -0.8 + Math.sin(swingProgress * Math.PI) * 2.2;
      torsoOffset = -Math.sin(swingProgress * Math.PI) * 14;
    } else if (shotType === 'right') {
      batAngle = 0.8 - Math.sin(swingProgress * Math.PI) * 2.2;
      torsoOffset = Math.sin(swingProgress * Math.PI) * 14;
    } else if (shotType === 'up') {
      batAngle = -1.2 + Math.sin(swingProgress * Math.PI) * 2.5;
      torsoOffset = -Math.sin(swingProgress * Math.PI) * 8;
    }

    // ── 1. Batting Pads & Legs (White with blue straps) ──
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-24, -28, 16, 36);
    ctx.fillRect(8, -28, 16, 36);

    // Pad Straps
    ctx.fillStyle = '#1e3a8a';
    ctx.fillRect(-24, -20, 16, 4);
    ctx.fillRect(-24, -8, 16, 4);
    ctx.fillRect(8, -20, 16, 4);
    ctx.fillRect(8, -8, 16, 4);

    // Shoes
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(-26, 6, 20, 8);
    ctx.fillRect(6, 6, 20, 8);

    // ── 2. Torso & Team Jersey ──
    ctx.save();
    ctx.translate(torsoOffset, 0);

    const jerseyGrad = ctx.createLinearGradient(-26, -75, 26, -75);
    jerseyGrad.addColorStop(0, '#1d4ed8');
    jerseyGrad.addColorStop(0.5, '#3b82f6');
    jerseyGrad.addColorStop(1, '#1e40af');

    ctx.fillStyle = jerseyGrad;
    ctx.beginPath();
    ctx.roundRect(-26, -75, 52, 48, 8);
    ctx.fill();

    // Jersey Gold Trim & Collar
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-12, -75);
    ctx.lineTo(0, -60);
    ctx.lineTo(12, -75);
    ctx.stroke();

    // ── 3. Head & Helmet ──
    // Neck
    ctx.fillStyle = '#fca5a5';
    ctx.fillRect(-8, -84, 16, 12);

    // Helmet Shell (Navy Blue 3D Sphere)
    const helmetGrad = ctx.createRadialGradient(-6, -100, 4, 0, -96, 24);
    helmetGrad.addColorStop(0, '#3b82f6');
    helmetGrad.addColorStop(0.6, '#1e3a8a');
    helmetGrad.addColorStop(1, '#0f172a');

    ctx.fillStyle = helmetGrad;
    ctx.beginPath();
    ctx.arc(0, -96, 22, 0, Math.PI * 2);
    ctx.fill();

    // Helmet Visor / Peak
    ctx.fillStyle = '#1e3a8a';
    ctx.fillRect(-22, -96, 22, 6);

    // Metallic Face Grill
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-18, -90); ctx.lineTo(0, -78);
    ctx.moveTo(-12, -90); ctx.lineTo(0, -74);
    ctx.moveTo(-6, -90);  ctx.lineTo(0, -70);
    ctx.stroke();

    // Face skin beneath grill
    ctx.fillStyle = '#fca5a5';
    ctx.beginPath();
    ctx.ellipse(0, -88, 12, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // ── 4. 3D Cricket Bat & Batting Gloves ──
    ctx.save();
    ctx.translate(14, -50);
    ctx.rotate(batAngle);

    // Cane Handle Grip
    ctx.fillStyle = '#334155';
    ctx.fillRect(-4, -28, 8, 30);

    // Wooden Blade with 3D Bevel
    const batGrad = ctx.createLinearGradient(-7, 0, 7, 0);
    batGrad.addColorStop(0, '#ca8a04');
    batGrad.addColorStop(0.3, '#fef08a');
    batGrad.addColorStop(0.8, '#fef9c3');
    batGrad.addColorStop(1, '#a16207');

    ctx.fillStyle = batGrad;
    ctx.beginPath();
    ctx.roundRect(-7, 2, 14, 68, 3);
    ctx.fill();

    // Bat Sponsor Sticker
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(-6, 8, 12, 20);

    // Batting Gloves (White with green grip)
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, -18, 9, 0, Math.PI * 2);
    ctx.arc(0, -6, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#22c55e';
    ctx.fillRect(-4, -19, 8, 3);
    ctx.fillRect(-4, -7, 8, 3);

    ctx.restore();

    ctx.restore();
    ctx.restore();
  }

  /**
   * Draw Dynamic 3D Bowler Model
   */
  static drawBowler(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    phase: 'idle' | 'runup' | 'delivery' | 'followthrough',
    armAngle: number,
    teamColor: string
  ): void {
    ctx.save();
    ctx.translate(x, y);

    // Contact shadow
    ctx.fillStyle = 'rgba(2, 6, 23, 0.55)';
    ctx.beginPath();
    ctx.ellipse(0, 4, 16, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Trousers
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-8, -20, 6, 22);
    ctx.fillRect(2, -20, 6, 22);

    // Jersey
    ctx.fillStyle = teamColor || '#2563eb';
    ctx.fillRect(-10, -42, 20, 24);

    // Head & Cap
    ctx.fillStyle = '#fca5a5';
    ctx.beginPath();
    ctx.arc(0, -48, 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(0, -50, 8, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(-8, -50, 8, 2);

    // Rotating Bowling Arm
    ctx.save();
    ctx.translate(6, -36);
    ctx.rotate(armAngle);
    ctx.fillStyle = '#fca5a5';
    ctx.fillRect(-3, -22, 6, 22);

    // Ball held in hand during delivery
    if (phase === 'runup' || phase === 'delivery') {
      ctx.fillStyle = '#dc2626';
      ctx.beginPath();
      ctx.arc(0, -24, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    ctx.restore();
  }

  /**
   * Draw Celebratory Broadcast Banner (FOUR, SIX, WICKET)
   */
  static drawBanner(
    ctx: CanvasRenderingContext2D,
    type: 'FOUR' | 'SIX' | 'WICKET',
    width: number,
    height: number,
    progress: number
  ): void {
    if (progress <= 0 || progress >= 1) return;

    ctx.save();
    const centerX = width / 2;
    const centerY = height * 0.38;

    const scale = Math.sin(progress * Math.PI) * 1.05;
    ctx.translate(centerX, centerY);
    ctx.scale(scale, scale);

    const isWicket = type === 'WICKET';
    const isSix = type === 'SIX';

    const bgGrad = ctx.createLinearGradient(-160, 0, 160, 0);
    if (isWicket) {
      bgGrad.addColorStop(0, 'rgba(225, 29, 72, 0)');
      bgGrad.addColorStop(0.3, 'rgba(225, 29, 72, 0.95)');
      bgGrad.addColorStop(0.7, 'rgba(225, 29, 72, 0.95)');
      bgGrad.addColorStop(1, 'rgba(225, 29, 72, 0)');
    } else if (isSix) {
      bgGrad.addColorStop(0, 'rgba(168, 85, 247, 0)');
      bgGrad.addColorStop(0.3, 'rgba(168, 85, 247, 0.95)');
      bgGrad.addColorStop(0.7, 'rgba(168, 85, 247, 0.95)');
      bgGrad.addColorStop(1, 'rgba(168, 85, 247, 0)');
    } else {
      bgGrad.addColorStop(0, 'rgba(16, 185, 129, 0)');
      bgGrad.addColorStop(0.3, 'rgba(16, 185, 129, 0.95)');
      bgGrad.addColorStop(0.7, 'rgba(16, 185, 129, 0.95)');
      bgGrad.addColorStop(1, 'rgba(16, 185, 129, 0)');
    }

    ctx.fillStyle = bgGrad;
    ctx.fillRect(-220, -32, 440, 64);

    // Text Label
    ctx.font = 'black 36px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = isWicket ? '#f43f5e' : isSix ? '#c084fc' : '#34d399';
    ctx.shadowBlur = 20;

    const label = isWicket ? '⚡ WICKET! ⚡' : isSix ? '💥 MAXIMUM SIX! 💥' : '🚀 FOUR RUNS! 🚀';
    ctx.fillText(label, 0, 0);

    ctx.restore();
  }
}
