import Phaser from "phaser";
import { ANIM, animDuration, prefersReducedMotion } from "../constants";

/** Floating pill-style text feedback system for modern Ludo. */
export class FeedbackText {
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  float(
    text: string,
    x: number,
    y: number,
    options: {
      color?: string;
      bgColor?: number;
      borderColor?: number;
      fontSize?: string;
      stroke?: string;
      strokeThickness?: number;
      duration?: number;
      distance?: number;
    } = {},
  ): Phaser.GameObjects.Container | null {
    const reduced = prefersReducedMotion();
    const {
      color = "#ffffff",
      bgColor = 0x0f172a,
      borderColor = 0xf59e0b,
      fontSize = "15px",
      duration = ANIM.feedbackFloatDuration,
      distance = ANIM.feedbackFloatDistance,
    } = options;

    if (reduced) return null;

    // Modern pill container
    const container = this.scene.add.container(x, y);
    container.setDepth(200);

    const txt = this.scene.add.text(0, 0, text, {
      fontSize,
      color,
      fontFamily: "Outfit, sans-serif",
      fontStyle: "bold",
    }).setOrigin(0.5);

    const padX = 14;
    const padY = 6;
    const w = txt.width + padX * 2;
    const h = txt.height + padY * 2;
    const r = h / 2;

    const bgGfx = this.scene.add.graphics();
    bgGfx.fillStyle(bgColor, 0.95);
    bgGfx.fillRoundedRect(-w / 2, -h / 2, w, h, r);
    bgGfx.lineStyle(1.5, borderColor, 0.9);
    bgGfx.strokeRoundedRect(-w / 2, -h / 2, w, h, r);

    container.add([bgGfx, txt]);
    container.setScale(0.7).setAlpha(0);

    // Pop in, float up, and fade out
    this.scene.tweens.add({
      targets: container,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      duration: animDuration(150),
      ease: "Back.Out",
      onComplete: () => {
        this.scene.tweens.add({
          targets: container,
          y: y - distance,
          alpha: 0,
          duration: animDuration(duration - 150),
          ease: "Cubic.Out",
          onComplete: () => container.destroy(),
        });
      },
    });

    return container;
  }

  /** Dice result feedback. */
  diceResult(value: number, x: number, y: number): void {
    const isSix = value === 6;
    this.float(isSix ? "🎲 ROLLED 6! 🔥" : `🎲 ROLLED ${value}`, x, y - 28, {
      color: isSix ? "#fbbf24" : "#ffffff",
      bgColor: isSix ? 0x451a03 : 0x0f172a,
      borderColor: isSix ? 0xf59e0b : 0x334155,
      fontSize: isSix ? "16px" : "15px",
    });
  }

  /** Capture feedback. */
  capture(x: number, y: number): void {
    this.float("⚔️ CAPTURED!", x, y, {
      color: "#f87171",
      bgColor: 0x450a0a,
      borderColor: 0xef4444,
      fontSize: "15px",
      duration: 1100,
      distance: 45,
    });
  }

  /** Safe tile feedback. */
  safe(x: number, y: number): void {
    this.float("🛡️ SAFE ZONE", x, y, {
      color: "#4ade80",
      bgColor: 0x052e16,
      borderColor: 0x22c55e,
      fontSize: "14.5px",
      duration: 900,
    });
  }

  /** Token reached home. */
  home(x: number, y: number): void {
    this.float("🏆 HOME GOAL!", x, y, {
      color: "#fbbf24",
      bgColor: 0x451a03,
      borderColor: 0xf59e0b,
      fontSize: "16px",
      duration: 1200,
      distance: 50,
    });
  }

  /** Extra turn (rolled 6). */
  extraTurn(x: number, y: number): void {
    this.float("✨ BONUS TURN!", x, y, {
      color: "#60a5fa",
      bgColor: 0x0f172a,
      borderColor: 0x3b82f6,
      fontSize: "15px",
      duration: 950,
    });
  }

  /** Token entered board. */
  entered(x: number, y: number): void {
    this.float("🚀 ENTERED BOARD", x, y, {
      color: "#a78bfa",
      bgColor: 0x0f172a,
      borderColor: 0x8b5cf6,
      fontSize: "14.5px",
      duration: 850,
    });
  }
}

export default FeedbackText;
