import Phaser from "phaser";
import type { FruitType } from "../types/fruit.types";

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
    this.generateBombTexture();
    this.generateSparkTexture();
  }

  private generateFruitTexture(type: FruitType): void {
    const size = 120;
    const half = size / 2;

    // 1. Generate full texture
    const fullKey = `fn-${type}`;
    const fullTex = this.scene.textures.createCanvas(fullKey, size, size);
    if (fullTex) {
      const ctx = fullTex.context;
      this.drawFruitShape(ctx, type, half, half, size * 0.4);
      fullTex.refresh();
    }

    // 2. Generate left half texture
    const leftKey = `fn-${type}-left`;
    const leftTex = this.scene.textures.createCanvas(leftKey, size, size);
    if (leftTex) {
      const ctx = leftTex.context;
      ctx.save();
      // Clip left half
      ctx.beginPath();
      ctx.rect(0, 0, half, size);
      ctx.clip();
      this.drawFruitShape(ctx, type, half, half, size * 0.4);
      ctx.restore();
      leftTex.refresh();
    }

    // 3. Generate right half texture
    const rightKey = `fn-${type}-right`;
    const rightTex = this.scene.textures.createCanvas(rightKey, size, size);
    if (rightTex) {
      const ctx = rightTex.context;
      ctx.save();
      // Clip right half
      ctx.beginPath();
      ctx.rect(half, 0, half, size);
      ctx.clip();
      this.drawFruitShape(ctx, type, half, half, size * 0.4);
      ctx.restore();
      rightTex.refresh();
    }
  }

  private drawFruitShape(
    ctx: CanvasRenderingContext2D,
    type: FruitType,
    cx: number,
    cy: number,
    r: number
  ): void {
    ctx.clearRect(0, 0, cx * 2, cy * 2);

    switch (type) {
      case "watermelon":
        // Rind (Dark green)
        ctx.fillStyle = "#15803d";
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();

        // Light rind
        ctx.fillStyle = "#86efac";
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.9, 0, Math.PI * 2);
        ctx.fill();

        // Inside flesh (Pink/Red)
        ctx.fillStyle = "#ef4444";
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.82, 0, Math.PI * 2);
        ctx.fill();

        // Seeds
        ctx.fillStyle = "#1e293b";
        ctx.fillRect(cx - 10, cy - 8, 3, 4);
        ctx.fillRect(cx + 8, cy - 4, 3, 4);
        ctx.fillRect(cx - 4, cy + 10, 3, 4);
        break;

      case "apple":
        // Apple shape
        ctx.fillStyle = "#dc2626";
        ctx.beginPath();
        ctx.arc(cx - r * 0.25, cy, r * 0.8, 0, Math.PI * 2);
        ctx.arc(cx + r * 0.25, cy, r * 0.8, 0, Math.PI * 2);
        ctx.fill();

        // Indentation bottom
        ctx.fillStyle = "#b91c1c";
        ctx.beginPath();
        ctx.arc(cx, cy + r * 0.65, r * 0.2, 0, Math.PI * 2);
        ctx.fill();

        // Leaf (Green)
        ctx.fillStyle = "#22c55e";
        ctx.beginPath();
        ctx.ellipse(cx + 8, cy - r * 1.05, 12, 6, Math.PI / 4, 0, Math.PI * 2);
        ctx.fill();

        // Stem (Brown)
        ctx.fillStyle = "#78350f";
        ctx.fillRect(cx - 2, cy - r * 1.1, 4, r * 0.5);
        break;

      case "orange":
        // Orange skin
        ctx.fillStyle = "#ea580c";
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();

        // White rind
        ctx.fillStyle = "#ffedd5";
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.9, 0, Math.PI * 2);
        ctx.fill();

        // Segments
        ctx.fillStyle = "#f97316";
        for (let i = 0; i < 8; i++) {
          const startAngle = (i * Math.PI) / 4 + 0.08;
          const endAngle   = ((i + 1) * Math.PI) / 4 - 0.08;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.arc(cx, cy, r * 0.82, startAngle, endAngle);
          ctx.closePath();
          ctx.fill();
        }
        break;

      case "banana":
        // Banana body (Yellow bezier shape, enlarged)
        ctx.fillStyle = "#facc15"; // Bright yellow
        ctx.beginPath();
        // Start at top left (stem area)
        ctx.moveTo(cx - 32, cy - 26);
        // Outer curve (bottom edge)
        ctx.bezierCurveTo(cx - 13, cy + 39, cx + 20, cy + 52, cx + 39, cy + 26);
        // Inner curve (top edge)
        ctx.bezierCurveTo(cx + 13, cy + 26, cx - 13, cy + 6, cx - 23, cy - 29);
        ctx.closePath();
        ctx.fill();

        // Dark Outline / Inner stroke to match reference style
        ctx.strokeStyle = "#eab308"; // Darker yellow for outline
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Top stem (Dark brown)
        ctx.fillStyle = "#4a2810";
        ctx.beginPath();
        ctx.moveTo(cx - 32, cy - 26);
        ctx.lineTo(cx - 23, cy - 29);
        ctx.lineTo(cx - 29, cy - 36);
        ctx.lineTo(cx - 36, cy - 34);
        ctx.closePath();
        ctx.fill();

        // Bottom tip (Dark brown)
        ctx.fillStyle = "#271608";
        ctx.beginPath();
        ctx.arc(cx + 36, cy + 27, 4, 0, Math.PI * 2);
        ctx.fill();
        break;

      case "coconut":
        // Shell (Dark brown)
        ctx.fillStyle = "#451a03";
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();

        // White inside core
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.78, 0, Math.PI * 2);
        ctx.fill();
        break;

      case "kiwi":
        // Skin (Brown)
        ctx.fillStyle = "#78350f";
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();

        // Flesh (Lime green)
        ctx.fillStyle = "#84cc16";
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.88, 0, Math.PI * 2);
        ctx.fill();

        // Light green center
        ctx.fillStyle = "#bef264";
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.35, 0, Math.PI * 2);
        ctx.fill();

        // Tiny seed dots
        ctx.fillStyle = "#1e293b";
        for (let i = 0; i < 10; i++) {
          const angle = (i * Math.PI * 2) / 10;
          const sx = cx + Math.cos(angle) * (r * 0.52);
          const sy = cy + Math.sin(angle) * (r * 0.52);
          ctx.fillRect(sx - 1.5, sy - 1.5, 2, 2);
        }
        break;
    }
  }

  private generateBombTexture(): void {
    const size = 120;
    const half = size / 2;
    const key  = "fn-bomb";

    const tex = this.scene.textures.createCanvas(key, size, size);
    if (!tex) return;
    const ctx = tex.context;

    // Body (Black metallic sphere)
    const gradient = ctx.createRadialGradient(half - 10, half - 10, 5, half, half, 38);
    gradient.addColorStop(0, "#64748b"); // high specular reflection light
    gradient.addColorStop(0.3, "#334155");
    gradient.addColorStop(1, "#0f172a");

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(half, half, 38, 0, Math.PI * 2);
    ctx.fill();

    // Rivets
    ctx.fillStyle = "#94a3b8";
    ctx.fillRect(half - 4, half - 42, 8, 6);

    // Fuse thread (S-shaped curve)
    ctx.strokeStyle = "#d97706";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(half, half - 40);
    ctx.bezierCurveTo(half - 12, half - 60, half + 12, half - 70, half + 4, half - 84);
    ctx.stroke();

    tex.refresh();
  }

  private generateSparkTexture(): void {
    // Generate simple yellow star spark for bomb fuse
    const size = 16;
    const half = size / 2;
    const key  = "fn-spark";

    const tex = this.scene.textures.createCanvas(key, size, size);
    if (!tex) return;
    const ctx = tex.context;

    ctx.fillStyle = "#f59e0b";
    ctx.beginPath();
    ctx.arc(half, half, half * 0.8, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(half, half, half * 0.35, 0, Math.PI * 2);
    ctx.fill();

    tex.refresh();
  }
}

export default TextureManager;
