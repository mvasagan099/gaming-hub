import Phaser from "phaser";
import type { FruitType } from "../types/fruit.types";

/**
 * TextureManager — Generates high-fidelity, vibrant 3D volumetric textures
 * for whole fruits, distinct left/right sliced halves with juicy cross-sections,
 * metallic bombs with glowing fuses, and particle sprites.
 */
export class TextureManager {
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  generateTextures(): void {
    if (this.scene.textures.exists("fn-watermelon")) return;

    this.generateFruitTexture("watermelon");
    this.generateFruitTexture("apple");
    this.generateFruitTexture("orange");
    this.generateFruitTexture("banana");
    this.generateFruitTexture("coconut");
    this.generateFruitTexture("kiwi");
    this.generateFruitTexture("pear");
    this.generateFruitTexture("life");
    this.generateBombTexture();
    this.generateParticleTextures();
  }

  private generateFruitTexture(type: FruitType): void {
    const size = 140;
    const half = size / 2;

    // 1. Generate full 3D whole fruit texture
    const fullKey = `fn-${type}`;
    const fullTex = this.scene.textures.createCanvas(fullKey, size, size);
    if (fullTex) {
      const ctx = fullTex.context;
      this.drawVolumetricFruit(ctx, type, half, half, size * 0.38);
      fullTex.refresh();
    }

    // 2. Generate left sliced half with interior cross-section
    const leftKey = `fn-${type}-left`;
    const leftTex = this.scene.textures.createCanvas(leftKey, size, size);
    if (leftTex) {
      const ctx = leftTex.context;
      this.drawSlicedHalf(ctx, type, half, half, size * 0.38, "left");
      leftTex.refresh();
    }

    // 3. Generate right sliced half with interior cross-section
    const rightKey = `fn-${type}-right`;
    const rightTex = this.scene.textures.createCanvas(rightKey, size, size);
    if (rightTex) {
      const ctx = rightTex.context;
      this.drawSlicedHalf(ctx, type, half, half, size * 0.38, "right");
      rightTex.refresh();
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. WHOLE VOLUMETRIC 3D FRUIT RENDERING (High Luminosity & Contrast)
  // ═══════════════════════════════════════════════════════════════════════════

  private drawVolumetricFruit(
    ctx: CanvasRenderingContext2D,
    type: FruitType,
    cx: number,
    cy: number,
    r: number
  ): void {
    ctx.clearRect(0, 0, cx * 2, cy * 2);

    // Key light offset (Top-Left 315°)
    const lx = cx - r * 0.35;
    const ly = cy - r * 0.35;

    switch (type) {
      case "watermelon": {
        // ── Outer 3D Sphere Rind (High Brightness Emerald) ──
        const rindGrad = ctx.createRadialGradient(lx, ly, r * 0.05, cx, cy, r * 1.02);
        rindGrad.addColorStop(0, "#86efac");    // Luminous bright green
        rindGrad.addColorStop(0.35, "#22c55e"); // Rich emerald
        rindGrad.addColorStop(0.75, "#15803d"); // Dark green
        rindGrad.addColorStop(1, "#052e16");    // Shadow edge
        ctx.fillStyle = rindGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();

        // ── Organic Watermelon Stripes ──
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r - 1, 0, Math.PI * 2);
        ctx.clip();

        ctx.fillStyle = "#064e3b";
        for (let i = -3; i <= 3; i++) {
          const sx = cx + i * (r * 0.32);
          ctx.beginPath();
          ctx.moveTo(sx - 4, cy - r);
          ctx.bezierCurveTo(sx + 12, cy - r * 0.4, sx - 12, cy + r * 0.4, sx + 4, cy + r);
          ctx.bezierCurveTo(sx + 18, cy + r * 0.4, sx - 4, cy - r * 0.4, sx + 6, cy - r);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();

        // Luminous edge rim
        ctx.strokeStyle = "rgba(134, 239, 172, 0.6)";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(cx, cy, r - 1.5, 0, Math.PI * 2);
        ctx.stroke();

        // Top-Left Gloss Specular Sheen
        const specGrad = ctx.createRadialGradient(lx, ly, 0, lx, ly, r * 0.45);
        specGrad.addColorStop(0, "rgba(255,255,255,0.95)");
        specGrad.addColorStop(0.4, "rgba(255,255,255,0.35)");
        specGrad.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = specGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      case "apple": {
        // ── 3D Apple Body (Glossy Ruby Red) ──
        const appleGrad = ctx.createRadialGradient(lx, ly, r * 0.05, cx, cy, r * 1.05);
        appleGrad.addColorStop(0, "#fca5a5");   // Glossy pink/red highlight
        appleGrad.addColorStop(0.3, "#ef4444");  // Vibrant candy red
        appleGrad.addColorStop(0.75, "#b91c1c"); // Crimson shade
        appleGrad.addColorStop(1, "#450a0a");   // Underside shadow

        ctx.fillStyle = appleGrad;
        ctx.beginPath();
        ctx.arc(cx - r * 0.28, cy - r * 0.05, r * 0.78, 0, Math.PI * 2);
        ctx.arc(cx + r * 0.28, cy - r * 0.05, r * 0.78, 0, Math.PI * 2);
        ctx.arc(cx, cy + r * 0.2, r * 0.78, 0, Math.PI * 2);
        ctx.fill();

        // Top stem cavity dip
        ctx.fillStyle = "#7f1d1d";
        ctx.beginPath();
        ctx.ellipse(cx, cy - r * 0.65, r * 0.25, r * 0.12, 0, 0, Math.PI * 2);
        ctx.fill();

        // Stem
        ctx.strokeStyle = "#78350f";
        ctx.lineWidth = 4;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(cx, cy - r * 0.65);
        ctx.quadraticCurveTo(cx + 6, cy - r * 0.95, cx + 10, cy - r * 1.15);
        ctx.stroke();

        // Bright Emerald Leaf
        ctx.fillStyle = "#4ade80";
        ctx.beginPath();
        ctx.ellipse(cx + 12, cy - r * 0.95, 14, 7, Math.PI / 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#16a34a";
        ctx.lineWidth = 1.2;
        ctx.stroke();

        // Sharp Specular Glint
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.beginPath();
        ctx.ellipse(lx, ly, 10, 6, -Math.PI / 4, 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      case "orange": {
        // ── 3D Orange with High Vibrancy ──
        const orangeGrad = ctx.createRadialGradient(lx, ly, r * 0.05, cx, cy, r * 1.02);
        orangeGrad.addColorStop(0, "#ffedd5");   // Bright shine
        orangeGrad.addColorStop(0.25, "#fb923c");// High saturation orange
        orangeGrad.addColorStop(0.7, "#ea580c"); // Rich orange
        orangeGrad.addColorStop(1, "#7c2d12");   // Deep shadow
        ctx.fillStyle = orangeGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();

        // Stippled skin pores
        ctx.fillStyle = "rgba(234, 88, 12, 0.25)";
        for (let i = 0; i < 30; i++) {
          const angle = Math.random() * Math.PI * 2;
          const dist = Math.random() * (r * 0.85);
          ctx.beginPath();
          ctx.arc(cx + Math.cos(angle) * dist, cy + Math.sin(angle) * dist, 1.2, 0, Math.PI * 2);
          ctx.fill();
        }

        // Green stem navel
        ctx.fillStyle = "#22c55e";
        ctx.beginPath();
        ctx.arc(cx, cy - r * 0.82, 3.5, 0, Math.PI * 2);
        ctx.fill();

        // Luminous specular
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.beginPath();
        ctx.ellipse(lx, ly, 12, 7, -Math.PI / 4, 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      case "pear": {
        ctx.fillStyle = "#a3e635";
        ctx.beginPath();
        ctx.moveTo(cx, cy - r);
        ctx.bezierCurveTo(cx + r * 0.5, cy - r, cx + r * 0.25, cy - r * 0.2, cx + r * 0.8, cy + r * 0.2);
        ctx.bezierCurveTo(cx + r * 1.2, cy + r, cx - r * 1.2, cy + r, cx - r * 0.8, cy + r * 0.2);
        ctx.bezierCurveTo(cx - r * 0.25, cy - r * 0.2, cx - r * 0.5, cy - r, cx, cy - r);
        ctx.fill();
        ctx.fillStyle = "#713f12";
        ctx.fillRect(cx - 3, cy - r - 10, 6, 15);
        break;
      }
      case "life": {
        ctx.fillStyle = "#22c55e";
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 56px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("♥", cx, cy + 2);
        break;
      }

      case "banana": {
        // ── Curved Bright Banana ──
        ctx.save();
        ctx.translate(cx, cy);

        const bananaGrad = ctx.createLinearGradient(-35, -30, 35, 35);
        bananaGrad.addColorStop(0, "#fef9c3");   // Bright highlight
        bananaGrad.addColorStop(0.35, "#facc15");// Rich sunny yellow
        bananaGrad.addColorStop(0.75, "#eab308");// Golden yellow
        bananaGrad.addColorStop(1, "#854d0e");   // Ridge shade

        ctx.fillStyle = bananaGrad;
        ctx.beginPath();
        ctx.moveTo(-36, -26);
        ctx.bezierCurveTo(-15, 42, 22, 54, 44, 26);
        ctx.bezierCurveTo(15, 28, -12, 8, -25, -28);
        ctx.closePath();
        ctx.fill();

        // Yellow-green tip
        ctx.strokeStyle = "#84cc16";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(-36, -26);
        ctx.lineTo(-25, -28);
        ctx.stroke();

        // Ridge line
        ctx.strokeStyle = "rgba(161, 98, 7, 0.45)";
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(-32, -24);
        ctx.bezierCurveTo(-8, 32, 22, 40, 40, 24);
        ctx.stroke();

        // Stem & blossom tips
        ctx.fillStyle = "#451a03";
        ctx.beginPath();
        ctx.moveTo(-36, -26);
        ctx.lineTo(-25, -28);
        ctx.lineTo(-32, -38);
        ctx.lineTo(-42, -34);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = "#1c1917";
        ctx.beginPath();
        ctx.arc(42, 26, 4, 0, Math.PI * 2);
        ctx.fill();

        // Specular highlight arc
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.lineWidth = 3.5;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(-20, -10);
        ctx.bezierCurveTo(-5, 12, 10, 24, 26, 18);
        ctx.stroke();

        ctx.restore();
        break;
      }

      case "coconut": {
        // ── High-Contrast Coconut (Showing Bright White Meat Core & Fibrous Husk) ──
        // Warm brown fibrous husk
        const cocoGrad = ctx.createRadialGradient(lx, ly, r * 0.1, cx, cy, r * 1.05);
        cocoGrad.addColorStop(0, "#a16207");   // Bright caramel brown
        cocoGrad.addColorStop(0.4, "#78350f"); // Rich warm brown
        cocoGrad.addColorStop(0.85, "#451a03");// Dark brown
        cocoGrad.addColorStop(1, "#1c0a02");   // Outer rim
        ctx.fillStyle = cocoGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();

        // Bright Porcelain White Inner Meat (Makes Coconut Pop Instantly!)
        const whiteGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 0.65);
        whiteGrad.addColorStop(0, "#f8fafc");
        whiteGrad.addColorStop(0.7, "#ffffff");
        whiteGrad.addColorStop(1, "#e2e8f0");
        ctx.fillStyle = whiteGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.62, 0, Math.PI * 2);
        ctx.fill();

        // Center coconut hollow
        ctx.fillStyle = "#1e293b";
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.32, 0, Math.PI * 2);
        ctx.fill();

        // Specular glint on white meat
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.beginPath();
        ctx.ellipse(cx - 10, cy - 10, 8, 4, -Math.PI / 4, 0, Math.PI * 2);
        ctx.fill();

        // Luminous husk outline
        ctx.strokeStyle = "rgba(245, 158, 11, 0.6)";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(cx, cy, r - 1, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }

      case "kiwi": {
        // ── High-Contrast Kiwi (Showing Lime Green Inner & Seed Starburst) ──
        // Brown fuzzy skin ring
        ctx.fillStyle = "#854d0e";
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();

        // Bright Lime Green Translucent Flesh
        const limeGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 0.88);
        limeGrad.addColorStop(0, "#bef264");   // Luminous yellow-green
        limeGrad.addColorStop(0.65, "#84cc16");// Vibrant lime
        limeGrad.addColorStop(1, "#65a30d");   // Dark lime
        ctx.fillStyle = limeGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.84, 0, Math.PI * 2);
        ctx.fill();

        // Creamy white sunburst center
        ctx.fillStyle = "#f7fee7";
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.30, 0, Math.PI * 2);
        ctx.fill();

        // Ring of Black Seeds
        ctx.fillStyle = "#0f172a";
        for (let i = 0; i < 10; i++) {
          const angle = (i * Math.PI * 2) / 10;
          const kx = cx + Math.cos(angle) * (r * 0.48);
          const ky = cy + Math.sin(angle) * (r * 0.48);
          ctx.fillRect(kx - 1.5, ky - 1.5, 3, 3);
        }

        // Specular shine
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.beginPath();
        ctx.ellipse(lx, ly, 9, 5, -Math.PI / 4, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. SLICED HALF TEXTURES (Juicy Cut Cross-Section)
  // ═══════════════════════════════════════════════════════════════════════════

  private drawSlicedHalf(
    ctx: CanvasRenderingContext2D,
    type: FruitType,
    cx: number,
    cy: number,
    r: number,
    side: "left" | "right"
  ): void {
    ctx.clearRect(0, 0, cx * 2, cy * 2);

    ctx.save();
    ctx.beginPath();
    if (side === "left") {
      ctx.rect(0, 0, cx, cy * 2);
    } else {
      ctx.rect(cx, 0, cx, cy * 2);
    }
    ctx.clip();

    // 1. Draw outer whole fruit
    this.drawVolumetricFruit(ctx, type, cx, cy, r);

    // 2. Draw cut cross-section face along the center slice seam
    switch (type) {
      case "watermelon": {
        ctx.fillStyle = "#86efac";
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.88, 0, Math.PI * 2);
        ctx.fill();

        const pulpGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 0.8);
        pulpGrad.addColorStop(0, "#f87171");
        pulpGrad.addColorStop(0.8, "#ef4444");
        pulpGrad.addColorStop(1, "#b91c1c");
        ctx.fillStyle = pulpGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.8, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#0f172a";
        const seeds = side === "left"
          ? [[-14, -10], [-8, 12], [-18, 6]]
          : [[14, -10], [8, 12], [18, 6]];
        for (const [sx, sy] of seeds) {
          ctx.beginPath();
          ctx.ellipse(cx + sx, cy + sy, 4, 2.5, Math.PI / 4, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }

      case "orange": {
        ctx.fillStyle = "#ffedd5";
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.9, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#f97316";
        for (let i = 0; i < 8; i++) {
          const startAngle = (i * Math.PI) / 4 + 0.06;
          const endAngle   = ((i + 1) * Math.PI) / 4 - 0.06;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.arc(cx, cy, r * 0.82, startAngle, endAngle);
          ctx.closePath();
          ctx.fill();
        }

        ctx.fillStyle = "#ffedd5";
        ctx.beginPath();
        ctx.arc(cx, cy, 4, 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      case "apple": {
        const fleshGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 0.88);
        fleshGrad.addColorStop(0, "#fef9c3");
        fleshGrad.addColorStop(0.8, "#fef08a");
        fleshGrad.addColorStop(1, "#fde047");
        ctx.fillStyle = fleshGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.88, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#ca8a04";
        ctx.beginPath();
        ctx.ellipse(cx + (side === "left" ? -4 : 4), cy, 6, 12, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#451a03";
        ctx.beginPath();
        ctx.ellipse(cx + (side === "left" ? -6 : 6), cy, 3, 2, Math.PI / 6, 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      case "kiwi": {
        ctx.fillStyle = "#84cc16";
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.9, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#f7fee7";
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.32, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#1e293b";
        for (let i = 0; i < 8; i++) {
          const sAngle = (i * Math.PI) / 4;
          const kx = cx + Math.cos(sAngle) * (r * 0.48);
          const ky = cy + Math.sin(sAngle) * (r * 0.48);
          ctx.fillRect(kx - 1.5, ky - 1.5, 3, 3);
        }
        break;
      }

      case "coconut": {
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.82, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#1e293b";
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.45, 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      case "banana": {
        ctx.fillStyle = "#fef08a";
        ctx.beginPath();
        ctx.ellipse(cx, cy, 18, 28, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
    }

    // Cut edge glistening highlight line
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx, cy + r);
    ctx.stroke();

    ctx.restore();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. 3D METALLIC BOMB RENDERING
  // ═══════════════════════════════════════════════════════════════════════════

  private generateBombTexture(): void {
    const size = 140;
    const half = size / 2;
    const key  = "fn-bomb";

    const tex = this.scene.textures.createCanvas(key, size, size);
    if (!tex) return;
    const ctx = tex.context;

    const lx = half - 16;
    const ly = half - 16;

    // 3D Polished Graphite Sphere
    const sphereGrad = ctx.createRadialGradient(lx, ly, 6, half, half, 44);
    sphereGrad.addColorStop(0, "#e2e8f0");   // High metallic reflection
    sphereGrad.addColorStop(0.25, "#64748b");// Slate sheen
    sphereGrad.addColorStop(0.65, "#1e293b");// Dark graphite
    sphereGrad.addColorStop(1, "#020617");   // Deepest black AO
    ctx.fillStyle = sphereGrad;
    ctx.beginPath();
    ctx.arc(half, half, 42, 0, Math.PI * 2);
    ctx.fill();

    // Glowing Neon Danger Ring
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(half, half, 22, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.arc(half, half, 6, 0, Math.PI * 2);
    ctx.fill();

    // Brass Collar
    ctx.fillStyle = "#b45309";
    ctx.fillRect(half - 8, half - 48, 16, 8);
    ctx.fillStyle = "#fbbf24";
    ctx.fillRect(half - 6, half - 46, 12, 3);

    // Fuse
    ctx.strokeStyle = "#d97706";
    ctx.lineWidth = 4.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(half, half - 48);
    ctx.bezierCurveTo(half - 16, half - 70, half + 18, half - 80, half + 6, half - 96);
    ctx.stroke();

    // Burning Spark
    ctx.fillStyle = "#f59e0b";
    ctx.beginPath();
    ctx.arc(half + 6, half - 96, 7, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(half + 6, half - 96, 3.5, 0, Math.PI * 2);
    ctx.fill();

    tex.refresh();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. PARTICLE TEXTURES (Sparks, Juice Droplets)
  // ═══════════════════════════════════════════════════════════════════════════

  private generateParticleTextures(): void {
    const sparkTex = this.scene.textures.createCanvas("fn-spark", 20, 20);
    if (sparkTex) {
      const ctx = sparkTex.context;
      const grad = ctx.createRadialGradient(10, 10, 1, 10, 10, 9);
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(0.4, "#facc15");
      grad.addColorStop(1, "rgba(245, 158, 11, 0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(10, 10, 9, 0, Math.PI * 2);
      ctx.fill();
      sparkTex.refresh();
    }

    const juiceTex = this.scene.textures.createCanvas("fn-juice-drop", 16, 16);
    if (juiceTex) {
      const ctx = juiceTex.context;
      const grad = ctx.createRadialGradient(6, 6, 1, 8, 8, 7);
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(0.5, "rgba(255,255,255,0.9)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(8, 8, 7, 0, Math.PI * 2);
      ctx.fill();
      juiceTex.refresh();
    }
  }
}

export default TextureManager;
