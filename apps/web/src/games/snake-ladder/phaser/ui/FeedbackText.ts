import Phaser from "phaser";
import { ANIM, animDuration, prefersReducedMotion } from "../constants";

/** Floating text feedback system for Snake & Ladder. */
export class FeedbackText {
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /**
   * Show a floating text at (x, y) that drifts upward and fades out.
   * @returns the text object (caller can chain further if needed)
   */
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

  /** Convenience: show dice result feedback. */
  diceResult(value: number, x: number, y: number): void {
    this.float(`+${value}`, x, y - 30, {
      color: "#fbbf24",
      fontSize: "20px",
      stroke: "#78350f",
    });
  }

  /** Convenience: snake feedback. */
  snakeHit(x: number, y: number): void {
    this.float("SNAKE!", x, y, {
      color: "#ef4444",
      fontSize: "18px",
      stroke: "#7f1d1d",
      duration: 1000,
      distance: 50,
    });
  }

  /** Convenience: ladder feedback. */
  ladderClimb(x: number, y: number): void {
    this.float("LADDER!", x, y, {
      color: "#4ade80",
      fontSize: "18px",
      stroke: "#14532d",
      duration: 1000,
      distance: 50,
    });
  }

  /** Convenience: overshoot feedback. */
  overshoot(x: number, y: number): void {
    this.float("Need exact!", x, y, {
      color: "#fbbf24",
      fontSize: "14px",
      stroke: "#78350f",
      duration: 900,
    });
  }

  /** Convenience: extra turn feedback. */
  extraTurn(x: number, y: number): void {
    this.float("EXTRA TURN!", x, y, {
      color: "#60a5fa",
      fontSize: "14px",
      stroke: "#1e3a5f",
      duration: 900,
    });
  }
}

export default FeedbackText;
