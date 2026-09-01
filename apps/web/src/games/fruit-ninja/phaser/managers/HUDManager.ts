import Phaser from "phaser";
import { FRUIT_NINJA_VISUAL_CONFIG, prefersReducedMotion } from "../constants/fruitNinjaVisualConfig";

export default class HUDManager {
  private scene: Phaser.Scene;
  private scoreCard!: Phaser.GameObjects.Container;
  private scoreText!: Phaser.GameObjects.Text;
  private scoreBgGfx!: Phaser.GameObjects.Graphics;
  private timerText!: Phaser.GameObjects.Text;
  private timerBox!: Phaser.GameObjects.Container;
  private timerBgGfx!: Phaser.GameObjects.Graphics;
  private comboContainer!: Phaser.GameObjects.Container;
  private comboText!: Phaser.GameObjects.Text;
  private comboBonusText!: Phaser.GameObjects.Text;
  private livesBox?: Phaser.GameObjects.Container;
  private livesHearts: Phaser.GameObjects.Text[] = [];
  private oppScoreText?: Phaser.GameObjects.Text;
  private oppCard?: Phaser.GameObjects.Container;

  private currentScore = 0;
  private displayedScore = 0;
  private scoreTween?: Phaser.Tweens.Tween;
  private timerPulseTween?: Phaser.Tweens.Tween;
  private heartBeatTweens: Phaser.Tweens.Tween[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  create(mode: string, isMultiplayer = false): void {
    const depth = 50;
    const w = this.scene.scale.width;
    const reduced = prefersReducedMotion();

    // ── 1. Modern High-Gloss Pill Score Card (Top-Left) ──
    this.scoreCard = this.scene.add.container(20, -70).setDepth(depth);
    this.scoreBgGfx = this.scene.add.graphics();
    this.drawPillBg(this.scoreBgGfx, 0, 0, 148, 48, 0x0f172a, 0xf59e0b);

    const scoreLabel = this.scene.add.text(14, 6, "★ SCORE", {
      fontSize: "10px",
      fontFamily: "Outfit, sans-serif",
      fontStyle: "bold",
      color: "#f59e0b",
      stroke: "#000000",
      strokeThickness: 2,
    });

    this.scoreText = this.scene.add.text(14, 18, "0", {
      fontSize: "22px",
      fontFamily: "Outfit, monospace",
      fontStyle: "bold",
      color: "#ffffff",
      stroke: "#090d16",
      strokeThickness: 3,
    });

    this.scoreCard.add([this.scoreBgGfx, scoreLabel, this.scoreText]);

    // ── 2. Multiplayer Opponent Score Card ──
    if (isMultiplayer) {
      this.oppCard = this.scene.add.container(20, -70).setDepth(depth);
      const oppBgGfx = this.scene.add.graphics();
      this.drawPillBg(oppBgGfx, 0, 0, 148, 38, 0x0f172a, 0x38bdf8);

      const oppLabel = this.scene.add.text(12, 4, "⚡ OPPONENT", {
        fontSize: "8px",
        fontFamily: "Outfit, sans-serif",
        fontStyle: "bold",
        color: "#38bdf8",
      });

      this.oppScoreText = this.scene.add.text(12, 14, "0", {
        fontSize: "16px",
        fontFamily: "Outfit, monospace",
        fontStyle: "bold",
        color: "#ffffff",
      });

      this.oppCard.add([oppBgGfx, oppLabel, this.oppScoreText]);
    }

    // ── 3. Digital Arcade Timer Pill (Top-Center) ──
    this.timerBox = this.scene.add.container(w / 2, -70).setDepth(depth);
    this.timerBgGfx = this.scene.add.graphics();
    this.drawPillBg(this.timerBgGfx, -50, 0, 100, 48, 0x0f172a, 0x10b981);

    const timerLabel = this.scene.add.text(0, 6, "⏱ TIME", {
      fontSize: "10px",
      fontFamily: "Outfit, sans-serif",
      fontStyle: "bold",
      color: "#10b981",
      stroke: "#000000",
      strokeThickness: 2,
    }).setOrigin(0.5, 0);

    this.timerText = this.scene.add.text(0, 18, "60", {
      fontSize: "22px",
      fontFamily: "Outfit, monospace",
      fontStyle: "bold",
      color: "#ffffff",
      stroke: "#090d16",
      strokeThickness: 3,
    }).setOrigin(0.5, 0);

    this.timerBox.add([this.timerBgGfx, timerLabel, this.timerText]);

    // ── 4. Stylized 3D Heart Lives (Top-Right) ──
    if (mode !== "zen") {
      this.livesBox = this.scene.add.container(w - 148, -70).setDepth(depth);
      const livesBgGfx = this.scene.add.graphics();
      this.drawPillBg(livesBgGfx, 0, 0, 128, 48, 0x0f172a, 0xef4444);

      const livesLabel = this.scene.add.text(14, 6, "♥ LIVES", {
        fontSize: "10px",
        fontFamily: "Outfit, sans-serif",
        fontStyle: "bold",
        color: "#ef4444",
        stroke: "#000000",
        strokeThickness: 2,
      });

      this.livesBox.add([livesBgGfx, livesLabel]);

      this.livesHearts = [];
      for (let i = 0; i < 3; i++) {
        const heart = this.scene.add.text(18 + i * 34, 18, "❤️", {
          fontSize: "18px",
        });
        this.livesBox.add(heart);
        this.livesHearts.push(heart);

        // Idle gentle heartbeat pulse
        if (!reduced) {
          const t = this.scene.tweens.add({
            targets: heart,
            scaleX: 1.12,
            scaleY: 1.12,
            duration: 700,
            yoyo: true,
            repeat: -1,
            delay: i * 180,
            ease: "Sine.InOut",
          });
          this.heartBeatTweens.push(t);
        }
      }
    }

    // ── 5. Dynamic Combo Banner Container (Center Screen) ──
    this.comboContainer = this.scene.add.container(w / 2, 130).setDepth(depth).setAlpha(0);
    const comboGfx = this.scene.add.graphics();
    comboGfx.fillStyle(0x0f172a, 0.95);
    comboGfx.fillRoundedRect(-130, -32, 260, 64, 20);
    comboGfx.lineStyle(2.5, 0xf59e0b, 0.95);
    comboGfx.strokeRoundedRect(-130, -32, 260, 64, 20);

    this.comboText = this.scene.add.text(0, -12, "3x COMBO!", {
      fontSize: "24px",
      fontFamily: "Outfit, sans-serif",
      fontStyle: "black",
      color: "#facc15",
      stroke: "#0f172a",
      strokeThickness: 6,
    }).setOrigin(0.5);

    this.comboBonusText = this.scene.add.text(0, 14, "+30 BONUS POINTS", {
      fontSize: "12px",
      fontFamily: "Outfit, sans-serif",
      fontStyle: "bold",
      color: "#4ade80",
    }).setOrigin(0.5);

    this.comboContainer.add([comboGfx, this.comboText, this.comboBonusText]);

    // ── 6. Staggered Entrance Slide-Down Animation ──
    this.animateHUDEntrance();
  }

  /**
   * Draws a beveled, high-gloss glassmorphic pill background with glowing border
   */
  private drawPillBg(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    w: number,
    h: number,
    bgColor: number,
    accentColor: number
  ): void {
    g.clear();

    // 1. Drop shadow
    g.fillStyle(0x000000, 0.45);
    g.fillRoundedRect(x + 2, y + 4, w, h, 16);

    // 2. Base dark glass fill
    g.fillStyle(bgColor, 0.92);
    g.fillRoundedRect(x, y, w, h, 16);

    // 3. Top-edge gloss specular highlight
    g.fillStyle(0xffffff, 0.12);
    g.fillRoundedRect(x + 3, y + 2, w - 6, h * 0.4, 12);

    // 4. Accent border with ambient glow
    g.lineStyle(2.2, accentColor, 0.85);
    g.strokeRoundedRect(x, y, w, h, 16);

    // 5. Hairline inner glow
    g.lineStyle(1.0, 0xffffff, 0.35);
    g.strokeRoundedRect(x + 1.5, y + 1.5, w - 3, h - 3, 14);
  }

  // ─── Staggered Entrance Animation ──────────────────────────────────────────

  private animateHUDEntrance(): void {
    const targets = [
      { obj: this.scoreCard, targetY: 18, delay: 0 },
      { obj: this.timerBox,  targetY: 18, delay: 100 },
      ...(this.livesBox ? [{ obj: this.livesBox, targetY: 18, delay: 200 }] : []),
      ...(this.oppCard ? [{ obj: this.oppCard, targetY: 72, delay: 150 }] : []),
    ];

    targets.forEach(({ obj, targetY, delay }) => {
      this.scene.tweens.add({
        targets: obj,
        y: targetY,
        duration: 500,
        delay,
        ease: "Back.Out",
      });
    });
  }

  // ─── Score Animation with Number Roll & Pop ────────────────────────────────

  updateScore(score: number): void {
    this.currentScore = score;

    // Number Roll-Up Animation
    const startScore = this.displayedScore;
    const diff = score - startScore;

    if (this.scoreTween) this.scoreTween.stop();

    const scoreProxy = { val: startScore };
    this.scoreTween = this.scene.tweens.add({
      targets: scoreProxy,
      val: score,
      duration: Math.min(400, Math.max(150, diff * 15)),
      ease: "Quad.Out",
      onUpdate: () => {
        this.displayedScore = Math.floor(scoreProxy.val);
        this.scoreText.setText(this.displayedScore.toLocaleString());
      },
      onComplete: () => {
        this.displayedScore = score;
        this.scoreText.setText(score.toLocaleString());
      },
    });

    // Score Card Bouncy Elastic Punch
    this.scene.tweens.add({
      targets: this.scoreCard,
      scaleX: 1.15,
      scaleY: 1.15,
      duration: 120,
      yoyo: true,
      ease: "Back.Out",
    });

    // Golden Text Flash
    this.scoreText.setColor("#fef08a");
    this.scene.time.delayedCall(160, () => {
      this.scoreText.setColor("#ffffff");
    });
  }

  updateOpponentScore(score: number): void {
    if (this.oppScoreText) {
      this.oppScoreText.setText(score.toLocaleString());
      if (this.oppCard) {
        this.scene.tweens.add({
          targets: this.oppCard,
          scaleX: 1.08,
          scaleY: 1.08,
          duration: 100,
          yoyo: true,
        });
      }
    }
  }

  // ─── Lives Animation with Slash & Break ────────────────────────────────────

  updateLives(lives: number): void {
    this.livesHearts.forEach((heart, idx) => {
      if (idx >= lives && heart.text === "❤️") {
        // Dramatic Heart Slash & Shatter Animation
        heart.setText("💔");

        this.scene.tweens.add({
          targets: heart,
          scaleX: 1.6,
          scaleY: 1.6,
          angle: Phaser.Math.Between(-25, 25),
          duration: 200,
          ease: "Back.Out",
          onComplete: () => {
            this.scene.tweens.add({
              targets: heart,
              alpha: 0.25,
              scaleX: 0.9,
              scaleY: 0.9,
              duration: 350,
              ease: "Quad.In",
            });
          },
        });

        // Red Vignette Flash on Life Loss
        const redFlash = this.scene.add.rectangle(
          this.scene.scale.width / 2,
          this.scene.scale.height / 2,
          this.scene.scale.width,
          this.scene.scale.height,
          0xef4444,
          0.22
        ).setDepth(45);

        this.scene.tweens.add({
          targets: redFlash,
          alpha: 0,
          duration: 300,
          onComplete: () => redFlash.destroy(),
        });
      }
    });
  }

  // ─── Digital Timer Animation with Heartbeat Pulse ──────────────────────────

  updateTimer(timeLeft: number): void {
    if (!this.timerText) return;

    const seconds = Math.ceil(timeLeft);
    this.timerText.setText(seconds.toString());

    if (seconds <= 5) {
      // Red Critical Heartbeat Pulse
      this.drawPillBg(this.timerBgGfx, -50, 0, 100, 48, 0x450a0a, 0xef4444);
      this.timerText.setColor("#f87171");

      this.scene.tweens.add({
        targets: this.timerBox,
        scaleX: 1.18,
        scaleY: 1.18,
        duration: 160,
        yoyo: true,
        ease: "Sine.InOut",
      });
    } else if (seconds <= 10) {
      // Amber Warning Glow
      this.drawPillBg(this.timerBgGfx, -50, 0, 100, 48, 0x3b1c06, 0xf59e0b);
      this.timerText.setColor("#fbbf24");

      this.scene.tweens.add({
        targets: this.timerBox,
        scaleX: 1.08,
        scaleY: 1.08,
        duration: 250,
        yoyo: true,
        ease: "Sine.InOut",
      });
    }
  }

  // ─── Dynamic Combo Banner Animation ────────────────────────────────────────

  showCombo(comboCount: number, bonus: number): void {
    const tier = FRUIT_NINJA_VISUAL_CONFIG.combos.tiers.find((t) => t.count === comboCount) || {
      label: `${comboCount}x COMBO!`,
      color: "#f59e0b",
      scale: 1.3,
    };

    this.comboText.setText(tier.label);
    this.comboText.setColor(tier.color);
    this.comboBonusText.setText(`+${bonus} BONUS POINTS!`);

    this.comboContainer.setAlpha(1);
    this.comboContainer.setScale(0.3);
    this.comboContainer.setAngle(-6);

    // Pop in with spring bounce
    this.scene.tweens.add({
      targets: this.comboContainer,
      scaleX: tier.scale,
      scaleY: tier.scale,
      angle: 0,
      duration: 240,
      ease: "Back.Out",
      onComplete: () => {
        this.scene.tweens.add({
          targets: this.comboContainer,
          alpha: 0,
          y: this.comboContainer.y - 25,
          scaleX: tier.scale * 0.85,
          scaleY: tier.scale * 0.85,
          duration: 400,
          delay: 450,
          ease: "Quad.In",
          onComplete: () => {
            this.comboContainer.y = 130;
          },
        });
      },
    });
  }

  // ─── Cinematic Match Start 3-2-1 SLICE Intro ───────────────────────────────

  playStartIntro(onComplete: () => void): void {
    const w = this.scene.scale.width;
    const h = this.scene.scale.height;

    const countText = this.scene.add.text(w / 2, h / 2, "3", {
      fontSize: "76px",
      fontFamily: "Outfit, sans-serif",
      fontStyle: "black",
      color: "#facc15",
      stroke: "#0f172a",
      strokeThickness: 9,
    }).setOrigin(0.5).setDepth(100);

    const steps = ["3", "2", "1", "SLICE!"];
    let stepIdx = 0;

    const nextStep = () => {
      if (stepIdx >= steps.length) {
        countText.destroy();
        onComplete();
        return;
      }

      countText.setText(steps[stepIdx]!);
      countText.setScale(0.3);
      countText.setAlpha(1);

      if (steps[stepIdx] === "SLICE!") {
        countText.setColor("#ef4444");
        countText.setFontSize(84);
      }

      this.scene.tweens.add({
        targets: countText,
        scaleX: 1.2,
        scaleY: 1.2,
        duration: 320,
        ease: "Back.Out",
        onComplete: () => {
          this.scene.tweens.add({
            targets: countText,
            alpha: 0,
            duration: 130,
            onComplete: () => {
              stepIdx++;
              nextStep();
            },
          });
        },
      });
    };

    nextStep();
  }
}
