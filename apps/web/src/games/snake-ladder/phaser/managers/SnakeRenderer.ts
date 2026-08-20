import Phaser from "phaser";
import { SNAKE_VISUAL_CONFIG, animDuration, prefersReducedMotion } from "../constants";

/** Realistic biological snake coloration & pattern specification */
export interface SnakeSkinConfig {
  patternName: string;
  bodyColor: string;
  dorsalSaddle: string;
  ventralDark: string;
  bellyLight: string;
  specular: string;
  eyeColor: string;
  numBody: number;
  numDorsal: number;
  numDark: number;
  numBelly: number;
  numSpecular: number;
  numEye: number;
}

export const SNAKE_SKIN_PRESETS: Record<string, SnakeSkinConfig> = {
  "albino-butter-python": {
    patternName: "albino-butter-python",
    bodyColor: "#fef08a",
    dorsalSaddle: "#eab308",
    ventralDark: "#713f12",
    bellyLight: "#ffffff",
    specular: "#ffffff",
    eyeColor: "#ef4444",
    numBody: 0xfef08a,
    numDorsal: 0xeab308,
    numDark: 0x713f12,
    numBelly: 0xffffff,
    numSpecular: 0xffffff,
    numEye: 0xef4444,
  },
  "desert-copperhead": {
    patternName: "desert-copperhead",
    bodyColor: "#b45309",
    dorsalSaddle: "#78350f",
    ventralDark: "#451a03",
    bellyLight: "#fed7aa",
    specular: "#ffedd5",
    eyeColor: "#f59e0b",
    numBody: 0xb45309,
    numDorsal: 0x78350f,
    numDark: 0x451a03,
    numBelly: 0xfed7aa,
    numSpecular: 0xffedd5,
    numEye: 0xf59e0b,
  },
  "sage-tree-boa": {
    patternName: "sage-tree-boa",
    bodyColor: "#64748b",
    dorsalSaddle: "#1e293b",
    ventralDark: "#0f172a",
    bellyLight: "#cbd5e1",
    specular: "#f8fafc",
    eyeColor: "#94a3b8",
    numBody: 0x64748b,
    numDorsal: 0x1e293b,
    numDark: 0x0f172a,
    numBelly: 0xcbd5e1,
    numSpecular: 0xf8fafc,
    numEye: 0x94a3b8,
  },
  "calico-ball-python": {
    patternName: "calico-ball-python",
    bodyColor: "#e2e8f0",
    dorsalSaddle: "#0f172a",
    ventralDark: "#020617",
    bellyLight: "#ffffff",
    specular: "#ffffff",
    eyeColor: "#475569",
    numBody: 0xe2e8f0,
    numDorsal: 0x0f172a,
    numDark: 0x020617,
    numBelly: 0xffffff,
    numSpecular: 0xffffff,
    numEye: 0x475569,
  },
  "reticulated-anaconda": {
    patternName: "reticulated-anaconda",
    bodyColor: "#451a03",
    dorsalSaddle: "#92400e",
    ventralDark: "#1c0a00",
    bellyLight: "#d6d3d1",
    specular: "#fef08a",
    eyeColor: "#d97706",
    numBody: 0x451a03,
    numDorsal: 0x92400e,
    numDark: 0x1c0a00,
    numBelly: 0xd6d3d1,
    numSpecular: 0xfef08a,
    numEye: 0xd97706,
  },
  "emerald-tree-boa": {
    patternName: "emerald-tree-boa",
    bodyColor: "#15803d",
    dorsalSaddle: "#22c55e",
    ventralDark: "#052e16",
    bellyLight: "#86efac",
    specular: "#dcfce7",
    eyeColor: "#facc15",
    numBody: 0x15803d,
    numDorsal: 0x22c55e,
    numDark: 0x052e16,
    numBelly: 0x86efac,
    numSpecular: 0xdcfce7,
    numEye: 0xfacc15,
  },
  "blood-python": {
    patternName: "blood-python",
    bodyColor: "#881337",
    dorsalSaddle: "#be123c",
    ventralDark: "#4c0519",
    bellyLight: "#fecdd3",
    specular: "#ffe4e6",
    eyeColor: "#f43f5e",
    numBody: 0x881337,
    numDorsal: 0xbe123c,
    numDark: 0x4c0519,
    numBelly: 0xfecdd3,
    numSpecular: 0xffe4e6,
    numEye: 0xf43f5e,
  },
  "blue-malayan-coral": {
    patternName: "blue-malayan-coral",
    bodyColor: "#1e3a8a",
    dorsalSaddle: "#2563eb",
    ventralDark: "#0f172a",
    bellyLight: "#38bdf8",
    specular: "#e0f2fe",
    eyeColor: "#38bdf8",
    numBody: 0x1e3a8a,
    numDorsal: 0x2563eb,
    numDark: 0x0f172a,
    numBelly: 0x38bdf8,
    numSpecular: 0xe0f2fe,
    numEye: 0x38bdf8,
  },
  "golden-eyelash-viper": {
    patternName: "golden-eyelash-viper",
    bodyColor: "#ca8a04",
    dorsalSaddle: "#eab308",
    ventralDark: "#713f12",
    bellyLight: "#fef08a",
    specular: "#fef9c3",
    eyeColor: "#ca8a04",
    numBody: 0xca8a04,
    numDorsal: 0xeab308,
    numDark: 0x713f12,
    numBelly: 0xfef08a,
    numSpecular: 0xfef9c3,
    numEye: 0xca8a04,
  },
};

