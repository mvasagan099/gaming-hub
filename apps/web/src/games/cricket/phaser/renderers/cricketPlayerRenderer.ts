/**
 * High-Definition Realistic Human Cricketer Animation Renderer
 * Renders anatomical, athletic human cricket player textures with:
 * - Natural human proportions and muscular curves
 * - Multi-stop gradients for cylindrical 3D limb and torso lighting
 * - True biomechanical cricket bowling action sequence (Idle -> Run-up -> Gather Leap -> 12 O'Clock Release -> Follow-Through)
 * - Molded competition batting equipment & realistic batting shot frames
 */

export class CricketPlayerRenderer {
  // ─────────────────────────────────────────────────────────────────────────────
  // BOWLER ANIMATION FRAMES (160 × 260)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Frame 1: Bowler Idle / Ready at the Mark (160 × 260)
   */
  static renderBowlerIdle(canvas: HTMLCanvasElement): void {
    canvas.width = 160;
    canvas.height = 260;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 160, 260);

    // Ground Shadow
    const shadowGrad = ctx.createRadialGradient(80, 248, 8, 80, 248, 44);
    shadowGrad.addColorStop(0, 'rgba(2, 6, 23, 0.50)');
    shadowGrad.addColorStop(1, 'rgba(2, 6, 23, 0)');
    ctx.fillStyle = shadowGrad;
    ctx.beginPath();
    ctx.ellipse(80, 248, 44, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // Spikes / Shoes (Balanced stance)
    this.drawShoes(ctx, 50, 230, 84, 230, 26, 16);

    // White Trousers (Standing)
    this.drawTrousers(ctx, 48, 150, 26, 82, 84, 150, 26, 82);

    // Crimson Jersey Torso
    this.drawTorso(ctx, 48, 85, 64, 70, 0);

    // Arms holding ball in both hands at chest
    const skinGrad = this.getSkinGrad(ctx, 40, 90, 120, 90);
    ctx.fillStyle = skinGrad;
    // Left & Right Forearms inwards
    ctx.beginPath();
    ctx.roundRect(42, 110, 28, 18, 5);
    ctx.roundRect(90, 110, 28, 18, 5);
    ctx.fill();

    // Cupped Hands
    ctx.beginPath();
    ctx.arc(72, 124, 7, 0, Math.PI * 2);
    ctx.arc(88, 124, 7, 0, Math.PI * 2);
    ctx.fill();

    // 3D Ball in hands
    this.drawBall(ctx, 80, 122, 9);

    // Head, Face & Cap
    this.drawHeadAndCap(ctx, 80, 48, 0);
  }

  /**
   * Frame 2: Bowler Run-Up Power Stride (160 × 260)
   */
  static renderBowlerStride(canvas: HTMLCanvasElement): void {
    canvas.width = 160;
    canvas.height = 260;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 160, 260);

