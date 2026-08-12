import Phaser from "phaser";
import { LudoEvents } from "../events/LudoEvents";

const DOT_PATTERNS: Array<Array<[number, number]>> = [
  /* 1 */ [[0, 0]],
  /* 2 */ [[-10, -10], [10, 10]],
  /* 3 */ [[-10, -10], [0, 0], [10, 10]],
  /* 4 */ [[-10, -10], [10, -10], [-10, 10], [10, 10]],
  /* 5 */ [[-10, -10], [10, -10], [0, 0], [-10, 10], [10, 10]],
  /* 6 */ [[-10, -12], [10, -12], [-10, 0], [10, 0], [-10, 12], [10, 12]],
];

export default class DiceManager {
  private scene:        Phaser.Scene;
  private container!:  Phaser.GameObjects.Container;
  private diceGfx!:    Phaser.GameObjects.Graphics;
  private hitArea!:    Phaser.GameObjects.Rectangle;
  private rollBtn!:    Phaser.GameObjects.Rectangle;
  private rollLabel!:  Phaser.GameObjects.Text;

  private value      = 1;
  private rolling    = false;
  private enabled    = true;
  private selectMode = false;
  private onRollCb: (() => void) | null = null;
  private onRollCompleteCb: (() => void) | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  create(x = 912, y = 280): void {
    this.diceGfx = this.scene.add.graphics();
    this.drawFace(this.value);

    // Invisible click target on the dice face
    this.hitArea = this.scene.add.rectangle(0, -16, 66, 66, 0xffffff, 0);
    this.hitArea.setInteractive({ useHandCursor: true });
    this.hitArea.on("pointerdown", () => this.handlePointerDown());
    this.hitArea.on("pointerover", () => { if (this.enabled) this.scene.tweens.add({ targets: this.container, scale: 1.05, duration: 100 }); });
    this.hitArea.on("pointerout",  () => { this.scene.tweens.add({ targets: this.container, scale: 1.0,  duration: 100 }); });

    // Roll button
    this.rollBtn = this.scene.add.rectangle(0, 44, 160, 38, 0x7c3aed);
    this.rollBtn.setStrokeStyle(2, 0xa78bfa);
    this.rollBtn.setInteractive({ useHandCursor: true });
    this.rollBtn.on("pointerdown", () => this.handlePointerDown());
    this.rollBtn.on("pointerover", () => { if (this.enabled) this.rollBtn.setFillStyle(0x6d28d9); });
    this.rollBtn.on("pointerout",  () => { this.rollBtn.setFillStyle(0x7c3aed); });

    this.rollLabel = this.scene.add.text(0, 44, "🎲  ROLL DICE", {
      fontSize:   "13px",
      color:      "#ffffff",
      fontFamily: "Outfit, sans-serif",
      fontStyle:  "bold",
    }).setOrigin(0.5);

    this.container = this.scene.add.container(x, y, [
      this.diceGfx,
      this.hitArea,
      this.rollBtn,
      this.rollLabel,
    ]);
    this.container.setDepth(100);
  }

  private handlePointerDown(): void {
    if (this.selectMode) {
      this.flashSelectHint();
      return;
    }
    this.roll();
  }

  // ─── Face drawing ─────────────────────────────────────────────────────────────

  private drawFace(face: number, highlighted = false): void {
    this.diceGfx.clear();
    const s = 30; const r = 8;
    const borderColor = highlighted ? 0xf59e0b : 0x1e293b;

    this.diceGfx.fillStyle(0xffffff, 1);
    this.diceGfx.fillRoundedRect(-s, -s - 16, s * 2, s * 2, r);
    this.diceGfx.lineStyle(highlighted ? 3 : 2, borderColor, 1);
    this.diceGfx.strokeRoundedRect(-s, -s - 16, s * 2, s * 2, r);

    const clamp = Math.max(1, Math.min(face, 6));
    const dots  = DOT_PATTERNS[clamp - 1] ?? DOT_PATTERNS[0];
    this.diceGfx.fillStyle(0x1e293b, 1);
    for (const [dx, dy] of dots) {
      this.diceGfx.fillCircle(dx, dy - 16, 5);
    }
  }

  // ─── State control ─────────────────────────────────────────────────────────────

  enable(label = "🎲  ROLL DICE"): void {
    this.enabled = true;
    this.selectMode = false;
    this.rollBtn.setFillStyle(0x7c3aed).setAlpha(1);
    this.rollBtn.setInteractive({ useHandCursor: true });
    this.hitArea.setInteractive({ useHandCursor: true });
    this.rollLabel.setText(label).setAlpha(1);
  }

