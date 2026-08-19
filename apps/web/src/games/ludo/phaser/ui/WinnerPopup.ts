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

    const overlay = this.scene.add.rectangle(cx, cy, w, h, 0x000000, 0.78);

    // Modern rounded card
    const card = this.scene.add.graphics();
    card.fillStyle(0x0f172a, 1);
    card.fillRoundedRect(cx - 210, cy - 150, 420, 300, 20);
    card.lineStyle(3, 0xf59e0b, 1);
    card.strokeRoundedRect(cx - 210, cy - 150, 420, 300, 20);

    this.trophyText = this.scene.add.text(cx, cy - 110, "🏆", {
      fontSize: "52px",
    }).setOrigin(0.5);

    this.titleText = this.scene.add.text(cx, cy - 48, "", {
      fontSize: "24px",
      color: "#f59e0b",
      fontFamily: "Outfit, sans-serif",
      fontStyle: "bold",
      align: "center",
    }).setOrigin(0.5);

    this.statsText = this.scene.add.text(cx, cy + 10, "", {
      fontSize: "13px",
      color: "#94a3b8",
      fontFamily: "Outfit, sans-serif",
      align: "center",
      lineSpacing: 6,
    }).setOrigin(0.5);

    // Divider
    const divider = this.scene.add.graphics();
    divider.lineStyle(1, 0x334155, 1);
    divider.lineBetween(cx - 180, cy + 55, cx + 180, cy + 55);

    // Modern rounded play-again button
    const btnGfx = this.scene.add.graphics();
    btnGfx.fillStyle(0x16a34a, 1);
    btnGfx.fillRoundedRect(cx - 80, cy + 73, 160, 44, 22);
    btnGfx.lineStyle(2, 0x4ade80, 1);
    btnGfx.strokeRoundedRect(cx - 80, cy + 73, 160, 44, 22);

    const btnHit = this.scene.add.rectangle(cx, cy + 95, 160, 44, 0xffffff, 0);
    btnHit.setInteractive({ useHandCursor: true });
    btnHit.on("pointerover", () => {
      btnGfx.clear();
      btnGfx.fillStyle(0x15803d, 1);
      btnGfx.fillRoundedRect(cx - 80, cy + 73, 160, 44, 22);
      btnGfx.lineStyle(2, 0x4ade80, 1);
      btnGfx.strokeRoundedRect(cx - 80, cy + 73, 160, 44, 22);
    });
    btnHit.on("pointerout", () => {
      btnGfx.clear();
      btnGfx.fillStyle(0x16a34a, 1);
      btnGfx.fillRoundedRect(cx - 80, cy + 73, 160, 44, 22);
      btnGfx.lineStyle(2, 0x4ade80, 1);
      btnGfx.strokeRoundedRect(cx - 80, cy + 73, 160, 44, 22);
    });
    btnHit.on("pointerdown", () => this.handlePlayAgain());

    const btnLabel = this.scene.add.text(cx, cy + 95, "PLAY AGAIN", {
      fontSize: "13px",
      color: "#ffffff",
      fontFamily: "Outfit, sans-serif",
      fontStyle: "bold",
    }).setOrigin(0.5);

    this.container = this.scene.add.container(0, 0, [
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
        this.titleText.setText("YOU WIN!");
        this.titleText.setColor("#4ade80");
        this.particles?.winFireworks();
      } else {
        this.trophyText.setText("💔");
        this.titleText.setText(`YOU LOST\n(${playerName} Won)`);
        this.titleText.setColor("#f87171");
      }
    } else {
      this.titleText.setText(opts?.won ? "YOU WIN!" : `${playerName.toUpperCase()} WINS!`);
      if (opts?.won) {
        this.particles?.winFireworks();
      }
    }

    const totalRolls = history.length;
    const captures = history.filter((h) => h.message.includes("Captured")).length;
    this.statsText.setText(`Total Rolls: ${totalRolls}   •   Captures: ${captures}`);

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
