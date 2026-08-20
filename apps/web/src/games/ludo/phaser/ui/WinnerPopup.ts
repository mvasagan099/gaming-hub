import Phaser from "phaser";
import type { LudoHistoryEntry } from "../managers/GameManager";
import type ParticleManager from "../../../snake-ladder/phaser/managers/ParticleManager";
import { ANIM, animDuration, prefersReducedMotion } from "../constants";

export default class WinnerPopup {
  private scene: Phaser.Scene;
  private container!: Phaser.GameObjects.Container;
  private titleText!: Phaser.GameObjects.Text;
  private trophyText!: Phaser.GameObjects.Text;
  private statsText!: Phaser.GameObjects.Text;
  private particles: ParticleManager | null;
  private onPlayAgain: (() => void) | null = null;
  private trophyTween?: Phaser.Tweens.Tween;

  constructor(scene: Phaser.Scene, particles: ParticleManager | null = null) {
    this.scene = scene;
    this.particles = particles;
  }

  create(): void {
    const w = this.scene.scale.width;
    const h = this.scene.scale.height;
    const cx = w / 2;
    const cy = h / 2;

    // 1. Dark Backdrop Overlay
    const overlay = this.scene.add.rectangle(0, 0, w, h, 0x000000, 0.85);

    // 2. Modern 3D Rounded Victory Card
    const card = this.scene.add.graphics();
    // Drop shadow
    card.fillStyle(0x000000, 0.4);
    card.fillRoundedRect(-216, -156, 432, 312, 24);

    // Card Body
    card.fillStyle(0x0f172a, 0.98);
    card.fillRoundedRect(-210, -150, 420, 300, 20);

    // Inner Glow
    card.fillStyle(0xf59e0b, 0.04);
    card.fillRoundedRect(-210, -150, 420, 300, 20);

    // Gold Beveled Stroke
    card.lineStyle(2.5, 0xf59e0b, 0.9);
    card.strokeRoundedRect(-210, -150, 420, 300, 20);

    // Top sheen
    card.fillStyle(0xffffff, 0.1);
    card.fillRoundedRect(-210, -150, 420, 8, { tl: 20, tr: 20, bl: 0, br: 0 });

    this.trophyText = this.scene.add.text(0, -100, "🏆", {
      fontSize: "56px",
    }).setOrigin(0.5);

    this.titleText = this.scene.add.text(0, -38, "", {
      fontSize: "24px",
      color: "#f59e0b",
      fontFamily: "Outfit, sans-serif",
      fontStyle: "bold",
      align: "center",
      shadow: {
        offsetX: 0,
        offsetY: 2,
        color: "#000000",
        blur: 4,
        fill: true,
      },
    }).setOrigin(0.5);

    this.statsText = this.scene.add.text(0, 18, "", {
      fontSize: "13px",
      color: "#94a3b8",
      fontFamily: "Outfit, sans-serif",
      align: "center",
      lineSpacing: 6,
    }).setOrigin(0.5);

    // Divider
    const divider = this.scene.add.graphics();
    divider.lineStyle(1, 0x334155, 0.8);
    divider.lineBetween(-170, 58, 170, 58);

    // Modern Tactile Play-Again Button
    const btnGfx = this.scene.add.graphics();
    this.drawButton(btnGfx, "normal");

    const btnHit = this.scene.add.rectangle(0, 95, 170, 44, 0xffffff, 0);
    btnHit.setInteractive({ useHandCursor: true });

    btnHit.on("pointerover", () => this.drawButton(btnGfx, "hover"));
    btnHit.on("pointerout", () => this.drawButton(btnGfx, "normal"));
    btnHit.on("pointerdown", () => {
      this.drawButton(btnGfx, "pressed");
      this.handlePlayAgain();
    });

    const btnLabel = this.scene.add.text(0, 95, "PLAY AGAIN", {
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

    this.container = this.scene.add.container(cx, cy, [
      overlay,
      card as unknown as Phaser.GameObjects.GameObject,
      this.trophyText,
      this.titleText,
      this.statsText,
      divider as unknown as Phaser.GameObjects.GameObject,
      btnGfx as unknown as Phaser.GameObjects.GameObject,
      btnHit,
      btnLabel,
    ]);

    this.container.setDepth(200);
    this.container.setVisible(false);
    this.container.setScale(0);
  }

  private drawButton(g: Phaser.GameObjects.Graphics, state: "normal" | "hover" | "pressed"): void {
    g.clear();
    const w = 170;
    const h = 44;
    const y = 95;
    const r = 22;

    const baseColor = state === "hover" ? 0x15803d : state === "pressed" ? 0x14532d : 0x16a34a;

    // Drop shadow
    g.fillStyle(0x000000, 0.25);
    g.fillRoundedRect(-w / 2 + 2, y - h / 2 + 3, w, h, r);

    // Button body
    g.fillStyle(baseColor, 1.0);
    g.fillRoundedRect(-w / 2, y - h / 2, w, h, r);

    // Top sheen
    g.fillStyle(0xffffff, 0.2);
    g.fillRoundedRect(-w / 2, y - h / 2, w, h * 0.45, { tl: r, tr: r, bl: 0, br: 0 });

    // Border
    g.lineStyle(2, 0x4ade80, 0.9);
    g.strokeRoundedRect(-w / 2, y - h / 2, w, h, r);
  }

  setActions(onPlayAgain: () => void): void {
    this.onPlayAgain = onPlayAgain;
  }

  show(
    playerName: string,
    history: LudoHistoryEntry[] = [],
    opts?: { multiplayer?: boolean; won?: boolean },
  ): void {
    const reduced = prefersReducedMotion();

    if (opts?.multiplayer) {
      if (opts.won) {
        this.trophyText.setText("🏆");
        this.titleText.setText("VICTORY!\n1st PLACE");
        this.titleText.setColor("#4ade80");
        this.particles?.winFireworks();
      } else {
        this.trophyText.setText("💔");
        this.titleText.setText(`GAME OVER\n(${playerName} Won)`);
        this.titleText.setColor("#f87171");
      }
    } else {
      this.titleText.setText(opts?.won ? "VICTORY!\n1st PLACE" : `${playerName.toUpperCase()} WINS!`);
      if (opts?.won) {
        this.particles?.winFireworks();
      }
    }

    const totalRolls = history.length;
    const captures = history.filter((h) => h.message.includes("Captured")).length;
    this.statsText.setText(`🎲 Total Rolls: ${totalRolls}    ⚔️ Captures: ${captures}`);

    this.container.setVisible(true);

    this.scene.tweens.add({
      targets: this.container,
      scaleX: 1,
      scaleY: 1,
      duration: animDuration(450),
      ease: "Back.Out",
    });

    // Trophy pulse animation
    this.trophyTween?.stop();
    if (!reduced) {
      this.trophyTween = this.scene.tweens.add({
        targets: this.trophyText,
        scaleX: ANIM.winTrophyPulseScale,
        scaleY: ANIM.winTrophyPulseScale,
        duration: animDuration(ANIM.winTrophyPulseDuration),
        ease: "Sine.InOut",
        yoyo: true,
        repeat: -1,
      });
    }

    this.particles?.winFireworks();
  }

  hide(): void {
    this.trophyTween?.stop();
    this.scene.tweens.add({
      targets: this.container,
      scaleX: 0,
      scaleY: 0,
      duration: animDuration(250),
      ease: "Back.In",
      onComplete: () => this.container.setVisible(false),
    });
  }

  private handlePlayAgain(): void {
    if (this.onPlayAgain) {
      this.onPlayAgain();
      return;
    }
    this.scene.scene.restart();
  }
}

export { WinnerPopup };