  disable(): void {
    this.enabled = false;
    this.selectMode = false;
    this.rollBtn.setFillStyle(0x1e293b).setAlpha(0.6);
    if (this.rollBtn?.input) this.rollBtn.disableInteractive();
    if (this.hitArea?.input) this.hitArea.disableInteractive();
    this.rollLabel.setAlpha(0.5);
  }

  /** Show "waiting" state visually without blocking rollForAI() */
  setWaiting(label: string): void {
    this.enabled = false;
    this.selectMode = false;
    this.rollBtn.setFillStyle(0x1e293b).setAlpha(0.6);
    if (this.rollBtn?.input) this.rollBtn.disableInteractive();
    if (this.hitArea?.input) this.hitArea.disableInteractive();
    this.rollLabel.setText(label).setAlpha(0.7);
  }

  /** Show prompt to select a token (after rolling, multiple moves available) */
  setSelectMode(): void {
    this.enabled = false;
    this.selectMode = true;
    this.rollBtn.setFillStyle(0xd97706).setAlpha(1);
    this.rollBtn.setInteractive({ useHandCursor: true });
    this.hitArea.setInteractive({ useHandCursor: true });
    this.rollLabel.setText("👇 SELECT TOKEN").setAlpha(1);
  }

  private flashSelectHint(): void {
    this.scene.tweens.add({
      targets: this.container,
      scale: 1.12,
      duration: 90,
      yoyo: true,
      ease: "Sine.InOut",
    });
  }

  /** Override the roll button label without changing enabled state. */
  setPrompt(label: string): void {
    this.rollLabel.setText(label);
    if (this.enabled) {
      this.rollLabel.setAlpha(1);
    } else {
      this.rollLabel.setAlpha(0.7);
    }
  }

  /**
   * Hook for the online driver: when set, clicking the dice/button forwards
   * to the callback instead of rolling locally (server-authoritative).
   */
  setOnRoll(cb: (() => void) | null): void {
    this.onRollCb = cb;
  }

  /** Instantly display a value without animation (reconnect / remote sync). */
  setValue(value: number): void {
    const clamped = Math.max(1, Math.min(6, value));
    this.value = clamped;
    this.drawFace(clamped, clamped === 6);
  }

  /**
   * Play the roll animation but settle on the given authoritative value.
   * Used when a `game:state` broadcast reports a server-side roll.
   */
  rollTo(value: number, onComplete?: () => void): void {
    this.rolling = false;
    this.onRollCompleteCb = onComplete ?? null;
    this.startRoll(Math.max(1, Math.min(6, value)));
  }

  // ─── Roll ─────────────────────────────────────────────────────────────────────

  /** Human click — requires enabled state */
  roll(): void {
    if (this.rolling || !this.enabled) return;
    if (this.onRollCb) {
      this.onRollCb();
      return;
    }
    this.startRoll();
  }

  /** AI-triggered roll — bypasses enabled guard */
  rollForAI(): void {
    if (this.rolling) return;
    this.startRoll();
  }

  private startRoll(finalValue?: number): void {
    this.rolling = true;
    this.disable();
    this.scene.events.emit(LudoEvents.DICE_ROLL_STARTED);

    let count = 0;
    const totalFrames = 12;

    const tick = () => {
      count++;
      const temp = Phaser.Math.Between(1, 6);
      this.drawFace(temp);
      this.scene.tweens.add({
        targets:  this.container,
        scale:    count % 2 === 0 ? 1.1 : 0.95,
        duration: 55,
        ease:     "Sine.InOut",
      });
      if (count < totalFrames) {
        this.scene.time.delayedCall(65, tick);
      } else {
        this.finishRoll(finalValue);
      }
    };
    tick();
  }

  private finishRoll(finalValue?: number): void {
    this.value = finalValue ?? Phaser.Math.Between(1, 6);
    const isSix = this.value === 6;
    this.drawFace(this.value, isSix);

    this.scene.tweens.add({
      targets:  this.container,
      scale:    1.2,
      duration: 120,
      ease:     "Back.Out",
      yoyo:     true,
      onComplete: () => {
        this.container.setScale(1);
        this.rolling = false;
        this.scene.events.emit(LudoEvents.DICE_ROLLED, this.value);
        if (this.onRollCompleteCb) {
          const cb = this.onRollCompleteCb;
          this.onRollCompleteCb = null;
          cb();
        }
      },
    });
  }

  getValue():  number  { return this.value;   }
  isRolling(): boolean { return this.rolling;  }

  reset(): void {
    this.rolling = false;
    this.value   = 1;
    this.drawFace(1);
    this.enable();
  }

  unlock(): void { this.enable(); }
}

export { DiceManager };
