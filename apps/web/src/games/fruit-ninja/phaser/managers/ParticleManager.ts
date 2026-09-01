import Phaser from "phaser";
import { FRUIT_NINJA_VISUAL_CONFIG, prefersReducedMotion } from "../constants/fruitNinjaVisualConfig";

/**
 * ParticleManager — High-performance multi-layer particle system for:
 *  - Fruit juice droplet bursts with physical gravity & drag
 *  - Translucent mist spray
 *  - Blade sparks and slice flashes
 *  - Explosive bomb blast shockwaves with screen shake & flash
 */
export class ParticleManager {
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /**
   * Spawns a rich multi-layer juice burst with droplets and fine mist spray.
   */
  fruitJuice(x: number, y: number, color: number, mistColor?: number): void {
    if (prefersReducedMotion()) return;

    // 1. High-velocity Juice Droplets (Arcade physics)
    const droplets = this.scene.add.particles(x, y, "fn-juice-drop", {
      color: [color],
      speed: { min: FRUIT_NINJA_VISUAL_CONFIG.particles.juiceSpeedMin, max: FRUIT_NINJA_VISUAL_CONFIG.particles.juiceSpeedMax },
      angle: { min: 0, max: 360 },
      scale: { start: 1.0, end: 0.2 },
      gravityY: 300,
      lifespan: FRUIT_NINJA_VISUAL_CONFIG.particles.juiceLifespan,
      quantity: FRUIT_NINJA_VISUAL_CONFIG.particles.juiceCount,
      emitting: false,
    });
    droplets.setDepth(35);
    droplets.explode();

    // 2. Fine Mist & Pulp Spray
    const mist = this.scene.add.particles(x, y, "fn-spark", {
      color: [mistColor ?? color],
      speed: { min: 40, max: 140 },
      angle: { min: 0, max: 360 },
      scale: { start: 1.4, end: 0 },
      alpha: { start: 0.8, end: 0 },
      lifespan: FRUIT_NINJA_VISUAL_CONFIG.particles.mistLifespan,
      quantity: 10,
      emitting: false,
    });
    mist.setDepth(34);
    mist.explode();

    // 3. Instant Slice Flash Line
    const flashGfx = this.scene.add.graphics();
    flashGfx.setDepth(38);
    flashGfx.lineStyle(3, 0xffffff, 0.9);
    flashGfx.beginPath();
    flashGfx.moveTo(x - 30, y - 10);
    flashGfx.lineTo(x + 30, y + 10);
    flashGfx.strokePath();

    this.scene.tweens.add({
      targets: flashGfx,
      alpha: 0,
      scaleX: 1.5,
      scaleY: 1.5,
      duration: 160,
      ease: "Quad.Out",
      onComplete: () => flashGfx.destroy(),
    });

    // Cleanup emitters after animation finishes
    this.scene.time.delayedCall(550, () => {
      droplets.destroy();
      mist.destroy();
    });
  }

  /**
   * Spawns sparks along blade path or during high combo strikes.
   */
  bladeSparks(x: number, y: number, count = 8): void {
    if (prefersReducedMotion()) return;

    const sparks = this.scene.add.particles(x, y, "fn-spark", {
      color: [0xffffff, 0xfacc15, 0xf59e0b],
      speed: { min: 80, max: 200 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.7, end: 0 },
      lifespan: 250,
      quantity: count,
      emitting: false,
    });
    sparks.setDepth(45);
    sparks.explode();

    this.scene.time.delayedCall(300, () => sparks.destroy());
  }

  /**
   * Massive bomb blast with shockwave ring, fiery sparks, screen flash, and heavy camera shake.
   */
  bombExplosion(x: number, y: number): void {
    // 1. Fiery Sparks & Debris
    const blast = this.scene.add.particles(x, y, "fn-spark", {
      color: [0xffffff, 0xff3333, 0xffaa00, 0xffff00],
      speed: { min: 200, max: 480 },
      angle: { min: 0, max: 360 },
      scale: { start: 1.6, end: 0 },
      gravityY: 200,
      lifespan: 750,
      quantity: FRUIT_NINJA_VISUAL_CONFIG.particles.bombSparks,
      emitting: false,
    });
    blast.setDepth(60);
    blast.explode();

    // 2. Shockwave expanding ring
    const shockGfx = this.scene.add.graphics();
    shockGfx.setDepth(58);
    const shockProxy = { r: 10, alpha: 1.0 };
    this.scene.tweens.add({
      targets: shockProxy,
      r: 180,
      alpha: 0,
      duration: 400,
      ease: "Quad.Out",
      onUpdate: () => {
        shockGfx.clear();
        shockGfx.lineStyle(4, 0xf59e0b, shockProxy.alpha);
        shockGfx.strokeCircle(x, y, shockProxy.r);
        shockGfx.lineStyle(2, 0xffffff, shockProxy.alpha * 0.8);
        shockGfx.strokeCircle(x, y, shockProxy.r * 0.85);
      },
      onComplete: () => shockGfx.destroy(),
    });

    // 3. Camera Shake
    if (!prefersReducedMotion()) {
      this.scene.cameras.main.shake(350, 0.035);
    }

    // 4. Dramatic Screen Flash
    const flash = this.scene.add.rectangle(
      this.scene.scale.width / 2,
      this.scene.scale.height / 2,
      this.scene.scale.width,
      this.scene.scale.height,
      0xffffff,
      0.9
    );
    flash.setDepth(120);

    this.scene.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 350,
      ease: "Sine.In",
      onComplete: () => {
        flash.destroy();
        blast.destroy();
      },
    });
  }
}

export default ParticleManager;
