import Phaser from "phaser";
import { GameEvents } from "../events/GameEvents";
import { ANIM, animDuration, prefersReducedMotion } from "../constants";

/** Dot positions for each die face (relative to center, within -22..+22 range) */
const DOT_PATTERNS: Array<Array<[number, number]>> = [
  /* 1 */ [[0, 0]],
  /* 2 */ [[-13, -13], [13, 13]],
  /* 3 */ [[-13, -13], [0, 0], [13, 13]],
  /* 4 */ [[-13, -13], [13, -13], [-13, 13], [13, 13]],
  /* 5 */ [[-13, -13], [13, -13], [0, 0], [-13, 13], [13, 13]],
  /* 6 */ [[-13, -15], [13, -15], [-13, 0], [13, 0], [-13, 15], [13, 15]],
];

const DICE_SIZE = 36; // half-size → 72×72 3D dice
const DICE_CORNER_RADIUS = 12;

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

    // ── 3D Dice Face Graphics (72×72) ──────────────────────────────────
    this.diceGraphics = this.scene.add.graphics();
    this.draw3DDiceFace(this.value);

    // Hit area for clicking directly on the 3D dice
    const diceHitArea = this.scene.add.rectangle(0, -18, DICE_SIZE * 2 + 10, DICE_SIZE * 2 + 14, 0xffffff, 0);
    diceHitArea.setInteractive({ useHandCursor: true });
    diceHitArea.on("pointerdown", () => this.roll());
    diceHitArea.on("pointerover", () => {
      if (this.enabled && !reduced) {
        this.scene.tweens.add({ targets: this.container, scale: 1.05, duration: 100 });
      }
    });
    diceHitArea.on("pointerout", () => {
      if (!reduced) {
        this.scene.tweens.add({ targets: this.container, scale: 1.0, duration: 100 });
      }
    });

    // Hidden value text
    this.valueText = this.scene.add.text(0, -18, "", {
      fontSize: "0px",
      color: "#000000",
    }).setOrigin(0.5).setDepth(0);

    // ── Physical 3D Push Button ─────────────────────────────────────────
    this.rollBtn = this.scene.add.graphics();
    this.draw3DRollButton(false, false);

    const btnHitArea = this.scene.add.rectangle(0, 50, 172, 44, 0xffffff, 0);
    btnHitArea.setInteractive({ useHandCursor: true });
    btnHitArea.on("pointerdown", () => {
      this.draw3DRollButton(true, true);
      this.roll();
    });
    btnHitArea.on("pointerup", () => {
      if (this.enabled) this.draw3DRollButton(true, false);
    });
    btnHitArea.on("pointerover", () => {
      if (this.enabled) this.draw3DRollButton(true, false);
    });
    btnHitArea.on("pointerout", () => {
      if (this.enabled) this.draw3DRollButton(false, false);
    });

    this.rollBtnLabel = this.scene.add.text(0, 50, "ROLL DICE", {
      fontSize: "14px",
      color: "#ffffff",
      fontFamily: "Outfit, sans-serif",
      fontStyle: "bold",
      stroke: "#1e1b4b",
      strokeThickness: 2,
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

  private draw3DRollButton(hover: boolean, pressed: boolean): void {
    this.rollBtn.clear();
    const btnW = 172;
    const btnH = 44;
    const bx = -btnW / 2;
    const by = 28 + (pressed ? 3 : 0);
    const r = 10;
    const depth = pressed ? 2 : 5;

    // Button drop shadow
    this.rollBtn.fillStyle(0x000000, 0.4);
    this.rollBtn.fillRoundedRect(bx, by + depth + 2, btnW, btnH, r);

    // Button 3D bottom extrusion edge
    this.rollBtn.fillStyle(0x312e81, 1); // Dark indigo base
    this.rollBtn.fillRoundedRect(bx, by + depth, btnW, btnH, r);

    // Main 3D button face
    const btnColor = hover ? 0x6366f1 : 0x4f46e5;
    this.rollBtn.fillStyle(btnColor, 1);
    this.rollBtn.fillRoundedRect(bx, by, btnW, btnH, r);

    // Top specular bevel highlight
    this.rollBtn.fillStyle(0xffffff, hover ? 0.35 : 0.22);
    this.rollBtn.fillRoundedRect(bx + 1, by + 1, btnW - 2, 6, { tl: r - 1, tr: r - 1, bl: 0, br: 0 });

    // Metallic border outline
    this.rollBtn.lineStyle(1.5, 0x818cf8, 0.8);
    this.rollBtn.strokeRoundedRect(bx, by, btnW, btnH, r);
  }

  private drawDisabledButton(): void {
    this.rollBtn.clear();
    const btnW = 172;
    const btnH = 44;
    const bx = -btnW / 2;
    const by = 28;
    const r = 10;

    // Disabled shadow
    this.rollBtn.fillStyle(0x000000, 0.2);
    this.rollBtn.fillRoundedRect(bx, by + 3, btnW, btnH, r);

    // Disabled slab
    this.rollBtn.fillStyle(0x0f172a, 1);
    this.rollBtn.fillRoundedRect(bx, by + 2, btnW, btnH, r);

    // Disabled face
    this.rollBtn.fillStyle(0x1e293b, 1);
    this.rollBtn.fillRoundedRect(bx, by, btnW, btnH, r);

    this.rollBtn.lineStyle(1, 0x334155, 0.4);
    this.rollBtn.strokeRoundedRect(bx, by, btnW, btnH, r);
  }

  /** Draw 3D physical cube dice with inset pips and bevel highlights */
  private draw3DDiceFace(face: number): void {
    this.diceGraphics.clear();
    const s = DICE_SIZE;
    const r = DICE_CORNER_RADIUS;
    const cy = -18;
    const depth = 6;

    // ── 1. Soft Ambient Ground Shadow ──
    this.diceGraphics.fillStyle(0x000000, 0.2);
    this.diceGraphics.fillRoundedRect(-s - 4, cy - s + depth + 4, (s + 4) * 2, (s + 4) * 2, r + 2);
    this.diceGraphics.fillStyle(0x000000, 0.35);
    this.diceGraphics.fillRoundedRect(-s, cy - s + depth + 2, s * 2, s * 2, r);

    // ── 2. Extruded 3D Bottom Slab Edge ──
    this.diceGraphics.fillStyle(0x94a3b8, 1); // Darker slate edge
    this.diceGraphics.fillRoundedRect(-s, cy - s + depth, s * 2, s * 2, r);
    this.diceGraphics.fillStyle(0xcfd8dc, 1);
    this.diceGraphics.fillRoundedRect(-s, cy - s + depth - 2, s * 2, s * 2, r);

    // ── 3. Main Ivory Top Surface ──
    this.diceGraphics.fillStyle(0xffffff, 1);
    this.diceGraphics.fillRoundedRect(-s, cy - s, s * 2, s * 2, r);

    // ── 4. 3D Bevel Highlights & Rim ──
    // Top specular highlight
    this.diceGraphics.fillStyle(0xffffff, 0.7);
    this.diceGraphics.fillRoundedRect(-s + 2, cy - s + 2, s * 2 - 4, 6, { tl: r - 2, tr: r - 2, bl: 0, br: 0 });

    // Left specular highlight
    this.diceGraphics.fillStyle(0xffffff, 0.4);
    this.diceGraphics.fillRoundedRect(-s + 2, cy - s + 6, 4, s * 2 - 12, { tl: 0, tr: 0, bl: 0, br: 0 });

    // Outer subtle contour
    this.diceGraphics.lineStyle(2, 0x475569, 0.6);
    this.diceGraphics.strokeRoundedRect(-s, cy - s, s * 2, s * 2, r);

    // ── 5. Inset 3D Pips / Dots ──
    const clampedFace = Math.max(1, Math.min(face, 6));
    const dots = DOT_PATTERNS[clampedFace - 1] ?? DOT_PATTERNS[0];
    const isOneOrSix = clampedFace === 1;

    for (const [dx, dy] of dots) {
      const pipX = dx;
      const pipY = dy + cy;
      const pipRadius = clampedFace === 1 ? 8 : 5.5;

      // Inset drop shadow (simulates carved recess)
      this.diceGraphics.fillStyle(0x000000, 0.25);
      this.diceGraphics.fillCircle(pipX + 1, pipY + 1.2, pipRadius + 0.5);

      // Deep pip body (Crimson for 1, Obsidian Navy for others)
      const pipColor = isOneOrSix ? 0xdc2626 : 0x0f172a;
      this.diceGraphics.fillStyle(pipColor, 1);
      this.diceGraphics.fillCircle(pipX, pipY, pipRadius);

      // Pip inner bevel shadow
      this.diceGraphics.fillStyle(0x000000, 0.35);
      this.diceGraphics.fillCircle(pipX + 0.5, pipY + 0.8, pipRadius - 1.5);

      // Pip specular glint
      this.diceGraphics.fillStyle(0xffffff, 0.7);
      this.diceGraphics.fillCircle(pipX - pipRadius * 0.35, pipY - pipRadius * 0.35, pipRadius * 0.35);
    }
  }

  enable(): void {
    this.enabled = true;
    this.draw3DRollButton(false, false);
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
    this.draw3DDiceFace(this.value);
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
      this.draw3DDiceFace(value);
      this.rolling = false;
      this.scene.events.emit(GameEvents.DICE_ROLLED, value);
      return;
    }

    let count = 0;
    const totalFrames = ANIM.diceRollFrames;

    const tick = () => {
      count++;
      const temp = Phaser.Math.Between(1, 6);
      this.draw3DDiceFace(temp);

      // 3D Tumbling rotation & lift
      this.scene.tweens.add({
        targets: this.container,
        scale: count % 2 === 0 ? 1.12 : 0.94,
        angle: Phaser.Math.Between(-16, 16),
        duration: animDuration(45),
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
    this.draw3DDiceFace(this.value);

    const reduced = prefersReducedMotion();
    if (reduced) {
      this.container.setScale(1);
      this.container.setAngle(0);
      this.rolling = false;
      this.scene.events.emit(GameEvents.DICE_ROLLED, this.value);
      return;
    }

    // 3D Landing bounce with rotation reset
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
    this.draw3DDiceFace(1);
    this.container.setAngle(0);
    this.enable();
  }
}

export { DiceManager };

