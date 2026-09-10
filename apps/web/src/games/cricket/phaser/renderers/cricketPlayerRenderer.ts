/**
 * High-Definition Realistic Human Cricketer Animation Renderer
 * Procedurally renders realistic, anatomically athletic human cricket player textures with:
 * - Natural human proportions, muscular curves, and dynamic athletic postures
 * - Multi-stop gradients for cylindrical 3D limb and torso lighting
 * - Molded competition batting pads with 3D cane ribs & knee rolls
 * - Aerodynamic helmet with titanium face grill & ear protection
 * - Pro split-finger batting gloves wrapped on English willow bat
 * - Complete animation suite:
 *   - Bowler: Idle, Prep, Sprint Run-up (2 strides), High Gather Leap, Crease Plant, 12 O'Clock Release, Follow-Through 1 & 2, plus Rear Perspective
 *   - Batsman: Idle Stance, Bat Tap, High Backlift Trigger, Cover Drive, Straight Punch, Pull/Cut, Lofted Six, Forward Defense, Crease Bat Slide, Wicket Reaction, Celebration
 *   - Running cycle with forward and rearward stride animations
 *   - Non-striker and dynamic athletic fielders
 */

export class CricketPlayerRenderer {
  // ─────────────────────────────────────────────────────────────────────────────
  // COLOR PALETTE TOKENS
  // ─────────────────────────────────────────────────────────────────────────────
  public static readonly PALETTE = {
    skinLight: '#fcd34d',
    skinWarmLight: '#fde68a',
    skinMid: '#f59e0b',
    skinDark: '#d97706',
    skinShadow: '#92400e',
    // Team 1 / Batsman Kit (Cyan / Royal / Sapphire Gradient)
    jerseyCyan: '#38bdf8',
    jerseyRoyal: '#0284c7',
    jerseyDarkBlue: '#0369a1',
    jerseyDeepNavy: '#0c4a6e',
    jerseyGold: '#fbbf24',
    jerseyWhiteTrim: '#ffffff',
    // Team 2 / Bowler Kit (Crimson / Scarlet / Ruby)
    bowlerRedLight: '#f87171',
    bowlerRedMid: '#dc2626',
    bowlerRedDark: '#991b1b',
    bowlerRedDeep: '#450a0a',
    // Trousers & Pads
    trouserWhite: '#ffffff',
    trouserLight: '#f8fafc',
    trouserMid: '#e2e8f0',
    trouserShade: '#cbd5e1',
    trouserDark: '#94a3b8',
    // Batting Pads
    padWhite: '#ffffff',
    padLight: '#f1f5f9',
    padMid: '#e2e8f0',
    padShade: '#cbd5e1',
    padRib: '#94a3b8',
    padStrap: '#0f172a',
    // English Willow Bat
    woodLight: '#fef3c7',
    woodMid: '#fde68a',
    woodGrain: '#f59e0b',
    woodDark: '#b45309',
    batGrip: '#0284c7',
    batGripAccent: '#38bdf8',
    batToeGuard: '#0f172a',
    batSticker: '#dc2626',
    // Helmet
    helmetGloss: '#60a5fa',
    helmetMid: '#1e40af',
    helmetDark: '#1e3a8a',
    helmetShadow: '#0f172a',
    grillSteel: '#f8fafc',
    grillDark: '#64748b',
    // Shoes
    shoeSole: '#0f172a',
    shoeSpikes: '#94a3b8',
    shoeUpper: '#ffffff',
    shoeTrim: '#0284c7',
    // Shadows
    shadowDeep: 'rgba(2, 6, 23, 0.70)',
    shadowSoft: 'rgba(2, 6, 23, 0.25)',
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // GROUND CONTACT SHADOW HELPER
  // ─────────────────────────────────────────────────────────────────────────────
  private static drawGroundShadow(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    rx: number,
    ry: number = 7
  ): void {
    const shadowG = ctx.createRadialGradient(cx, cy, 2, cx, cy, rx);
    shadowG.addColorStop(0, this.PALETTE.shadowDeep);
    shadowG.addColorStop(0.55, this.PALETTE.shadowSoft);
    shadowG.addColorStop(1, 'rgba(2, 6, 23, 0)');
    ctx.fillStyle = shadowG;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ATHLETIC SHOE BUILDER
  // ─────────────────────────────────────────────────────────────────────────────
  private static drawAthleticShoe(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number = 14,
    facingLeft: boolean = false
  ): void {
    ctx.save();
    if (facingLeft) {
      ctx.translate(x + w, y);
      ctx.scale(-1, 1);
      x = 0;
      y = 0;
    }

    // 1. Black studded outsole
    ctx.fillStyle = this.PALETTE.shoeSole;
    ctx.beginPath();
    ctx.roundRect(x, y + h - 4, w, 4, [0, 0, 3, 3]);
    ctx.fill();

    // Metal spikes
    ctx.fillStyle = this.PALETTE.shoeSpikes;
    for (let s = 0; s < 4; s++) {
      ctx.fillRect(x + 3 + s * ((w - 6) / 3), y + h - 1.5, 2, 2);
    }

    // 2. Leather shoe upper with 3D gradient
    const upperG = ctx.createLinearGradient(x, y, x, y + h);
    upperG.addColorStop(0, this.PALETTE.shoeUpper);
    upperG.addColorStop(0.65, this.PALETTE.trouserLight);
    upperG.addColorStop(1, this.PALETTE.trouserMid);
    ctx.fillStyle = upperG;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h - 3, [5, 8, 3, 3]);
    ctx.fill();

    // Blue heel counter wrap
    ctx.fillStyle = this.PALETTE.shoeTrim;
    ctx.beginPath();
    ctx.roundRect(x, y + 2, 7, h - 6, [4, 0, 0, 2]);
    ctx.fill();

    // Laces
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let l = 0; l < 3; l++) {
      ctx.moveTo(x + 10 + l * 4, y + 2.5);
      ctx.lineTo(x + 10 + l * 4, y + 7.5);
    }
    ctx.stroke();

    ctx.restore();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ATHLETIC CRICKET TROUSER LEG BUILDER
  // ─────────────────────────────────────────────────────────────────────────────
  private static drawTrouserLeg(
    ctx: CanvasRenderingContext2D,
    hipX: number,
    hipY: number,
    kneeX: number,
    kneeY: number,
    ankleX: number,
    ankleY: number,
    widthThigh: number = 20,
    widthCalf: number = 16
  ): void {
    const legG = ctx.createLinearGradient(hipX - widthThigh, hipY, hipX + widthThigh, ankleY);
    legG.addColorStop(0, this.PALETTE.trouserWhite);
    legG.addColorStop(0.35, this.PALETTE.trouserLight);
    legG.addColorStop(0.75, this.PALETTE.trouserMid);
    legG.addColorStop(1, this.PALETTE.trouserShade);
    ctx.fillStyle = legG;

    // Thigh segment
    ctx.beginPath();
    ctx.moveTo(hipX - widthThigh / 2, hipY);
    ctx.lineTo(hipX + widthThigh / 2, hipY);
    ctx.lineTo(kneeX + widthCalf / 2 + 2, kneeY);
    ctx.lineTo(kneeX - widthCalf / 2 - 2, kneeY);
    ctx.closePath();
    ctx.fill();

    // Calf & Ankle segment
    ctx.beginPath();
    ctx.moveTo(kneeX - widthCalf / 2 - 2, kneeY);
    ctx.lineTo(kneeX + widthCalf / 2 + 2, kneeY);
    ctx.lineTo(ankleX + widthCalf / 2, ankleY);
    ctx.lineTo(ankleX - widthCalf / 2, ankleY);
    ctx.closePath();
    ctx.fill();

    // Subtle fabric crease shading at knee
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(kneeX - widthCalf / 2 + 2, kneeY);
    ctx.lineTo(kneeX + widthCalf / 2 - 2, kneeY);
    ctx.stroke();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CRICKET BALL BUILDER
  // ─────────────────────────────────────────────────────────────────────────────
  private static drawBall(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number = 7.5
  ): void {
    const ballGrad = ctx.createRadialGradient(
      x - radius * 0.35,
      y - radius * 0.35,
      1,
      x,
      y,
      radius
    );
    ballGrad.addColorStop(0, '#f87171');
    ballGrad.addColorStop(0.45, this.PALETTE.bowlerRedMid);
    ballGrad.addColorStop(0.85, this.PALETTE.bowlerRedDark);
    ballGrad.addColorStop(1, this.PALETTE.bowlerRedDeep);
    ctx.fillStyle = ballGrad;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    // White stitched cricket seam
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(x, y, radius * 0.95, radius * 0.35, Math.PI / 4, 0, Math.PI * 2);
    ctx.stroke();

    // Catchlight highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.beginPath();
    ctx.arc(x - radius * 0.35, y - radius * 0.35, radius * 0.28, 0, Math.PI * 2);
    ctx.fill();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // HUMAN ATHLETE BUILDERS (Anatomical Head, Neck, Torso & Limbs)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Anatomical Human Head & Cricket Cap (Front / 3/4 Perspective)
   * With defined jawline, ears, eyebrows, eyes, nose, mouth, and 6-panel cricket cap.
   */
  private static drawHumanHeadFront(
    ctx: CanvasRenderingContext2D,
    headX: number,
    headY: number,
    shoulderX: number,
    shoulderY: number,
    headTiltDeg: number = 0,
    capColor: string = '#dc2626',
    capDark: string = '#991b1b',
    capHighlight: string = '#ef4444'
  ): void {
    ctx.save();
    ctx.translate(headX, headY);
    if (headTiltDeg !== 0) ctx.rotate((headTiltDeg * Math.PI) / 180);

    const relShoulderX = shoulderX - headX;
    // Clamp effective neck collar reach to max 20px so neck is compact, strong, and athletic
    const relShoulderY = Math.min(shoulderY - headY, 20);

    // 1. Realistic Human Neck (Front Perspective) - Short & Athletic (8-10px exposed)
    const neckG = ctx.createLinearGradient(-7, 10, 7, relShoulderY + 3);
    neckG.addColorStop(0, '#b87c5e');   // Shadow under chin
    neckG.addColorStop(0.35, '#ecc4ab'); // Throat highlight
    neckG.addColorStop(0.7, '#dfa587'); // Natural skin midtone
    neckG.addColorStop(1, '#ad6f4e');   // Shadow entering collar opening
    ctx.fillStyle = neckG;

    ctx.beginPath();
    // Neck starts under jaw at x = -6.5, y = 12
    ctx.moveTo(-6.5, 12);
    // Straight, neat contour down into collar at x = relShoulderX - 7.5
    ctx.lineTo(relShoulderX - 7.5, relShoulderY + 3);
    // Base tucked neatly inside shirt collar
    ctx.lineTo(relShoulderX + 7.5, relShoulderY + 3);
    // Right contour up to jaw at x = 6.5, y = 12
    ctx.lineTo(6.5, 12);
    ctx.closePath();
    ctx.fill();

    // Subtle sternocleidomastoid tendon shading (compact, refined)
    ctx.strokeStyle = 'rgba(154, 96, 66, 0.3)';
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.moveTo(-3.5, 13);
    ctx.lineTo(relShoulderX - 1.5, relShoulderY + 1.5);
    ctx.moveTo(3.5, 13);
    ctx.lineTo(relShoulderX + 1.5, relShoulderY + 1.5);
    ctx.stroke();

    // Suprasternal notch (gentle throat depression at center base)
    ctx.fillStyle = 'rgba(154, 96, 66, 0.35)';
    ctx.beginPath();
    ctx.arc(relShoulderX, relShoulderY + 1.5, 1.5, 0, Math.PI);
    ctx.fill();

    // 2. Anatomical Human Face Profile with defined jawline and chin
    const faceG = ctx.createLinearGradient(0, -6, 0, 18);
    faceG.addColorStop(0, '#fad0b5');
    faceG.addColorStop(0.45, '#e0a98b');
    faceG.addColorStop(1, '#c28562');
    ctx.fillStyle = faceG;
    ctx.beginPath();
    ctx.moveTo(-13, -2);
    ctx.bezierCurveTo(-13, 7, -10, 15, 0, 18); // Chin
    ctx.bezierCurveTo(10, 15, 13, 7, 13, -2);
    ctx.closePath();
    ctx.fill();

    // 3. Human Ears on left and right
    ctx.fillStyle = '#e0a98b';
    ctx.beginPath();
    ctx.ellipse(-14, 5, 2.8, 5.5, -0.1, 0, Math.PI * 2);
    ctx.ellipse(14, 5, 2.8, 5.5, 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#b87c5e';
    ctx.beginPath();
    ctx.ellipse(-13.8, 5, 1.5, 3.5, -0.1, 0, Math.PI * 2);
    ctx.ellipse(13.8, 5, 1.5, 3.5, 0.1, 0, Math.PI * 2);
    ctx.fill();

    // 4. Sideburns under cap
    ctx.fillStyle = '#1e1b18';
    ctx.fillRect(-13, -2, 2.5, 7);
    ctx.fillRect(10.5, -2, 2.5, 7);

    // 5. Dark angled athletic eyebrows
    ctx.strokeStyle = '#1e1b18';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-9, 2); ctx.lineTo(-3, 3.5);
    ctx.moveTo(9, 2); ctx.lineTo(3, 3.5);
    ctx.stroke();

    // 6. Almond-shaped eyes with pupils and catchlights
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(-5.5, 6.5, 3.2, 2, 0, 0, Math.PI * 2);
    ctx.ellipse(5.5, 6.5, 3.2, 2, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#0f172a'; // Dark iris & pupil
    ctx.beginPath();
    ctx.arc(-5.5, 6.5, 1.6, 0, Math.PI * 2);
    ctx.arc(5.5, 6.5, 1.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff'; // Catchlight
    ctx.fillRect(-5.2, 5.8, 0.9, 0.9);
    ctx.fillRect(5.8, 5.8, 0.9, 0.9);

    // 7. Nose bridge and nostrils
    ctx.strokeStyle = '#b87c5e';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, 4);
    ctx.lineTo(-0.5, 11);
    ctx.lineTo(2, 11.5);
    ctx.stroke();

    // 8. Determined mouth line
    ctx.strokeStyle = '#9a3412';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-3.5, 14.5);
    ctx.lineTo(3.5, 14.5);
    ctx.stroke();

    // 9. Cap Dome
    const capG = ctx.createRadialGradient(0, -10, 2, 0, -6, 17);
    capG.addColorStop(0, capHighlight);
    capG.addColorStop(0.55, capColor);
    capG.addColorStop(1, capDark);
    ctx.fillStyle = capG;
    ctx.beginPath();
    ctx.arc(0, -4, 15, Math.PI, 0, false);
    ctx.closePath();
    ctx.fill();

    // 10. Cap Visor / Bill casting soft shadow across brow
    ctx.fillStyle = 'rgba(15, 23, 42, 0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 1.5, 13, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = capDark;
    ctx.beginPath();
    ctx.ellipse(0, -3, 16.5, 5, 0, 0, Math.PI);
    ctx.fill();
    ctx.strokeStyle = capColor;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // 11. Gold embroidered crest on crown
    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.arc(0, -9, 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  /**
   * Compatibility wrapper for drawHeadAndCap
   */
  private static drawHeadAndCap(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    tiltDeg: number = 0,
    capColor: string = '#dc2626',
    capDark: string = '#991b1b',
    capHighlight: string = '#ef4444'
  ): void {
    this.drawHumanHeadFront(ctx, x, y, x, y + 28, tiltDeg, capColor, capDark, capHighlight);
  }

  /**
   * Anatomical Human Head & Cricket Cap (Rear Perspective)
   * With neck trapezius muscles, tapered athletic hairline, rear ears, 6-panel cap,
   * ventilation arch cutout, and adjustable strap with silver buckle.
   */
  /**
   * Anatomical Human Head & Cricket Cap (Rear Perspective)
   * Lifelike human cricketer seen from behind:
   * 1. Strong athletic neck with trapezius muscles seamlessly connecting into shoulders.
   * 2. Natural tapered athletic haircut with skin fade at the nape.
   * 3. Realistic human ears with outer helix and inner concha visible from rear.
   * 4. Realistic pro cricket cap covering ONLY the crown/upper skull, with curved rear headband,
   *    arched ventilation cutout revealing hair, adjustable strap with silver buckle, 6-panel seam stitching,
   *    and squatchee button.
   */
  private static drawHumanHeadRear(
    ctx: CanvasRenderingContext2D,
    headX: number,
    headY: number,
    shoulderX: number,
    shoulderY: number,
    headTiltDeg: number = 0,
    capColor: string = '#dc2626',
    capDark: string = '#991b1b',
    capHighlight: string = '#ef4444'
  ): void {
    ctx.save();
    ctx.translate(headX, headY);
    if (headTiltDeg !== 0) ctx.rotate((headTiltDeg * Math.PI) / 180);

    const relShoulderX = shoulderX - headX;
    // Clamp effective neck collar reach to max 18px so rear neck is short, athletic and strong
    const relShoulderY = Math.min(shoulderY - headY, 18);

    // ── 1. Realistic Human Neck (Rear Perspective) - Short & Athletic (6-8px exposed) ──
    const neckG = ctx.createLinearGradient(0, 6, relShoulderX, relShoulderY + 3);
    neckG.addColorStop(0, '#a56c4d');   // Shadow under cranium occipital bone
    neckG.addColorStop(0.35, '#e0a98b'); // Natural athletic skin tone
    neckG.addColorStop(0.7, '#d39779');
    neckG.addColorStop(1, '#9e6244');   // Shadow entering jersey back collar
    ctx.fillStyle = neckG;

    ctx.beginPath();
    // Start at base of skull under ears at x = -6.5, y = 8
    ctx.moveTo(-6.5, 8);
    // Straight contour down to collar entrance at x = relShoulderX - 7.5
    ctx.lineTo(relShoulderX - 7.5, relShoulderY + 3);
    // Base tucked inside jersey collar
    ctx.lineTo(relShoulderX + 7.5, relShoulderY + 3);
    // Right neck contour up to base of skull at x = 6.5, y = 8
    ctx.lineTo(6.5, 8);
    ctx.closePath();
    ctx.fill();

    // Subtle central cervical spine furrow shading
    ctx.strokeStyle = 'rgba(154, 96, 66, 0.3)';
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.moveTo(0, 8);
    ctx.lineTo(relShoulderX, relShoulderY + 1);
    ctx.stroke();

    // ── 2. Athletic Haircut at Nape & Sides (Tapered Fade) ──
    // The hair wraps around the occipital cranium below the cap and tapers down the neck
    const hairG = ctx.createLinearGradient(-14, -6, 14, 14);
    hairG.addColorStop(0, '#1c1917');
    hairG.addColorStop(0.5, '#292524');
    hairG.addColorStop(1, '#181513');
    ctx.fillStyle = hairG;

    // Hair mass behind ears down to nape (tapering to 13px at nape bottom)
    ctx.beginPath();
    ctx.moveTo(-13.5, -4);
    ctx.bezierCurveTo(-14, 2, -11, 8, -6.5, 12);
    ctx.lineTo(6.5, 12);
    ctx.bezierCurveTo(11, 8, 14, 2, 13.5, -4);
    ctx.bezierCurveTo(10, -6, -10, -6, -13.5, -4);
    ctx.closePath();
    ctx.fill();

    // Soft clipper skin fade at bottom of hairline
    ctx.fillStyle = '#784e37';
    ctx.fillRect(-6, 11, 12, 1.8);

    // ── 3. Realistic Human Ears (Rear View) ──
    // Left Ear
    ctx.save();
    ctx.fillStyle = '#e0a98b';
    ctx.beginPath();
    ctx.ellipse(-15, 2, 3.2, 6.5, -0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#b87c5e';
    ctx.beginPath();
    ctx.ellipse(-14.2, 2, 1.8, 4.5, -0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#f3cbb3';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.arc(-15.5, 1, 4.5, Math.PI * 0.7, Math.PI * 1.3);
    ctx.stroke();

    // Right Ear
    ctx.fillStyle = '#e0a98b';
    ctx.beginPath();
    ctx.ellipse(15, 2, 3.2, 6.5, 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#b87c5e';
    ctx.beginPath();
    ctx.ellipse(14.2, 2, 1.8, 4.5, 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#f3cbb3';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.arc(15.5, 1, 4.5, -Math.PI * 0.3, Math.PI * 0.3);
    ctx.stroke();
    ctx.restore();

    // ── 4. Cricket Cap Visor Edges (peeking out at temples) ──
    ctx.fillStyle = capDark;
    ctx.beginPath();
    ctx.ellipse(-14.5, -3, 3, 1.4, -0.4, 0, Math.PI * 2);
    ctx.ellipse(14.5, -3, 3, 1.4, 0.4, 0, Math.PI * 2);
    ctx.fill();

    // ── 5. Pro Cricket Cap Dome (Crown ONLY, y = -18 to y = 1) ──
    // The cap covers ONLY the upper cranium! It stops at the back of the head.
    const capG = ctx.createLinearGradient(-15, -18, 15, 2);
    capG.addColorStop(0, capHighlight);
    capG.addColorStop(0.4, capColor);
    capG.addColorStop(0.85, capDark);
    capG.addColorStop(1, '#7f1d1d');
    ctx.fillStyle = capG;

    ctx.beginPath();
    ctx.moveTo(0, -17.5);
    ctx.bezierCurveTo(-9, -17.5, -15, -11, -15, -2);
    ctx.bezierCurveTo(-14.5, 2, -12, 3, -8, 2);
    // Arched ventilation cut-out revealing hair underneath!
    ctx.bezierCurveTo(-6, -4, 6, -4, 8, 2);
    ctx.bezierCurveTo(12, 3, 14.5, 2, 15, -2);
    ctx.bezierCurveTo(15, -11, 9, -17.5, 0, -17.5);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = capDark;
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // ── 6. Cap Panel Stitching (6-panel cricket cap anatomy) ──
    ctx.strokeStyle = 'rgba(254, 240, 138, 0.35)';
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.moveTo(0, -17); ctx.lineTo(0, -3.5);
    ctx.moveTo(0, -17); ctx.bezierCurveTo(-5, -12, -11, -7, -14, -2);
    ctx.moveTo(0, -17); ctx.bezierCurveTo(5, -12, 11, -7, 14, -2);
    ctx.stroke();

    // ── 7. Adjustable Strap Across Cut-out with Metal Slide Buckle ──
    ctx.fillStyle = capDark;
    ctx.fillRect(-7.5, 0, 15, 3.2);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.lineWidth = 0.8;
    ctx.strokeRect(-7.5, 0, 15, 3.2);

    // Silver metal slide buckle
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(0.5, -0.5, 4.5, 4.2);
    ctx.fillStyle = '#64748b';
    ctx.fillRect(2, 0.5, 1.5, 2.2);

    // ── 8. Crown Top Squatchee Button ──
    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.arc(0, -17.5, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ca8a04';
    ctx.lineWidth = 0.8;
    ctx.stroke();

    ctx.restore();
  }

  /**
   * Anatomical V-Taper Torso & Jersey (Rear Perspective)
   */
  private static drawAthleticBowlerTorsoRear(
    ctx: CanvasRenderingContext2D,
    shoulderX: number,
    shoulderY: number,
    waistX: number,
    waistY: number,
    torsoLeanDeg: number = 0,
    jerseyPrimary: string = '#dc2626',
    jerseyLight: string = '#ef4444',
    jerseyDark: string = '#991b1b',
    meshDark: string = '#7f1d1d',
    squadName: string = 'PACE',
    squadNum: string = '99'
  ): void {
    ctx.save();
    ctx.translate(shoulderX, shoulderY);
    if (torsoLeanDeg !== 0) ctx.rotate((torsoLeanDeg * Math.PI) / 180);

    const relWaistX = waistX - shoulderX;
    const relWaistY = waistY - shoulderY;

    // 1. Broad V-taper jersey body
    const torsoG = ctx.createLinearGradient(-28, 0, 28, relWaistY);
    torsoG.addColorStop(0, jerseyLight);
    torsoG.addColorStop(0.35, jerseyPrimary);
    torsoG.addColorStop(0.75, jerseyDark);
    torsoG.addColorStop(1, meshDark);
    ctx.fillStyle = torsoG;

    ctx.beginPath();
    ctx.moveTo(-28, 4); // Left shoulder deltoid
    ctx.bezierCurveTo(-29, 20, relWaistX - 20, relWaistY - 14, relWaistX - 18, relWaistY); // Left lat taper
    ctx.lineTo(relWaistX + 18, relWaistY); // Waist hem
    ctx.bezierCurveTo(relWaistX + 20, relWaistY - 14, 29, 20, 28, 4); // Right lat
    ctx.bezierCurveTo(16, -2, -16, -2, -28, 4); // Neck collar curve
    ctx.closePath();
    ctx.fill();

    // 2. Ribbed collar / crew-neck back
    ctx.strokeStyle = '#fef08a'; // Gold collar accent
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.ellipse(0, 2, 14, 5, 0, 0, Math.PI);
    ctx.stroke();

    // 3. Raglan sleeve seam stitching
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-14, 2);
    ctx.bezierCurveTo(-18, 14, -25, 18, -28, 22);
    ctx.moveTo(14, 2);
    ctx.bezierCurveTo(18, 14, 25, 18, 28, 22);
    ctx.stroke();

    // 4. Breathable side mesh athletic panels
    ctx.fillStyle = meshDark;
    // Left side panel
    ctx.beginPath();
    ctx.moveTo(-28, 20);
    ctx.bezierCurveTo(-27, 34, relWaistX - 19, relWaistY - 6, relWaistX - 18, relWaistY);
    ctx.lineTo(relWaistX - 13, relWaistY);
    ctx.bezierCurveTo(relWaistX - 15, relWaistY - 8, -22, 32, -23, 20);
    ctx.closePath();
    ctx.fill();

    // Right side panel
    ctx.beginPath();
    ctx.moveTo(28, 20);
    ctx.bezierCurveTo(27, 34, relWaistX + 19, relWaistY - 6, relWaistX + 18, relWaistY);
    ctx.lineTo(relWaistX + 13, relWaistY);
    ctx.bezierCurveTo(relWaistX + 15, relWaistY - 8, 22, 32, 23, 20);
    ctx.closePath();
    ctx.fill();

    // 5. Athletic Belt & Tucked Hem
    ctx.fillStyle = '#0f172a'; // Dark sports belt
    ctx.fillRect(relWaistX - 18, relWaistY - 1, 36, 4.5);
    ctx.fillStyle = '#cbd5e1'; // Silver belt buckle
    ctx.fillRect(relWaistX - 3.5, relWaistY - 1, 7, 4.5);

    // 6. Pro Typography: Squad Name & Varsity Number
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.font = 'bold 9px "Outfit", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(squadName, 0, 18);

    ctx.font = '900 22px "Outfit", sans-serif';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)'; // Drop shadow
    ctx.fillText(squadNum, 1, 39);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(squadNum, 0, 38);

    ctx.restore();
  }

  /**
   * Anatomical V-Taper Torso & Jersey (Front Perspective)
   */
  private static drawAthleticBowlerTorsoFront(
    ctx: CanvasRenderingContext2D,
    shoulderX: number,
    shoulderY: number,
    waistX: number,
    waistY: number,
    torsoLeanDeg: number = 0,
    jerseyPrimary: string = '#dc2626',
    jerseyLight: string = '#ef4444',
    jerseyDark: string = '#991b1b',
    meshDark: string = '#7f1d1d'
  ): void {
    ctx.save();
    ctx.translate(shoulderX, shoulderY);
    if (torsoLeanDeg !== 0) ctx.rotate((torsoLeanDeg * Math.PI) / 180);

    const relWaistX = waistX - shoulderX;
    const relWaistY = waistY - shoulderY;

    // 1. Broad V-taper chest
    const torsoG = ctx.createLinearGradient(-28, 0, 28, relWaistY);
    torsoG.addColorStop(0, jerseyLight);
    torsoG.addColorStop(0.35, jerseyPrimary);
    torsoG.addColorStop(0.75, jerseyDark);
    torsoG.addColorStop(1, '#500724');
    ctx.fillStyle = torsoG;

    ctx.beginPath();
    ctx.moveTo(-28, 4); // Left shoulder deltoid
    ctx.bezierCurveTo(-29, 20, relWaistX - 20, relWaistY - 14, relWaistX - 18, relWaistY);
    ctx.lineTo(relWaistX + 18, relWaistY);
    ctx.bezierCurveTo(relWaistX + 20, relWaistY - 14, 29, 20, 28, 4);
    ctx.bezierCurveTo(16, -2, -16, -2, -28, 4);
    ctx.closePath();
    ctx.fill();

    // 2. V-neck athletic collar with white ribbing
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(-8, 0); ctx.lineTo(0, 9); ctx.lineTo(8, 0);
    ctx.closePath();
    ctx.fill();

    // Inner collar shadow
    ctx.fillStyle = jerseyDark;
    ctx.beginPath();
    ctx.moveTo(-5, 0); ctx.lineTo(0, 6.5); ctx.lineTo(5, 0);
    ctx.closePath();
    ctx.fill();

    // 3. Team gold crest on left chest
    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.arc(-14, 18, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ca8a04';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 4. Breathable side mesh athletic panels
    ctx.fillStyle = meshDark;
    // Left
    ctx.beginPath();
    ctx.moveTo(-28, 20);
    ctx.bezierCurveTo(-27, 34, relWaistX - 19, relWaistY - 6, relWaistX - 18, relWaistY);
    ctx.lineTo(relWaistX - 13, relWaistY);
    ctx.bezierCurveTo(relWaistX - 15, relWaistY - 8, -22, 32, -23, 20);
    ctx.closePath();
    ctx.fill();
    // Right
    ctx.beginPath();
    ctx.moveTo(28, 20);
    ctx.bezierCurveTo(27, 34, relWaistX + 19, relWaistY - 6, relWaistX + 18, relWaistY);
    ctx.lineTo(relWaistX + 13, relWaistY);
    ctx.bezierCurveTo(relWaistX + 15, relWaistY - 8, 22, 32, 23, 20);
    ctx.closePath();
    ctx.fill();

    // 5. Athletic belt at waist
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(relWaistX - 18, relWaistY - 1, 36, 4.5);
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(relWaistX - 3.5, relWaistY - 1, 7, 4.5);

    ctx.restore();
  }

  /**
   * Anatomical Multi-Segment Arm (Deltoid, Bicep, Elbow, Forearm, Sweatband, Hand)
   */
  private static drawAthleticArm(
    ctx: CanvasRenderingContext2D,
    shoulderX: number,
    shoulderY: number,
    elbowX: number,
    elbowY: number,
    wristX: number,
    wristY: number,
    hasSweatband: boolean = false,
    isRearView: boolean = false,
    jerseyColor: string = '#dc2626'
  ): void {
    ctx.save();

    // 1. Deltoid sleeve cap
    const sleeveDark = (jerseyColor === this.PALETTE.jerseyRoyal || jerseyColor === this.PALETTE.jerseyCyan)
      ? this.PALETTE.jerseyDeepNavy
      : '#991b1b';
    const sleeveG = ctx.createLinearGradient(shoulderX, shoulderY, elbowX, elbowY);
    sleeveG.addColorStop(0, jerseyColor);
    sleeveG.addColorStop(1, sleeveDark);
    ctx.fillStyle = sleeveG;
    ctx.beginPath();
    ctx.arc(shoulderX, shoulderY + 2, 8.5, 0, Math.PI * 2);
    ctx.fill();

    // Sleeve cylinder down to mid-bicep
    const midArmX = shoulderX + (elbowX - shoulderX) * 0.45;
    const midArmY = shoulderY + (elbowY - shoulderY) * 0.45;
    ctx.strokeStyle = sleeveG;
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(shoulderX, shoulderY + 2);
    ctx.lineTo(midArmX, midArmY);
    ctx.stroke();

    // Sleeve cuff seam
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(midArmX - 5, midArmY);
    ctx.lineTo(midArmX + 5, midArmY);
    ctx.stroke();

    // 2. Muscular bare arm (bicep / tricep to elbow)
    const armG = ctx.createLinearGradient(midArmX, midArmY, wristX, wristY);
    armG.addColorStop(0, '#f1c2a5');
    armG.addColorStop(0.5, '#e0a98b');
    armG.addColorStop(1, '#c28562');

    ctx.strokeStyle = armG;
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(midArmX, midArmY);
    ctx.lineTo(elbowX, elbowY);
    ctx.stroke();

    // 3. Forearm (elbow to wrist, tapering)
    ctx.lineWidth = 10.5;
    ctx.beginPath();
    ctx.moveTo(elbowX, elbowY);
    ctx.lineTo(wristX, wristY);
    ctx.stroke();

    // 4. White elastic compression sweatband on wrist
    if (hasSweatband) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 12;
      ctx.lineCap = 'butt';
      ctx.beginPath();
      const dx = wristX - elbowX;
      const dy = wristY - elbowY;
      const len = Math.hypot(dx, dy) || 1;
      const px = -dy / len;
      const py = dx / len;
      ctx.moveTo(wristX - px * 5, wristY - py * 5);
      ctx.lineTo(wristX + px * 5, wristY + py * 5);
      ctx.stroke();

      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(wristX - px * 4, wristY - py * 4);
      ctx.lineTo(wristX + px * 4, wristY + py * 4);
      ctx.stroke();
    }

    // 5. Anatomical Hand with knuckles and thumb
    const handDist = 7;
    const hx = wristX + ((wristX - elbowX) / (Math.hypot(wristX - elbowX, wristY - elbowY) || 1)) * handDist;
    const hy = wristY + ((wristY - elbowY) / (Math.hypot(wristX - elbowX, wristY - elbowY) || 1)) * handDist;

    ctx.fillStyle = '#e0a98b';
    ctx.beginPath();
    ctx.arc(hx, hy, 5.2, 0, Math.PI * 2);
    ctx.fill();

    // Knuckle shadow / finger curl
    ctx.fillStyle = '#c28562';
    ctx.beginPath();
    ctx.arc(hx + 1, hy + 1, 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  /**
   * Complete Front Bowler Frame Builder
   */
  private static drawBowlerFrame(
    ctx: CanvasRenderingContext2D,
    p: {
      shadowX?: number; shadowY?: number; shadowRx?: number;
      headX: number; headY: number; headTilt?: number;
      shoulderX: number; shoulderY: number; torsoLean?: number; torsoW?: number; torsoH?: number;
      waistX?: number; waistY?: number;
      lHipX: number; lHipY: number; lKneeX: number; lKneeY: number; lAnkleX: number; lAnkleY: number; lShoeX: number; lShoeY: number;
      rHipX: number; rHipY: number; rKneeX: number; rKneeY: number; rAnkleX: number; rAnkleY: number; rShoeX: number; rShoeY: number;
      lShoulderX: number; lShoulderY: number; lElbowX: number; lElbowY: number; lWristX: number; lWristY: number;
      rShoulderX: number; rShoulderY: number; rElbowX: number; rElbowY: number; rWristX: number; rWristY: number;
      ballX?: number; ballY?: number;
    }
  ): void {
    const wx = p.waistX ?? p.shoulderX;
    const wy = p.waistY ?? (p.shoulderY + 64);

    this.drawGroundShadow(ctx, p.shadowX ?? 90, p.shadowY ?? 272, p.shadowRx ?? 34, 8);
    this.drawAthleticShoe(ctx, p.lShoeX, p.lShoeY, 26, 14, false);
    this.drawAthleticShoe(ctx, p.rShoeX, p.rShoeY, 26, 14, false);
    this.drawTrouserLeg(ctx, p.lHipX, p.lHipY, p.lKneeX, p.lKneeY, p.lAnkleX, p.lAnkleY, 22, 16);
    this.drawTrouserLeg(ctx, p.rHipX, p.rHipY, p.rKneeX, p.rKneeY, p.rAnkleX, p.rAnkleY, 22, 16);

    this.drawAthleticBowlerTorsoFront(ctx, p.shoulderX, p.shoulderY, wx, wy, p.torsoLean || 0);

    this.drawAthleticArm(ctx, p.lShoulderX, p.lShoulderY, p.lElbowX, p.lElbowY, p.lWristX, p.lWristY, false, false);
    this.drawAthleticArm(ctx, p.rShoulderX, p.rShoulderY, p.rElbowX, p.rElbowY, p.rWristX, p.rWristY, true, false);

    if (p.ballX !== undefined && p.ballY !== undefined) {
      this.drawBall(ctx, p.ballX, p.ballY, 8);
    }

    this.drawHumanHeadFront(ctx, p.headX, p.headY, p.shoulderX, p.shoulderY, p.headTilt || 0);
  }

  /**
   * Complete Rear Bowler Frame Builder
   */
  private static drawBowlerRearFrame(
    ctx: CanvasRenderingContext2D,
    p: {
      shadowX?: number; shadowY?: number; shadowRx?: number;
      headX: number; headY: number; headTilt?: number;
      shoulderX: number; shoulderY: number; torsoLean?: number;
      waistX: number; waistY: number;
      lHipX: number; lHipY: number; lKneeX: number; lKneeY: number; lAnkleX: number; lAnkleY: number; lShoeX: number; lShoeY: number;
      rHipX: number; rHipY: number; rKneeX: number; rKneeY: number; rAnkleX: number; rAnkleY: number; rShoeX: number; rShoeY: number;
      lShoulderX: number; lShoulderY: number; lElbowX: number; lElbowY: number; lWristX: number; lWristY: number;
      rShoulderX: number; rShoulderY: number; rElbowX: number; rElbowY: number; rWristX: number; rWristY: number;
      ballX?: number; ballY?: number;
      sweatbandWrist?: 'left' | 'right' | 'both';
    }
  ): void {
    this.drawGroundShadow(ctx, p.shadowX ?? 90, p.shadowY ?? 272, p.shadowRx ?? 34, 8);
    this.drawAthleticShoe(ctx, p.lShoeX, p.lShoeY, 26, 14, false);
    this.drawAthleticShoe(ctx, p.rShoeX, p.rShoeY, 26, 14, false);
    this.drawTrouserLeg(ctx, p.lHipX, p.lHipY, p.lKneeX, p.lKneeY, p.lAnkleX, p.lAnkleY, 22, 16);
    this.drawTrouserLeg(ctx, p.rHipX, p.rHipY, p.rKneeX, p.rKneeY, p.rAnkleX, p.rAnkleY, 22, 16);

    this.drawAthleticBowlerTorsoRear(ctx, p.shoulderX, p.shoulderY, p.waistX, p.waistY, p.torsoLean || 0);

    const hasLeftSweatband = p.sweatbandWrist === 'left' || p.sweatbandWrist === 'both';
    const hasRightSweatband = p.sweatbandWrist === 'right' || p.sweatbandWrist === 'both' || p.sweatbandWrist === undefined;

    this.drawAthleticArm(ctx, p.lShoulderX, p.lShoulderY, p.lElbowX, p.lElbowY, p.lWristX, p.lWristY, hasLeftSweatband, true);
    this.drawAthleticArm(ctx, p.rShoulderX, p.rShoulderY, p.rElbowX, p.rElbowY, p.rWristX, p.rWristY, hasRightSweatband, true);

    if (p.ballX !== undefined && p.ballY !== undefined) {
      this.drawBall(ctx, p.ballX, p.ballY, 8);
    }

    this.drawHumanHeadRear(ctx, p.headX, p.headY, p.shoulderX, p.shoulderY, p.headTilt || 0);
  }

  /**
   * Frame 1: Bowler Standing Idle at the Top of the Mark
   */
  public static renderBowlerIdle(canvas: HTMLCanvasElement): void {
    canvas.width = 180;
    canvas.height = 280;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 180, 280);

    this.drawBowlerFrame(ctx, {
      shadowX: 90, shadowY: 272, shadowRx: 32,
      headX: 90, headY: 58, headTilt: 0,
      shoulderX: 90, shoulderY: 78, torsoW: 38, torsoH: 64, torsoLean: 0,
      lHipX: 82, lHipY: 142, lKneeX: 80, lKneeY: 202, lAnkleX: 78, lAnkleY: 256,
      rHipX: 98, rHipY: 142, rKneeX: 100, rKneeY: 202, rAnkleX: 102, rAnkleY: 256,
      lShoeX: 66, lShoeY: 256,
      rShoeX: 90, rShoeY: 256,
      lShoulderX: 72, lShoulderY: 86, lElbowX: 80, lElbowY: 116, lWristX: 88, lWristY: 122,
      rShoulderX: 108, rShoulderY: 86, rElbowX: 102, rElbowY: 116, rWristX: 92, rWristY: 122,
      ballX: 90, ballY: 124,
    });
  }

  /**
   * Frame 2: Bowler Preparation / Rocking Back into Stride
   */
  public static renderBowlerPrep(canvas: HTMLCanvasElement): void {
    canvas.width = 180;
    canvas.height = 280;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 180, 280);

    this.drawBowlerFrame(ctx, {
      shadowX: 90, shadowY: 272, shadowRx: 34,
      headX: 90, headY: 62, headTilt: 2,
      shoulderX: 90, shoulderY: 82, torsoW: 38, torsoH: 64, torsoLean: 3,
      lHipX: 82, lHipY: 146, lKneeX: 76, lKneeY: 206, lAnkleX: 74, lAnkleY: 256,
      rHipX: 98, rHipY: 146, rKneeX: 102, rKneeY: 206, rAnkleX: 106, rAnkleY: 256,
      lShoeX: 62, lShoeY: 256,
      rShoeX: 94, rShoeY: 256,
      lShoulderX: 72, lShoulderY: 90, lElbowX: 64, lElbowY: 120, lWristX: 76, lWristY: 126,
      rShoulderX: 108, rShoulderY: 90, rElbowX: 116, rElbowY: 120, rWristX: 104, rWristY: 126,
      ballX: 90, ballY: 128,
    });
  }

  /**
   * Frame 3: Bowler Run-Up Sprint Stride 1 (Left knee drive, high momentum)
   */
  public static renderBowlerRun1(canvas: HTMLCanvasElement): void {
    canvas.width = 180;
    canvas.height = 280;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 180, 280);

    this.drawBowlerFrame(ctx, {
      shadowX: 90, shadowY: 272, shadowRx: 36,
      headX: 90, headY: 56, headTilt: 4,
      shoulderX: 90, shoulderY: 76, torsoW: 38, torsoH: 64, torsoLean: 8,
      lHipX: 82, lHipY: 140, lKneeX: 68, lKneeY: 194, lAnkleX: 62, lAnkleY: 256,
      rHipX: 98, rHipY: 140, rKneeX: 110, rKneeY: 198, rAnkleX: 116, rAnkleY: 244,
      lShoeX: 50, lShoeY: 256,
      rShoeX: 104, rShoeY: 244,
      lShoulderX: 72, lShoulderY: 84, lElbowX: 56, lElbowY: 116, lWristX: 52, lWristY: 130,
      rShoulderX: 108, rShoulderY: 84, rElbowX: 124, rElbowY: 110, rWristX: 122, rWristY: 96,
      ballX: 124, ballY: 92,
    });
  }

  /**
   * Frame 4: Bowler Run-Up Sprint Stride 2 (Right knee drive, alternate sprint)
   */
  public static renderBowlerRun2(canvas: HTMLCanvasElement): void {
    canvas.width = 180;
    canvas.height = 280;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 180, 280);

    this.drawBowlerFrame(ctx, {
      shadowX: 90, shadowY: 272, shadowRx: 36,
      headX: 90, headY: 56, headTilt: 3,
      shoulderX: 90, shoulderY: 76, torsoW: 38, torsoH: 64, torsoLean: 7,
      lHipX: 82, lHipY: 140, lKneeX: 74, lKneeY: 198, lAnkleX: 66, lAnkleY: 244,
      rHipX: 98, rHipY: 140, rKneeX: 112, rKneeY: 194, rAnkleX: 118, rAnkleY: 256,
      lShoeX: 54, lShoeY: 244,
      rShoeX: 106, rShoeY: 256,
      lShoulderX: 72, lShoulderY: 84, lElbowX: 60, lElbowY: 110, lWristX: 66, lWristY: 94,
      rShoulderX: 108, rShoulderY: 84, rElbowX: 122, rElbowY: 116, rWristX: 126, rWristY: 132,
      ballX: 128, ballY: 134,
    });
  }

  /**
   * Legacy alias: renderBowlerStride maps to renderBowlerRun1
   */
  public static renderBowlerStride(canvas: HTMLCanvasElement): void {
    this.renderBowlerRun1(canvas);
  }

  /**
   * Frame 5: Bowler Gather / Airborne Leap into Delivery Stride
   */
  public static renderBowlerGather(canvas: HTMLCanvasElement): void {
    canvas.width = 180;
    canvas.height = 280;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 180, 280);

    this.drawBowlerFrame(ctx, {
      shadowX: 90, shadowY: 272, shadowRx: 28,
      headX: 90, headY: 44, headTilt: -4,
      shoulderX: 90, shoulderY: 64, torsoW: 38, torsoH: 62, torsoLean: -4,
      lHipX: 82, lHipY: 126, lKneeX: 72, lKneeY: 172, lAnkleX: 68, lAnkleY: 218,
      rHipX: 98, rHipY: 126, rKneeX: 106, rKneeY: 176, rAnkleX: 110, rAnkleY: 222,
      lShoeX: 56, lShoeY: 218,
      rShoeX: 98, rShoeY: 222,
      lShoulderX: 72, lShoulderY: 70, lElbowX: 48, lElbowY: 48, lWristX: 44, lWristY: 32,
      rShoulderX: 108, rShoulderY: 70, rElbowX: 132, rElbowY: 54, rWristX: 136, rWristY: 42,
      ballX: 138, ballY: 38,
    });
  }

  /**
   * Frame 6: Front Foot Plant on Bowling Crease (Torso coiled side-on)
   */
  public static renderBowlerPlant(canvas: HTMLCanvasElement): void {
    canvas.width = 180;
    canvas.height = 280;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 180, 280);

    this.drawBowlerFrame(ctx, {
      shadowX: 88, shadowY: 272, shadowRx: 36,
      headX: 88, headY: 52, headTilt: 0,
      shoulderX: 88, shoulderY: 72, torsoW: 38, torsoH: 64, torsoLean: 2,
      lHipX: 80, lHipY: 136, lKneeX: 72, lKneeY: 196, lAnkleX: 68, lAnkleY: 256,
      rHipX: 96, rHipY: 136, rKneeX: 110, rKneeY: 198, rAnkleX: 118, rAnkleY: 248,
      lShoeX: 56, lShoeY: 256,
      rShoeX: 106, rShoeY: 248,
      lShoulderX: 70, lShoulderY: 78, lElbowX: 52, lElbowY: 106, lWristX: 58, lWristY: 134,
      rShoulderX: 106, rShoulderY: 78, rElbowX: 122, rElbowY: 36, rWristX: 118, rWristY: 14,
      ballX: 118, ballY: 10,
    });
  }

  /**
   * Frame 7: 12 O'Clock Vertical Overarm Delivery Release
   */
  public static renderBowlerRelease(canvas: HTMLCanvasElement): void {
    canvas.width = 180;
    canvas.height = 280;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 180, 280);

    this.drawBowlerFrame(ctx, {
      shadowX: 88, shadowY: 272, shadowRx: 36,
      headX: 88, headY: 54, headTilt: 2,
      shoulderX: 88, shoulderY: 74, torsoW: 38, torsoH: 64, torsoLean: 4,
      lHipX: 80, lHipY: 138, lKneeX: 70, lKneeY: 198, lAnkleX: 66, lAnkleY: 256,
      rHipX: 96, rHipY: 138, rKneeX: 108, rKneeY: 198, rAnkleX: 116, rAnkleY: 246,
      lShoeX: 54, lShoeY: 256,
      rShoeX: 104, rShoeY: 246,
      lShoulderX: 70, lShoulderY: 80, lElbowX: 56, lElbowY: 118, lWristX: 62, lWristY: 138,
      rShoulderX: 106, rShoulderY: 74, rElbowX: 112, rElbowY: 30, rWristX: 114, rWristY: 12,
      ballX: 115, ballY: 6,
    });
  }

  /**
   * Frame 8: Immediate Post-Release Follow-Through (Arm sweeps across body)
   */
  public static renderBowlerFollowthrough(canvas: HTMLCanvasElement): void {
    canvas.width = 180;
    canvas.height = 280;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 180, 280);

    this.drawBowlerFrame(ctx, {
      shadowX: 80, shadowY: 272, shadowRx: 38,
      headX: 78, headY: 70, headTilt: 12,
      shoulderX: 82, shoulderY: 90, torsoW: 38, torsoH: 62, torsoLean: 18,
      lHipX: 74, lHipY: 152, lKneeX: 68, lKneeY: 206, lAnkleX: 64, lAnkleY: 256,
      rHipX: 90, rHipY: 152, rKneeX: 116, rKneeY: 204, rAnkleX: 124, rAnkleY: 236,
      lShoeX: 52, lShoeY: 256,
      rShoeX: 112, rShoeY: 236,
      lShoulderX: 66, lShoulderY: 96, lElbowX: 38, lElbowY: 134, lWristX: 42, lWristY: 154,
      rShoulderX: 98, rShoulderY: 96, rElbowX: 74, rElbowY: 138, rWristX: 52, rWristY: 168,
    });
  }

  /**
   * Frame 9: Final Deceleration & Ready Return
   */
  public static renderBowlerFollowthrough2(canvas: HTMLCanvasElement): void {
    canvas.width = 180;
    canvas.height = 280;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 180, 280);

    this.drawBowlerFrame(ctx, {
      shadowX: 86, shadowY: 272, shadowRx: 34,
      headX: 86, headY: 62, headTilt: 4,
      shoulderX: 86, shoulderY: 82, torsoW: 38, torsoH: 64, torsoLean: 6,
      lHipX: 78, lHipY: 146, lKneeX: 74, lKneeY: 204, lAnkleX: 70, lAnkleY: 256,
      rHipX: 94, rHipY: 146, rKneeX: 104, rKneeY: 204, rAnkleX: 108, rAnkleY: 256,
      lShoeX: 58, lShoeY: 256,
      rShoeX: 96, rShoeY: 256,
      lShoulderX: 70, lShoulderY: 88, lElbowX: 58, lElbowY: 122, lWristX: 68, lWristY: 142,
      rShoulderX: 102, rShoulderY: 88, rElbowX: 88, rElbowY: 128, rWristX: 82, rWristY: 146,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // BATSMAN ANIMATION SUITE (240 × 300 Canvas)
  // Grounded at y = 286 (with contact shadow at y = 290)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Internal helper to draw an athletic, semi-open profile batsman
   */
  private static drawBatsmanProfile(
    ctx: CanvasRenderingContext2D,
    p: {
      shadowX?: number;
      shadowY?: number;
      shadowRx?: number;
      // Head
      headX: number;
      headY: number;
      headTilt?: number;
      // Torso & Pelvis
      shoulderX: number;
      shoulderY: number;
      waistX: number;
      waistY: number;
      buttockX: number;
      buttockY: number;
      torsoLean?: number;
      // Legs & Pads
      rearShoeX: number; rearShoeY: number;
      frontShoeX: number; frontShoeY: number;
      rearPadX: number; rearPadY: number; rearPadW: number; rearPadH: number;
      frontPadX: number; frontPadY: number; frontPadW: number; frontPadH: number;
      frontKneeX: number; frontKneeY: number;
      // Arms & Bat
      lArmSleeveX: number; lArmSleeveY: number;
      elbowX: number; elbowY: number;
      wristX: number; wristY: number;
      batHandleX: number; batHandleY: number;
      batToeX: number; batToeY: number;
      batAngleDeg?: number;
      impactSpark?: { x: number; y: number; star?: boolean };
    }
  ): void {
    // 1. Ground Shadow (Grounding base is y = 290)
    this.drawGroundShadow(ctx, p.shadowX ?? 120, p.shadowY ?? 290, p.shadowRx ?? 38, 8);

    // 2. Rear Foot & Rear Batting Pad (Depth layer)
    this.drawAthleticShoe(ctx, p.rearShoeX, p.rearShoeY, 26, 14, false);

    const rearPadG = ctx.createLinearGradient(p.rearPadX, p.rearPadY, p.rearPadX + p.rearPadW, p.rearPadY + p.rearPadH);
    rearPadG.addColorStop(0, this.PALETTE.padMid);
    rearPadG.addColorStop(0.5, this.PALETTE.padShade);
    rearPadG.addColorStop(1, this.PALETTE.trouserDark);
    ctx.fillStyle = rearPadG;
    ctx.beginPath();
    ctx.roundRect(p.rearPadX, p.rearPadY, p.rearPadW, p.rearPadH, [6, 6, 4, 4]);
    ctx.fill();

    // 3. Athletic Cyan / Sapphire Torso & Pelvis with S-Curve Anatomy
    const bodyG = ctx.createLinearGradient(p.buttockX, p.buttockY, p.shoulderX + 16, p.shoulderY);
    bodyG.addColorStop(0, this.PALETTE.jerseyDeepNavy);
    bodyG.addColorStop(0.3, this.PALETTE.jerseyDarkBlue);
    bodyG.addColorStop(0.65, this.PALETTE.jerseyRoyal);
    bodyG.addColorStop(1, this.PALETTE.jerseyCyan);
    ctx.fillStyle = bodyG;

    ctx.beginPath();
    ctx.moveTo(p.shoulderX - 8, p.shoulderY);
    ctx.bezierCurveTo(p.shoulderX - 12, p.shoulderY + 22, p.waistX - 10, p.waistY - 8, p.waistX - 6, p.waistY);
    ctx.bezierCurveTo(p.buttockX - 4, p.buttockY - 10, p.buttockX - 2, p.buttockY + 12, p.buttockX + 8, p.buttockY + 22);
    ctx.bezierCurveTo(p.buttockX + 14, p.buttockY + 28, p.frontKneeX - 10, p.frontKneeY - 10, p.frontKneeX - 4, p.frontKneeY);
    ctx.lineTo(p.frontKneeX + 10, p.frontKneeY - 2);
    ctx.bezierCurveTo(p.frontKneeX + 8, p.frontKneeY - 18, p.waistX + 14, p.waistY + 14, p.waistX + 12, p.waistY + 4);
    ctx.bezierCurveTo(p.waistX + 14, p.waistY - 16, p.shoulderX + 16, p.shoulderY + 14, p.shoulderX + 12, p.shoulderY - 2);
    ctx.closePath();
    ctx.fill();

    // Waistband & Team Piping
    ctx.strokeStyle = this.PALETTE.jerseyDeepNavy;
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(p.waistX - 6, p.waistY);
    ctx.lineTo(p.waistX + 12, p.waistY + 4);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(p.shoulderX - 4, p.shoulderY + 6);
    ctx.bezierCurveTo(p.shoulderX - 8, p.shoulderY + 24, p.waistX - 5, p.waistY - 2, p.buttockX + 6, p.buttockY + 16);
    ctx.stroke();

    // 4. Front Batting Pad (3D Molded Shin Guard with Knee Roll Bolster)
    // Knee Roll Bolster
    const kneeG = ctx.createLinearGradient(p.frontPadX, p.frontPadY - 10, p.frontPadX + p.frontPadW, p.frontPadY + 12);
    kneeG.addColorStop(0, this.PALETTE.padWhite);
    kneeG.addColorStop(0.5, this.PALETTE.padLight);
    kneeG.addColorStop(1, this.PALETTE.padMid);
    ctx.fillStyle = kneeG;
    ctx.beginPath();
    ctx.roundRect(p.frontPadX - 2, p.frontPadY - 8, p.frontPadW + 4, 18, [8, 8, 4, 4]);
    ctx.fill();

    ctx.strokeStyle = this.PALETTE.padRib;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(p.frontPadX - 1, p.frontPadY + 1);
    ctx.lineTo(p.frontPadX + p.frontPadW + 1, p.frontPadY + 1);
    ctx.stroke();

    // Main Shin Pad Body
    const padG = ctx.createLinearGradient(p.frontPadX, p.frontPadY, p.frontPadX + p.frontPadW, p.frontPadY + p.frontPadH);
    padG.addColorStop(0, this.PALETTE.padWhite);
    padG.addColorStop(0.4, this.PALETTE.padLight);
    padG.addColorStop(0.8, this.PALETTE.padMid);
    padG.addColorStop(1, this.PALETTE.padShade);
    ctx.fillStyle = padG;
    ctx.beginPath();
    ctx.roundRect(p.frontPadX, p.frontPadY + 8, p.frontPadW, p.frontPadH - 8, [4, 4, 6, 6]);
    ctx.fill();

    // 3 Cylindrical Cane Ribs
    ctx.strokeStyle = this.PALETTE.padRib;
    ctx.lineWidth = 1.6;
    for (let r = 0; r < 3; r++) {
      const rx = p.frontPadX + 4 + r * (p.frontPadW / 3.1);
      ctx.beginPath();
      ctx.moveTo(rx, p.frontPadY + 12);
      ctx.lineTo(rx, p.frontPadY + p.frontPadH - 4);
      ctx.stroke();
    }

    // Navy Pad Straps with Silver Buckles
    ctx.fillStyle = this.PALETTE.padStrap;
    ctx.fillRect(p.frontPadX, p.frontPadY + 28, p.frontPadW, 3);
    ctx.fillRect(p.frontPadX, p.frontPadY + 50, p.frontPadW, 3);
    ctx.fillStyle = this.PALETTE.trouserMid;
    ctx.fillRect(p.frontPadX + 1, p.frontPadY + 27, 3.5, 5);
    ctx.fillRect(p.frontPadX + 1, p.frontPadY + 49, 3.5, 5);

    // 5. Front Spiked Shoe (Grounded at y = 274-288)
    this.drawAthleticShoe(ctx, p.frontShoeX, p.frontShoeY, 28, 14, false);

    // 6. Arms & Batting Gloves
    // Sleeve
    const sleeveG = ctx.createLinearGradient(p.shoulderX, p.shoulderY, p.elbowX, p.elbowY);
    sleeveG.addColorStop(0, this.PALETTE.jerseyDeepNavy);
    sleeveG.addColorStop(0.6, this.PALETTE.jerseyRoyal);
    sleeveG.addColorStop(1, this.PALETTE.jerseyDarkBlue);
    ctx.fillStyle = sleeveG;
    ctx.beginPath();
    ctx.roundRect(p.lArmSleeveX, p.lArmSleeveY, 14, 36, 5);
    ctx.fill();

    // Forearm
    const armG = ctx.createLinearGradient(p.elbowX, p.elbowY, p.wristX, p.wristY);
    armG.addColorStop(0, this.PALETTE.skinLight);
    armG.addColorStop(0.6, this.PALETTE.skinMid);
    armG.addColorStop(1, this.PALETTE.skinDark);
    ctx.fillStyle = armG;
    ctx.beginPath();
    ctx.roundRect(p.elbowX - 2, p.elbowY, 12, 30, 4);
    ctx.fill();

    // Split-Finger Pro Batting Gloves
    const gloveG = ctx.createLinearGradient(p.wristX - 3, p.wristY, p.wristX + 16, p.wristY + 16);
    gloveG.addColorStop(0, '#ffffff');
    gloveG.addColorStop(0.6, this.PALETTE.trouserLight);
    gloveG.addColorStop(1, this.PALETTE.jerseyRoyal);
    ctx.fillStyle = gloveG;
    ctx.beginPath();
    ctx.roundRect(p.wristX - 2, p.wristY, 16, 17, 4);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    for (let f = 0; f < 3; f++) {
      ctx.fillRect(p.wristX - 1, p.wristY + 2.5 + f * 4.2, 14, 2.8);
    }
    ctx.fillStyle = this.PALETTE.jerseyRoyal;
    ctx.fillRect(p.wristX + 1, p.wristY + 14, 11, 2.5);

    // 7. English Willow Bat
    this.drawEnglishWillowBat(
      ctx,
      p.batHandleX, p.batHandleY,
      p.batHandleX + 1, p.batHandleY + 24,
      p.batToeX, p.batToeY,
      p.batToeX + 16, p.batToeY,
      p.batHandleX + 17, p.batHandleY + 24,
      7, 24
    );

    // 8. Impact Flash / Spark if requested
    if (p.impactSpark) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.beginPath();
      ctx.arc(p.impactSpark.x, p.impactSpark.y, p.impactSpark.star ? 14 : 9, 0, Math.PI * 2);
      ctx.fill();
      if (p.impactSpark.star) {
        ctx.fillStyle = this.PALETTE.jerseyGold;
        ctx.beginPath();
        ctx.arc(p.impactSpark.x, p.impactSpark.y, 7, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 9. Batting Helmet with Titanium Face Grill
    this.drawBattingHelmet(ctx, p.headX, p.headY, p.headTilt || 0);
  }

  /**
   * English Willow Bat Helper
   */
  private static drawEnglishWillowBat(
    ctx: CanvasRenderingContext2D,
    handleX: number, handleY: number,
    throatX: number, throatY: number,
    toeLeftX: number, toeLeftY: number,
    toeRightX: number, toeRightY: number,
    shoulderRightX: number, shoulderRightY: number,
    handleW: number, handleH: number
  ): void {
    // 1. Rubber diamond traction grip
    ctx.fillStyle = this.PALETTE.batGrip;
    ctx.beginPath();
    ctx.roundRect(handleX - handleW / 2, handleY, handleW, handleH, 3);
    ctx.fill();

    ctx.strokeStyle = this.PALETTE.batGripAccent;
    ctx.lineWidth = 1;
    for (let g = 0; g < 4; g++) {
      ctx.beginPath();
      ctx.moveTo(handleX - handleW / 2, handleY + 4 + g * 5);
      ctx.lineTo(handleX + handleW / 2, handleY + 4 + g * 5);
      ctx.stroke();
    }

    // 2. English Willow Blade
    const bladeG = ctx.createLinearGradient(throatX, throatY, toeRightX, toeRightY);
    bladeG.addColorStop(0, this.PALETTE.woodLight);
    bladeG.addColorStop(0.3, this.PALETTE.woodMid);
    bladeG.addColorStop(0.7, this.PALETTE.woodGrain);
    bladeG.addColorStop(1, this.PALETTE.woodDark);
    ctx.fillStyle = bladeG;

    ctx.beginPath();
    ctx.moveTo(throatX, throatY);
    ctx.lineTo(toeLeftX, toeLeftY);
    ctx.lineTo(toeRightX, toeRightY);
    ctx.lineTo(shoulderRightX, shoulderRightY);
    ctx.closePath();
    ctx.fill();

    // Wood Grain Streaks
    ctx.strokeStyle = 'rgba(180, 83, 9, 0.40)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(throatX + 5, throatY + 8); ctx.lineTo(toeLeftX + 5, toeLeftY - 2);
    ctx.moveTo(throatX + 11, throatY + 8); ctx.lineTo(toeLeftX + 11, toeLeftY - 2);
    ctx.stroke();

    // Metallic Red Sponsor Sticker Badge
    ctx.fillStyle = this.PALETTE.batSticker;
    ctx.beginPath();
    ctx.moveTo(throatX + 5, throatY + 14);
    ctx.lineTo(throatX + 16, throatY + 54);
    ctx.lineTo(throatX + 26, throatY + 54);
    ctx.lineTo(throatX + 16, throatY + 14);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(throatX + 8, throatY + 24, 11, 2.5);
    ctx.fillRect(throatX + 10, throatY + 32, 11, 2.5);

    // Hard rubber toe guard
    ctx.fillStyle = this.PALETTE.batToeGuard;
    ctx.beginPath();
    ctx.moveTo(toeLeftX, toeLeftY);
    ctx.lineTo(toeRightX, toeRightY);
    ctx.lineTo(toeRightX - 2, toeRightY + 4);
    ctx.lineTo(toeLeftX - 2, toeLeftY + 4);
    ctx.closePath();
    ctx.fill();
  }

  /**
   * Batting Helmet with Grill Helper
   */
  private static drawBattingHelmet(
    ctx: CanvasRenderingContext2D,
    headX: number,
    headY: number,
    tiltDeg: number = 0
  ): void {
    ctx.save();
    ctx.translate(headX, headY);
    if (tiltDeg !== 0) ctx.rotate((tiltDeg * Math.PI) / 180);

    // Neck
    const neckG = ctx.createLinearGradient(-8, 14, 8, 14);
    neckG.addColorStop(0, this.PALETTE.skinMid);
    neckG.addColorStop(0.5, this.PALETTE.skinLight);
    neckG.addColorStop(1, this.PALETTE.skinDark);
    ctx.fillStyle = neckG;
    ctx.beginPath();
    ctx.roundRect(-7, 12, 14, 20, 3);
    ctx.fill();

    // Composite Helmet Shell Dome
    const helmetG = ctx.createRadialGradient(-2, -4, 4, 0, 0, 24);
    helmetG.addColorStop(0, this.PALETTE.helmetGloss);
    helmetG.addColorStop(0.4, this.PALETTE.helmetMid);
    helmetG.addColorStop(0.8, this.PALETTE.helmetDark);
    helmetG.addColorStop(1, this.PALETTE.helmetShadow);
    ctx.fillStyle = helmetG;
    ctx.beginPath();
    ctx.arc(0, 0, 22, 0, Math.PI * 2);
    ctx.fill();

    // Gloss Catchlight Arc
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.beginPath();
    ctx.ellipse(-4, -11, 12, 4.5, -0.3, 0, Math.PI * 2);
    ctx.fill();

    // Ear protection pad
    ctx.fillStyle = this.PALETTE.helmetShadow;
    ctx.beginPath();
    ctx.arc(-7, 6, 7.5, 0, Math.PI * 2);
    ctx.fill();

    // Face Profile facing bowler
    ctx.fillStyle = this.PALETTE.skinLight;
    ctx.beginPath();
    ctx.roundRect(4, -2, 15, 20, 4);
    ctx.fill();

    // Focused Eye
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(11, 4, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(10.5, 3.5, 1, 1);

    // Helmet Sun Visor Peak
    ctx.fillStyle = this.PALETTE.helmetShadow;
    ctx.beginPath();
    ctx.roundRect(6, -6, 24, 7, [2, 6, 6, 2]);
    ctx.fill();

    // Titanium Face Protection Grill
    ctx.strokeStyle = this.PALETTE.grillSteel;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(11, 0); ctx.lineTo(11, 18);
    ctx.moveTo(18, 2); ctx.lineTo(18, 14);
    ctx.moveTo(8, 7); ctx.lineTo(24, 7);
    ctx.moveTo(9, 13); ctx.lineTo(22, 13);
    ctx.stroke();

    // Chin strap
    ctx.strokeStyle = this.PALETTE.helmetShadow;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-5, 8);
    ctx.lineTo(5, 20);
    ctx.stroke();

    ctx.restore();
  }

  /**
   * 1. Ready Batting Stance (Athletic semi-open posture, bat rested on turf)
   */
  public static renderBatsmanStance(canvas: HTMLCanvasElement): void {
    canvas.width = 240;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 240, 300);

    this.drawBatsmanProfile(ctx, {
      shadowX: 120, shadowY: 290, shadowRx: 36,
      headX: 128, headY: 48, headTilt: 0,
      shoulderX: 122, shoulderY: 78, waistX: 114, waistY: 130, buttockX: 100, buttockY: 158,
      rearShoeX: 106, rearShoeY: 274,
      frontShoeX: 114, frontShoeY: 274,
      rearPadX: 108, rearPadY: 202, rearPadW: 20, rearPadH: 74,
      frontPadX: 116, frontPadY: 202, frontPadW: 20, frontPadH: 74,
      frontKneeX: 124, frontKneeY: 202,
      lArmSleeveX: 118, lArmSleeveY: 80,
      elbowX: 126, elbowY: 114,
      wristX: 128, wristY: 150,
      batHandleX: 130, batHandleY: 138,
      batToeX: 138, batToeY: 284,
    });
  }

  /**
   * 2. Stance Bat Tap (Rhythmic bat tapping on turf behind back foot)
   */
  public static renderBatsmanTap(canvas: HTMLCanvasElement): void {
    canvas.width = 240;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 240, 300);

    this.drawBatsmanProfile(ctx, {
      shadowX: 120, shadowY: 290, shadowRx: 36,
      headX: 128, headY: 47, headTilt: 0,
      shoulderX: 122, shoulderY: 77, waistX: 114, waistY: 129, buttockX: 100, buttockY: 157,
      rearShoeX: 106, rearShoeY: 274,
      frontShoeX: 114, frontShoeY: 274,
      rearPadX: 108, rearPadY: 202, rearPadW: 20, rearPadH: 74,
      frontPadX: 116, frontPadY: 202, frontPadW: 20, frontPadH: 74,
      frontKneeX: 124, frontKneeY: 202,
      lArmSleeveX: 118, lArmSleeveY: 79,
      elbowX: 126, elbowY: 112,
      wristX: 128, wristY: 144,
      batHandleX: 130, batHandleY: 132,
      batToeX: 140, batToeY: 270,
    });
  }

  /**
   * 3. High Backlift Trigger Movement (Cocked bat behind rear hip, eyes level)
   */
  public static renderBatsmanBacklift(canvas: HTMLCanvasElement): void {
    canvas.width = 240;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 240, 300);

    this.drawBatsmanProfile(ctx, {
      shadowX: 120, shadowY: 290, shadowRx: 38,
      headX: 128, headY: 46, headTilt: 1,
      shoulderX: 120, shoulderY: 76, waistX: 110, waistY: 130, buttockX: 96, buttockY: 158,
      rearShoeX: 104, rearShoeY: 274,
      frontShoeX: 112, frontShoeY: 274,
      rearPadX: 106, rearPadY: 202, rearPadW: 20, rearPadH: 74,
      frontPadX: 114, frontPadY: 202, frontPadW: 20, frontPadH: 74,
      frontKneeX: 122, frontKneeY: 202,
      lArmSleeveX: 116, lArmSleeveY: 78,
      elbowX: 112, elbowY: 104,
      wristX: 106, wristY: 124,
      batHandleX: 106, batHandleY: 116,
      batToeX: 72, batToeY: 22,
    });
  }

  /**
   * 4. Cover Drive / Off Drive — Forward Stride (Left Shot)
   */
  public static renderBatsmanDriveStride(canvas: HTMLCanvasElement): void {
    canvas.width = 240;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 240, 300);

    this.drawBatsmanProfile(ctx, {
      shadowX: 126, shadowY: 290, shadowRx: 42,
      headX: 134, headY: 50, headTilt: -2,
      shoulderX: 128, shoulderY: 80, waistX: 116, waistY: 134, buttockX: 98, buttockY: 160,
      rearShoeX: 104, rearShoeY: 274,
      frontShoeX: 124, frontShoeY: 274,
      rearPadX: 106, rearPadY: 202, rearPadW: 20, rearPadH: 74,
      frontPadX: 126, frontPadY: 202, frontPadW: 21, frontPadH: 74,
      frontKneeX: 134, frontKneeY: 202,
      lArmSleeveX: 124, lArmSleeveY: 82,
      elbowX: 132, elbowY: 118,
      wristX: 134, wristY: 150,
      batHandleX: 134, batHandleY: 142,
      batToeX: 162, batToeY: 280,
    });
  }

  /**
   * 5. Cover Drive — Sweet Spot Impact (Left Shot)
   */
  public static renderBatsmanDriveImpact(canvas: HTMLCanvasElement): void {
    canvas.width = 240;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 240, 300);

    this.drawBatsmanProfile(ctx, {
      shadowX: 128, shadowY: 290, shadowRx: 44,
      headX: 136, headY: 50, headTilt: -3,
      shoulderX: 130, shoulderY: 80, waistX: 116, waistY: 134, buttockX: 98, buttockY: 160,
      rearShoeX: 104, rearShoeY: 274,
      frontShoeX: 126, frontShoeY: 274,
      rearPadX: 106, rearPadY: 202, rearPadW: 20, rearPadH: 74,
      frontPadX: 128, frontPadY: 202, frontPadW: 21, frontPadH: 74,
      frontKneeX: 136, frontKneeY: 202,
      lArmSleeveX: 126, lArmSleeveY: 82,
      elbowX: 136, elbowY: 114,
      wristX: 140, wristY: 148,
      batHandleX: 140, batHandleY: 140,
      batToeX: 170, batToeY: 282,
      impactSpark: { x: 160, y: 254 },
    });
  }

  /**
   * 6. Cover Drive — High Follow-Through (Left Shot)
   */
  public static renderBatsmanDriveFollow(canvas: HTMLCanvasElement): void {
    canvas.width = 240;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 240, 300);

    this.drawBatsmanProfile(ctx, {
      shadowX: 126, shadowY: 290, shadowRx: 40,
      headX: 134, headY: 48, headTilt: -2,
      shoulderX: 128, shoulderY: 78, waistX: 116, waistY: 134, buttockX: 100, buttockY: 160,
      rearShoeX: 104, rearShoeY: 274,
      frontShoeX: 124, frontShoeY: 274,
      rearPadX: 106, rearPadY: 202, rearPadW: 20, rearPadH: 74,
      frontPadX: 126, frontPadY: 202, frontPadW: 21, frontPadH: 74,
      frontKneeX: 134, frontKneeY: 202,
      lArmSleeveX: 124, lArmSleeveY: 80,
      elbowX: 140, elbowY: 98,
      wristX: 150, wristY: 112,
      batHandleX: 150, batHandleY: 106,
      batToeX: 190, batToeY: 28,
    });
  }