const SKIN_ORDER = [
  "albino-butter-python",
  "desert-copperhead",
  "sage-tree-boa",
  "calico-ball-python",
  "reticulated-anaconda",
  "emerald-tree-boa",
  "blood-python",
  "blue-malayan-coral",
  "golden-eyelash-viper",
];

export interface SplineSamplePoint {
  pt: { x: number; y: number };
  tangent: { x: number; y: number };
  normal: { x: number; y: number };
  width: number;
}

export interface RenderedSnakeInstance {
  headCell: number;
  tailCell: number;
  headPos: Phaser.Math.Vector2;
  tailPos: Phaser.Math.Vector2;
  splinePoints: SplineSamplePoint[];
  fwd: { x: number; y: number };
  skin: SnakeSkinConfig;
  container: Phaser.GameObjects.Container;
  bodyGraphics: Phaser.GameObjects.Graphics;
  headContainer: Phaser.GameObjects.Container;
  headGraphics: Phaser.GameObjects.Graphics;
  tongueGraphics: Phaser.GameObjects.Graphics;
  highlightGraphics: Phaser.GameObjects.Graphics;
  tongueTimer?: Phaser.Time.TimerEvent;
}

/**
 * Realistic 3D Physical Board Game Snake Presentation Renderer.
 * Generates natural serpentine S-curves with biological python/boa dorsal saddle
 * blotches, volumetric drop shadows, cylindrical gradients, sculpted wedge heads,
 * and animated forked tongues.
 */
