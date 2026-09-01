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
  private rollBtnGfx!: Phaser.GameObjects.Graphics;
  private rollLabel!: Phaser.GameObjects.Text;
  private haloTween: Phaser.Tweens.Tween | null = null;

  private value = 1;
  private rolling = false;
  private enabled = true;
  private selectMode = false;
  private onRollCb: (() => void) | null = null;
  private onRollCompleteCb: (() => void) | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  create(x = 912, y = 220): void {
    this.diceGfx = this.scene.add.graphics();
    this.draw3DDice(this.value);

    // Invisible click target over dice cube
    this.hitArea = this.scene.add.rectangle(0, -18, 80, 80, 0xffffff, 0);
    this.hitArea.setInteractive({ useHandCursor: true });
    this.hitArea.on("pointerdown", () => this.handlePointerDown());
    this.hitArea.on("pointerover", () => {
      if (this.enabled) {
        this.scene.tweens.add({ targets: this.container, scaleX: 1.05, scaleY: 1.05, duration: 100 });
      }
    });
    this.hitArea.on("pointerout", () => {
      this.scene.tweens.add({ targets: this.container, scaleX: 1, scaleY: 1, duration: 100 });
    });

    // ─── Modern Tactile Roll Button ───────────────────────────────────────────
    this.rollBtnGfx = this.scene.add.graphics();
    this.drawButton(true, "active");

    const btnHit = this.scene.add.rectangle(0, 48, 172, 42, 0xffffff, 0);
    btnHit.setInteractive({ useHandCursor: true });
    btnHit.on("pointerdown", () => {
      // Press micro-animation
      this.scene.tweens.add({
        targets: this.container,
        scaleX: 0.96,
        scaleY: 0.96,
        duration: 60,
        yoyo: true,
      });
      this.handlePointerDown();
    });
    btnHit.on("pointerover", () => {
      if (this.enabled) this.drawButton(true, "hover");
    });
    btnHit.on("pointerout", () => {
      if (this.enabled) this.drawButton(true, "active");
    });

    this.rollLabel = this.scene.add.text(0, 48, "ROLL DICE", {
      fontSize: "13px",
      color: "#ffffff",
      fontFamily: "Outfit, sans-serif",
      fontStyle: "bold",
      shadow: {
        offsetX: 0,
        offsetY: 1,
        color: "#00000088",
        blur: 2,
        fill: true,
      },
    }).setOrigin(0.5);

    this.container = this.scene.add.container(x, y, [
      this.diceGfx,
      this.hitArea,
      this.rollBtnGfx,
      btnHit,
      this.rollLabel,
    ]);
    this.container.setDepth(100);

    this.startActiveHalo();
  }

  private handlePointerDown(): void {
    if (this.selectMode) {
      this.flashSelectHint();
      return;
    }
    this.roll();
  }

  // ─── 3D Dice Face Rendering ──────────────────────────────────────────────────

  private draw3DDice(face: number, isGoldenSix = false, tiltX = 0, tiltY = 0): void {
    this.diceGfx.clear();
    const s = 34; // Half-size of dice cube
    const r = 10;
    const dotR = 5.2;
    const cy = -18;

    // 1. Soft 3D Ambient Drop Shadow under cube
    this.diceGfx.fillStyle(0x000000, 0.35);
    this.diceGfx.fillRoundedRect(-s + 4, cy - s + 8, s * 2, s * 2, r + 2);

    // 2. 3D Beveled Cube Body (Midnight Slate to Pearl White)
    // Dark bottom-right bevel extrusion
    this.diceGfx.fillStyle(0xcfd8dc, 1);
    this.diceGfx.fillRoundedRect(-s, cy - s + 3, s * 2, s * 2, r);

    // Main Pearl White Top Face
    this.diceGfx.fillStyle(isGoldenSix ? 0xfffbeb : 0xffffff, 1);
    this.diceGfx.fillRoundedRect(-s, cy - s, s * 2, s * 2, r);

    // 3. Top-Left Specular Surface Sheen (315° Key Light)
    this.diceGfx.fillStyle(0xffffff, 0.6);
    this.diceGfx.fillRoundedRect(-s + 2, cy - s + 2, s * 2 - 4, 8, { tl: r - 2, tr: r - 2, bl: 0, br: 0 });

    // 4. Cube Perimeter Stroke
    const strokeColor = isGoldenSix ? 0xf59e0b : 0x94a3b8;
    this.diceGfx.lineStyle(isGoldenSix ? 2.5 : 1.5, strokeColor, 0.85);
    this.diceGfx.strokeRoundedRect(-s, cy - s, s * 2, s * 2, r);

    // 5. Engraved Pips (Dots with Inner Bevels)
    const clamp = Math.max(1, Math.min(face, 6));
    const dots = DOT_PATTERNS[clamp - 1] ?? DOT_PATTERNS[0];

    for (const [dx, dy] of dots) {
      const px = dx + tiltX;
      const py = cy + dy + tiltY;

      // Pip top highlight (gives recessed engraved look)
      this.diceGfx.fillStyle(0xffffff, 0.4);
      this.diceGfx.fillCircle(px, py + 0.8, dotR);

      // Pip core dark pigment
      this.diceGfx.fillStyle(isGoldenSix ? 0xd97706 : 0x0f172a, 1.0);
      this.diceGfx.fillCircle(px, py, dotR);

      // Inner pip specular glint
      this.diceGfx.fillStyle(0xffffff, 0.6);
      this.diceGfx.fillCircle(px - 1.5, py - 1.5, 1.2);
    }
  }

  // ─── Button Drawing ──────────────────────────────────────────────────────────

  private drawButton(enabled: boolean, state: "active" | "hover" | "disabled" | "select"): void {
    this.rollBtnGfx.clear();
    const w = 172;
    const h = 42;
    const y = 48;
    const r = 12;

    // Drop shadow
    this.rollBtnGfx.fillStyle(0x000000, 0.25);
    this.rollBtnGfx.fillRoundedRect(-w / 2 + 2, y - h / 2 + 3, w, h, r);

    if (!enabled || state === "disabled") {
      // Disabled Slate
      this.rollBtnGfx.fillStyle(0x1e293b, 0.6);
      this.rollBtnGfx.fillRoundedRect(-w / 2, y - h / 2, w, h, r);
      this.rollBtnGfx.lineStyle(1.2, 0x334155, 0.5);
      this.rollBtnGfx.strokeRoundedRect(-w / 2, y - h / 2, w, h, r);
      return;
    }

    if (state === "select") {
      // Golden Select State
      this.rollBtnGfx.fillStyle(0xd97706, 1.0);
      this.rollBtnGfx.fillRoundedRect(-w / 2, y - h / 2, w, h, r);
      // Top sheen
      this.rollBtnGfx.fillStyle(0xfef08a, 0.25);
      this.rollBtnGfx.fillRoundedRect(-w / 2, y - h / 2, w, h * 0.45, { tl: r, tr: r, bl: 0, br: 0 });
      this.rollBtnGfx.lineStyle(2, 0xfcd34d, 1.0);
      this.rollBtnGfx.strokeRoundedRect(-w / 2, y - h / 2, w, h, r);
      return;
    }

    // Active / Hover State (Vibrant Purple Gradient)
    const baseColor = state === "hover" ? 0x6d28d9 : 0x7c3aed;
    this.rollBtnGfx.fillStyle(baseColor, 1.0);
    this.rollBtnGfx.fillRoundedRect(-w / 2, y - h / 2, w, h, r);

    // Top sheen
    this.rollBtnGfx.fillStyle(0xffffff, 0.22);
    this.rollBtnGfx.fillRoundedRect(-w / 2, y - h / 2, w, h * 0.45, { tl: r, tr: r, bl: 0, br: 0 });

    this.rollBtnGfx.lineStyle(2, 0xa78bfa, 0.9);
    this.rollBtnGfx.strokeRoundedRect(-w / 2, y - h / 2, w, h, r);
  }

  // ─── Active Halo Animation ───────────────────────────────────────────────────

  private startActiveHalo(): void {
    if (prefersReducedMotion()) return;
    this.haloTween?.stop();
    this.haloTween = this.scene.tweens.add({
      targets: this.rollLabel,
      alpha: { from: 1.0, to: 0.8 },
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: "Sine.InOut",
    });
  }

  // ─── State Control ───────────────────────────────────────────────────────────

  enable(label = "ROLL DICE"): void {
    this.enabled = true;
    this.selectMode = false;
    this.drawButton(true, "active");
    this.hitArea.setInteractive({ useHandCursor: true });
    this.rollLabel.setText(label).setAlpha(1);
    this.startActiveHalo();
  }

  disable(): void {
    this.enabled = false;
    this.selectMode = false;
    this.drawButton(false, "disabled");
    if (this.hitArea?.input) this.hitArea.disableInteractive();
    this.rollLabel.setAlpha(0.5);
    this.haloTween?.stop();
  }

  setWaiting(label: string): void {
    this.enabled = false;
    this.selectMode = false;
    this.drawButton(false, "disabled");
    if (this.hitArea?.input) this.hitArea.disableInteractive();
    this.rollLabel.setText(label).setAlpha(0.6);
    this.haloTween?.stop();
  }

  setSelectMode(): void {
    this.enabled = false;
    this.selectMode = true;
    this.drawButton(true, "select");
    this.hitArea.setInteractive({ useHandCursor: true });
    this.rollLabel.setText("SELECT TOKEN").setAlpha(1);
    this.flashSelectHint();
  }

  private flashSelectHint(): void {
    this.scene.tweens.add({
      targets: this.container,
      scaleX: 1.10,
      scaleY: 1.10,
      duration: animDuration(90),
      yoyo: true,
      ease: "Sine.InOut",
    });
  }

  setPrompt(label: string): void {
    this.rollLabel.setText(label);
  }

  setOnRoll(cb: (() => void) | null): void {
    this.onRollCb = cb;
  }

  setValue(value: number): void {
    const clamped = Math.max(1, Math.min(6, value));
    this.value = clamped;
    this.draw3DDice(clamped, clamped === 6);
  }

  rollTo(value: number, onComplete?: () => void): void {
    this.rolling = false;
    this.onRollCompleteCb = onComplete ?? null;
    this.startRoll(Math.max(1, Math.min(6, value)));
  }

  // ─── 3D Roll Physics & Landing ───────────────────────────────────────────────

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
      const tiltX = (count % 2 === 0 ? 1 : -1) * 2;
      const tiltY = (count % 3 === 0 ? 1 : -1) * 2;
      this.draw3DDice(temp, false, tiltX, tiltY);

      // 3D rotation wobble during tumble
      if (!reduced) {
        this.scene.tweens.add({
          targets: this.container,
          scaleX: count % 2 === 0 ? 1.08 : 0.94,
          scaleY: count % 2 === 0 ? 0.94 : 1.08,
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
    this.draw3DDice(this.value, isSix, 0, 0);

    // Celebratory landing bounce with scale pop
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

  getValue(): number { return this.value; }
  isRolling(): boolean { return this.rolling; }

  reset(): void {
    this.rolling = false;
    this.value = 1;
    this.draw3DDice(1);
    this.enable();
  }

  unlock(): void { this.enable(); }
}

export { DiceManager };