  /**
   * 7. Straight Drive / Punch — Impact (Straight Shot)
   */
  public static renderBatsmanStraightImpact(canvas: HTMLCanvasElement): void {
    canvas.width = 240;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 240, 300);

    this.drawBatsmanProfile(ctx, {
      shadowX: 122, shadowY: 290, shadowRx: 36,
      headX: 130, headY: 48, headTilt: 0,
      shoulderX: 124, shoulderY: 78, waistX: 114, waistY: 130, buttockX: 100, buttockY: 158,
      rearShoeX: 106, rearShoeY: 274,
      frontShoeX: 116, frontShoeY: 274,
      rearPadX: 108, rearPadY: 202, rearPadW: 20, rearPadH: 74,
      frontPadX: 118, frontPadY: 202, frontPadW: 20, frontPadH: 74,
      frontKneeX: 126, frontKneeY: 202,
      lArmSleeveX: 120, lArmSleeveY: 80,
      elbowX: 130, elbowY: 118,
      wristX: 130, wristY: 150,
      batHandleX: 130, batHandleY: 142,
      batToeX: 134, batToeY: 284,
      impactSpark: { x: 132, y: 254 },
    });
  }

  /**
   * 8. Straight Drive — High Vertical Follow-Through (Straight Shot)
   */
  public static renderBatsmanStraightFollow(canvas: HTMLCanvasElement): void {
    canvas.width = 240;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 240, 300);

    this.drawBatsmanProfile(ctx, {
      shadowX: 122, shadowY: 290, shadowRx: 36,
      headX: 130, headY: 46, headTilt: 0,
      shoulderX: 124, shoulderY: 76, waistX: 114, waistY: 130, buttockX: 100, buttockY: 158,
      rearShoeX: 106, rearShoeY: 274,
      frontShoeX: 116, frontShoeY: 274,
      rearPadX: 108, rearPadY: 202, rearPadW: 20, rearPadH: 74,
      frontPadX: 118, frontPadY: 202, frontPadW: 20, frontPadH: 74,
      frontKneeX: 126, frontKneeY: 202,
      lArmSleeveX: 120, lArmSleeveY: 78,
      elbowX: 134, elbowY: 100,
      wristX: 138, wristY: 122,
      batHandleX: 138, batHandleY: 114,
      batToeX: 148, batToeY: 18,
    });
  }

  /**
   * 9. Pull Shot / Cut — Back Foot Shift Prep (Right Shot)
   */
  public static renderBatsmanPullPrep(canvas: HTMLCanvasElement): void {
    canvas.width = 240;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 240, 300);

    this.drawBatsmanProfile(ctx, {
      shadowX: 116, shadowY: 290, shadowRx: 36,
      headX: 130, headY: 46, headTilt: 2,
      shoulderX: 124, shoulderY: 76, waistX: 110, waistY: 128, buttockX: 96, buttockY: 156,
      rearShoeX: 102, rearShoeY: 274,
      frontShoeX: 112, frontShoeY: 274,
      rearPadX: 104, rearPadY: 202, rearPadW: 20, rearPadH: 74,
      frontPadX: 114, frontPadY: 202, frontPadW: 20, frontPadH: 74,
      frontKneeX: 122, frontKneeY: 202,
      lArmSleeveX: 120, lArmSleeveY: 78,
      elbowX: 114, elbowY: 92,
      wristX: 108, wristY: 110,
      batHandleX: 108, batHandleY: 102,
      batToeX: 66, batToeY: 26,
    });
  }

  /**
   * 10. Pull Shot — Horizontal Cross-Bat Impact (Right Shot)
   */
  public static renderBatsmanPullImpact(canvas: HTMLCanvasElement): void {
    canvas.width = 240;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 240, 300);

    this.drawBatsmanProfile(ctx, {
      shadowX: 116, shadowY: 290, shadowRx: 38,
      headX: 132, headY: 46, headTilt: 3,
      shoulderX: 126, shoulderY: 76, waistX: 112, waistY: 128, buttockX: 98, buttockY: 156,
      rearShoeX: 102, rearShoeY: 274,
      frontShoeX: 112, frontShoeY: 274,
      rearPadX: 104, rearPadY: 202, rearPadW: 20, rearPadH: 74,
      frontPadX: 114, frontPadY: 202, frontPadW: 20, frontPadH: 74,
      frontKneeX: 122, frontKneeY: 202,
      lArmSleeveX: 122, lArmSleeveY: 78,
      elbowX: 136, elbowY: 104,
      wristX: 142, wristY: 132,
      batHandleX: 142, batHandleY: 124,
      batToeX: 206, batToeY: 164,
      impactSpark: { x: 176, y: 152 },
    });
  }

  /**
   * 11. Pull Shot — Swivel Follow-Through (Right Shot)
   */
  public static renderBatsmanPullFollow(canvas: HTMLCanvasElement): void {
    canvas.width = 240;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 240, 300);

    this.drawBatsmanProfile(ctx, {
      shadowX: 116, shadowY: 290, shadowRx: 36,
      headX: 130, headY: 46, headTilt: 2,
      shoulderX: 124, shoulderY: 76, waistX: 112, waistY: 128, buttockX: 98, buttockY: 156,
      rearShoeX: 102, rearShoeY: 274,
      frontShoeX: 112, frontShoeY: 274,
      rearPadX: 104, rearPadY: 202, rearPadW: 20, rearPadH: 74,
      frontPadX: 114, frontPadY: 202, frontPadW: 20, frontPadH: 74,
      frontKneeX: 122, frontKneeY: 202,
      lArmSleeveX: 120, lArmSleeveY: 78,
      elbowX: 128, elbowY: 92,
      wristX: 122, wristY: 106,
      batHandleX: 122, batHandleY: 98,
      batToeX: 164, batToeY: 48,
    });
  }

  /**
   * 12. Lofted Slog — Deep Power Base (Up / Loft Shot)
   */
  public static renderBatsmanLoftPrep(canvas: HTMLCanvasElement): void {
    canvas.width = 240;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 240, 300);

    this.drawBatsmanProfile(ctx, {
      shadowX: 120, shadowY: 290, shadowRx: 38,
      headX: 128, headY: 54, headTilt: 1,
      shoulderX: 120, shoulderY: 84, waistX: 108, waistY: 136, buttockX: 94, buttockY: 164,
      rearShoeX: 104, rearShoeY: 274,
      frontShoeX: 114, frontShoeY: 274,
      rearPadX: 106, rearPadY: 210, rearPadW: 20, rearPadH: 66,
      frontPadX: 116, frontPadY: 210, frontPadW: 20, frontPadH: 66,
      frontKneeX: 124, frontKneeY: 210,
      lArmSleeveX: 116, lArmSleeveY: 86,
      elbowX: 120, elbowY: 126,
      wristX: 116, wristY: 154,
      batHandleX: 116, batHandleY: 146,
      batToeX: 94, batToeY: 274,
    });
  }

  /**
   * 13. Lofted Slog — Explosive Uppercut Impact (Up / Loft Shot)
   */
  public static renderBatsmanLoftImpact(canvas: HTMLCanvasElement): void {
    canvas.width = 240;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 240, 300);

    this.drawBatsmanProfile(ctx, {
      shadowX: 122, shadowY: 290, shadowRx: 40,
      headX: 130, headY: 48, headTilt: -1,
      shoulderX: 122, shoulderY: 78, waistX: 110, waistY: 132, buttockX: 96, buttockY: 160,
      rearShoeX: 104, rearShoeY: 274,
      frontShoeX: 116, frontShoeY: 274,
      rearPadX: 106, rearPadY: 204, rearPadW: 20, rearPadH: 72,
      frontPadX: 118, frontPadY: 204, frontPadW: 20, frontPadH: 72,
      frontKneeX: 126, frontKneeY: 204,
      lArmSleeveX: 118, lArmSleeveY: 80,
      elbowX: 132, elbowY: 110,
      wristX: 138, wristY: 136,
      batHandleX: 138, batHandleY: 128,
      batToeX: 190, batToeY: 212,
      impactSpark: { x: 170, y: 184, star: true },
    });
  }

  /**
   * 14. Lofted Slog — Skyward High Finish (Up / Loft Shot)
   */
  public static renderBatsmanLoftFollow(canvas: HTMLCanvasElement): void {
    canvas.width = 240;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 240, 300);

    this.drawBatsmanProfile(ctx, {
      shadowX: 122, shadowY: 290, shadowRx: 38,
      headX: 132, headY: 44, headTilt: -4,
      shoulderX: 124, shoulderY: 74, waistX: 114, waistY: 130, buttockX: 98, buttockY: 158,
      rearShoeX: 104, rearShoeY: 274,
      frontShoeX: 116, frontShoeY: 274,
      rearPadX: 106, rearPadY: 204, rearPadW: 20, rearPadH: 72,
      frontPadX: 118, frontPadY: 204, frontPadW: 20, frontPadH: 72,
      frontKneeX: 126, frontKneeY: 204,
      lArmSleeveX: 120, lArmSleeveY: 76,
      elbowX: 140, elbowY: 86,
      wristX: 152, wristY: 96,
      batHandleX: 152, batHandleY: 90,
      batToeX: 194, batToeY: 14,
    });
  }

  /**
   * 15. Forward Defensive Block (Soft hands, bat presented vertically beside pad)
   */
  public static renderBatsmanDefend(canvas: HTMLCanvasElement): void {
    canvas.width = 240;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 240, 300);

    this.drawBatsmanProfile(ctx, {
      shadowX: 122, shadowY: 290, shadowRx: 36,
      headX: 128, headY: 50, headTilt: 0,
      shoulderX: 122, shoulderY: 80, waistX: 112, waistY: 132, buttockX: 98, buttockY: 158,
      rearShoeX: 104, rearShoeY: 274,
      frontShoeX: 118, frontShoeY: 274,
      rearPadX: 106, rearPadY: 204, rearPadW: 20, rearPadH: 72,
      frontPadX: 120, frontPadY: 204, frontPadW: 20, frontPadH: 72,
      frontKneeX: 128, frontKneeY: 204,
      lArmSleeveX: 118, lArmSleeveY: 82,
      elbowX: 128, elbowY: 120,
      wristX: 124, wristY: 152,
      batHandleX: 124, batHandleY: 144,
      batToeX: 120, batToeY: 284,
    });
  }

  /**
   * 16. Wicket / Dismissal Reaction (Looking back at stumps in disbelief)
   */
  public static renderBatsmanWicket(canvas: HTMLCanvasElement): void {
    canvas.width = 240;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 240, 300);

    this.drawBatsmanProfile(ctx, {
      shadowX: 118, shadowY: 290, shadowRx: 34,
      headX: 120, headY: 50, headTilt: -8,
      shoulderX: 120, shoulderY: 82, waistX: 110, waistY: 132, buttockX: 96, buttockY: 158,
      rearShoeX: 102, rearShoeY: 274,
      frontShoeX: 112, frontShoeY: 274,
      rearPadX: 104, rearPadY: 204, rearPadW: 20, rearPadH: 72,
      frontPadX: 114, frontPadY: 204, frontPadW: 20, frontPadH: 72,
      frontKneeX: 122, frontKneeY: 204,
      lArmSleeveX: 116, lArmSleeveY: 84,
      elbowX: 114, elbowY: 128,
      wristX: 108, wristY: 160,
      batHandleX: 108, batHandleY: 152,
      batToeX: 124, batToeY: 284,
    });
  }

  /**
   * 17. Bat Slide across Crease (Reaching forward to ground bat over the line)
   */
  public static renderBatsmanSlideAway(canvas: HTMLCanvasElement): void {
    canvas.width = 240;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 240, 300);

    this.drawGroundShadow(ctx, 120, 290, 48, 7);

    // Planted sliding feet
    this.drawAthleticShoe(ctx, 92, 274, 28, 14);
    this.drawAthleticShoe(ctx, 126, 268, 28, 14);

    // Deep lunging body angled forward
    const bodyG = ctx.createLinearGradient(96, 210, 150, 160);
    bodyG.addColorStop(0, this.PALETTE.jerseyDeepNavy);
    bodyG.addColorStop(0.5, this.PALETTE.jerseyRoyal);
    bodyG.addColorStop(1, this.PALETTE.jerseyCyan);
    ctx.fillStyle = bodyG;
    ctx.beginPath();
    ctx.roundRect(100, 170, 36, 68, 6);
    ctx.fill();

    // Arms extended forward along turf
    ctx.strokeStyle = this.PALETTE.jerseyRoyal;
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(128, 182);
    ctx.lineTo(164, 224);
    ctx.lineTo(186, 252);
    ctx.stroke();

    // Gloves holding bat sliding on turf
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(184, 248, 14, 14, 4);
    ctx.fill();

    // English Willow Bat extended forward over the crease
    this.drawEnglishWillowBat(ctx, 192, 252, 194, 266, 228, 284, 238, 280, 204, 266, 6, 20);

    // Head looking down towards the crease
    this.drawBattingHelmet(ctx, 142, 146, 12);
  }

  public static renderBatsmanSlideTowards(canvas: HTMLCanvasElement): void {
    this.renderBatsmanSlideAway(canvas);
  }

  /**
   * 18a. Running Between Wickets — Away / Up Pitch (Stride 1)
   */
  public static renderBatsmanRunAway1(canvas: HTMLCanvasElement): void {
    canvas.width = 240;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 240, 300);

    this.drawGroundShadow(ctx, 120, 290, 34, 7);

    // Planted Left Leg
    this.drawTrouserLeg(ctx, 110, 150, 108, 210, 106, 268, 20, 16);
    this.drawAthleticShoe(ctx, 96, 268, 26, 14);

    // Kicking Right Leg
    this.drawTrouserLeg(ctx, 130, 150, 138, 198, 144, 234, 20, 16);
    this.drawAthleticShoe(ctx, 134, 234, 24, 13);

    // Rear Torso (Blue Jersey with White Number '18')
    const torsoG = ctx.createLinearGradient(106, 80, 134, 152);
    torsoG.addColorStop(0, this.PALETTE.jerseyDeepNavy);
    torsoG.addColorStop(0.5, this.PALETTE.jerseyRoyal);
    torsoG.addColorStop(1, this.PALETTE.jerseyCyan);
    ctx.fillStyle = torsoG;
    ctx.beginPath();
    ctx.roundRect(106, 82, 28, 70, 6);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('18', 120, 122);

    // Left Arm Pumping Forward
    ctx.strokeStyle = this.PALETTE.jerseyRoyal;
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(106, 88); ctx.lineTo(92, 114); ctx.lineTo(94, 136);
    ctx.stroke();

    // Right Arm trailing holding bat
    ctx.beginPath();
    ctx.moveTo(134, 88); ctx.lineTo(144, 116); ctx.lineTo(142, 138);
    ctx.stroke();

    this.drawEnglishWillowBat(ctx, 144, 140, 146, 156, 172, 226, 182, 224, 156, 156, 6, 20);

    // Back of Helmet
    const helmetG = ctx.createRadialGradient(120, 52, 2, 120, 52, 18);
    helmetG.addColorStop(0, this.PALETTE.helmetGloss);
    helmetG.addColorStop(0.5, this.PALETTE.helmetMid);
    helmetG.addColorStop(1, this.PALETTE.helmetShadow);
    ctx.fillStyle = helmetG;
    ctx.beginPath();
    ctx.arc(120, 52, 16, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * 18b. Running Between Wickets — Away / Up Pitch (Stride 2)
   */
  public static renderBatsmanRunAway2(canvas: HTMLCanvasElement): void {
    canvas.width = 240;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 240, 300);

    this.drawGroundShadow(ctx, 120, 290, 34, 7);

    // Planted Right Leg
    this.drawTrouserLeg(ctx, 130, 150, 132, 210, 134, 268, 20, 16);
    this.drawAthleticShoe(ctx, 122, 268, 26, 14);

    // Kicking Left Leg
    this.drawTrouserLeg(ctx, 110, 150, 102, 198, 96, 234, 20, 16);
    this.drawAthleticShoe(ctx, 88, 234, 24, 13);

    // Rear Torso
    const torsoG = ctx.createLinearGradient(106, 80, 134, 152);
    torsoG.addColorStop(0, this.PALETTE.jerseyDeepNavy);
    torsoG.addColorStop(0.5, this.PALETTE.jerseyRoyal);
    torsoG.addColorStop(1, this.PALETTE.jerseyCyan);
    ctx.fillStyle = torsoG;
    ctx.beginPath();
    ctx.roundRect(106, 82, 28, 70, 6);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('18', 120, 122);

    // Right Arm Pumping Forward
    ctx.strokeStyle = this.PALETTE.jerseyRoyal;
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(134, 88); ctx.lineTo(146, 114); ctx.lineTo(144, 136);
    ctx.stroke();

    // Left Arm trailing holding bat
    ctx.beginPath();
    ctx.moveTo(106, 88); ctx.lineTo(96, 116); ctx.lineTo(98, 138);
    ctx.stroke();

    this.drawEnglishWillowBat(ctx, 96, 140, 94, 156, 68, 226, 58, 224, 84, 156, 6, 20);

    // Back of Helmet
    const helmetG = ctx.createRadialGradient(120, 52, 2, 120, 52, 18);
    helmetG.addColorStop(0, this.PALETTE.helmetGloss);
    helmetG.addColorStop(0.5, this.PALETTE.helmetMid);
    helmetG.addColorStop(1, this.PALETTE.helmetShadow);
    ctx.fillStyle = helmetG;
    ctx.beginPath();
    ctx.arc(120, 52, 16, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * 19a. Running Between Wickets — Towards / Down Pitch (Stride 1)
   */
  public static renderBatsmanRunTowards1(canvas: HTMLCanvasElement): void {
    canvas.width = 240;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 240, 300);

    this.drawGroundShadow(ctx, 120, 290, 34, 7);

    // High Stride Front Pad Lift
    const pad1G = ctx.createLinearGradient(102, 170, 120, 255);
    pad1G.addColorStop(0, this.PALETTE.padWhite);
    pad1G.addColorStop(0.5, this.PALETTE.padLight);
    pad1G.addColorStop(1, this.PALETTE.padShade);
    ctx.fillStyle = pad1G;
    ctx.beginPath();
    ctx.roundRect(102, 170, 18, 76, 5);
    ctx.fill();
    this.drawAthleticShoe(ctx, 98, 248, 26, 14);

    // Planted Trailing Pad
    const pad2G = ctx.createLinearGradient(122, 192, 140, 274);
    pad2G.addColorStop(0, this.PALETTE.padLight);
    pad2G.addColorStop(0.5, this.PALETTE.padMid);
    pad2G.addColorStop(1, this.PALETTE.padShade);
    ctx.fillStyle = pad2G;
    ctx.beginPath();
    ctx.roundRect(122, 192, 18, 80, 5);
    ctx.fill();
    this.drawAthleticShoe(ctx, 118, 270, 26, 14);

    // Front Torso with V-Neck & Sponsor Badge
    const torsoG = ctx.createLinearGradient(106, 80, 134, 152);
    torsoG.addColorStop(0, this.PALETTE.jerseyDeepNavy);
    torsoG.addColorStop(0.5, this.PALETTE.jerseyRoyal);
    torsoG.addColorStop(1, this.PALETTE.jerseyCyan);
    ctx.fillStyle = torsoG;
    ctx.beginPath();
    ctx.roundRect(106, 82, 28, 70, 6);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(114, 82); ctx.lineTo(120, 96); ctx.lineTo(126, 82);
    ctx.closePath();
    ctx.fill();

    // Arms sprinting holding bat across chest
    ctx.strokeStyle = this.PALETTE.jerseyRoyal;
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(106, 88); ctx.lineTo(116, 124);
    ctx.moveTo(134, 88); ctx.lineTo(124, 124);
    ctx.stroke();

    this.drawEnglishWillowBat(ctx, 122, 126, 124, 146, 144, 234, 156, 230, 136, 146, 6, 20);

    // Front Helmet & Titanium Grill
    const helmetG = ctx.createRadialGradient(120, 52, 2, 120, 52, 18);
    helmetG.addColorStop(0, this.PALETTE.helmetGloss);
    helmetG.addColorStop(0.5, this.PALETTE.helmetMid);
    helmetG.addColorStop(1, this.PALETTE.helmetShadow);
    ctx.fillStyle = helmetG;
    ctx.beginPath();
    ctx.arc(120, 52, 16, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = this.PALETTE.helmetShadow;
    ctx.fillRect(108, 48, 24, 4);

    ctx.strokeStyle = this.PALETTE.grillSteel;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(112, 56); ctx.lineTo(128, 56);
    ctx.moveTo(114, 62); ctx.lineTo(126, 62);
    ctx.moveTo(120, 52); ctx.lineTo(120, 66);
    ctx.stroke();
  }

  /**
   * 19b. Running Between Wickets — Towards / Down Pitch (Stride 2)
   */
  public static renderBatsmanRunTowards2(canvas: HTMLCanvasElement): void {
    canvas.width = 240;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 240, 300);

    this.drawGroundShadow(ctx, 120, 290, 34, 7);

    // High Stride Right Pad Lift
    const pad2G = ctx.createLinearGradient(122, 170, 140, 255);
    pad2G.addColorStop(0, this.PALETTE.padWhite);
    pad2G.addColorStop(0.5, this.PALETTE.padLight);
    pad2G.addColorStop(1, this.PALETTE.padShade);
    ctx.fillStyle = pad2G;
    ctx.beginPath();
    ctx.roundRect(122, 170, 18, 76, 5);
    ctx.fill();
    this.drawAthleticShoe(ctx, 118, 248, 26, 14);

    // Planted Left Pad
    const pad1G = ctx.createLinearGradient(102, 192, 120, 274);
    pad1G.addColorStop(0, this.PALETTE.padLight);
    pad1G.addColorStop(0.5, this.PALETTE.padMid);
    pad1G.addColorStop(1, this.PALETTE.padShade);
    ctx.fillStyle = pad1G;
    ctx.beginPath();
    ctx.roundRect(102, 192, 18, 80, 5);
    ctx.fill();
    this.drawAthleticShoe(ctx, 98, 270, 26, 14);

    // Front Torso
    const torsoG = ctx.createLinearGradient(106, 80, 134, 152);
    torsoG.addColorStop(0, this.PALETTE.jerseyDeepNavy);
    torsoG.addColorStop(0.5, this.PALETTE.jerseyRoyal);
    torsoG.addColorStop(1, this.PALETTE.jerseyCyan);
    ctx.fillStyle = torsoG;
    ctx.beginPath();
    ctx.roundRect(106, 82, 28, 70, 6);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(114, 82); ctx.lineTo(120, 96); ctx.lineTo(126, 82);
    ctx.closePath();
    ctx.fill();

    // Arms
    ctx.strokeStyle = this.PALETTE.jerseyRoyal;
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(106, 88); ctx.lineTo(116, 124);
    ctx.moveTo(134, 88); ctx.lineTo(124, 124);
    ctx.stroke();

    this.drawEnglishWillowBat(ctx, 118, 126, 116, 146, 96, 234, 84, 230, 104, 146, 6, 20);

    // Helmet & Grill
    const helmetG = ctx.createRadialGradient(120, 52, 2, 120, 52, 18);
    helmetG.addColorStop(0, this.PALETTE.helmetGloss);
    helmetG.addColorStop(0.5, this.PALETTE.helmetMid);
    helmetG.addColorStop(1, this.PALETTE.helmetShadow);
    ctx.fillStyle = helmetG;
    ctx.beginPath();
    ctx.arc(120, 52, 16, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = this.PALETTE.helmetShadow;
    ctx.fillRect(108, 48, 24, 4);

    ctx.strokeStyle = this.PALETTE.grillSteel;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(112, 56); ctx.lineTo(128, 56);
    ctx.moveTo(114, 62); ctx.lineTo(126, 62);
    ctx.moveTo(120, 52); ctx.lineTo(120, 66);
    ctx.stroke();
  }

  /**
   * Aliases for backwards compatibility
   */
  public static renderBatsmanRun1(canvas: HTMLCanvasElement): void {
    this.renderBatsmanRunAway1(canvas);
  }

  public static renderBatsmanRun2(canvas: HTMLCanvasElement): void {
    this.renderBatsmanRunAway2(canvas);
  }

  public static renderBatsman(canvas: HTMLCanvasElement): void {
    this.renderBatsmanStance(canvas);
  }

  /**
   * 20. Milestone Celebration (Raising bat aloft to crowd)
   */
  public static renderBatsmanCelebrate(canvas: HTMLCanvasElement): void {
    canvas.width = 240;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 240, 300);

    this.drawBatsmanProfile(ctx, {
      shadowX: 120, shadowY: 290, shadowRx: 36,
      headX: 126, headY: 46, headTilt: 0,
      shoulderX: 120, shoulderY: 78, waistX: 112, waistY: 132, buttockX: 98, buttockY: 158,
      rearShoeX: 104, rearShoeY: 274,
      frontShoeX: 114, frontShoeY: 274,
      rearPadX: 106, rearPadY: 202, rearPadW: 20, rearPadH: 74,
      frontPadX: 116, frontPadY: 202, frontPadW: 20, frontPadH: 74,
      frontKneeX: 124, frontKneeY: 202,
      lArmSleeveX: 118, lArmSleeveY: 80,
      elbowX: 138, elbowY: 56,
      wristX: 148, wristY: 34,
      batHandleX: 148, batHandleY: 28,
      batToeX: 152, batToeY: -74,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // NON-STRIKER & FIELDER PROCEDURAL RENDERING
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * High-Definition Non-Striker at Bowling Crease (180 × 280)
   */
  public static renderNonStriker(canvas: HTMLCanvasElement): void {
    canvas.width = 180;
    canvas.height = 280;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 180, 280);

    // Ground Shadow at y = 272
    this.drawGroundShadow(ctx, 90, 272, 34, 8);

    // Shoes at ground line y = 256
    this.drawAthleticShoe(ctx, 64, 256, 26, 14, false);
    this.drawAthleticShoe(ctx, 92, 256, 26, 14, false);

    // Athletic Trousers with Shin Pads
    this.drawTrouserLeg(ctx, 78, 142, 76, 202, 76, 256, 20, 16);
    this.drawTrouserLeg(ctx, 102, 142, 104, 202, 104, 256, 20, 16);

    // Front batting pads on both shins
    ctx.fillStyle = this.PALETTE.padLight;
    ctx.beginPath();
    ctx.roundRect(66, 178, 18, 76, 4);
    ctx.roundRect(94, 178, 18, 76, 4);
    ctx.fill();

    // Pad straps
    ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
    ctx.fillRect(66, 198, 18, 3);
    ctx.fillRect(66, 226, 18, 3);
    ctx.fillRect(94, 198, 18, 3);
    ctx.fillRect(94, 226, 18, 3);

    // Athletic Royal Blue Torso
    this.drawAthleticBowlerTorsoFront(
      ctx, 90, 78, 90, 142, 0,
      this.PALETTE.jerseyRoyal, this.PALETTE.jerseyCyan, this.PALETTE.jerseyDeepNavy, '#0c4a6e'
    );

    // Bat resting grounded on left side
    this.drawEnglishWillowBat(ctx, 50, 142, 48, 160, 40, 256, 32, 254, 56, 160, 6, 20);

    // Arms: left arm holding bat, right arm resting at hip
    this.drawAthleticArm(ctx, 70, 84, 56, 114, 50, 134, true, false, this.PALETTE.jerseyRoyal);
    this.drawAthleticArm(ctx, 110, 84, 116, 112, 108, 126, false, false, this.PALETTE.jerseyRoyal);

    // White batting glove holding handle
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.roundRect(44, 130, 14, 14, 4);
    ctx.fill();

    // Human Head & Blue Cap (Proportional athletic neck)
    this.drawHumanHeadFront(
      ctx, 90, 58, 90, 78, 0,
      this.PALETTE.jerseyRoyal, this.PALETTE.jerseyDeepNavy, this.PALETTE.jerseyCyan
    );
  }

  /**
   * High-Definition Non-Striker in Rear Perspective (For Bowling View)
   * Positioned at foreground bowling crease facing UP-PITCH towards the striker batsman.
   * Features:
   * - Royal blue team jersey with athletic V-taper and player varsity name/number 'INDIA' '18'
   * - Rear human head with short athletic neck, nape fade haircut, realistic ears, and blue cricket cap
   * - White athletic trousers with rear batting pad straps and side wings
   * - Spiked athletic shoes planted at the crease facing up-pitch
   * - English willow bat grounded inside the popping crease held by gloved hand
   */
  public static renderNonStrikerRear(canvas: HTMLCanvasElement): void {
    canvas.width = 180;
    canvas.height = 280;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 180, 280);

    // Ground Shadow at y = 272
    this.drawGroundShadow(ctx, 90, 272, 34, 8);

    // Shoes at ground line y = 256 facing up-pitch
    this.drawAthleticShoe(ctx, 66, 256, 26, 14, false);
    this.drawAthleticShoe(ctx, 92, 256, 26, 14, false);

    // Athletic Trousers Legs
    this.drawTrouserLeg(ctx, 78, 142, 76, 202, 76, 256, 20, 16);
    this.drawTrouserLeg(ctx, 102, 142, 104, 202, 104, 256, 20, 16);

    // Batting Pads from Rear: Straps wrapping behind calves and outer protective wings
    ctx.fillStyle = this.PALETTE.padLight;
    // Left & right outer pad wings visible on sides
    ctx.beginPath();
    ctx.roundRect(64, 180, 5, 74, 3);
    ctx.roundRect(111, 180, 5, 74, 3);
    ctx.fill();

    // Pad straps wrapping around the back of both calves
    ctx.fillStyle = '#0f172a';
    // Left leg straps
    ctx.fillRect(68, 196, 16, 3.5);
    ctx.fillRect(68, 222, 16, 3.5);
    ctx.fillRect(68, 244, 16, 3.5);
    // Left buckles
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(81, 195, 3.5, 5.5);
    ctx.fillRect(81, 221, 3.5, 5.5);
    ctx.fillRect(81, 243, 3.5, 5.5);

    // Right leg straps
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(96, 196, 16, 3.5);
    ctx.fillRect(96, 222, 16, 3.5);
    ctx.fillRect(96, 244, 16, 3.5);
    // Right buckles
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(109, 195, 3.5, 5.5);
    ctx.fillRect(109, 221, 3.5, 5.5);
    ctx.fillRect(109, 243, 3.5, 5.5);

    // Athletic Royal Blue Torso (Rear Perspective)
    this.drawAthleticBowlerTorsoRear(
      ctx, 90, 78, 90, 142, 0,
      this.PALETTE.jerseyRoyal, this.PALETTE.jerseyCyan, this.PALETTE.jerseyDarkBlue, this.PALETTE.jerseyDeepNavy,
      'INDIA', '18'
    );

    // Bat resting grounded on pitch side inside crease
    this.drawEnglishWillowBat(ctx, 50, 142, 48, 160, 40, 256, 32, 254, 56, 160, 6, 20);

    // Arms (Rear Perspective):
    // Left arm: extends down holding bat handle firmly inside crease
    this.drawAthleticArm(ctx, 70, 84, 56, 114, 50, 134, false, true, this.PALETTE.jerseyRoyal);
    // Right arm: relaxed at side, ready for sprint
    this.drawAthleticArm(ctx, 110, 84, 116, 112, 108, 126, false, true, this.PALETTE.jerseyRoyal);

    // White batting glove on left hand wrapped around bat grip
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.roundRect(42, 128, 14, 14, 4);
    ctx.fill();
    // Blue split finger pads on back of glove
    ctx.fillStyle = this.PALETTE.jerseyRoyal;
    ctx.fillRect(44, 132, 10, 2);
    ctx.fillRect(44, 136, 10, 2);

    // Human Head & Royal Blue Cap (Rear View looking up-pitch towards striker)
    this.drawHumanHeadRear(
      ctx, 90, 56, 90, 76, 0,
      this.PALETTE.jerseyRoyal, this.PALETTE.jerseyDeepNavy, this.PALETTE.jerseyCyan
    );
  }

  /**
   * High-Definition Crouched Athletic Fielder (140 × 200)
   */
  public static renderFielder(canvas: HTMLCanvasElement): void {
    canvas.width = 140;
    canvas.height = 200;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 140, 200);

    // Ground Shadow at y = 192
    this.drawGroundShadow(ctx, 70, 192, 30, 7);

    // Shoes at ground line y = 178
    this.drawAthleticShoe(ctx, 48, 178, 22, 12, false);
    this.drawAthleticShoe(ctx, 70, 178, 22, 12, false);

    // Athletic White Trousers
    this.drawTrouserLeg(ctx, 58, 108, 56, 148, 56, 178, 18, 14);
    this.drawTrouserLeg(ctx, 82, 108, 84, 148, 84, 178, 18, 14);

    // Athletic Red Torso (Matching Bowler's Kit)
    this.drawAthleticBowlerTorsoFront(
      ctx, 70, 56, 70, 108, 0,
      this.PALETTE.bowlerRedMid, this.PALETTE.bowlerRedLight, this.PALETTE.bowlerRedDark, this.PALETTE.bowlerRedDeep
    );

    // Athletic Arms in ready crouched cupped position (Red sleeves matching kit)
    this.drawAthleticArm(ctx, 54, 62, 42, 88, 58, 108, false, false, this.PALETTE.bowlerRedMid);
    this.drawAthleticArm(ctx, 86, 62, 98, 88, 82, 108, false, false, this.PALETTE.bowlerRedMid);

    // Human Head & Red Cap (Matching Bowler's Cap)
    this.drawHumanHeadFront(
      ctx, 70, 38, 70, 56, 0,
      this.PALETTE.bowlerRedMid, this.PALETTE.bowlerRedDark, this.PALETTE.bowlerRedLight
    );
  }

  /**
   * Fielder Sprint Stride 1 (Left knee drive, forward lean, pumping arms)
   */
  public static renderFielderRun1(canvas: HTMLCanvasElement): void {
    canvas.width = 140;
    canvas.height = 200;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 140, 200);

    this.drawGroundShadow(ctx, 70, 192, 32, 7);

    // Left shoe planted forward, right shoe trailing
    this.drawAthleticShoe(ctx, 36, 178, 22, 12, false);
    this.drawAthleticShoe(ctx, 88, 168, 22, 12, false);

    // Athletic White Trousers - Running stride
    this.drawTrouserLeg(ctx, 58, 108, 48, 144, 44, 178, 18, 14);
    this.drawTrouserLeg(ctx, 82, 108, 92, 144, 98, 168, 18, 14);

    // Athletic Red Torso with sprint forward lean
    this.drawAthleticBowlerTorsoFront(
      ctx, 70, 56, 70, 108, 6,
      this.PALETTE.bowlerRedMid, this.PALETTE.bowlerRedLight, this.PALETTE.bowlerRedDark, this.PALETTE.bowlerRedDeep
    );

    // Pumping arms (Right forward, Left back)
    this.drawAthleticArm(ctx, 54, 62, 40, 84, 34, 102, false, false, this.PALETTE.bowlerRedMid);
    this.drawAthleticArm(ctx, 86, 62, 98, 80, 106, 96, false, false, this.PALETTE.bowlerRedMid);

    // Head tilted in run direction
    this.drawHumanHeadFront(
      ctx, 74, 38, 72, 56, 4,
      this.PALETTE.bowlerRedMid, this.PALETTE.bowlerRedDark, this.PALETTE.bowlerRedLight
    );
  }

  /**
   * Fielder Sprint Stride 2 (Right knee drive, opposite leg/arm stride)
   */
  public static renderFielderRun2(canvas: HTMLCanvasElement): void {
    canvas.width = 140;
    canvas.height = 200;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 140, 200);

    this.drawGroundShadow(ctx, 70, 192, 32, 7);

    // Right shoe forward, left shoe trailing
    this.drawAthleticShoe(ctx, 42, 168, 22, 12, false);
    this.drawAthleticShoe(ctx, 92, 178, 22, 12, false);

    // Athletic White Trousers - Opposite stride
    this.drawTrouserLeg(ctx, 58, 108, 50, 144, 46, 168, 18, 14);
    this.drawTrouserLeg(ctx, 82, 108, 90, 144, 96, 178, 18, 14);

    // Athletic Red Torso with sprint forward lean
    this.drawAthleticBowlerTorsoFront(
      ctx, 70, 56, 70, 108, 6,
      this.PALETTE.bowlerRedMid, this.PALETTE.bowlerRedLight, this.PALETTE.bowlerRedDark, this.PALETTE.bowlerRedDeep
    );

    // Pumping arms (Left forward, Right back)
    this.drawAthleticArm(ctx, 54, 62, 42, 80, 52, 96, false, false, this.PALETTE.bowlerRedMid);
    this.drawAthleticArm(ctx, 86, 62, 100, 84, 106, 102, false, false, this.PALETTE.bowlerRedMid);

    // Head tilted in run direction
    this.drawHumanHeadFront(
      ctx, 74, 38, 72, 56, 3,
      this.PALETTE.bowlerRedMid, this.PALETTE.bowlerRedDark, this.PALETTE.bowlerRedLight
    );
  }

  /**
   * Fielder Pick / Scoop Posture (Bending low to field the ball)
   */
  public static renderFielderPick(canvas: HTMLCanvasElement): void {
    canvas.width = 140;
    canvas.height = 200;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 140, 200);

    this.drawGroundShadow(ctx, 70, 192, 36, 8);

    // Wide stance shoes
    this.drawAthleticShoe(ctx, 36, 178, 22, 12, false);
    this.drawAthleticShoe(ctx, 84, 178, 22, 12, false);

    // Deeply flexed knees / bent legs
    this.drawTrouserLeg(ctx, 56, 126, 44, 154, 42, 178, 18, 14);
    this.drawTrouserLeg(ctx, 84, 126, 96, 154, 94, 178, 18, 14);

    // Low forward bent torso
    this.drawAthleticBowlerTorsoFront(
      ctx, 70, 78, 70, 126, 0,
      this.PALETTE.bowlerRedMid, this.PALETTE.bowlerRedLight, this.PALETTE.bowlerRedDark, this.PALETTE.bowlerRedDeep
    );

    // Both arms reaching straight down to the turf to scoop the ball
    this.drawAthleticArm(ctx, 54, 82, 56, 130, 62, 172, false, false, this.PALETTE.bowlerRedMid);
    this.drawAthleticArm(ctx, 86, 82, 84, 130, 78, 172, false, false, this.PALETTE.bowlerRedMid);

    // Head down watching the ball
    this.drawHumanHeadFront(
      ctx, 70, 60, 70, 78, 0,
      this.PALETTE.bowlerRedMid, this.PALETTE.bowlerRedDark, this.PALETTE.bowlerRedLight
    );
  }

  /**
   * Fielder Throw Posture (Cocked high overarm throw towards stumps)
   */
  public static renderFielderThrow(canvas: HTMLCanvasElement): void {
    canvas.width = 140;
    canvas.height = 200;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 140, 200);

    this.drawGroundShadow(ctx, 70, 192, 34, 7);

    // Planted front left foot, turned back right foot
    this.drawAthleticShoe(ctx, 40, 178, 22, 12, false);
    this.drawAthleticShoe(ctx, 84, 176, 22, 12, false);

    this.drawTrouserLeg(ctx, 58, 108, 48, 144, 46, 178, 18, 14);
    this.drawTrouserLeg(ctx, 82, 108, 88, 144, 90, 176, 18, 14);

    // Torso in throwing stance
    this.drawAthleticBowlerTorsoFront(
      ctx, 70, 56, 70, 108, -4,
      this.PALETTE.bowlerRedMid, this.PALETTE.bowlerRedLight, this.PALETTE.bowlerRedDark, this.PALETTE.bowlerRedDeep
    );

    // Left guide arm pointing forward, right arm raised high cocked overhead
    this.drawAthleticArm(ctx, 54, 62, 38, 76, 28, 84, false, false, this.PALETTE.bowlerRedMid);
    this.drawAthleticArm(ctx, 86, 62, 106, 46, 104, 22, false, false, this.PALETTE.bowlerRedMid);

    // Head focused towards target stumps
    this.drawHumanHeadFront(
      ctx, 68, 38, 68, 56, -3,
      this.PALETTE.bowlerRedMid, this.PALETTE.bowlerRedDark, this.PALETTE.bowlerRedLight
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // REAR PERSPECTIVE BOWLER FRAMES (For Bowling View when role === 'bowling')
  // Bowler is at bottom of screen, facing UP the pitch towards batsman!
  // ─────────────────────────────────────────────────────────────────────────────

  public static renderBowlerRearIdle(canvas: HTMLCanvasElement): void {
    canvas.width = 180;
    canvas.height = 280;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 180, 280);

    this.drawBowlerRearFrame(ctx, {
      shadowX: 90, shadowY: 272, shadowRx: 32,
      headX: 90, headY: 56, headTilt: 0,
      shoulderX: 90, shoulderY: 76, torsoLean: 0,
      waistX: 90, waistY: 140,
      lHipX: 82, lHipY: 142, lKneeX: 80, lKneeY: 202, lAnkleX: 78, lAnkleY: 256, lShoeX: 66, lShoeY: 256,
      rHipX: 98, rHipY: 142, rKneeX: 100, rKneeY: 202, rAnkleX: 102, rAnkleY: 256, rShoeX: 90, rShoeY: 256,
      lShoulderX: 66, lShoulderY: 78, lElbowX: 74, lElbowY: 116, lWristX: 86, lWristY: 124,
      rShoulderX: 114, rShoulderY: 78, rElbowX: 106, rElbowY: 116, rWristX: 94, rWristY: 124,
      ballX: 90, ballY: 126,
      sweatbandWrist: 'right'
    });
  }

  public static renderBowlerRearStride1(canvas: HTMLCanvasElement): void {
    canvas.width = 180;
    canvas.height = 280;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 180, 280);

    this.drawBowlerRearFrame(ctx, {
      shadowX: 90, shadowY: 272, shadowRx: 34,
      headX: 90, headY: 54, headTilt: 2,
      shoulderX: 90, shoulderY: 74, torsoLean: 5,
      waistX: 90, waistY: 138,
      lHipX: 80, lHipY: 140, lKneeX: 70, lKneeY: 194, lAnkleX: 66, lAnkleY: 256, lShoeX: 52, lShoeY: 256,
      rHipX: 98, rHipY: 140, rKneeX: 110, rKneeY: 196, rAnkleX: 116, rAnkleY: 244, rShoeX: 104, rShoeY: 244,
      lShoulderX: 66, lShoulderY: 78, lElbowX: 54, lElbowY: 110, lWristX: 48, lWristY: 124,
      rShoulderX: 114, rShoulderY: 76, rElbowX: 132, rElbowY: 106, rWristX: 130, rWristY: 88,
      ballX: 134, ballY: 84,
      sweatbandWrist: 'right'
    });
  }

  public static renderBowlerRearStride2(canvas: HTMLCanvasElement): void {
    canvas.width = 180;
    canvas.height = 280;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 180, 280);

    this.drawBowlerRearFrame(ctx, {
      shadowX: 90, shadowY: 272, shadowRx: 34,
      headX: 90, headY: 54, headTilt: -2,
      shoulderX: 90, shoulderY: 74, torsoLean: -4,
      waistX: 90, waistY: 138,
      lHipX: 80, lHipY: 140, lKneeX: 68, lKneeY: 196, lAnkleX: 70, lAnkleY: 244, lShoeX: 58, lShoeY: 244,
      rHipX: 98, rHipY: 140, rKneeX: 108, rKneeY: 194, rAnkleX: 114, rAnkleY: 256, rShoeX: 102, rShoeY: 256,
      lShoulderX: 66, lShoulderY: 78, lElbowX: 50, lElbowY: 106, lWristX: 54, lWristY: 86,
      rShoulderX: 114, rShoulderY: 76, rElbowX: 128, rElbowY: 112, rWristX: 130, rWristY: 130,
      ballX: 134, ballY: 134,
      sweatbandWrist: 'right'
    });
  }

  public static renderBowlerRearGather(canvas: HTMLCanvasElement): void {
    canvas.width = 180;
    canvas.height = 280;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 180, 280);

    this.drawBowlerRearFrame(ctx, {
      shadowX: 90, shadowY: 272, shadowRx: 28,
      headX: 90, headY: 44, headTilt: -3,
      shoulderX: 90, shoulderY: 64, torsoLean: -3,
      waistX: 90, waistY: 126,
      lHipX: 82, lHipY: 128, lKneeX: 72, lKneeY: 172, lAnkleX: 68, lAnkleY: 218, lShoeX: 56, lShoeY: 218,
      rHipX: 98, rHipY: 128, rKneeX: 106, rKneeY: 176, rAnkleX: 110, rAnkleY: 222, rShoeX: 98, rShoeY: 222,
      lShoulderX: 66, lShoulderY: 68, lElbowX: 46, lElbowY: 48, lWristX: 42, lWristY: 32,
      rShoulderX: 114, rShoulderY: 68, rElbowX: 134, rElbowY: 52, rWristX: 138, rWristY: 40,
      ballX: 140, ballY: 36,
      sweatbandWrist: 'right'
    });
  }

  public static renderBowlerRearRelease(canvas: HTMLCanvasElement): void {
    canvas.width = 180;
    canvas.height = 280;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 180, 280);

    this.drawBowlerRearFrame(ctx, {
      shadowX: 88, shadowY: 272, shadowRx: 34,
      headX: 88, headY: 54, headTilt: 2,
      shoulderX: 88, shoulderY: 74, torsoLean: 4,
      waistX: 88, waistY: 138,
      lHipX: 80, lHipY: 138, lKneeX: 70, lKneeY: 198, lAnkleX: 66, lAnkleY: 256, lShoeX: 54, lShoeY: 256,
      rHipX: 96, rHipY: 138, rKneeX: 108, rKneeY: 198, rAnkleX: 116, rAnkleY: 246, rShoeX: 104, rShoeY: 246,
      lShoulderX: 64, lShoulderY: 78, lElbowX: 54, lElbowY: 116, lWristX: 58, lWristY: 136,
      rShoulderX: 112, rShoulderY: 74, rElbowX: 116, rElbowY: 30, rWristX: 118, rWristY: 12,
      ballX: 118, ballY: 6,
      sweatbandWrist: 'right'
    });
  }

  public static renderBowlerRearFollow(canvas: HTMLCanvasElement): void {
    canvas.width = 180;
    canvas.height = 280;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 180, 280);

    this.drawBowlerRearFrame(ctx, {
      shadowX: 84, shadowY: 272, shadowRx: 36,
      headX: 82, headY: 68, headTilt: 12,
      shoulderX: 82, shoulderY: 88, torsoLean: 16,
      waistX: 82, waistY: 148,
      lHipX: 76, lHipY: 150, lKneeX: 68, lKneeY: 204, lAnkleX: 64, lAnkleY: 256, lShoeX: 52, lShoeY: 256,
      rHipX: 92, rHipY: 150, rKneeX: 116, rKneeY: 202, rAnkleX: 124, rAnkleY: 238, rShoeX: 112, rShoeY: 238,
      lShoulderX: 60, lShoulderY: 94, lElbowX: 42, lElbowY: 132, lWristX: 46, lWristY: 150,
      rShoulderX: 106, rShoulderY: 90, rElbowX: 76, rElbowY: 136, rWristX: 60, rWristY: 156,
      sweatbandWrist: 'right'
    });
  }
}