export class SnakeRenderer {
  private scene: Phaser.Scene;
  private snakes: RenderedSnakeInstance[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  destroy(): void {
    this.clear();
  }

  clear(): void {
    for (const s of this.snakes) {
      if (s.tongueTimer) {
        s.tongueTimer.remove(false);
      }
      s.container.destroy();
    }
    this.snakes = [];
  }

  /**
   * Render a physical 3D board game snake between head and tail tile positions.
   */
  renderSnake(
    headCell: number,
    tailCell: number,
    headPos: Phaser.Math.Vector2,
    tailPos: Phaser.Math.Vector2,
    index: number,
  ): RenderedSnakeInstance | null {
    const skinKey = SKIN_ORDER[index % SKIN_ORDER.length] ?? "emerald-tree-boa";
    const skin = SNAKE_SKIN_PRESETS[skinKey] ?? SNAKE_SKIN_PRESETS["emerald-tree-boa"];

    // Compute natural serpentine S-curve spline points
    const splinePoints = this.buildSerpentineSpline(headPos, tailPos, index);
    if (splinePoints.length < 2) return null;

    // Entry tangent at head
    const p0 = splinePoints[0];
    const p1 = splinePoints[1];
    const fwd = { x: -(p1.pt.x - p0.pt.x), y: -(p1.pt.y - p0.pt.y) };
    const fLen = Math.sqrt(fwd.x * fwd.x + fwd.y * fwd.y) || 1;
    fwd.x /= fLen;
    fwd.y /= fLen;

    // ── 1. Volumetric Body & Cast Shadow Graphics (Depth: 4) ──
    const bodyG = this.scene.add.graphics();
    bodyG.setDepth(4);
    this.drawVolumetricPhysicalSnake(bodyG, splinePoints, skin);

    // ── 2. Sculpted Viper/Python Head Container (Depth: 4.5) ──
    const headContainer = this.scene.add.container(headPos.x, headPos.y);
    headContainer.setDepth(4.5);

    const tongueG = this.scene.add.graphics();
    const headG = this.scene.add.graphics();
    headContainer.add([tongueG, headG]);

    const angleRad = Math.atan2(fwd.y, fwd.x);
    headContainer.setRotation(angleRad);

    this.drawSculptedHead(headG, skin);
    this.drawForkedTongue(tongueG, 0); // Initially retracted

    // ── 3. Highlight Warning Aura Graphics (Depth: 5) ──
    const highlightG = this.scene.add.graphics();
    highlightG.setDepth(5);
    highlightG.setAlpha(0);

    const container = this.scene.add.container(0, 0, [bodyG, headContainer, highlightG]);
    container.setDepth(4);

    const instance: RenderedSnakeInstance = {
      headCell,
      tailCell,
      headPos,
      tailPos,
      splinePoints,
      fwd,
      skin,
      container,
      bodyGraphics: bodyG,
      headContainer,
      headGraphics: headG,
      tongueGraphics: tongueG,
      highlightGraphics: highlightG,
    };

    if (!prefersReducedMotion()) {
      this.setupIdleBreathing(instance);
      this.scheduleTongueFlick(instance);
    }

    this.snakes.push(instance);
    return instance;
  }

  // ─── Serpentine Multi-Wave Spline Generator ───────────────────────────────

  /**
   * Builds an authentic, smooth, organic serpentine curve passing through head and tail.
   * Eliminates artificial mathematical sine ripples and sharp kinks.
   */
  public buildSerpentineSpline(
    head: Phaser.Math.Vector2,
    tail: Phaser.Math.Vector2,
    seedIndex = 0,
    steps = 60,
  ): SplineSamplePoint[] {
    const dx = tail.x - head.x;
    const dy = tail.y - head.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) return [];

    const ux = dx / dist;
    const uy = dy / dist;
    const nx = -uy;
    const ny = ux;

    // Organic directional alternating multiplier per snake
    const dir = seedIndex % 2 === 0 ? 1 : -1;

    // Smooth organic curve envelope & waypoints
    const waypoints: Array<{ x: number; y: number }> = [];

    // Custom ergonomic serpentine curves for specific board snakes
    // (Gives all 9 snakes rich winding serpentine S-curves with organic tail-tip J-hooks)
    const customCurves: Record<number, Array<{ t: number; offNorm: number }>> = {
      0: [ // 99 -> 54 (Albino Butter Python)
        { t: 0.0,  offNorm: 0 },
        { t: 0.18, offNorm: 38 },
        { t: 0.38, offNorm: -42 },
        { t: 0.60, offNorm: 40 },
        { t: 0.80, offNorm: -22 },
        { t: 0.93, offNorm: 12 },
        { t: 1.0,  offNorm: -4 },
      ],
      1: [ // 92 -> 35 (Reticulated Anaconda)
        { t: 0.0,  offNorm: 0 },
        { t: 0.20, offNorm: -42 },
        { t: 0.42, offNorm: 44 },
        { t: 0.65, offNorm: -38 },
        { t: 0.83, offNorm: 20 },
        { t: 0.94, offNorm: -12 },
        { t: 1.0,  offNorm: 4 },
      ],
      2: [ // 87 -> 24 (Sage Tree Boa)
        { t: 0.0,  offNorm: 0 },
        { t: 0.18, offNorm: 38 },
        { t: 0.38, offNorm: -42 },
        { t: 0.60, offNorm: 40 },
        { t: 0.80, offNorm: -22 },
        { t: 0.93, offNorm: 12 },
        { t: 1.0,  offNorm: -4 },
      ],
      3: [ // 74 -> 53 (Calico Python)
        { t: 0.0,  offNorm: 0 },
        { t: 0.28, offNorm: 32 },
        { t: 0.65, offNorm: -32 },
        { t: 0.86, offNorm: 16 },
        { t: 0.96, offNorm: -8 },
        { t: 1.0,  offNorm: 2 },
      ],
      4: [ // 64 -> 18 (Desert Copperhead)
        { t: 0.0,  offNorm: 0 },
        { t: 0.18, offNorm: -25 },
        { t: 0.38, offNorm: 30 },
        { t: 0.62, offNorm: -30 },
        { t: 0.82, offNorm: 18 },
        { t: 0.93, offNorm: -12 },
        { t: 1.0,  offNorm: 4 },
      ],
      5: [ // 56 -> 15 (Emerald Tree Boa)
        { t: 0.0,  offNorm: 0 },
        { t: 0.18, offNorm: 25 },
        { t: 0.38, offNorm: -25 },
        { t: 0.62, offNorm: 25 },
        { t: 0.82, offNorm: -18 },
        { t: 0.93, offNorm: 12 },
        { t: 1.0,  offNorm: -4 },
      ],
      6: [ // 49 -> 11 (Blue Malayan Coral)
        { t: 0.0,  offNorm: 0 },
        { t: 0.22, offNorm: -26 },
        { t: 0.50, offNorm: 30 },
        { t: 0.78, offNorm: -26 },
        { t: 0.92, offNorm: 14 },
        { t: 1.0,  offNorm: -4 },
      ],
      7: [ // 47 -> 26 (Golden Eyelash Viper)
        { t: 0.0,  offNorm: 0 },
        { t: 0.28, offNorm: 26 },
        { t: 0.65, offNorm: -15 },
        { t: 0.85, offNorm: 12 },
        { t: 0.95, offNorm: -6 },
        { t: 1.0,  offNorm: 2 },
      ],
      8: [ // 16 -> 6 (Blood Coral Python)
        { t: 0.0,  offNorm: 0 },
        { t: 0.22, offNorm: -15 },
        { t: 0.50, offNorm: 15 },
        { t: 0.78, offNorm: -12 },
        { t: 0.92, offNorm: 8 },
        { t: 1.0,  offNorm: -2 },
      ],
    };

    const curveSpec = customCurves[seedIndex];

    if (curveSpec) {
      for (const ptSpec of curveSpec) {
        const baseX = head.x + dx * ptSpec.t;
        const baseY = head.y + dy * ptSpec.t;
        waypoints.push({
          x: baseX + nx * ptSpec.offNorm,
          y: baseY + ny * ptSpec.offNorm,
        });
      }
    } else {
      // General organic multi-wave formula
      const maxAmp = Math.min(36, dist * 0.24);
      const wayT = [0, 0.2, 0.4, 0.65, 0.85, 0.95, 1.0];
      const wayOff = [0, 1, -1, 1, -0.6, 0.3, 0];
      for (let i = 0; i < wayT.length; i++) {
        const t = wayT[i];
        const baseX = head.x + dx * t;
        const baseY = head.y + dy * t;
        const offset = wayOff[i] * maxAmp * dir;
        waypoints.push({
          x: baseX + nx * offset,
          y: baseY + ny * offset,
        });
      }
    }

    // Interpolate waypoints into dense, smooth spline points
    const rawPoints: Array<{ x: number; y: number }> = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      rawPoints.push(this.evalCatmullRom(waypoints, t));
    }

