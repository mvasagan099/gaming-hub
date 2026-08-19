import Phaser from "phaser";
import { ANIM, animDuration, prefersReducedMotion } from "../constants";

/** Floating text feedback system for Ludo. */
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
      fontSize?: string;
      stroke?: string;
      strokeThickness?: number;
      duration?: number;
      distance?: number;
    } = {},
  ): Phaser.GameObjects.Text | null {
    const reduced = prefersReducedMotion();
    const {
      color = "#ffffff",
      fontSize = "16px",
      stroke = "#000000",
      strokeThickness = 3,
      duration = ANIM.feedbackFloatDuration,
      distance = ANIM.feedbackFloatDistance,
    } = options;

    if (reduced) return null;

    const txt = this.scene.add.text(x, y, text, {
      fontSize,
      color,
      fontFamily: "Outfit, sans-serif",
      fontStyle: "bold",
      stroke,
      strokeThickness,
    }).setOrigin(0.5).setDepth(200);

    this.scene.tweens.add({
      targets: txt,
      y: y - distance,
      alpha: 0,
      duration: animDuration(duration),
      ease: "Cubic.Out",
      onComplete: () => txt.destroy(),
    });

    return txt;
  }

  /** Dice result feedback. */
  diceResult(value: number, x: number, y: number): void {
    this.float(`${value}`, x, y - 28, {
      color: value === 6 ? "#fbbf24" : "#ffffff",
      fontSize: value === 6 ? "22px" : "18px",
      stroke: value === 6 ? "#78350f" : "#1e293b",
    });
  }

  /** Capture feedback. */
  capture(x: number, y: number): void {
    this.float("CAPTURED!", x, y, {
      color: "#ef4444",
      fontSize: "16px",
      stroke: "#7f1d1d",
      duration: 1000,
      distance: 45,
    });
  }

  /** Safe tile feedback. */
  safe(x: number, y: number): void {
    this.float("SAFE", x, y, {
      color: "#4ade80",
      fontSize: "14px",
      stroke: "#14532d",
      duration: 800,
    });
  }

  /** Token reached home. */
  home(x: number, y: number): void {
    this.float("HOME!", x, y, {
      color: "#fbbf24",
      fontSize: "18px",
      stroke: "#78350f",
      duration: 1100,
      distance: 45,
    });
  }

  /** Extra turn (rolled 6). */
  extraTurn(x: number, y: number): void {
    this.float("EXTRA TURN!", x, y, {
      color: "#60a5fa",
      fontSize: "14px",
      stroke: "#1e3a5f",
      duration: 900,
    });
  }

  /** Token entered board. */
  entered(x: number, y: number): void {
    this.float("OUT!", x, y, {
      color: "#a78bfa",
      fontSize: "14px",
      stroke: "#4c1d95",
      duration: 800,
    });
  }
}

export default FeedbackText;