    // Floating Ground Shadow (Cadence bounce)
    const shadowGrad = ctx.createRadialGradient(80, 248, 6, 80, 248, 40);
    shadowGrad.addColorStop(0, 'rgba(2, 6, 23, 0.40)');
    shadowGrad.addColorStop(1, 'rgba(2, 6, 23, 0)');
    ctx.fillStyle = shadowGrad;
    ctx.beginPath();
    ctx.ellipse(80, 248, 40, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // High knee drive and trailing rear boot
    this.drawShoes(ctx, 40, 222, 98, 238, 26, 16);

    // Running Trousers (Split stride)
    const legGrad = this.getLegGrad(ctx, 30, 150, 120, 150);
    ctx.fillStyle = legGrad;
    // High front left leg
    ctx.beginPath();
    ctx.moveTo(50, 145);
    ctx.bezierCurveTo(42, 175, 36, 195, 42, 224);
    ctx.lineTo(66, 224);
    ctx.bezierCurveTo(68, 195, 72, 175, 72, 145);
    ctx.closePath();
    ctx.fill();

    // Trailing driving right leg
    ctx.beginPath();
    ctx.moveTo(86, 145);
    ctx.bezierCurveTo(88, 175, 96, 205, 100, 238);
    ctx.lineTo(122, 238);
    ctx.bezierCurveTo(116, 205, 108, 175, 104, 145);
    ctx.closePath();
    ctx.fill();

    // Torso tilted forward in sprint
    this.drawTorso(ctx, 48, 82, 64, 68, 4);

    // Arms pumping in sprint
    const skinGrad = this.getSkinGrad(ctx, 20, 80, 140, 80);
    ctx.fillStyle = skinGrad;
    // Left arm pumping forward
    ctx.beginPath();
    ctx.roundRect(30, 95, 18, 38, 5);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(39, 138, 7, 0, Math.PI * 2);
    ctx.fill();

    // Right arm holding ball ready
    ctx.beginPath();
    ctx.roundRect(110, 88, 18, 34, 5);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(119, 126, 7, 0, Math.PI * 2);
    ctx.fill();
    this.drawBall(ctx, 123, 124, 8.5);

    // Head, Face & Cap
    this.drawHeadAndCap(ctx, 80, 45, 3);
  }

  /**
   * Frame 3: Bowler Gather / Pre-Delivery Airborne Leap & Coil (160 × 260)
   */
  static renderBowlerGather(canvas: HTMLCanvasElement): void {
    canvas.width = 160;
    canvas.height = 260;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 160, 260);

    // Airborne Ground Shadow (Separated for jump height)
    const shadowGrad = ctx.createRadialGradient(80, 252, 6, 80, 252, 36);
    shadowGrad.addColorStop(0, 'rgba(2, 6, 23, 0.35)');
    shadowGrad.addColorStop(1, 'rgba(2, 6, 23, 0)');
    ctx.fillStyle = shadowGrad;
    ctx.beginPath();
    ctx.ellipse(80, 252, 36, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    // Legs tucked in gather leap (feet off ground)
    this.drawShoes(ctx, 48, 215, 88, 218, 24, 15);

    const legGrad = this.getLegGrad(ctx, 40, 140, 120, 140);
    ctx.fillStyle = legGrad;
    ctx.beginPath();
    ctx.roundRect(46, 140, 26, 78, 6);
    ctx.roundRect(86, 140, 26, 80, 6);
    ctx.fill();

    // Coiled Side-On Torso
    this.drawTorso(ctx, 48, 75, 64, 70, -6);

    const skinGrad = this.getSkinGrad(ctx, 20, 30, 140, 30);
    ctx.fillStyle = skinGrad;

    // Left Non-Bowling Arm (Extended High towards batsman for sight-line)
    ctx.beginPath();
    ctx.moveTo(42, 80);
    ctx.lineTo(26, 35);
    ctx.lineTo(42, 35);
    ctx.lineTo(56, 80);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(34, 30, 7, 0, Math.PI * 2); // Guiding Hand
    ctx.fill();

    // Right Bowling Arm (Cocked behind the head in deep power coil)
    ctx.beginPath();
    ctx.moveTo(110, 76);
    ctx.lineTo(134, 55);
    ctx.lineTo(148, 62);
    ctx.lineTo(124, 85);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(142, 58, 7.5, 0, Math.PI * 2);
    ctx.fill();

    // Ball held behind shoulder ready to windmill
    this.drawBall(ctx, 145, 52, 9);

    // Head, Face & Cap (Looking down pitch past left arm)
    this.drawHeadAndCap(ctx, 80, 38, -4);
  }

  /**
   * Frame 4: Bowler 12 O'Clock High Overarm Release (160 × 260)
   */
  static renderBowlerRelease(canvas: HTMLCanvasElement): void {
    canvas.width = 160;
    canvas.height = 260;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 160, 260);

