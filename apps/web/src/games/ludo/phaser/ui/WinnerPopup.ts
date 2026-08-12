import Phaser from "phaser";
import type { LudoHistoryEntry } from "../managers/GameManager";
import type ParticleManager from "../../../snake-ladder/phaser/managers/ParticleManager";

export default class WinnerPopup {
  private scene: Phaser.Scene;
  private container!: Phaser.GameObjects.Container;
  private titleText!: Phaser.GameObjects.Text;
  private trophyText!: Phaser.GameObjects.Text;
  private statsText!: Phaser.GameObjects.Text;
  private particles: ParticleManager | null;
  private onPlayAgain: (() => void) | null = null;

  constructor(scene: Phaser.Scene, particles: ParticleManager | null = null) {
    this.scene = scene;
    this.particles = particles;
  }

  create(): void {
    const w = this.scene.scale.width;
    const h = this.scene.scale.height;
    const cx = w / 2;
    const cy = h / 2;

    const overlay = this.scene.add.rectangle(cx, cy, w, h, 0x000000, 0.75);

    const card = this.scene.add.rectangle(0, 0, 420, 300, 0x0f172a);
    card.setStrokeStyle(3, 0xf59e0b);

    this.trophyText = this.scene.add.text(0, -110, "🏆", { fontSize: "52px" }).setOrigin(0.5);

    this.titleText = this.scene.add.text(0, -48, "", {
      fontSize:   "24px",
      color:      "#f59e0b",
      fontFamily: "Outfit, sans-serif",
      fontStyle:  "bold",
      align:      "center",
    }).setOrigin(0.5);

    this.statsText = this.scene.add.text(0, 10, "", {
      fontSize:   "13px",
      color:      "#94a3b8",
      fontFamily: "Outfit, sans-serif",
      align:      "center",
      lineSpacing: 6,
    }).setOrigin(0.5);

    const divider = this.scene.add.rectangle(0, 55, 360, 1, 0x334155);

    const btnBg = this.scene.add.rectangle(0, 95, 160, 44, 0x16a34a);
    btnBg.setStrokeStyle(2, 0x4ade80);
    btnBg.setInteractive({ useHandCursor: true });
    btnBg.on("pointerover", () => btnBg.setFillStyle(0x15803d));
    btnBg.on("pointerout",  () => btnBg.setFillStyle(0x16a34a));
    btnBg.on("pointerdown", () => this.handlePlayAgain());

    const btnLabel = this.scene.add.text(0, 95, "▶  PLAY AGAIN", {
      fontSize:   "13px",
      color:      "#ffffff",
      fontFamily: "Outfit, sans-serif",
      fontStyle:  "bold",
    }).setOrigin(0.5);

    this.container = this.scene.add.container(cx, cy, [
      overlay,
      card,
      this.trophyText,
      this.titleText,
      this.statsText,
      divider,
      btnBg,
      btnLabel,
    ]);

    this.container.setDepth(200);
    this.container.setVisible(false);
    this.container.setScale(0);
  }

  /**
   * Override the play-again button behaviour (online driver). When unset the
   * button restarts the local scene.
   */
  setActions(onPlayAgain: () => void): void {
    this.onPlayAgain = onPlayAgain;
  }

  show(
    playerName: string,
    history: LudoHistoryEntry[] = [],
    opts?: { multiplayer?: boolean; won?: boolean },
  ): void {
    if (opts?.multiplayer) {
      if (opts.won) {
        this.trophyText.setText("🏆");
        this.titleText.setText("🎉 YOU WIN!");
        this.titleText.setColor("#4ade80");
        this.particles?.winFireworks();
      } else {
        this.trophyText.setText("💔");
        this.titleText.setText(`YOU LOST\n(${playerName} Won)`);
        this.titleText.setColor("#f87171");
      }
    } else {
      this.titleText.setText(opts?.won ? "🎉 YOU WIN!" : `${playerName.toUpperCase()} WINS!`);
      if (opts?.won) {
        this.particles?.winFireworks();
      }
    }

    const totalRolls = history.length;
    const captures   = history.filter((h) => h.message.includes("⚔️")).length;
    this.statsText.setText(`Total Rolls: ${totalRolls}   •   Captures: ${captures}`);

    this.container.setVisible(true);

    this.scene.tweens.add({
      targets:  this.container,
      scale:    1,
      duration: 450,
      ease:     "Back.Out",
    });

    this.particles?.winFireworks();
  }

  hide(): void {
    this.scene.tweens.add({
      targets:  this.container,
      scale:    0,
      duration: 250,
      ease:     "Back.In",
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
