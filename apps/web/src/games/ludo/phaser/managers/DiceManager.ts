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
  private rollBtn!:    Phaser.GameObjects.Rectangle;
  private rollLabel!:  Phaser.GameObjects.Text;

  private value    = 1;
  private rolling  = false;
  private enabled  = true;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  create(x = 912, y = 280): void {
    this.diceGfx = this.scene.add.graphics();
    this.drawFace(this.value);

    // Invisible click target on the dice face
    const hitArea = this.scene.add.rectangle(0, -16, 66, 66, 0xffffff, 0);
    hitArea.setInteractive({ useHandCursor: true });
    hitArea.on("pointerdown", () => this.roll());
    hitArea.on("pointerover", () => { if (this.enabled) this.scene.tweens.add({ targets: this.container, scale: 1.05, duration: 100 }); });
    hitArea.on("pointerout",  () => { this.scene.tweens.add({ targets: this.container, scale: 1.0,  duration: 100 }); });

    // Roll button
    this.rollBtn = this.scene.add.rectangle(0, 44, 160, 38, 0x7c3aed);
    this.rollBtn.setStrokeStyle(2, 0xa78bfa);
    this.rollBtn.setInteractive({ useHandCursor: true });
    this.rollBtn.on("pointerdown", () => this.roll());
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
      hitArea,
      this.rollBtn,
      this.rollLabel,
    ]);
    this.container.setDepth(100);
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
    this.rollBtn.setFillStyle(0x7c3aed).setAlpha(1);
    this.rollBtn.setInteractive({ useHandCursor: true });
    this.rollLabel.setText(label).setAlpha(1);
  }

  disable(): void {
    this.enabled = false;
    this.rollBtn.setFillStyle(0x1e293b).setAlpha(0.6);
    this.rollBtn.disableInteractive();
    this.rollLabel.setAlpha(0.5);
  }

  /** Show "waiting" state visually without blocking rollForAI() */
  setWaiting(label: string): void {
    this.rollBtn.setFillStyle(0x1e293b).setAlpha(0.6);
    this.rollBtn.disableInteractive();
    this.rollLabel.setText(label).setAlpha(0.7);
  }

  /** Show prompt to select a token (after rolling, multiple moves available) */
  setSelectMode(): void {
    this.disable();
    this.rollLabel.setText("Select a token").setAlpha(1);
  }

  // ─── Roll ─────────────────────────────────────────────────────────────────────

  /** Human click — requires enabled state */
  roll(): void {
    if (this.rolling || !this.enabled) return;
    this.startRoll();
  }

  /** AI-triggered roll — bypasses enabled guard */
  rollForAI(): void {
    if (this.rolling) return;
    this.startRoll();
  }

  private startRoll(): void {
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
        this.finishRoll();
      }
    };
    tick();
  }

  private finishRoll(): void {
    this.value = Phaser.Math.Between(1, 6);
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