    // Calculate ultra-smooth tangents & normals using central differencing
    const samples: SplineSamplePoint[] = [];

    for (let i = 0; i <= steps; i++) {
      const pt = rawPoints[i];

      const prevPt = rawPoints[Math.max(0, i - 1)];
      const nextPt = rawPoints[Math.min(steps, i + 1)];

      const tx = nextPt.x - prevPt.x;
      const ty = nextPt.y - prevPt.y;
      const tLen = Math.sqrt(tx * tx + ty * ty) || 1;
      const normX = -ty / tLen;
      const normY = tx / tLen;

      const t = i / steps;

      // Realistic anatomical tapering profile:
      // Neck (t=0) ~ 11px -> Muscular Midbody (t=0.35) ~ 17px -> Ultra-Sharp Needle Tail Tip (t=1.0) ~ 0.4px
      let width: number;
      if (t < 0.25) {
        width = Phaser.Math.Linear(SNAKE_VISUAL_CONFIG.neckThickness, SNAKE_VISUAL_CONFIG.bodyMaxThickness, t / 0.25);
      } else {
        const tailProgress = (t - 0.25) / 0.75;
        // Non-linear power curve tapering down to an ultra-sharp 0.4px needle tip
        const taperFactor = Math.pow(1 - tailProgress, 1.5);
        width = Phaser.Math.Linear(0.4, SNAKE_VISUAL_CONFIG.bodyMaxThickness, taperFactor);
      }

      samples.push({
        pt,
        tangent: { x: tx / tLen, y: ty / tLen },
        normal: { x: normX, y: normY },
        width,
      });
    }

