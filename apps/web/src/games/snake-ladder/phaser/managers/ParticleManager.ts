import Phaser from "phaser";

/** Confetti colors in hex number format */
const CONFETTI_COLORS = [0xef4444, 0xf59e0b, 0x10b981, 0x3b82f6, 0x8b5cf6, 0xec4899, 0xffffff];

export class ParticleManager {
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /** Burst confetti explosion at (x, y) — used on tile landing or win */
  burstAt(x: number, y: number, count = 24): void {
    const g = this.scene.add.graphics();
    g.setDepth(150);

    const particles: Array<{
      x: number; y: number;
      vx: number; vy: number;
      color: number;
      size: number;
      alpha: number;
      life: number;
    }> = [];

    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Phaser.Math.FloatBetween(-0.3, 0.3);
      const speed = Phaser.Math.FloatBetween(60, 140);
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length] ?? 0xffffff,
        size:  Phaser.Math.FloatBetween(3, 7),
        alpha: 1,
        life:  0,
      });
    }

    const gravity = 200;
    const lifetime = 0.9;

    const handler = (_: unknown, delta: number) => {
      if (!g || !g.scene) {
        this.scene.events.off("update", handler);
        return;
      }
      const dt = delta / 1000;
      g.clear();

      let alive = false;
      for (const p of particles) {
        p.life += dt;
        if (p.life > lifetime) continue;
        alive = true;

        p.vy += gravity * dt;
        p.x  += p.vx * dt;
        p.y  += p.vy * dt;
        p.alpha = 1 - p.life / lifetime;

        g.fillStyle(p.color, p.alpha);
        g.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }

      if (!alive) {
        g.destroy();
        this.scene.events.off("update", handler);
      }
    };
    
    this.scene.events.on("update", handler);
  }

  /** Full-screen win fireworks — multiple bursts timed across the canvas */
  winFireworks(): void {
    const w = this.scene.scale.width;
    const h = this.scene.scale.height;

    const positions = [
      { x: w * 0.2, y: h * 0.3, delay: 0 },
      { x: w * 0.5, y: h * 0.2, delay: 200 },
      { x: w * 0.8, y: h * 0.3, delay: 100 },
      { x: w * 0.3, y: h * 0.5, delay: 350 },
      { x: w * 0.7, y: h * 0.4, delay: 500 },
      { x: w * 0.5, y: h * 0.6, delay: 700 },
      { x: w * 0.2, y: h * 0.6, delay: 900 },
      { x: w * 0.8, y: h * 0.6, delay: 1100 },
    ];

    for (const pos of positions) {
      this.scene.time.delayedCall(pos.delay, () => {
        this.burstAt(pos.x, pos.y, 36);
      });
    }
  }

  /** Subtle sparkle ring that fades in/out on a tile */
  tileSparkle(x: number, y: number, color: number): void {
    const g = this.scene.add.graphics();
    g.setDepth(6);

    let alpha = 0;
    let growing = true;

    const handler = (_: unknown, delta: number) => {
      if (!g || !g.scene) {
        this.scene.events.off("update", handler);
        return;
      }
      const dt = delta / 1000;
      alpha += growing ? dt * 2 : -dt * 2;
      if (alpha >= 1) growing = false;
      if (alpha <= 0) {
        g.destroy();
        this.scene.events.off("update", handler);
        return;
      }
      g.clear();
      g.lineStyle(3, color, alpha);
      g.strokeCircle(x, y, 20 + (1 - alpha) * 10);
    };

    this.scene.events.on("update", handler);
  }
}

export default ParticleManager;
