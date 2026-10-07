import Phaser from "phaser";
import { LudoEvents } from "../events/LudoEvents";
import type { PlayerColor } from "../types/ludo.types";
import { ANIM, LUDO_DESIGN_CONFIG, animDuration, prefersReducedMotion } from "../constants";

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
  private diceContainer!: Phaser.GameObjects.Container;
  private btnContainer!: Phaser.GameObjects.Container;
  private diceGfx!: Phaser.GameObjects.Graphics;
  private pedestalGfx!: Phaser.GameObjects.Graphics;
  private pedestalColor = 0xe11d48;
  private activeColors: PlayerColor[] = ["green", "blue"];
  private hitArea!: Phaser.GameObjects.Rectangle;
  private rollBtnGfx!: Phaser.GameObjects.Graphics;
  private rollLabel!: Phaser.GameObjects.Text;
  private haloTween: Phaser.Tweens.Tween | null = null;

  private isPortrait = false;
  private value = 1;
  private rolling = false;
  private enabled = true;
  private selectMode = false;
  private onRollCb: (() => void) | null = null;
  private onRollCompleteCb: (() => void) | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  create(x = 1080, y = 198, isPortrait = false, activeColors?: PlayerColor[]): void {
    this.isPortrait = isPortrait;
    if (activeColors && activeColors.length > 0) {
      this.activeColors = [...activeColors];
    }
    const startingColor = this.activeColors[0] ?? "red";
    this.pedestalColor = LUDO_DESIGN_CONFIG.colors[startingColor]?.main ?? 0xe11d48;

    // ── Glowing Floor Dais / Pedestal (Stationary behind the dice) ────
    this.pedestalGfx = this.scene.add.graphics();
    this.drawPedestal(this.pedestalColor);

    // Listen to TURN_CHANGED so the dice dais pulses with that player's neon color
    this.scene.events.on(LudoEvents.TURN_CHANGED, (data: { playerIndex: number; color?: PlayerColor }) => {
      let colorInt = 0xe11d48;
      if (data.color && LUDO_DESIGN_CONFIG.colors[data.color]) {
        colorInt = LUDO_DESIGN_CONFIG.colors[data.color].main;
      } else {
        const cName = this.activeColors[data.playerIndex % this.activeColors.length] ?? "red";
        colorInt = LUDO_DESIGN_CONFIG.colors[cName]?.main ?? 0xe11d48;
      }
      this.setPedestalColor(colorInt);
    });

    this.diceGfx = this.scene.add.graphics();
    this.draw3DDice(this.value);

    // Invisible click target over dice cube
    const s = this.isPortrait ? 36 : 40;
    const cubeCy = this.isPortrait ? -24 : -30;
    const cubeHit = s * 2 + 16;
    this.hitArea = this.scene.add.rectangle(0, 0, cubeHit, cubeHit, 0xffffff, 0);
    this.hitArea.setInteractive({ useHandCursor: true });
    this.hitArea.on("pointerdown", () => this.handlePointerDown());
    this.hitArea.on("pointerover", () => {
      if (this.enabled) {
        this.scene.tweens.add({ targets: this.diceContainer, scaleX: 1.05, scaleY: 1.05, duration: 100 });
      }
    });
    this.hitArea.on("pointerout", () => {
      this.scene.tweens.add({ targets: this.diceContainer, scaleX: 1, scaleY: 1, duration: 100 });
    });

    this.diceContainer = this.scene.add.container(0, cubeCy, [
      this.diceGfx,
      this.hitArea,
    ]);

    // ─── Modern Tactile Roll Button (Isolated in dedicated button container) ────
    this.rollBtnGfx = this.scene.add.graphics();
    this.drawButton(true, "active");

    const btnW = this.isPortrait ? 240 : 490;
    const btnH = this.isPortrait ? 46 : 50;
    const btnY = this.isPortrait ? 54 : 56;
    const btnHit = this.scene.add.rectangle(0, 0, btnW, btnH, 0xffffff, 0);
    btnHit.setInteractive({ useHandCursor: true });
    btnHit.on("pointerdown", () => {
      // Button press micro-animation only on the button
      this.scene.tweens.add({
        targets: this.btnContainer,
        scaleX: 0.97,
        scaleY: 0.97,
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

    this.rollLabel = this.scene.add.text(0, 0, "ROLL DICE", {
      fontSize: this.isPortrait ? "15px" : "20px",
      color: "#ffffff",
      fontFamily: "Outfit, sans-serif",
      fontStyle: "bold",
      letterSpacing: this.isPortrait ? 0.5 : 2,
      shadow: {
        offsetX: 0,
        offsetY: 2,
        color: "#1e1b4b",
        blur: 3,
        fill: true,
      },
    }).setOrigin(0.5);

    this.btnContainer = this.scene.add.container(0, btnY, [
      this.rollBtnGfx,
      btnHit,
      this.rollLabel,
    ]);

    this.container = this.scene.add.container(x, y, [
      this.pedestalGfx,
      this.diceContainer,
      this.btnContainer,
    ]);
    this.container.setDepth(100);

    this.startActiveHalo();
  }

  private drawPedestal(color: number): void {
    this.pedestalGfx.clear();
    const cubeCy = this.isPortrait ? -24 : -30;
    const r = this.isPortrait ? 38 : 46;
    const daisY = cubeCy + 24;

    // Ambient radial floor glow
    this.pedestalGfx.fillStyle(color, 0.16);
    this.pedestalGfx.fillEllipse(0, daisY, r * 2.3, r * 1.15);

    // Outer concentric sci-fi dais ring
    this.pedestalGfx.lineStyle(1.6, color, 0.5);
    this.pedestalGfx.strokeEllipse(0, daisY, r * 2.0, r * 0.96);

    // Inner floor platform disk
    this.pedestalGfx.fillStyle(0x0a1022, 0.92);
    this.pedestalGfx.fillEllipse(0, daisY, r * 1.6, r * 0.76);

    this.pedestalGfx.lineStyle(1.2, 0x1e2d4d, 0.85);
    this.pedestalGfx.strokeEllipse(0, daisY, r * 1.6, r * 0.76);
  }

  setPedestalColor(color: number): void {
    this.pedestalColor = color;
    this.drawPedestal(color);
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
    const s = this.isPortrait ? 36 : 40; // Half-size of dice cube
    const r = this.isPortrait ? 11 : 12;
    const dotR = this.isPortrait ? 5.2 : 6.2;
    const cy = 0;
    const dotSpacing = this.isPortrait ? 13 : 15;

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
    const baseDots = DOT_PATTERNS[clamp - 1] ?? DOT_PATTERNS[0];
    const scale = dotSpacing / 12;

    for (const [dx, dy] of baseDots) {
      const px = dx * scale + tiltX;
      const py = cy + dy * scale + tiltY;

      // Pip top highlight (gives recessed engraved look)
      this.diceGfx.fillStyle(0xffffff, 0.4);
      this.diceGfx.fillCircle(px, py + 0.8, dotR);

      // Pip core dark pigment
      this.diceGfx.fillStyle(isGoldenSix ? 0xd97706 : 0x0f172a, 1.0);
      this.diceGfx.fillCircle(px, py, dotR);

      // Inner pip specular glint
      this.diceGfx.fillStyle(0xffffff, 0.6);
      this.diceGfx.fillCircle(px - 1.5, py - 1.5, this.isPortrait ? 1.2 : 1.6);
    }
  }

  // ─── Button Drawing ──────────────────────────────────────────────────────────

  private drawButton(enabled: boolean, state: "active" | "hover" | "disabled" | "select"): void {
    this.rollBtnGfx.clear();
    const w = this.isPortrait ? 240 : 490;
    const h = this.isPortrait ? 46 : 50;
    const y = 0;
    const r = this.isPortrait ? 10 : 14;

    if (!enabled || state === "disabled") {
      // Disabled Slate
      this.rollBtnGfx.fillStyle(0x000000, 0.2);
      this.rollBtnGfx.fillRoundedRect(-w / 2 + 2, y - h / 2 + 3, w, h, r);

      this.rollBtnGfx.fillStyle(0x0f172a, 0.85);
      this.rollBtnGfx.fillRoundedRect(-w / 2, y - h / 2 + 2, w, h, r);

      this.rollBtnGfx.fillStyle(0x1e293b, 0.8);
      this.rollBtnGfx.fillRoundedRect(-w / 2, y - h / 2, w, h, r);

      this.rollBtnGfx.lineStyle(1.2, 0x334155, 0.5);
      this.rollBtnGfx.strokeRoundedRect(-w / 2, y - h / 2, w, h, r);
      return;
    }

    if (state === "select") {
      // Golden Select State
      this.rollBtnGfx.fillStyle(0xf59e0b, 0.25);
      this.rollBtnGfx.fillRoundedRect(-w / 2 - 3, y - h / 2 - 2, w + 6, h + 6, r + 2);

      this.rollBtnGfx.fillStyle(0x000000, 0.45);
      this.rollBtnGfx.fillRoundedRect(-w / 2, y - h / 2 + 4, w, h, r);

      this.rollBtnGfx.fillStyle(0x78350f, 1.0);
      this.rollBtnGfx.fillRoundedRect(-w / 2, y - h / 2 + 3, w, h, r);

      this.rollBtnGfx.fillStyle(0xd97706, 1.0);
      this.rollBtnGfx.fillRoundedRect(-w / 2, y - h / 2, w, h, r);

      // Top sheen
      this.rollBtnGfx.fillStyle(0xfef08a, 0.35);
      this.rollBtnGfx.fillRoundedRect(-w / 2 + 1, y - h / 2 + 1, w - 2, 6, { tl: r - 1, tr: r - 1, bl: 0, br: 0 });

      this.rollBtnGfx.lineStyle(2, 0xfcd34d, 1.0);
      this.rollBtnGfx.strokeRoundedRect(-w / 2, y - h / 2, w, h, r);
      return;
    }

    // Active / Hover State (Vibrant Purple/Violet Gradient)
    const hover = state === "hover";

    // Ambient drop glow aura
    this.rollBtnGfx.fillStyle(0x7c3aed, hover ? 0.3 : 0.2);
    this.rollBtnGfx.fillRoundedRect(-w / 2 - 3, y - h / 2 - 2, w + 6, h + 6, r + 2);

    // Deep drop shadow
    this.rollBtnGfx.fillStyle(0x000000, 0.45);
    this.rollBtnGfx.fillRoundedRect(-w / 2, y - h / 2 + 4, w, h, r);

    // 3D Extrusion base edge
    this.rollBtnGfx.fillStyle(0x2e1065, 1.0);
    this.rollBtnGfx.fillRoundedRect(-w / 2, y - h / 2 + 3, w, h, r);

    // Main 3D button face
    const baseColor = hover ? 0x8b5cf6 : 0x7c3aed;
    this.rollBtnGfx.fillStyle(baseColor, 1.0);
    this.rollBtnGfx.fillRoundedRect(-w / 2, y - h / 2, w, h, r);

    // Upper highlight fill
    this.rollBtnGfx.fillStyle(0xa855f7, hover ? 0.45 : 0.35);
    this.rollBtnGfx.fillRoundedRect(-w / 2, y - h / 2, w, h * 0.55, { tl: r, tr: r, bl: 0, br: 0 });

    // Top specular glass sheen
    this.rollBtnGfx.fillStyle(0xffffff, hover ? 0.45 : 0.3);
    this.rollBtnGfx.fillRoundedRect(-w / 2 + 1, y - h / 2 + 1, w - 2, 6, { tl: r - 1, tr: r - 1, bl: 0, br: 0 });

    // Metallic luminous border
    this.rollBtnGfx.lineStyle(1.8, hover ? 0xd8b4fe : 0xc084fc, 0.95);
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
      targets: this.btnContainer,
      scaleX: 1.05,
      scaleY: 1.05,
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
    if (!reduced && this.pedestalGfx) {
      this.scene.tweens.add({
        targets: this.pedestalGfx,
        scaleX: 1.1,
        scaleY: 1.1,
        duration: animDuration(150),
        yoyo: true,
        ease: "Sine.InOut",
      });
    }
    let count = 0;
    const totalFrames = reduced ? 4 : ANIM.diceRollFrames;

    const tick = () => {
      count++;
      const temp = Phaser.Math.Between(1, 6);
      const tiltX = (count % 2 === 0 ? 1 : -1) * 2;
      const tiltY = (count % 3 === 0 ? 1 : -1) * 2;
      this.draw3DDice(temp, false, tiltX, tiltY);

      // 3D rotation wobble on dice cube only during tumble
      if (!reduced) {
        this.scene.tweens.add({
          targets: this.diceContainer,
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

    // Celebratory landing bounce with scale pop on dice cube only
    this.scene.tweens.add({
      targets: this.diceContainer,
      scaleX: ANIM.diceLandingScale,
      scaleY: ANIM.diceLandingScale,
      angle: 0,
      duration: animDuration(ANIM.diceLandingDuration),
      ease: "Back.Out",
      yoyo: true,
      onComplete: () => {
        this.diceContainer.setScale(1).setAngle(0);
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
    this.diceContainer.setScale(1).setAngle(0);
    this.enable();
  }

  unlock(): void { this.enable(); }
}

export { DiceManager };