    return samples;
  }

  private evalCatmullRom(
    points: Array<{ x: number; y: number }>,
    t: number,
  ): { x: number; y: number } {
    const numSections = points.length - 1;
    const p = t * numSections;
    const index = Math.min(Math.floor(p), numSections - 1);
    const weight = p - index;

    const p0 = points[Math.max(index - 1, 0)];
    const p1 = points[index];
    const p2 = points[Math.min(index + 1, numSections)];
    const p3 = points[Math.min(index + 2, numSections)];

    const w2 = weight * weight;
    const w3 = w2 * weight;

    const x = 0.5 * (
      (2 * p1.x) +
      (-p0.x + p2.x) * weight +
      (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * w2 +
      (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * w3
    );

    const y = 0.5 * (
      (2 * p1.y) +
      (-p0.y + p2.y) * weight +
      (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * w2 +
      (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * w3
    );

    return { x, y };
  }

  // ─── 3D Volumetric Physical Snake Rendering ────────────────────────────────

  private drawVolumetricPhysicalSnake(
    g: Phaser.GameObjects.Graphics,
    points: SplineSamplePoint[],
    skin: SnakeSkinConfig,
  ): void {
    const shadowOffset = { x: SNAKE_VISUAL_CONFIG.shadowOffsetX, y: SNAKE_VISUAL_CONFIG.shadowOffsetY };

    // ── 1. Soft Board Drop Shadow (tapered multi-pass blurred contact shadow) ──
    this.drawTaperedPath(g, points, 1.45, 0x000000, 0.14, shadowOffset);
    this.drawTaperedPath(g, points, 1.15, 0x000000, 0.24, shadowOffset);

    // ── 2. Ventral Underbelly Shadow Rim (Bottom-Right Flank) ──
    this.drawTaperedPath(g, points, 1.08, skin.numDark, 0.95);

    // ── 3. Ventral Scale Stripe (Light underbelly edge) ──
    this.drawTaperedPath(g, points, 0.88, skin.numBelly, 0.9);

    // ── 4. Muscular Cylindrical Base Body (Smoothly Tapered) ──
    this.drawTaperedPath(g, points, 0.76, skin.numBody, 1.0);

    // ── 5. Biological Python / Boa Dorsal Saddle Blotches ──
    // Hand-painted-style saddle blotches along the spine at regular intervals
    for (let i = 3; i < points.length - 4; i += 3) {
      const p = points[i];
      const saddleRadiusX = p.width * 0.52;
      const saddleRadiusY = p.width * 0.40;

      // Dark saddle rim
      g.fillStyle(skin.numDark, 0.85);
      g.fillEllipse(p.pt.x, p.pt.y, saddleRadiusX * 2, saddleRadiusY * 2);

      // Vibrant saddle center
      g.fillStyle(skin.numDorsal, 0.95);
      g.fillEllipse(p.pt.x, p.pt.y, saddleRadiusX * 1.4, saddleRadiusY * 1.2);

      // Flank eye-spots on lateral body
      const flankDist = p.width * 0.36;
      g.fillStyle(skin.numDark, 0.6);
      g.fillCircle(p.pt.x + p.normal.x * flankDist, p.pt.y + p.normal.y * flankDist, 1.6);
      g.fillCircle(p.pt.x - p.normal.x * flankDist, p.pt.y - p.normal.y * flankDist, 1.6);
    }

    // ── 6. Micro Scale Cross-Hatch Ridge Lines ──
    for (let i = 2; i < points.length - 3; i += 2) {
      const p = points[i];
      const w = p.width * 0.45;

      g.lineStyle(1.3, skin.numDark, 0.4);
      g.lineBetween(
        p.pt.x + p.normal.x * w, p.pt.y + p.normal.y * w,
        p.pt.x - p.normal.x * w, p.pt.y - p.normal.y * w,
      );

      // Upper-left specular scale glints
      g.lineStyle(1.1, skin.numSpecular, 0.55);
      g.lineBetween(
        p.pt.x + p.normal.x * (w * 0.7), p.pt.y + p.normal.y * (w * 0.7),
        p.pt.x, p.pt.y,
      );
    }

    // ── 7. Specular Spinal Highlight Ridge (Top-Left Key Light) ──
    this.drawTaperedPath(g, points, 0.22, skin.numSpecular, 0.75);
    this.drawTaperedPath(g, points, 0.09, 0xffffff, 0.85);

    // ── 8. Realistically Sculpted Sharp Needle Tail Tip & Ring Bands ──
    const nPts = points.length;

    // Subcaudal alternating dark ring bands (matching reference photo)
    for (let k = Math.max(0, nPts - 16); k < nPts - 1; k++) {
      if (k % 2 === 0) {
        const sp = points[k];
        const rw = sp.width * 0.55;
        g.lineStyle(2.0, skin.numDark, 0.95);
        g.lineBetween(
          sp.pt.x + sp.normal.x * rw, sp.pt.y + sp.normal.y * rw,
          sp.pt.x - sp.normal.x * rw, sp.pt.y - sp.normal.y * rw,
        );
        // Secondary dark ring center glint
        g.lineStyle(1.0, skin.numDorsal, 0.8);
        g.lineBetween(
          sp.pt.x + sp.normal.x * (rw * 0.7), sp.pt.y + sp.normal.y * (rw * 0.7),
          sp.pt.x, sp.pt.y,
        );
      }
    }

    // Ultra-sharp needle tip polygon construction at the tail end
    const lastSp = points[nPts - 1];
    const prevSp = points[Math.max(0, nPts - 2)];

    const tx = lastSp.tangent.x;
    const ty = lastSp.tangent.y;
    const nx = lastSp.normal.x;
    const ny = lastSp.normal.y;

    // Sharp needle tip extending 6px beyond final spline point
    const needleTip = {
      x: lastSp.pt.x + tx * 6.0,
      y: lastSp.pt.y + ty * 6.0,
    };
    const baseLeft = {
      x: prevSp.pt.x + nx * (prevSp.width * 0.4),
      y: prevSp.pt.y + ny * (prevSp.width * 0.4),
    };
    const baseRight = {
      x: prevSp.pt.x - nx * (prevSp.width * 0.4),
      y: prevSp.pt.y - ny * (prevSp.width * 0.4),
    };

    // 1. Sharp Tip Drop Shadow
    g.fillStyle(0x000000, 0.28);
    g.beginPath();
    g.moveTo(needleTip.x + shadowOffset.x * 0.5, needleTip.y + shadowOffset.y * 0.5);
    g.lineTo(baseLeft.x + shadowOffset.x * 0.5, baseLeft.y + shadowOffset.y * 0.5);
    g.lineTo(baseRight.x + shadowOffset.x * 0.5, baseRight.y + shadowOffset.y * 0.5);
    g.closePath();
    g.fillPath();

    // 2. Dark Ventral Needle Base
    g.fillStyle(skin.numDark, 1);
    g.beginPath();
    g.moveTo(needleTip.x, needleTip.y);
    g.lineTo(baseLeft.x - nx * 0.4, baseLeft.y - ny * 0.4);
    g.lineTo(baseRight.x + nx * 0.4, baseRight.y + ny * 0.4);
    g.closePath();
    g.fillPath();

    // 3. Sharp Body Color Needle Tip
    g.fillStyle(skin.numBody, 1);
    g.beginPath();
    g.moveTo(needleTip.x, needleTip.y);
    g.lineTo(baseLeft.x, baseLeft.y);
    g.lineTo(baseRight.x, baseRight.y);
    g.closePath();
    g.fillPath();

    // 4. Sharp Dark Ring Tip Cap
    g.fillStyle(skin.numDark, 0.95);
    g.beginPath();
    g.moveTo(needleTip.x, needleTip.y);
    g.lineTo(lastSp.pt.x + nx * 0.6, lastSp.pt.y + ny * 0.6);
    g.lineTo(lastSp.pt.x - nx * 0.6, lastSp.pt.y - ny * 0.6);
    g.closePath();
    g.fillPath();

    // 5. Micro Specular Needle Glint Line
    g.lineStyle(0.8, skin.numSpecular, 0.95);
    g.lineBetween(lastSp.pt.x, lastSp.pt.y, needleTip.x, needleTip.y);
    g.lineStyle(0.5, 0xffffff, 1.0);
    g.lineBetween(lastSp.pt.x, lastSp.pt.y, needleTip.x, needleTip.y);
  }

  private drawTaperedPath(
    g: Phaser.GameObjects.Graphics,
    points: SplineSamplePoint[],
    widthMultiplier: number,
    color: number,
    alpha: number,
    offset = { x: 0, y: 0 },
  ): void {
    if (points.length < 2) return;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const segWidth = Math.max(0.4, ((p0.width + p1.width) / 2) * widthMultiplier);
      g.lineStyle(segWidth, color, alpha);
      g.lineBetween(
        p0.pt.x + offset.x, p0.pt.y + offset.y,
        p1.pt.x + offset.x, p1.pt.y + offset.y,
      );
    }
  }

  private drawPath(
    g: Phaser.GameObjects.Graphics,
    points: SplineSamplePoint[],
    offset = { x: 0, y: 0 },
  ): void {
    if (points.length === 0) return;
    g.beginPath();
    g.moveTo(points[0].pt.x + offset.x, points[0].pt.y + offset.y);
    for (let i = 1; i < points.length; i++) {
      g.lineTo(points[i].pt.x + offset.x, points[i].pt.y + offset.y);
    }
    g.strokePath();
  }

  // ─── Sculpted 3D Viper / Python Head ───────────────────────────────────────

  private drawSculptedHead(g: Phaser.GameObjects.Graphics, skin: SnakeSkinConfig): void {
    g.clear();
    const shadowOffset = { x: 4, y: 5 };

    // 1. Head Cast Shadow
    g.fillStyle(0x000000, 0.38);
    g.fillEllipse(shadowOffset.x + 3, shadowOffset.y, 28, 22);

    // 2. Dark Ventral Jaw Under-Rim
    g.fillStyle(skin.numDark, 1);
    g.beginPath();
    g.moveTo(-11, -9.5);
    g.lineTo(8, -6.5);
    g.lineTo(14, 0);
    g.lineTo(8, 6.5);
    g.lineTo(-11, 9.5);
    g.lineTo(-13, 0);
    g.closePath();
    g.fillPath();

    // 3. Main 3D Viper Skull Base
    g.fillStyle(skin.numBody, 1);
    g.beginPath();
    g.moveTo(-10, -8.5);
    g.lineTo(7, -5.5);
    g.lineTo(13, 0);
    g.lineTo(7, 5.5);
    g.lineTo(-10, 8.5);
    g.lineTo(-12, 0);
    g.closePath();
    g.fillPath();

    // 4. Dorsal Brow Crown & Forehead Saddle
    g.fillStyle(skin.numDorsal, 0.95);
    g.fillEllipse(1, -2, 14, 9);

    // Forehead specular dome
    g.fillStyle(skin.numSpecular, 0.75);
    g.fillCircle(0, -3, 2.5);
    g.fillStyle(0xffffff, 0.95);
    g.fillCircle(-0.5, -3.5, 1.2);

    // 5. Nostrils & Mouth Commissure Seam
    g.fillStyle(skin.numDark, 0.9);
    g.fillCircle(11, -2.5, 1.1);
    g.fillCircle(11, 2.5, 1.1);

    g.lineStyle(1.2, skin.numDark, 0.85);
    g.lineBetween(8, 0, 13.5, 0);

    // 6. Small Realistic Elliptical Slit Eyes (Not cartoon balls!)
    const eyeY = 6.2;
    const eyeX = 3;
    this.drawRealisticEye(g, eyeX, -eyeY, skin.numEye, skin.numDark);
    this.drawRealisticEye(g, eyeX, eyeY, skin.numEye, skin.numDark);
  }

  private drawRealisticEye(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    irisColor: number,
    darkRimColor: number,
  ): void {
    // Dark orbital socket rim
    g.fillStyle(darkRimColor, 1);
    g.fillEllipse(x, y, 5.5, 4.5);

    // Colored iris
    g.fillStyle(irisColor, 1);
    g.fillEllipse(x, y, 4.5, 3.5);

    // Vertical slit pupil
    g.fillStyle(0x020617, 1);
    g.fillEllipse(x, y, 1.5, 3.6);

    // Glossy catch-light
    g.fillStyle(0xffffff, 0.95);
    g.fillCircle(x - 1, y - 1, 1.1);
  }

  // ─── Forked Tongue ────────────────────────────────────────────────────────

  private drawForkedTongue(g: Phaser.GameObjects.Graphics, extendProgress = 0): void {
    g.clear();
    if (extendProgress <= 0.05) return;

    const baseLength = 11;
    const extendLength = 14 * extendProgress;
    const startX = 12;
    const tipX = startX + baseLength + extendLength;

    const forkLen = 5.5 * extendProgress;
    const forkSpread = 4.5 * extendProgress;

    // Tongue drop shadow
    g.lineStyle(1.5, 0x000000, 0.25);
    g.lineBetween(startX, 1.5, tipX, 1.5);

    // Deep crimson tongue
    g.lineStyle(1.8, 0xdc2626, 1);
    g.lineBetween(startX, 0, tipX, 0);

    // Bifurcated tips
    g.lineStyle(1.4, 0xef4444, 1);
    g.lineBetween(tipX, 0, tipX + forkLen, -forkSpread);
    g.lineBetween(tipX, 0, tipX + forkLen, forkSpread);

    // Tip specular glints
    g.fillStyle(0xfca5a5, 0.9);
    g.fillCircle(tipX + forkLen, -forkSpread, 0.8);
    g.fillCircle(tipX + forkLen, forkSpread, 0.8);
  }

  // ─── Idle Breathing & Micro Body Squirm Animation ─────────────────────────

  private setupIdleBreathing(instance: RenderedSnakeInstance): void {
    // 1. Subtle head breathing pulse
    this.scene.tweens.add({
      targets: instance.headContainer,
      scaleX: 1.025,
      scaleY: 1.025,
      duration: 2200 + Phaser.Math.Between(0, 500),
      yoyo: true,
      repeat: -1,
      ease: "Sine.InOut",
    });

    // 2. Subtle organic midbody squirm/breathing wave (anchored 100% at head and tail tiles)
    const basePoints = instance.splinePoints;
    const nPts = basePoints.length;
    if (nPts < 4) return;

    const squirmProxy = { wavePhase: 0 };
    const maxSquirmAmp = 2.2; // Tiny, realistic 2.2px micro-movement

    this.scene.tweens.add({
      targets: squirmProxy,
      wavePhase: Math.PI * 2,
      duration: 3200 + Phaser.Math.Between(0, 800),
      repeat: -1,
      ease: "Linear",
      onUpdate: () => {
        if (!instance.bodyGraphics || !instance.bodyGraphics.scene) return;

        // Animate points with a zero-boundary envelope (head t=0 and tail t=1 never move)
        const animatedPoints: SplineSamplePoint[] = basePoints.map((sp, idx) => {
          if (idx === 0 || idx === nPts - 1) return sp;

          const t = idx / (nPts - 1);
          // Envelope ensures 0 movement at head and 0 movement at tail
          const envelope = Math.sin(Math.PI * t);
          // Serpentine travelling wave along the midbody
          const wave = Math.sin(squirmProxy.wavePhase + t * Math.PI * 3);
          const offset = envelope * wave * maxSquirmAmp;

          return {
            ...sp,
            pt: {
              x: sp.pt.x + sp.normal.x * offset,
              y: sp.pt.y + sp.normal.y * offset,
            },
          };
        });

        instance.bodyGraphics.clear();
        this.drawVolumetricPhysicalSnake(instance.bodyGraphics, animatedPoints, instance.skin);
      },
    });
  }

  private scheduleTongueFlick(instance: RenderedSnakeInstance): void {
    const delay = Phaser.Math.Between(
      SNAKE_VISUAL_CONFIG.tongueMinInterval,
      SNAKE_VISUAL_CONFIG.tongueMaxInterval,
    );

    instance.tongueTimer = this.scene.time.delayedCall(delay, () => {
      this.playTongueFlick(instance, () => {
        this.scheduleTongueFlick(instance);
      });
    });
  }

  private playTongueFlick(instance: RenderedSnakeInstance, onComplete?: () => void): void {
    if (prefersReducedMotion()) {
      onComplete?.();
      return;
    }

    const tg = instance.tongueGraphics;
    const duration = animDuration(SNAKE_VISUAL_CONFIG.tongueFlickDuration);
    const proxy = { extend: 0 };

    this.scene.tweens.add({
      targets: proxy,
      extend: 1,
      duration: duration / 2,
      yoyo: true,
      ease: "Sine.InOut",
      onUpdate: () => {
        this.drawForkedTongue(tg, proxy.extend);
      },
      onComplete: () => {
        this.drawForkedTongue(tg, 0);
        onComplete?.();
      },
    });
  }

  /** Trigger bite reaction on token landing */
  triggerReaction(headCell: number): void {
    const instance = this.snakes.find(s => s.headCell === headCell);
    if (!instance) return;

    this.highlight(headCell);

    if (prefersReducedMotion()) return;

    this.scene.tweens.add({
      targets: instance.headContainer,
      scaleX: SNAKE_VISUAL_CONFIG.reactionScale,
      scaleY: SNAKE_VISUAL_CONFIG.reactionScale,
      duration: animDuration(SNAKE_VISUAL_CONFIG.reactionDuration / 2),
      yoyo: true,
      ease: "Back.Out",
    });

    this.playTongueFlick(instance);
  }

  highlight(headCell: number): void {
    const instance = this.snakes.find(s => s.headCell === headCell);
    if (!instance) return;

    const hg = instance.highlightGraphics;
    hg.clear();

    hg.lineStyle(24, instance.skin.numDorsal, 0.35);
    this.drawPath(hg, instance.splinePoints);

    hg.lineStyle(12, instance.skin.numSpecular, 0.7);
    this.drawPath(hg, instance.splinePoints);

    this.scene.tweens.add({
      targets: hg,
      alpha: 1,
      duration: 200,
      ease: "Sine.InOut",
    });
  }

  unhighlightAll(): void {
    for (const s of this.snakes) {
      if (s.highlightGraphics.alpha > 0) {
        this.scene.tweens.add({
          targets: s.highlightGraphics,
          alpha: 0,
          duration: 200,
          ease: "Sine.InOut",
        });
      }
    }
  }
}

export default SnakeRenderer;
