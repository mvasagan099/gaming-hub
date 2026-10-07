import Phaser from "phaser";
import type FruitManager from "./FruitManager";
import { FRUIT_NINJA_VISUAL_CONFIG } from "../constants/fruitNinjaVisualConfig";

export interface TrailPoint {
  x: number;
  y: number;
  time: number;
}

export class SliceManager {
  private scene: Phaser.Scene;
  private fruitManager: FruitManager;
  private trailGraphics!: Phaser.GameObjects.Graphics;
  private points: TrailPoint[] = [];

  private isComboActive = false;
  private comboTier = 0;
  private onBladeInput?: (type: "slice-begin" | "slice-move" | "slice-end", x: number, y: number) => void;

  constructor(scene: Phaser.Scene, fruitManager: FruitManager) {
    this.scene = scene;
    this.fruitManager = fruitManager;
  }

  setComboActive(active: boolean, tier = 0): void {
    this.isComboActive = active;
    this.comboTier = tier;
  }

  setAuthoritativeInput(handler: NonNullable<SliceManager["onBladeInput"]>): void {
    this.onBladeInput = handler;
  }

  create(): void {
    // Swipe trail overlay (depth 40)
    this.trailGraphics = this.scene.add.graphics();
    this.trailGraphics.setDepth(40);

    // Setup input listeners for pointer and touch
    this.scene.input.on("pointerdown", this.onPointerDown, this);
    this.scene.input.on("pointermove", this.onPointerMove, this);
    this.scene.input.on("pointerup", this.onPointerUp, this);
    this.scene.events.once("shutdown", () => {
      this.scene.input.off("pointerdown", this.onPointerDown, this);
      this.scene.input.off("pointermove", this.onPointerMove, this);
      this.scene.input.off("pointerup", this.onPointerUp, this);
    });
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.scene.registry.get("isMobilePortrait")) return;
    this.startSlicePoint(pointer.x, pointer.y);
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (this.scene.registry.get("isMobilePortrait")) return;
    if (!pointer.isDown) return;

    const now = this.scene.time.now;
    const currentPoint: TrailPoint = { x: pointer.x, y: pointer.y, time: now };

    this.points.push(currentPoint);
    if (this.points.length > FRUIT_NINJA_VISUAL_CONFIG.trail.maxPoints) {
      this.points.shift();
    }