    // Firm plant shadow at crease
    const shadowGrad = ctx.createRadialGradient(80, 248, 10, 80, 248, 50);
    shadowGrad.addColorStop(0, 'rgba(2, 6, 23, 0.55)');
    shadowGrad.addColorStop(1, 'rgba(2, 6, 23, 0)');
    ctx.fillStyle = shadowGrad;
    ctx.beginPath();
    ctx.ellipse(80, 248, 50, 11, 0, 0, Math.PI * 2);
    ctx.fill();

    // Plant Lead Foot & Driving Rear Foot
    this.drawShoes(ctx, 42, 230, 92, 226, 28, 16);

    // Braced Front Leg & Driving Back Leg
    const legGrad = this.getLegGrad(ctx, 40, 155, 120, 155);
    ctx.fillStyle = legGrad;
    ctx.beginPath();
    ctx.moveTo(46, 155);
    ctx.bezierCurveTo(40, 180, 42, 210, 44, 232);
    ctx.lineTo(68, 232);
    ctx.bezierCurveTo(72, 210, 74, 180, 72, 155);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(88, 155);
    ctx.bezierCurveTo(86, 180, 90, 210, 92, 230);
    ctx.lineTo(114, 230);
    ctx.bezierCurveTo(118, 205, 116, 180, 112, 155);
    ctx.closePath();
    ctx.fill();

    // Powerful forward-driving Torso
    this.drawTorso(ctx, 46, 88, 68, 70, 3);

    const skinGrad = this.getSkinGrad(ctx, 20, 20, 140, 20);

    // Left Arm (Tucked tightly into chest for rotational whip)
    ctx.fillStyle = skinGrad;
    ctx.beginPath();
    ctx.roundRect(34, 115, 18, 28, 5);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(43, 146, 8, 0, Math.PI * 2); // Closed Torque Fist
    ctx.fill();

    // Right Arm (High 12 O'Clock Vertical Delivery Release)
    ctx.fillStyle = skinGrad;
    ctx.beginPath();
    ctx.moveTo(116, 76);
    ctx.lineTo(122, 22);
    ctx.lineTo(142, 22);
    ctx.lineTo(134, 76);
    ctx.closePath();
    ctx.fill();

    // White Wristband
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(122, 22, 20, 7);

    // Hand releasing the ball at the highest apex
    ctx.fillStyle = skinGrad;
    ctx.beginPath();
    ctx.arc(132, 15, 8, 0, Math.PI * 2);
    ctx.fill();

    // Volumetric 3D Cricket Ball at Finger Release Point
    this.drawBall(ctx, 132, 8, 9.5);

