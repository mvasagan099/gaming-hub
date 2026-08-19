import Phaser from "phaser";
import { LudoEvents } from "../events/LudoEvents";
import { ANIM, animDuration, prefersReducedMotion } from "../constants";

const DOT_PATTERNS: Array<Array<[number, number]>> = [
  /* 1 */ [[0, 0]],
  /* 2 */ [[-12, -12], [12, 12]],
  /* 3 */ [[-12, -12], [0, 0], [12, 12]],
  /* 4 */ [[-12, -12], [12, -12], [-12, 12], [12, 12]],
  /* 5 */ [[-12, -12], [12, -12], [0, 0], [-12, 12], [12, 12]],
  /* 6 */ [[-12, -14], [12, -14], [-12, 0], [12, 0], [-12, 14], [12, 14]],
];

export default class DiceManager {
  private scene: Phaser.Scene;
  private container!: Phaser.GameObjects.Container;
  private diceGfx!: Phaser.GameObjects.Graphics;
  private hitArea!: Phaser.GameObjects.Rectangle;
  private rollBtn!: Phaser.GameObjects.Rectangle;
  private rollBtnStroke!: Phaser.GameObjects.Rectangle;
  private rollLabel!: Phaser.GameObjects.Text;

  private value = 1;
  private rolling = false;
  private enabled = true;
  private selectMode = false;
  private onRollCb: (() => void) | null = null;
  private onRollCompleteCb: (() => void) | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  create(x = 912, y = 280): void {
    this.diceGfx = this.scene.add.graphics();
    this.drawFace(this.value);

    // Invisible click target — larger for easier tapping
    this.hitArea = this.scene.add.rectangle(0, -18, 74, 74, 0xffffff, 0);
    this.hitArea.setInteractive({ useHandCursor: true });
    this.hitArea.on("pointerdown", () => this.handlePointerDown());
    this.hitArea.on("pointerover", () => {
      if (this.enabled) this.scene.tweens.add({ targets: this.container, scaleX: 1.06, scaleY: 1.06, duration: 100 });
    });
    this.hitArea.on("pointerout", () => {
      this.scene.tweens.add({ targets: this.container, scaleX: 1, scaleY: 1, duration: 100 });
    });

    // Modern rounded button with shadow
    const btnW = 164;
    const btnH = 40;
    const btnY = 46;

    // Button shadow
    const btnShadow = this.scene.add.rectangle(2, btnY + 2, btnW, btnH, 0x000000, 0.2);
    btnShadow.setStrokeStyle(0);

    // Button background
    this.rollBtn = this.scene.add.rectangle(0, btnY, btnW, btnH, 0x7c3aed);
    this.rollBtn.setStrokeStyle(2, 0xa78bfa);
    this.rollBtn.setInteractive({ useHandCursor: true });
    this.rollBtn.on("pointerdown", () => this.handlePointerDown());
    this.rollBtn.on("pointerover", () => { if (this.enabled) this.rollBtn.setFillStyle(0x6d28d9); });
    this.rollBtn.on("pointerout", () => { this.rollBtn.setFillStyle(0x7c3aed); });

    this.rollLabel = this.scene.add.text(0, btnY, "ROLL DICE", {
      fontSize: "13px",
      color: "#ffffff",
      fontFamily: "Outfit, sans-serif",
      fontStyle: "bold",
    }).setOrigin(0.5);

    this.container = this.scene.add.container(x, y, [
      btnShadow,
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
    const s = 33;
    const r = 10;
    const dotR = 5.5;

    // Drop shadow
    this.diceGfx.fillStyle(0x000000, 0.12);
    this.diceGfx.fillRoundedRect(-s + 3, -s - 18 + 3, s * 2, s * 2, r);

    // Main face
    this.diceGfx.fillStyle(0xffffff, 1);
    this.diceGfx.fillRoundedRect(-s, -s - 18, s * 2, s * 2, r);

    // Inner subtle gradient line at top
    this.diceGfx.fillStyle(0xf1f5f9, 0.6);
    this.diceGfx.fillRoundedRect(-s, -s - 18, s * 2, 4, { tl: r, tr: r, bl: 0, br: 0 });

    // Border
    const borderColor = highlighted ? 0xf59e0b : 0x1e293b;
    this.diceGfx.lineStyle(highlighted ? 3 : 2, borderColor, 1);
    this.diceGfx.strokeRoundedRect(-s, -s - 18, s * 2, s * 2, r);

    // Dots
    const clamp = Math.max(1, Math.min(face, 6));
    const dots = DOT_PATTERNS[clamp - 1] ?? DOT_PATTERNS[0];
    this.diceGfx.fillStyle(0x1e293b, 1);
    for (const [dx, dy] of dots) {
      this.diceGfx.fillCircle(dx, dy - 18, dotR);
    }
  }

  // ─── State control ─────────────────────────────────────────────────────────────

  enable(label = "ROLL DICE"): void {
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
    this.rollBtn.setFillStyle(0x1e293b).setAlpha(0.55);
    if (this.rollBtn?.input) this.rollBtn.disableInteractive();
    if (this.hitArea?.input) this.hitArea.disableInteractive();
    this.rollLabel.setAlpha(0.45);
  }

  setWaiting(label: string): void {
    this.enabled = false;
    this.selectMode = false;
    this.rollBtn.setFillStyle(0x1e293b).setAlpha(0.55);
    if (this.rollBtn?.input) this.rollBtn.disableInteractive();
    if (this.hitArea?.input) this.hitArea.disableInteractive();
    this.rollLabel.setText(label).setAlpha(0.65);
  }

  setSelectMode(): void {
    this.enabled = false;
    this.selectMode = true;
    this.rollBtn.setFillStyle(0xd97706).setAlpha(1);
    this.rollBtn.setInteractive({ useHandCursor: true });
    this.hitArea.setInteractive({ useHandCursor: true });
    this.rollLabel.setText("SELECT TOKEN").setAlpha(1);
  }

  private flashSelectHint(): void {
    this.scene.tweens.add({
      targets: this.container,
      scaleX: 1.14,
      scaleY: 1.14,
      duration: animDuration(80),
      yoyo: true,
      ease: "Sine.InOut",
    });
  }

  setPrompt(label: string): void {
    this.rollLabel.setText(label);
    this.rollLabel.setAlpha(this.enabled ? 1 : 0.65);
  }

  setOnRoll(cb: (() => void) | null): void {
    this.onRollCb = cb;
  }

  setValue(value: number): void {
    const clamped = Math.max(1, Math.min(6, value));
    this.value = clamped;
    this.drawFace(clamped, clamped === 6);
  }

  rollTo(value: number, onComplete?: () => void): void {
    this.rolling = false;
    this.onRollCompleteCb = onComplete ?? null;
    this.startRoll(Math.max(1, Math.min(6, value)));
  }

  // ─── Roll ─────────────────────────────────────────────────────────────────────

  roll(): void {
    if (this.rolling || !this.enabled) return;
    if (this.onRollCb) {
      this.onRollCb();
      return;
    }
    this.startRoll();
  }

  rollForAI(): void {
    if (this.rolling) return;
    this.startRoll();
  }

  private startRoll(finalValue?: number): void {
    this.rolling = true;
    this.disable();
    this.scene.events.emit(LudoEvents.DICE_ROLL_STARTED);

    const reduced = prefersReducedMotion();
    let count = 0;
    const totalFrames = reduced ? 4 : ANIM.diceRollFrames;

    const tick = () => {
      count++;
      const temp = Phaser.Math.Between(1, 6);
      this.drawFace(temp);

      // Rotation shake during roll
      if (!reduced) {
        this.scene.tweens.add({
          targets: this.container,
          scaleX: count % 2 === 0 ? 1.08 : 0.95,
          scaleY: count % 2 === 0 ? 0.95 : 1.08,
          angle: count % 2 === 0 ? ANIM.diceRotationAmount * 180 : -ANIM.diceRotationAmount * 180,
          duration: animDuration(ANIM.diceFrameDelay),
          ease: "Sine.InOut",
        });
      }

      if (count < totalFrames) {
        this.scene.time.delayedCall(animDuration(ANIM.diceFrameDelay), tick);
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

    // Landing bounce with scale pop
    this.scene.tweens.add({
      targets: this.container,
      scaleX: ANIM.diceLandingScale,
      scaleY: ANIM.diceLandingScale,
      angle: 0,
      duration: animDuration(ANIM.diceLandingDuration),
      ease: "Back.Out",
      yoyo: true,
      onComplete: () => {
        this.container.setScale(1).setAngle(0);
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
