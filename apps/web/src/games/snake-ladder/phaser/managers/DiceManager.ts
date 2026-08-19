import Phaser from "phaser";
import { GameEvents } from "../events/GameEvents";
import { ANIM, animDuration, prefersReducedMotion } from "../constants";

/** Dot positions for each die face (relative to center, within -24..+24 range) */
const DOT_PATTERNS: Array<Array<[number, number]>> = [
  /* 1 */ [[0, 0]],
  /* 2 */ [[-12, -12], [12, 12]],
  /* 3 */ [[-12, -12], [0, 0], [12, 12]],
  /* 4 */ [[-12, -12], [12, -12], [-12, 12], [12, 12]],
  /* 5 */ [[-12, -12], [12, -12], [0, 0], [-12, 12], [12, 12]],
  /* 6 */ [[-12, -14], [12, -14], [-12, 0], [12, 0], [-12, 14], [12, 14]],
];

const DICE_SIZE = 35; // half-size → 70×70 dice
const DICE_CORNER_RADIUS = 10;

export default class DiceManager {
  private scene: Phaser.Scene;
  private container!: Phaser.GameObjects.Container;
  private diceGraphics!: Phaser.GameObjects.Graphics;
  private valueText!: Phaser.GameObjects.Text;
  private rollBtn!: Phaser.GameObjects.Graphics;
  private rollBtnLabel!: Phaser.GameObjects.Text;
  private value = 1;
  private rolling = false;
  private enabled = true;
  private onRollOverride: (() => void) | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  create(x = 912, y = 210): void {
    const reduced = prefersReducedMotion();

    // ── Dice face graphics (70×70) ──────────────────────────────────────
    this.diceGraphics = this.scene.add.graphics();
    this.drawDiceFace(this.value);

    // Invisible hit area for the dice face
    const diceHitArea = this.scene.add.rectangle(0, -18, DICE_SIZE * 2 + 8, DICE_SIZE * 2 + 8, 0xffffff, 0);
    diceHitArea.setInteractive({ useHandCursor: true });
    diceHitArea.on("pointerdown", () => this.roll());
    diceHitArea.on("pointerover", () => {
      if (this.enabled && !reduced) {
        this.scene.tweens.add({ targets: this.container, scale: 1.06, duration: 100 });
      }
    });
    diceHitArea.on("pointerout", () => {
      if (!reduced) {
        this.scene.tweens.add({ targets: this.container, scale: 1.0, duration: 100 });
      }
    });

    // Value text (hidden, used for intermediate frames)
    this.valueText = this.scene.add.text(0, -18, "", {
      fontSize: "0px",
      color: "#000000",
    }).setOrigin(0.5).setDepth(0);

    // ── Modern Roll Button ──────────────────────────────────────────────
    this.rollBtn = this.scene.add.graphics();
    this.drawRollButton(false);

    const btnHitArea = this.scene.add.rectangle(0, 48, 170, 42, 0xffffff, 0);
    btnHitArea.setInteractive({ useHandCursor: true });
    btnHitArea.on("pointerdown", () => this.roll());
    btnHitArea.on("pointerover", () => {
      if (this.enabled) this.drawRollButton(true);
    });
    btnHitArea.on("pointerout", () => {
      if (this.enabled) this.drawRollButton(false);
    });

    this.rollBtnLabel = this.scene.add.text(0, 48, "ROLL DICE", {
      fontSize: "14px",
      color: "#ffffff",
      fontFamily: "Outfit, sans-serif",
      fontStyle: "bold",
      stroke: "#312e81",
      strokeThickness: 1,
    }).setOrigin(0.5);

    this.container = this.scene.add.container(x, y, [
      this.diceGraphics,
      diceHitArea,
      this.valueText,
      this.rollBtn,
      btnHitArea,
      this.rollBtnLabel,
    ]);

    this.container.setDepth(100);
  }

  private drawRollButton(hover: boolean): void {
    this.rollBtn.clear();
    // Button background
    this.rollBtn.fillStyle(hover ? 0x6366f1 : 0x4f46e5, 1);
    this.rollBtn.fillRoundedRect(-85, 27, 170, 42, 10);
    // Border
    this.rollBtn.lineStyle(2, 0x818cf8, 0.8);
    this.rollBtn.strokeRoundedRect(-85, 27, 170, 42, 10);
    // Top highlight
    this.rollBtn.fillStyle(0x818cf8, 0.2);
    this.rollBtn.fillRoundedRect(-85, 27, 170, 14, { tl: 10, tr: 10, bl: 0, br: 0 });
  }

  private drawDisabledButton(): void {
    this.rollBtn.clear();
    this.rollBtn.fillStyle(0x1e293b, 1);
    this.rollBtn.fillRoundedRect(-85, 27, 170, 42, 10);
    this.rollBtn.lineStyle(1, 0x334155, 0.5);
    this.rollBtn.strokeRoundedRect(-85, 27, 170, 42, 10);
  }