    // Head, Face & Cap (Focused eyes locked on stumps)
    this.drawHeadAndCap(ctx, 80, 48, 2);
  }

  /**
   * Frame 5: Bowler Follow-Through (160 × 260)
   */
  static renderBowlerFollowthrough(canvas: HTMLCanvasElement): void {
    canvas.width = 160;
    canvas.height = 260;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 160, 260);

    // Ground Contact Shadow
    const shadowGrad = ctx.createRadialGradient(70, 248, 8, 70, 248, 46);
    shadowGrad.addColorStop(0, 'rgba(2, 6, 23, 0.55)');
    shadowGrad.addColorStop(1, 'rgba(2, 6, 23, 0)');
    ctx.fillStyle = shadowGrad;
    ctx.beginPath();
    ctx.ellipse(70, 248, 46, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // Front plant foot & high trailing balance leg
    this.drawShoes(ctx, 44, 232, 108, 205, 26, 16);

    const legGrad = this.getLegGrad(ctx, 35, 155, 125, 155);
    ctx.fillStyle = legGrad;
    // Front bent absorbing knee
    ctx.beginPath();
    ctx.moveTo(46, 155);
    ctx.bezierCurveTo(40, 185, 42, 215, 46, 234);
    ctx.lineTo(70, 234);
    ctx.bezierCurveTo(72, 215, 74, 185, 72, 155);
    ctx.closePath();
    ctx.fill();

    // High kick trailing balance leg
    ctx.beginPath();
    ctx.moveTo(86, 155);
    ctx.bezierCurveTo(92, 175, 105, 195, 110, 210);
    ctx.lineTo(132, 205);
    ctx.bezierCurveTo(124, 185, 110, 165, 102, 155);
    ctx.closePath();
    ctx.fill();

    // Deep forward-bent Torso (40° forward lean)
    this.drawTorso(ctx, 36, 105, 74, 62, 14);

    const skinGrad = this.getSkinGrad(ctx, 10, 100, 120, 100);
    ctx.fillStyle = skinGrad;

    // Right Arm swept fully across torso towards left hip (follow-through sweep)
    ctx.beginPath();
    ctx.moveTo(96, 108);
    ctx.lineTo(34, 150);
    ctx.lineTo(24, 138);
    ctx.lineTo(82, 100);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(28, 146, 7.5, 0, Math.PI * 2);
    ctx.fill();

    // Left Arm kicking back for dynamic balance
    ctx.beginPath();
    ctx.roundRect(96, 115, 22, 18, 4);
    ctx.fill();

    // Head bent forward looking along pitch to field return ball
    this.drawHeadAndCap(ctx, 68, 70, 10);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // BATSMAN & FIELDER PROCEDURAL RENDERING
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Render Realistic Human Batsman with 3D Helmet & Molded Pads (200 × 320)
   */
  static renderBatsman(canvas: HTMLCanvasElement): void {
    canvas.width = 200;
    canvas.height = 320;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 200, 320);

    // Ground Shadow
    const shadowGrad = ctx.createRadialGradient(100, 305, 12, 100, 305, 65);
    shadowGrad.addColorStop(0, 'rgba(2, 6, 23, 0.50)');
    shadowGrad.addColorStop(0.6, 'rgba(2, 6, 23, 0.20)');
    shadowGrad.addColorStop(1, 'rgba(2, 6, 23, 0)');
    ctx.fillStyle = shadowGrad;
    ctx.beginPath();
    ctx.ellipse(100, 305, 65, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    // Cricket Spikes
    const shoeGrad = ctx.createLinearGradient(48, 280, 92, 302);
    shoeGrad.addColorStop(0, '#ffffff');
    shoeGrad.addColorStop(0.7, '#e2e8f0');
    shoeGrad.addColorStop(1, '#94a3b8');

    ctx.fillStyle = shoeGrad;
    ctx.beginPath();
    ctx.roundRect(48, 282, 42, 20, [8, 8, 4, 4]);
    ctx.roundRect(108, 282, 46, 20, [8, 8, 4, 4]);
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(48, 296, 42, 6);
    ctx.fillRect(108, 296, 46, 6);
    ctx.fillStyle = '#0284c7';
    ctx.fillRect(56, 286, 18, 4);
    ctx.fillRect(116, 286, 20, 4);

    // Molded 3D Competition Batting Pads
    const padGrad = ctx.createLinearGradient(44, 180, 94, 180);
    padGrad.addColorStop(0, '#cbd5e1');
    padGrad.addColorStop(0.2, '#f8fafc');
    padGrad.addColorStop(0.7, '#ffffff');
    padGrad.addColorStop(1, '#e2e8f0');

    ctx.fillStyle = padGrad;
    ctx.beginPath();
    ctx.roundRect(44, 182, 48, 104, 8);
    ctx.roundRect(104, 186, 52, 100, 8);
    ctx.fill();

    // Vertical Molded Cane Ribs
    for (let r = 0; r < 4; r++) {
      const rxL = 48 + r * 11;
      const ribGradL = ctx.createLinearGradient(rxL, 202, rxL + 8, 202);
      ribGradL.addColorStop(0, '#cbd5e1');
      ribGradL.addColorStop(0.4, '#ffffff');
      ribGradL.addColorStop(1, '#94a3b8');
      ctx.fillStyle = ribGradL;
      ctx.beginPath();
      ctx.roundRect(rxL, 202, 8, 80, 4);
      ctx.fill();

      const rxR = 108 + r * 12;
      const ribGradR = ctx.createLinearGradient(rxR, 206, rxR + 9, 206);
      ribGradR.addColorStop(0, '#cbd5e1');
      ribGradR.addColorStop(0.4, '#ffffff');
      ribGradR.addColorStop(1, '#94a3b8');
      ctx.fillStyle = ribGradR;
      ctx.beginPath();
      ctx.roundRect(rxR, 206, 9, 76, 4);
      ctx.fill();
    }

    // Molded Knee Rolls
    const kneeRollGrad = ctx.createLinearGradient(44, 184, 94, 184);
    kneeRollGrad.addColorStop(0, '#e2e8f0');
    kneeRollGrad.addColorStop(0.5, '#ffffff');
    kneeRollGrad.addColorStop(1, '#cbd5e1');
    ctx.fillStyle = kneeRollGrad;
    ctx.beginPath();
    ctx.roundRect(44, 184, 48, 18, 5);
    ctx.roundRect(104, 188, 52, 18, 5);
    ctx.fill();

    // Pad Straps (Navy with Silver Buckles)
    ctx.fillStyle = '#1e3a8a';
    for (let s = 0; s < 3; s++) {
      const sy = 208 + s * 28;
      ctx.fillRect(44, sy, 48, 6);
      ctx.fillRect(104, sy + 3, 52, 6);
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(49, sy + 1, 5, 4);
      ctx.fillRect(109, sy + 4, 5, 4);
      ctx.fillStyle = '#1e3a8a';
    }

    // Trousers
    const pantsGrad = ctx.createLinearGradient(42, 146, 158, 146);
    pantsGrad.addColorStop(0, '#cbd5e1');
    pantsGrad.addColorStop(0.3, '#f1f5f9');
    pantsGrad.addColorStop(0.7, '#ffffff');
    pantsGrad.addColorStop(1, '#cbd5e1');
    ctx.fillStyle = pantsGrad;
    ctx.beginPath();
    ctx.roundRect(42, 148, 114, 42, 8);
    ctx.fill();

    // India Blue Jersey
    const jerseyGrad = ctx.createLinearGradient(40, 86, 160, 86);
    jerseyGrad.addColorStop(0, '#0a2e66');
    jerseyGrad.addColorStop(0.25, '#0f4c9e');
    jerseyGrad.addColorStop(0.55, '#1d4ed8');
    jerseyGrad.addColorStop(0.85, '#0f4c9e');
    jerseyGrad.addColorStop(1, '#081f44');

    ctx.fillStyle = jerseyGrad;
    ctx.beginPath();
    ctx.moveTo(42, 88);
    ctx.bezierCurveTo(46, 118, 50, 142, 48, 156);
    ctx.lineTo(152, 156);
    ctx.bezierCurveTo(150, 142, 154, 118, 158, 88);
    ctx.bezierCurveTo(130, 80, 70, 80, 42, 88);
    ctx.closePath();
    ctx.fill();

    // Dark side panels with gold piping
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(52, 92); ctx.lineTo(58, 156);
    ctx.moveTo(148, 92); ctx.lineTo(142, 156);
    ctx.stroke();

    // V-Neck Collar & Gold Crest
    ctx.fillStyle = '#081f44';
    ctx.beginPath();
    ctx.moveTo(82, 82); ctx.lineTo(100, 108); ctx.lineTo(118, 82);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(82, 82); ctx.lineTo(100, 108); ctx.lineTo(118, 82);
    ctx.stroke();

    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(100, 122, 8, 0, Math.PI * 2);
    ctx.fill();

    // Batting Arms & Segmented Gloves
    const skinGrad = ctx.createLinearGradient(12, 90, 42, 90);
    skinGrad.addColorStop(0, '#f6c49f');
    skinGrad.addColorStop(0.5, '#e5a075');
    skinGrad.addColorStop(1, '#c27848');

    ctx.fillStyle = jerseyGrad;
    ctx.beginPath();
    ctx.roundRect(14, 88, 30, 60, 8);
    ctx.roundRect(154, 90, 30, 54, 8);
    ctx.fill();

    ctx.fillStyle = skinGrad;
    ctx.beginPath();
    ctx.roundRect(10, 144, 26, 36, 6);
    ctx.roundRect(158, 138, 24, 30, 6);
    ctx.fill();

    // Segmented Batting Gloves
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(6, 176, 38, 30, 7);
    ctx.roundRect(156, 164, 34, 26, 6);
    ctx.fill();

    // English Willow Cricket Bat
    const gripGrad = ctx.createLinearGradient(0, 150, 18, 150);
    gripGrad.addColorStop(0, '#09090b');
    gripGrad.addColorStop(1, '#27272a');
    ctx.fillStyle = gripGrad;
    ctx.beginPath();
    ctx.roundRect(0, 152, 18, 66, 4);
    ctx.fill();

    const bladeGrad = ctx.createLinearGradient(0, 226, 26, 226);
    bladeGrad.addColorStop(0, '#fef3c7');
    bladeGrad.addColorStop(0.3, '#fde68a');
    bladeGrad.addColorStop(0.8, '#f59e0b');
    bladeGrad.addColorStop(1, '#b45309');
    ctx.fillStyle = bladeGrad;
    ctx.beginPath();
    ctx.roundRect(0, 226, 26, 68, [0, 4, 4, 0]);
    ctx.fill();

    // Wood grains & sponsor
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(3, 238, 18, 30);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(5, 246, 14, 3);
    ctx.fillRect(5, 255, 14, 3);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 290, 26, 6);

    // 3D Helmet & Face
    const helmetGrad = ctx.createRadialGradient(88, 32, 6, 100, 44, 36);
    helmetGrad.addColorStop(0, '#38bdf8');
    helmetGrad.addColorStop(0.3, '#1d4ed8');
    helmetGrad.addColorStop(0.7, '#0f2b5c');
    helmetGrad.addColorStop(1, '#0a162e');

    ctx.fillStyle = helmetGrad;
    ctx.beginPath();
    ctx.arc(100, 44, 36, 0, Math.PI * 2);
    ctx.fill();

    // Peak
    ctx.fillStyle = '#0a162e';
    ctx.beginPath();
    ctx.roundRect(60, 42, 40, 14, [4, 0, 0, 4]);
    ctx.fill();

    // Face skin
    ctx.fillStyle = skinGrad;
    ctx.beginPath();
    ctx.roundRect(66, 48, 32, 26, 5);
    ctx.fill();

    // Eyes
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(74, 56, 3.5, 0, Math.PI * 2);
    ctx.arc(88, 56, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Titanium Metallic Grill
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2.4;
    for (let b = 0; b < 4; b++) {
      ctx.beginPath();
      ctx.moveTo(62, 48 + b * 8);
      ctx.lineTo(100, 48 + b * 8);
      ctx.stroke();
    }
    for (let v = 0; v < 4; v++) {
      ctx.beginPath();
      ctx.moveTo(66 + v * 8, 46);
      ctx.lineTo(66 + v * 8, 76);
      ctx.stroke();
    }
  }

  /**
   * Render Realistic Human Fielder in Crouched Ready Stance (120 × 180)
   */
  static renderFielder(canvas: HTMLCanvasElement): void {
    canvas.width = 120;
    canvas.height = 180;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 120, 180);

    // Ground Shadow
    const shadowGrad = ctx.createRadialGradient(60, 172, 8, 60, 172, 40);
    shadowGrad.addColorStop(0, 'rgba(2, 6, 23, 0.45)');
    shadowGrad.addColorStop(1, 'rgba(2, 6, 23, 0)');
    ctx.fillStyle = shadowGrad;
    ctx.beginPath();
    ctx.ellipse(60, 172, 40, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // Spikes / Shoes
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(32, 156, 22, 14, 4);
    ctx.roundRect(66, 156, 22, 14, 4);
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(32, 166, 22, 4);
    ctx.fillRect(66, 166, 22, 4);

    // Athletic Trousers (Crouched Knees)
    const legGrad = ctx.createLinearGradient(30, 100, 90, 100);
    legGrad.addColorStop(0, '#f1f5f9');
    legGrad.addColorStop(0.5, '#ffffff');
    legGrad.addColorStop(1, '#cbd5e1');
    ctx.fillStyle = legGrad;
    ctx.beginPath();
    ctx.roundRect(34, 105, 18, 54, 6);
    ctx.roundRect(68, 105, 18, 54, 6);
    ctx.roundRect(32, 94, 56, 20, 6);
    ctx.fill();

    // India Blue Jersey
    const jerseyGrad = ctx.createLinearGradient(30, 50, 90, 50);
    jerseyGrad.addColorStop(0, '#0f4c9e');
    jerseyGrad.addColorStop(0.5, '#1d4ed8');
    jerseyGrad.addColorStop(1, '#0a2e66');
    ctx.fillStyle = jerseyGrad;
    ctx.beginPath();
    ctx.roundRect(30, 48, 60, 50, 8);
    ctx.fill();

    // V-Neck Collar
    ctx.fillStyle = '#081f44';
    ctx.beginPath();
    ctx.moveTo(48, 46); ctx.lineTo(60, 60); ctx.lineTo(72, 46);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(48, 46); ctx.lineTo(60, 60); ctx.lineTo(72, 46);
    ctx.stroke();

    // Ready Arms with Cupped Hands
    const skinGrad = ctx.createLinearGradient(20, 60, 40, 60);
    skinGrad.addColorStop(0, '#f6c49f');
    skinGrad.addColorStop(1, '#c27848');
    ctx.fillStyle = skinGrad;
    ctx.beginPath();
    ctx.roundRect(18, 76, 14, 24, 4);
    ctx.roundRect(88, 76, 14, 24, 4);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(28, 104, 7, 0, Math.PI * 2);
    ctx.arc(92, 104, 7, 0, Math.PI * 2);
    ctx.fill();

    // Head & Cap
    ctx.fillStyle = skinGrad;
    ctx.fillRect(54, 38, 12, 12);
    ctx.beginPath();
    ctx.arc(60, 28, 15, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(55, 27, 2, 0, Math.PI * 2);
    ctx.arc(65, 27, 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#0f4c9e';
    ctx.beginPath();
    ctx.arc(60, 24, 15.5, Math.PI, 0, false);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#081f44';
    ctx.beginPath();
    ctx.ellipse(60, 24, 18, 5, 0, 0, Math.PI);
    ctx.fill();
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(60, 16, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // HELPER DRAWING METHODS
  // ─────────────────────────────────────────────────────────────────────────────

  private static drawShoes(
    ctx: CanvasRenderingContext2D,
    x1: number, y1: number,
    x2: number, y2: number,
    w: number, h: number
  ): void {
    const bootGrad = ctx.createLinearGradient(x1, y1, x1 + w, y1 + h);
    bootGrad.addColorStop(0, '#ffffff');
    bootGrad.addColorStop(0.7, '#e2e8f0');
    bootGrad.addColorStop(1, '#94a3b8');

    ctx.fillStyle = bootGrad;
    ctx.beginPath();
    ctx.roundRect(x1, y1, w, h, [6, 8, 4, 4]);
    ctx.roundRect(x2, y2, w, h, [6, 8, 4, 4]);
    ctx.fill();

    // Dark Soles & Red Accents
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(x1, y1 + h - 4, w, 4);
    ctx.fillRect(x2, y2 + h - 4, w, 4);
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(x1 + 4, y1 + 3, w - 8, 3);
    ctx.fillRect(x2 + 4, y2 + 3, w - 8, 3);
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

    // Inseam Shadow
    ctx.fillStyle = 'rgba(148, 163, 184, 0.45)';
    ctx.beginPath();
    ctx.moveTo(x1 + w1, y1);
    ctx.lineTo(x2, y1);
    ctx.lineTo((x1 + w1 + x2) / 2, y1 + 32);
    ctx.closePath();
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

    // Side Panels
    ctx.fillStyle = '#7f1d1d';
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2 + 4, 8, h - 8, 3);
    ctx.roundRect(w / 2 - 8, -h / 2 + 4, 8, h - 8, 3);
    ctx.fill();

    // Gold Piping
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-w / 2 + 8, -h / 2 + 4); ctx.lineTo(-w / 2 + 8, h / 2 - 4);
    ctx.moveTo(w / 2 - 8, -h / 2 + 4); ctx.lineTo(w / 2 - 8, h / 2 - 4);
    ctx.stroke();

    // V-Neck Collar & Gold Crest
    ctx.fillStyle = '#450a0a';
    ctx.beginPath();
    ctx.moveTo(-10, -h / 2); ctx.lineTo(0, -h / 2 + 16); ctx.lineTo(10, -h / 2);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-10, -h / 2); ctx.lineTo(0, -h / 2 + 16); ctx.lineTo(10, -h / 2);
    ctx.stroke();

    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(0, -h / 2 + 28, 6, 0, Math.PI * 2);
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

    // Neck
    const neckGrad = ctx.createLinearGradient(-8, 12, 8, 12);
    neckGrad.addColorStop(0, '#e5a075');
    neckGrad.addColorStop(1, '#c27848');
    ctx.fillStyle = neckGrad;
    ctx.fillRect(-8, 12, 16, 18);

    // Face
    const faceGrad = ctx.createRadialGradient(0, 0, 4, 0, 0, 18);
    faceGrad.addColorStop(0, '#f6c49f');
    faceGrad.addColorStop(0.6, '#e5a075');
    faceGrad.addColorStop(1, '#c27848');
    ctx.fillStyle = faceGrad;
    ctx.beginPath();
    ctx.arc(0, 0, 17, 0, Math.PI * 2);
    ctx.fill();

    // Ears
    ctx.fillStyle = '#e5a075';
    ctx.beginPath();
    ctx.arc(-17, 0, 3.5, 0, Math.PI * 2);
    ctx.arc(17, 0, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Eyes looking down pitch
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(-6, -2, 2.5, 0, Math.PI * 2);
    ctx.arc(6, -2, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-7, -3, 1, 1);
    ctx.fillRect(5, -3, 1, 1);

    // Crimson 6-Panel Cap
    const capGrad = ctx.createRadialGradient(0, -10, 4, 0, -10, 20);
    capGrad.addColorStop(0, '#dc2626');
    capGrad.addColorStop(0.5, '#991b1b');
    capGrad.addColorStop(1, '#450a0a');
    ctx.fillStyle = capGrad;
    ctx.beginPath();
    ctx.arc(0, -6, 18, Math.PI, 0, false);
    ctx.closePath();
    ctx.fill();

    // Cap Visor Peak
    ctx.fillStyle = '#450a0a';
    ctx.beginPath();
    ctx.ellipse(0, -6, 21, 6, 0, 0, Math.PI);
    ctx.fill();
    ctx.fillStyle = '#991b1b';
    ctx.beginPath();
    ctx.ellipse(0, -8, 21, 5, 0, 0, Math.PI);
    ctx.fill();

    // Gold Team Crest on Cap
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(0, -16, 3, 0, Math.PI * 2);
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

    // Specular Catchlight
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
