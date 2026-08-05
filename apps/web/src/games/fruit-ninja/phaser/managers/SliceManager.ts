import Phaser from "phaser";
import type FruitManager from "./FruitManager";

export class SliceManager {
  private scene: Phaser.Scene;
  private fruitManager: FruitManager;
  private trailGraphics!: Phaser.GameObjects.Graphics;
  private points: Array<{ x: number; y: number; time: number }> = [];
  private readonly maxPoints = 8;
  private readonly maxTime   = 180; // milliseconds to keep trail point

  private isComboActive = false;

  constructor(scene: Phaser.Scene, fruitManager: FruitManager) {
    this.scene = scene;
    this.fruitManager = fruitManager;
  }
  
  setComboActive(active: boolean): void {
     this.isComboActive = active;
  }

  create(): void {
    // Swipe trail overlay (depth 40)
    this.trailGraphics = this.scene.add.graphics();
    this.trailGraphics.setDepth(40);

    // Setup drag inputs
    this.scene.input.on("pointerdown", this.onPointerDown, this);
    this.scene.input.on("pointermove", this.onPointerMove, this);
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    this.points = [{ x: pointer.x, y: pointer.y, time: this.scene.time.now }];
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (!pointer.isDown) return;

    const now = this.scene.time.now;
    const currentPoint = { x: pointer.x, y: pointer.y, time: now };
    
    // Add point
    this.points.push(currentPoint);
    if (this.points.length > this.maxPoints) {
      this.points.shift();
    }

    // Check intersection with all active fruits
    this.checkSliceCollisions(pointer);
  }

  update(): void {
    this.drawTrail();
  }

  // ─── Swipe Trail Drawing ────────────────────────────────────────────────────

  private drawTrail(): void {
    this.trailGraphics.clear();

    const now = this.scene.time.now;
    // Filter expired points
    this.points = this.points.filter((p) => now - p.time < this.maxTime);

    if (this.points.length < 2) return;

    // Draw fading neon trail line segments
    for (let i = 1; i < this.points.length; i++) {
      const p1 = this.points[i - 1]!;
      const p2 = this.points[i]!;

      // Fade alpha/width toward trail tail
      const age = now - p2.time;
      const alpha = Math.max(0, 1 - age / this.maxTime);
      const width = 8 * alpha;

      const color = this.isComboActive ? 0xf43f5e : 0x38bdf8; // Rose if combo, else sky blue

      this.trailGraphics.lineStyle(width, color, alpha);
      this.trailGraphics.beginPath();
      this.trailGraphics.moveTo(p1.x, p1.y);
      this.trailGraphics.lineTo(p2.x, p2.y);
      this.trailGraphics.strokePath();

      // White inner core
      this.trailGraphics.lineStyle(width * 0.4, 0xffffff, alpha);
      this.trailGraphics.beginPath();
      this.trailGraphics.moveTo(p1.x, p1.y);
      this.trailGraphics.lineTo(p2.x, p2.y);
      this.trailGraphics.strokePath();
    }
  }

  // ─── Collision math segment intersection ──────────────────────────────────────

  private checkSliceCollisions(pointer: Phaser.Input.Pointer): void {
    if (this.points.length < 2) return;

    // Last line segment
    const p1 = this.points[this.points.length - 2]!;
    const p2 = this.points[this.points.length - 1]!;

    const list = this.fruitManager.getActiveFruitsList();

    for (const item of list) {
      const { x, y } = item.sprite;
      const r = item.def.radius;

      // Circle segment intersection check
      if (this.lineIntersectsCircle(p1.x, p1.y, p2.x, p2.y, x, y, r)) {
        this.fruitManager.splitFruit(item.id);
      }
    }
  }

  private lineIntersectsCircle(
    x1: number, y1: number,
    x2: number, y2: number,
    cx: number, cy: number,
    r: number
  ): boolean {
    // Vector AB
    const abx = x2 - x1;
    const aby = y2 - y1;
    // Vector AC
    const acx = cx - x1;
    const acy = cy - y1;

    // Square length of AB
    const abLenSq = abx * abx + aby * aby;
    if (abLenSq === 0) return false;

    // Project AC onto AB, clamp to segment length
    let t = (acx * abx + acy * aby) / abLenSq;
    t = Math.max(0, Math.min(1, t));

    // Closest point on line segment
    const closestX = x1 + t * abx;
    const closestY = y1 + t * aby;

    // Distance squared from closest point to circle center
    const dx = cx - closestX;
    const dy = cy - closestY;
    const distSq = dx * dx + dy * dy;

    return distSq <= r * r;
  }

  clear(): void {
    this.points = [];
    this.trailGraphics.clear();
  }
}

export default SliceManager;
