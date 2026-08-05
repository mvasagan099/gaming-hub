import Phaser from "phaser";
import { GameEvents } from "../events/GameEvents";

/** Dot positions for each die face (relative to center, within -20..+20 range) */
const DOT_PATTERNS: Array<Array<[number, number]>> = [
  /* 1 */ [[0, 0]],
  /* 2 */ [[-10, -10], [10, 10]],
  /* 3 */ [[-10, -10], [0, 0], [10, 10]],
  /* 4 */ [[-10, -10], [10, -10], [-10, 10], [10, 10]],
  /* 5 */ [[-10, -10], [10, -10], [0, 0], [-10, 10], [10, 10]],
  /* 6 */ [[-10, -12], [10, -12], [-10, 0], [10, 0], [-10, 12], [10, 12]],
];

export default class DiceManager {
  private scene: Phaser.Scene;
  private container!: Phaser.GameObjects.Container;
  private diceGraphics!: Phaser.GameObjects.Graphics;
  private valueText!: Phaser.GameObjects.Text;
  private rollBtn!: Phaser.GameObjects.Rectangle;
  private rollBtnLabel!: Phaser.GameObjects.Text;
  private value = 1;
  private rolling = false;
  private enabled = true;
  private onRollOverride: (() => void) | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  create(x = 912, y = 280): void {
    // Main dice face graphics (60×60)
    this.diceGraphics = this.scene.add.graphics();
    this.drawDiceFace(this.value);

    // Invisible hit area for the dice face
    const diceHitArea = this.scene.add.rectangle(0, -16, 66, 66, 0xffffff, 0);
    diceHitArea.setInteractive({ useHandCursor: true });
    diceHitArea.on("pointerdown", () => this.roll());
    diceHitArea.on("pointerover", () => {
      if (this.enabled) this.scene.tweens.add({ targets: this.container, scale: 1.05, duration: 100 });
    });
    diceHitArea.on("pointerout", () => {
      this.scene.tweens.add({ targets: this.container, scale: 1.0, duration: 100 });
    });

    // Value text (shown during roll animation between faces)
    this.valueText = this.scene.add.text(0, -16, "", {
      fontSize: "0px",
      color: "#000000",
    }).setOrigin(0.5).setDepth(0);

    // Roll button
    this.rollBtn = this.scene.add.rectangle(0, 42, 150, 38, 0x4f46e5);
    this.rollBtn.setStrokeStyle(2, 0x818cf8);
    this.rollBtn.setInteractive({ useHandCursor: true });
    this.rollBtn.on("pointerdown", () => this.roll());
    this.rollBtn.on("pointerover", () => {
      if (this.enabled) this.rollBtn.setFillStyle(0x6366f1);
    });
    this.rollBtn.on("pointerout", () => {
      this.rollBtn.setFillStyle(0x4f46e5);
    });

    this.rollBtnLabel = this.scene.add.text(0, 42, "🎲  ROLL DICE", {
      fontSize: "13px",
      color: "#ffffff",
      fontFamily: "Outfit, sans-serif",
      fontStyle: "bold",
    }).setOrigin(0.5);

    this.container = this.scene.add.container(x, y, [
      this.diceGraphics,
      diceHitArea,
      this.valueText,
      this.rollBtn,
      this.rollBtnLabel,
    ]);

    // Critical: high depth so dice renders above HUD background panel
    this.container.setDepth(100);
  }

  /** Draw dice face with dots using Graphics */
  private drawDiceFace(face: number): void {
    this.diceGraphics.clear();

    const s = 30; // half-size → 60×60 dice
    const r = 8;  // corner radius

    // White background with rounded corners
    this.diceGraphics.fillStyle(0xffffff, 1);
    this.diceGraphics.fillRoundedRect(-s, -s - 16, s * 2, s * 2, r);

    // Border
    this.diceGraphics.lineStyle(2, 0x1e293b, 1);
    this.diceGraphics.strokeRoundedRect(-s, -s - 16, s * 2, s * 2, r);

    // Dots
    const clampedFace = Math.max(1, Math.min(face, 6));
    const dots = DOT_PATTERNS[clampedFace - 1] ?? DOT_PATTERNS[0];
    this.diceGraphics.fillStyle(0x1e293b, 1);
    for (const [dx, dy] of dots) {
      this.diceGraphics.fillCircle(dx, dy - 16, 5);
    }
  }

  enable(): void {
    this.enabled = true;
    this.rollBtn.setFillStyle(0x4f46e5);
    this.rollBtn.setAlpha(1);
    this.rollBtn.setInteractive({ useHandCursor: true });
    this.rollBtnLabel.setText("🎲  ROLL DICE");
    this.rollBtnLabel.setAlpha(1);
  }

  disable(): void {
    this.enabled = false;
    this.rollBtn.setFillStyle(0x1e293b);
    this.rollBtn.setAlpha(0.6);
    this.rollBtn.disableInteractive();
    this.rollBtnLabel.setAlpha(0.5);
  }

  /** Visually show 'waiting' state without blocking programmatic rolls */
  setWaiting(playerName: string): void {
    // Only disable the interactive button — do NOT set this.enabled = false
    // so that rollForAI() can still proceed.
    this.rollBtn.setFillStyle(0x1e293b);
    this.rollBtn.setAlpha(0.6);
    this.rollBtn.disableInteractive();
    this.rollBtnLabel.setText(`${playerName}'s turn…`);
    this.rollBtnLabel.setAlpha(0.7);
  }

  getValue(): number {
    return this.value;
  }

  /** Human player click — requires enabled state */
  roll(): void {
    if (this.rolling || !this.enabled) return;
    // Server-authoritative mode: the click is forwarded instead of rolled locally.
    if (this.onRollOverride) {
      this.onRollOverride();
      return;
    }
    this.startRoll();
  }

  /** AI-triggered roll — bypasses the enabled guard (AI doesn't click) */
  rollForAI(): void {
    // Force reset rolling state for AI to prevent getting stuck if a tween failed
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

  /** Override the roll button label (e.g. "Player 2's turn…"). */
  setPrompt(text: string): void {
    this.rollBtnLabel.setText(text);
    this.rollBtnLabel.setAlpha(1);
  }

  private startRoll(forced?: number): void {
    this.rolling = true;
    this.disable();
    this.scene.events.emit(GameEvents.DICE_ROLL_STARTED);

    let count = 0;
    const totalFrames = 12;

    const tick = () => {
      count++;
      const temp = Phaser.Math.Between(1, 6);
      this.drawDiceFace(temp);

      this.scene.tweens.add({
        targets: this.container,
        scale: count % 2 === 0 ? 1.1 : 0.95,
        duration: 55,
        ease: "Sine.InOut",
      });

      if (count < totalFrames) {
        this.scene.time.delayedCall(65, tick);
      } else {
        this.finishRoll(forced);
      }
    };

    tick();
  }

  private bias: 'high' | 'normal' = 'normal';

  setBias(bias: 'high' | 'normal'): void {
     this.bias = bias;
  }

  private finishRoll(forced?: number): void {
    let value: number;
    if (forced !== undefined) {
      value = forced;
    } else if (this.bias === 'high') {
      value = Phaser.Math.Between(4, 6);
    } else {
      value = Phaser.Math.Between(1, 6);
    }
    this.value = value;
    this.drawDiceFace(this.value);

    // Landing bounce
    this.scene.tweens.add({
      targets: this.container,
      scale: 1.2,
      duration: 120,
      ease: "Back.Out",
      yoyo: true,
      onComplete: () => {
        this.container.setScale(1);
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
    this.enable();
  }
}

export { DiceManager };
