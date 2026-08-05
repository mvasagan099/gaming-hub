import Phaser from "phaser";

export default class HUDManager {
  private scene: Phaser.Scene;
  private scoreText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;
  private livesTexts: Phaser.GameObjects.Text[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  create(mode: string): void {
    const depth = 50;
    const w = this.scene.scale.width;

    // Score display
    this.scoreText = this.scene.add.text(24, 24, "Score: 0", {
      fontSize:   "22px",
      color:      "#f59e0b",
      fontFamily: "Outfit, sans-serif",
      fontStyle:  "bold",
      stroke:     "#090d16",
      strokeThickness: 4,
    }).setDepth(depth);

    // Combo display (hidden by default)
    this.comboText = this.scene.add.text(w / 2, 80, "", {
      fontSize:   "28px",
      color:      "#38bdf8",
      fontFamily: "Outfit, sans-serif",
      fontStyle:  "black",
      stroke:     "#090d16",
      strokeThickness: 6,
    }).setOrigin(0.5).setDepth(depth).setAlpha(0);

    if (mode === "zen") {
      // Timer display
      this.timerText = this.scene.add.text(w - 24, 24, "90", {
        fontSize:   "26px",
        color:      "#4ade80",
        fontFamily: "Outfit, sans-serif",
        fontStyle:  "bold",
        stroke:     "#090d16",
        strokeThickness: 4,
      }).setOrigin(1, 0).setDepth(depth);
    } else {
      // Lives display
      for (let i = 0; i < 3; i++) {
        const txt = this.scene.add.text(w - 110 + i * 28, 24, "❤️", {
          fontSize: "20px",
        }).setDepth(depth);
        this.livesTexts.push(txt);
      }
    }
  }

  updateScore(score: number): void {
    this.scoreText.setText(`Score: ${score}`);
    this.scene.tweens.add({
      targets:  this.scoreText,
      scale:    1.15,
      duration: 100,
      yoyo:     true,
      ease:     "Sine.Out",
    });
  }

  updateLives(lives: number): void {
    this.livesTexts.forEach((txt, idx) => {
      if (idx < lives) {
        txt.setAlpha(1);
      } else {
        txt.setAlpha(0.2); // dimmed hearts
      }
    });
  }

  updateTimer(timeLeft: number): void {
    if (this.timerText) {
      this.timerText.setText(Math.ceil(timeLeft).toString());
      if (timeLeft <= 10) {
        this.timerText.setColor("#ef4444"); // Turn red when <10s
      }
    }
  }

  showCombo(comboCount: number, bonus: number): void {
    this.comboText.setText(`${comboCount} FRUIT COMBO! +${bonus}`);
    this.comboText.setAlpha(1);
    this.comboText.setScale(0.5);
    
    // Animate pop and fade out
    this.scene.tweens.add({
       targets: this.comboText,
       scale: 1.2,
       duration: 200,
       ease: "Back.out",
       onComplete: () => {
          this.scene.tweens.add({
             targets: this.comboText,
             alpha: 0,
             y: this.comboText.y - 20,
             duration: 600,
             delay: 400,
             ease: "Power2"
          });
       }
    });
  }

  reset(mode: string): void {
    this.updateScore(0);
    if (mode === "classic") {
      this.updateLives(3);
    }
  }
}
