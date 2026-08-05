import Phaser from "phaser";
import type { FruitDef } from "../types/fruit.types";

export class ScoreManager {
  private scene: Phaser.Scene;
  private score = 0;
  private comboCount = 0;
  private lastSliceTime = 0;
  private readonly comboWindow = 350; // time in ms to stack combo slices

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  registerSlice(def: FruitDef): number {
    const now = this.scene.time.now;
    this.score += def.points;

    // Check if within combo window
    if (now - this.lastSliceTime < this.comboWindow) {
      this.comboCount++;
    } else {
      // Evaluate last combo if any
      this.evaluateCombo();
      this.comboCount = 1; // start new combo count
    }

    this.lastSliceTime = now;
    return this.score;
  }

  evaluateCombo(): void {
    if (this.comboCount >= 3) {
      const bonus = this.comboCount; // 3 points for 3x combo, etc.
      this.score += bonus;

      // Emit visual combo popup text
      const x = this.scene.input.activePointer.x;
      const y = Math.max(120, this.scene.input.activePointer.y - 40);
      this.showComboPopup(x, y, this.comboCount);
    }
    this.comboCount = 0;
  }

  private showComboPopup(x: number, y: number, count: number): void {
    const textStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontSize:   "26px",
      color:      "#f59e0b", // Gold color
      fontFamily: "Outfit, sans-serif",
      fontStyle:  "bold",
      stroke:     "#0f172a",
      strokeThickness: 5,
    };

    const txt = this.scene.add.text(x, y, `${count}x COMBO!`, textStyle).setOrigin(0.5);
    txt.setDepth(50);
    txt.setScale(0.5);

    // Bounce and fade animation
    this.scene.tweens.add({
      targets:  txt,
      scale:    1.2,
      y:        y - 50,
      duration: 350,
      ease:     "Back.Out",
      onComplete: () => {
        this.scene.tweens.add({
          targets:  txt,
          alpha:    0,
          scale:    0.8,
          duration: 300,
          delay:    300,
          onComplete: () => txt.destroy(),
        });
      },
    });
  }

  getScore(): number {
    return this.score;
  }

  addPoints(points: number): void {
     this.score += points;
  }

  reset(): void {
    this.score = 0;
    this.comboCount = 0;
    this.lastSliceTime = 0;
  }
}

export default ScoreManager;
