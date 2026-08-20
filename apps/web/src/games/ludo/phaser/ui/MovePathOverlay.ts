import Phaser from "phaser";
import type { PlayerColor } from "../types/ludo.types";
import { LUDO_DESIGN_CONFIG, animDuration, prefersReducedMotion } from "../constants";
import { mainPathPixel, homeColPixel, HOME_COL_BASE, CELL_SIZE } from "../data/boardLayout";

/**
 * Renders subtle glowing track indicators showing the legal movement path and destination tile
 * when a player interacts with or selects an actionable token.
 */
export class MovePathOverlay {
  private scene: Phaser.Scene;
  private graphics: Phaser.GameObjects.Graphics;
  private pathPulseTween: Phaser.Tweens.Tween | null = null;
  private targetRingTween: Phaser.Tweens.Tween | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.graphics = scene.add.graphics();
    this.graphics.setDepth(45); // Above board & grid, below tokens
  }

  showPath(path: number[], color: PlayerColor): void {
    this.clear();
    if (!path || path.length === 0) return;

    const reduced = prefersReducedMotion();
    const cConfig = LUDO_DESIGN_CONFIG.colors[color];
    const targetColor = cConfig.glow;

    const draw = (pulse: number) => {
      this.graphics.clear();

      // 1. Draw subtle connecting route dots
      path.forEach((pos, idx) => {
        const isTarget = idx === path.length - 1;
        const pixel = this.getPixelForPosition(color, pos);

        if (!isTarget) {
          // Soft outer trail dot
          this.graphics.fillStyle(targetColor, 0.25 * pulse);
          this.graphics.fillCircle(pixel.x, pixel.y, 7);

          // Core bright dot
          this.graphics.fillStyle(0xffffff, 0.85 * pulse);
          this.graphics.fillCircle(pixel.x, pixel.y, 3.5);
        } else {
          // 2. Highlight target landing destination tile
          const r = CELL_SIZE * 0.46;

          // Target outer glowing beacon
          this.graphics.fillStyle(targetColor, 0.22 * pulse);
          this.graphics.fillCircle(pixel.x, pixel.y, r + 6 * pulse);

          // Target radiant ring
          this.graphics.lineStyle(2.5, targetColor, 0.9 * pulse);
          this.graphics.strokeCircle(pixel.x, pixel.y, r);

          // Target inner ring
          this.graphics.lineStyle(1.5, 0xffffff, 0.95 * pulse);
          this.graphics.strokeCircle(pixel.x, pixel.y, r - 3);

          // Target landing bullseye
          this.graphics.fillStyle(0xffffff, 0.9 * pulse);
          this.graphics.fillCircle(pixel.x, pixel.y, 4);
        }
      });
    };

    if (reduced) {
      draw(1);
      return;
    }

    const proxy = { pulse: 0.6 };
    draw(proxy.pulse);

    this.pathPulseTween = this.scene.tweens.add({
      targets: proxy,
      pulse: 1.0,
      duration: animDuration(500),
      ease: "Sine.InOut",
      yoyo: true,
      repeat: -1,
      onUpdate: () => {
        draw(proxy.pulse);
      },
    });
  }

  clear(): void {
    if (this.pathPulseTween) {
      this.pathPulseTween.stop();
      this.pathPulseTween = null;
    }
    this.graphics.clear();
  }

  destroy(): void {
    this.clear();
    this.graphics.destroy();
  }

  private getPixelForPosition(color: PlayerColor, position: number): { x: number; y: number } {
    const homeBase = HOME_COL_BASE[color];
    if (position >= homeBase) {
      return homeColPixel(color, position - homeBase);
    }
    return mainPathPixel(position);
  }
}

export default MovePathOverlay;