  /** Draw dice face with dots using Graphics */
  private drawDiceFace(face: number): void {
    this.diceGraphics.clear();
    const s = DICE_SIZE;
    const r = DICE_CORNER_RADIUS;
    const cy = -18;

    // Drop shadow
    this.diceGraphics.fillStyle(0x000000, 0.2);
    this.diceGraphics.fillRoundedRect(-s + 3, cy - s + 3, s * 2, s * 2, r);

    // White background with rounded corners
    this.diceGraphics.fillStyle(0xffffff, 1);
    this.diceGraphics.fillRoundedRect(-s, cy - s, s * 2, s * 2, r);

    // Border
    this.diceGraphics.lineStyle(2.5, 0x334155, 1);
    this.diceGraphics.strokeRoundedRect(-s, cy - s, s * 2, s * 2, r);

    // Top-left highlight
    this.diceGraphics.fillStyle(0xffffff, 0.5);
    this.diceGraphics.fillRoundedRect(-s + 2, cy - s + 2, s * 2 - 4, 6, { tl: r - 2, tr: r - 2, bl: 0, br: 0 });

    // Dots
    const clampedFace = Math.max(1, Math.min(face, 6));
    const dots = DOT_PATTERNS[clampedFace - 1] ?? DOT_PATTERNS[0];
    for (const [dx, dy] of dots) {
      // Dot shadow
      this.diceGraphics.fillStyle(0x000000, 0.15);
      this.diceGraphics.fillCircle(dx + 1, dy + cy + 1, 6);
      // Dot
      this.diceGraphics.fillStyle(0x1e293b, 1);
      this.diceGraphics.fillCircle(dx, dy + cy, 6);
      // Dot highlight
      this.diceGraphics.fillStyle(0x475569, 0.3);
      this.diceGraphics.fillCircle(dx - 1.5, dy + cy - 1.5, 2.5);
    }
  }

  enable(): void {
    this.enabled = true;
    this.drawRollButton(false);
    this.rollBtnLabel.setAlpha(1);
    this.rollBtnLabel.setText("ROLL DICE");
    this.container.setAlpha(1);
  }

  disable(): void {
    this.enabled = false;
    this.drawDisabledButton();
    this.rollBtnLabel.setAlpha(0.4);
    this.rollBtnLabel.setText("ROLL DICE");
    this.container.setAlpha(0.7);
  }

  /** Visually show 'waiting' state without blocking programmatic rolls */
  setWaiting(playerName: string): void {
    this.drawDisabledButton();
    this.rollBtnLabel.setAlpha(0.6);
    this.rollBtnLabel.setText(`${playerName}'s turn...`);
    this.container.setAlpha(0.7);
  }

  getValue(): number {
    return this.value;
  }

  /** Human player click — requires enabled state */
  roll(): void {
    if (this.rolling || !this.enabled) return;
    if (this.onRollOverride) {
      this.onRollOverride();
      return;
    }
    this.startRoll();
  }

  /** AI-triggered roll — bypasses the enabled guard */
  rollForAI(): void {
    this.rolling = false;
    this.startRoll();
  }

  /** Route human clicks to an external handler (multiplayer driver). */
  setOnRoll(handler: (() => void) | null): void {
    this.onRollOverride = handler;
  }

  /** Set the dice face instantly from an authoritative value. */
  setValue(value: number): void {
    this.value = Phaser.Math.Clamp(Math.round(value), 1, 6);
    this.drawDiceFace(this.value);
  }

  /** Animate a shuffle that lands on an authoritative value. */
  rollTo(value: number): void {
    this.rolling = false;
    this.startRoll(Phaser.Math.Clamp(Math.round(value), 1, 6));
  }

  /** Override the roll button label. */
  setPrompt(text: string): void {
    this.rollBtnLabel.setText(text);
    this.rollBtnLabel.setAlpha(1);
  }

  private startRoll(forced?: number): void {
    this.rolling = true;
    this.disable();
    this.scene.events.emit(GameEvents.DICE_ROLL_STARTED);

    const reduced = prefersReducedMotion();
    if (reduced) {
      // Skip animation, go straight to result
      const value = forced ?? Phaser.Math.Between(1, 6);
      this.value = value;
      this.drawDiceFace(value);
      this.rolling = false;
      this.scene.events.emit(GameEvents.DICE_ROLLED, value);
      return;
    }

    let count = 0;
    const totalFrames = ANIM.diceRollFrames;

    const tick = () => {
      count++;
      const temp = Phaser.Math.Between(1, 6);
      this.drawDiceFace(temp);

      // Shuffle scale + rotation
      this.scene.tweens.add({
        targets: this.container,
        scale: count % 2 === 0 ? 1.08 : 0.92,
        angle: Phaser.Math.Between(-12, 12),
        duration: animDuration(50),
        ease: "Sine.InOut",
      });

      if (count < totalFrames) {
        this.scene.time.delayedCall(animDuration(ANIM.diceFrameDelay), tick);
      } else {
        this.finishRoll(forced);
      }
    };

    tick();
  }

  private bias: "high" | "normal" = "normal";

  setBias(bias: "high" | "normal"): void {
    this.bias = bias;
  }

  private finishRoll(forced?: number): void {
    let value: number;
    if (forced !== undefined) {
      value = forced;
    } else if (this.bias === "high") {
      value = Phaser.Math.Between(4, 6);
    } else {
      value = Phaser.Math.Between(1, 6);
    }
    this.value = value;
    this.drawDiceFace(this.value);

    const reduced = prefersReducedMotion();
    if (reduced) {
      this.container.setScale(1);
      this.container.setAngle(0);
      this.rolling = false;
      this.scene.events.emit(GameEvents.DICE_ROLLED, this.value);
      return;
    }

    // Landing bounce with rotation reset
    this.scene.tweens.add({
      targets: this.container,
      scale: ANIM.diceLandingScale,
      angle: 0,
      duration: animDuration(ANIM.diceLandingDuration),
      ease: "Back.Out",
      yoyo: true,
      onComplete: () => {
        this.container.setScale(1);
        this.container.setAngle(0);
        this.rolling = false;
        this.scene.events.emit(GameEvents.DICE_ROLLED, this.value);
      },
    });
  }

  unlock(): void {
    this.enable();
  }

  reset(): void {
    this.rolling = false;
    this.value = 1;
    this.drawDiceFace(1);
    this.container.setAngle(0);
    this.enable();
  }
}

export { DiceManager };