    this.onBladeInput?.("slice-move", pointer.x, pointer.y);
    if (!this.onBladeInput) this.checkSliceCollisions();
  }

  public startSlicePoint(x: number, y: number): void {
    this.points = [{ x, y, time: this.scene.time.now }];
    this.onBladeInput?.("slice-begin", x, y);
  }

  public addSlicePoint(x: number, y: number): void {
    const now = this.scene.time.now;
    const currentPoint: TrailPoint = { x, y, time: now };
    this.points.push(currentPoint);
    if (this.points.length > FRUIT_NINJA_VISUAL_CONFIG.trail.maxPoints) {
      this.points.shift();
    }
    this.onBladeInput?.("slice-move", x, y);
    if (!this.onBladeInput) this.checkSliceCollisions();
  }

  public endSlicePoint(): void {
    const last = this.points[this.points.length - 1];
    if (last) this.onBladeInput?.("slice-end", last.x, last.y);
  }

  private onPointerUp(): void {
    if (this.scene.registry.get("isMobilePortrait")) return;
    this.endSlicePoint();
  }

  update(): void {
    this.drawTrail();
  }

  // ─── Glowing Neon Blade Trail Drawing ─────────────────────────────────────────

  private drawTrail(): void {
    this.trailGraphics.clear();

    const now = this.scene.time.now;
    const maxTime = FRUIT_NINJA_VISUAL_CONFIG.trail.lifetimeMs;

    // Filter expired points
    this.points = this.points.filter((p) => now - p.time < maxTime);

    if (this.points.length < 2) return;

    // Choose trail neon color based on combo state
    let auraColor: number = FRUIT_NINJA_VISUAL_CONFIG.trail.defaultColor; // 0x38bdf8
    if (this.isComboActive) {
      auraColor = this.comboTier >= 4
        ? FRUIT_NINJA_VISUAL_CONFIG.trail.criticalColor // Golden
        : FRUIT_NINJA_VISUAL_CONFIG.trail.comboColor;   // Crimson/Rose
    }

    // 1. Draw outer soft glow aura
    for (let i = 1; i < this.points.length; i++) {
      const p1 = this.points[i - 1]!;
      const p2 = this.points[i]!;

      const age = now - p2.time;
      const progress = Math.max(0, 1 - age / maxTime);
      const width = FRUIT_NINJA_VISUAL_CONFIG.trail.baseWidth * progress;

      // Outer glow
      this.trailGraphics.lineStyle(width * 1.6, auraColor, progress * 0.4);
      this.trailGraphics.beginPath();
      this.trailGraphics.moveTo(p1.x, p1.y);
      this.trailGraphics.lineTo(p2.x, p2.y);
      this.trailGraphics.strokePath();

      // Main neon body
      this.trailGraphics.lineStyle(width, auraColor, progress * 0.9);
      this.trailGraphics.beginPath();
      this.trailGraphics.moveTo(p1.x, p1.y);
      this.trailGraphics.lineTo(p2.x, p2.y);
      this.trailGraphics.strokePath();

      // Bright white razor-sharp core
      this.trailGraphics.lineStyle(Math.max(1.5, width * 0.35), 0xffffff, progress * 0.95);
      this.trailGraphics.beginPath();
      this.trailGraphics.moveTo(p1.x, p1.y);
      this.trailGraphics.lineTo(p2.x, p2.y);
      this.trailGraphics.strokePath();
    }
  }

  // ─── Sub-Frame Slicing Collision Math ─────────────────────────────────────────

  private checkSliceCollisions(): void {
    if (this.points.length < 2) return;

    const p1 = this.points[this.points.length - 2]!;
    const p2 = this.points[this.points.length - 1]!;

    const list = this.fruitManager.getActiveFruitsList();

    for (const item of list) {
      if (item.sliced) continue;
      const { x, y } = item.sprite;
      const r = item.def.radius;

      // Circle-segment intersection with tolerance
      if (this.lineIntersectsCircle(p1.x, p1.y, p2.x, p2.y, x, y, r + 6)) {
        // Calculate slice angle for directional split physics
        const sliceAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
        this.fruitManager.splitFruit(item.id, sliceAngle);

        // Spawn floating score popup (+10) at slice location
        if (item.type !== "bomb") {
          this.showSlicePopup(x, y, item.def.points);
        }
      }
    }
  }

  private lineIntersectsCircle(
    x1: number, y1: number,
    x2: number, y2: number,
    cx: number, cy: number,
    r: number
  ): boolean {
    const abx = x2 - x1;
    const aby = y2 - y1;
    const acx = cx - x1;
    const acy = cy - y1;

    const abLenSq = abx * abx + aby * aby;
    if (abLenSq === 0) {
      const dx = cx - x1;
      const dy = cy - y1;
      return dx * dx + dy * dy <= r * r;
    }

    let t = (acx * abx + acy * aby) / abLenSq;
    t = Math.max(0, Math.min(1, t));

    const closestX = x1 + t * abx;
    const closestY = y1 + t * aby;

    const dx = cx - closestX;
    const dy = cy - closestY;
    return dx * dx + dy * dy <= r * r;
  }

  private showSlicePopup(x: number, y: number, points: number): void {
    const txt = this.scene.add.text(x, y - 10, `+${points}`, {
      fontSize: "18px",
      fontFamily: "Outfit, sans-serif",
      fontStyle: "bold",
      color: "#facc15",
      stroke: "#0f172a",
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(50);

    this.scene.tweens.add({
      targets: txt,
      y: y - 40,
      alpha: 0,
      scaleX: 1.3,
      scaleY: 1.3,
      duration: 500,
      ease: "Cubic.Out",
      onComplete: () => txt.destroy(),
    });
  }

  clear(): void {
    this.points = [];
    this.trailGraphics.clear();
  }
}

export default SliceManager;
