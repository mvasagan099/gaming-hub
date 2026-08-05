import Phaser from "phaser";

export class ParticleManager {
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /** Spawns a juice splash particle burst */
  fruitJuice(x: number, y: number, color: number): void {
    const p = this.scene.add.particles(x, y, "fn-spark", {
      color: [color],
      speed: { min: 140, max: 280 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.8, end: 0 },
      lifespan: 450,
      quantity: 16,
      emitting: false,
    });
    p.setDepth(30);
    p.explode();

    // Auto cleanup emitter after explosion ends
    this.scene.time.delayedCall(500, () => p.destroy());
  }

  /** Massive bomb blast screen flash and sparks */
  bombExplosion(x: number, y: number): void {
    // 1. Particle shockwave
    const p = this.scene.add.particles(x, y, "fn-spark", {
      color: [0xff3333, 0xffaa00, 0xffff00],
      speed: { min: 200, max: 400 },
      angle: { min: 0, max: 360 },
      scale: { start: 1.2, end: 0 },
      lifespan: 800,
      quantity: 40,
      emitting: false,
    });
    p.setDepth(30);
    p.explode();

    // 2. Camera shake
    this.scene.cameras.main.shake(300, 0.03);

    // 3. Screen flash
    const flash = this.scene.add.rectangle(
      this.scene.scale.width / 2,
      this.scene.scale.height / 2,
      this.scene.scale.width,
      this.scene.scale.height,
      0xffffff,
      0.8
    );
    flash.setDepth(100);

    this.scene.tweens.add({
      targets:  flash,
      alpha:    0,
      duration: 350,
      onComplete: () => {
        flash.destroy();
        p.destroy();
      },
    });
  }
}

export default ParticleManager;
