import Phaser from "phaser";
import type { MoveHistoryEntry } from "../managers/GameManager";
import type ParticleManager from "../managers/ParticleManager";
import { claimPracticeReward } from "../../../../services/api/practiceReward";

export interface WinnerPopupOptions {
  mode?: "ai" | "multiplayer";
  won?: boolean;
}

export default class WinnerPopup {
  private scene: Phaser.Scene;
  private container!: Phaser.GameObjects.Container;
  private titleText!: Phaser.GameObjects.Text;
  private statsText!: Phaser.GameObjects.Text;
  private particles: ParticleManager | null;
  private playAgainAction: (() => void) | null = null;
  private closeAction: (() => void) | null = null;

  constructor(scene: Phaser.Scene, particles: ParticleManager | null = null) {
    this.scene = scene;
    this.particles = particles;
  }

  create(): void {
    const w = this.scene.scale.width;
    const h = this.scene.scale.height;
    const cx = w / 2;
    const cy = h / 2;

    // Dim overlay
    const overlay = this.scene.add.rectangle(cx, cy, w, h, 0x000000, 0.75);

    // Card background
    const card = this.scene.add.rectangle(0, 0, 420, 300, 0x0f172a);
    card.setStrokeStyle(3, 0xf59e0b);

    // Trophy
    const trophy = this.scene.add.text(0, -110, "🏆", {
      fontSize: "52px",
      align: "center",
    }).setOrigin(0.5);

    // Winner title
    this.titleText = this.scene.add.text(0, -48, "", {
      fontSize: "26px",
      color: "#f59e0b",
      fontFamily: "Outfit, sans-serif",
      fontStyle: "bold",
      align: "center",
    }).setOrigin(0.5);

    // Match stats
    this.statsText = this.scene.add.text(0, 10, "", {
      fontSize: "13px",
      color: "#94a3b8",
      fontFamily: "Outfit, sans-serif",
      align: "center",
      lineSpacing: 6,
    }).setOrigin(0.5);

    // Divider
    const divider = this.scene.add.rectangle(0, 55, 360, 1, 0x334155);

    // Play Again button
    const btnBg = this.scene.add.rectangle(-85, 95, 150, 44, 0x16a34a);
    btnBg.setStrokeStyle(2, 0x4ade80);
    btnBg.setInteractive({ useHandCursor: true });
    btnBg.on("pointerover", () => btnBg.setFillStyle(0x15803d));
    btnBg.on("pointerout",  () => btnBg.setFillStyle(0x16a34a));
    btnBg.on("pointerdown", () => this.onPlayAgain());

    const btnLabel = this.scene.add.text(-85, 95, "▶  REPLAY", {
      fontSize: "13px",
      color: "#ffffff",
      fontFamily: "Outfit, sans-serif",
      fontStyle: "bold",
    }).setOrigin(0.5);

    // Close button
    const closeBtnBg = this.scene.add.rectangle(85, 95, 150, 44, 0xef4444);
    closeBtnBg.setStrokeStyle(2, 0xf87171);
    closeBtnBg.setInteractive({ useHandCursor: true });
    closeBtnBg.on("pointerover", () => closeBtnBg.setFillStyle(0xb91c1c));
    closeBtnBg.on("pointerout",  () => closeBtnBg.setFillStyle(0xef4444));
    closeBtnBg.on("pointerdown", () => this.onClose());

    const closeBtnLabel = this.scene.add.text(85, 95, "✖  CLOSE", {
      fontSize: "13px",
      color: "#ffffff",
      fontFamily: "Outfit, sans-serif",
      fontStyle: "bold",
    }).setOrigin(0.5);

    this.container = this.scene.add.container(cx, cy, [
      overlay,
      card,
      trophy,
      this.titleText,
      this.statsText,
      divider,
      btnBg,
      btnLabel,
      closeBtnBg,
      closeBtnLabel
    ]);

    this.container.setDepth(200);
    this.container.setVisible(false);
    this.container.setScale(0);
  }

  show(playerName: string, history: MoveHistoryEntry[] = [], options: WinnerPopupOptions = {}): void {
    const isMultiplayer = options.mode === "multiplayer";

    if (isMultiplayer) {
      this.titleText.setText(options.won ? `🏆 YOU WON!` : `🏆 ${playerName} WON!`);
      this.titleText.setColor(options.won ? "#4ade80" : "#f59e0b");
      if (options.won) {
        this.particles?.winFireworks();
      }
    } else {
      const isHuman = playerName.toLowerCase() === "player 1";

      if (isHuman) {
        this.titleText.setText(`🎉 YOU WON! (+50 Coins)`);
        this.titleText.setColor("#4ade80");
        void claimPracticeReward("snake-ladder");
      } else {
        this.titleText.setText(`🤖 SORRY, AI WON...`);
        this.titleText.setColor("#f87171");
      }

      // Fireworks only if human wins
      if (isHuman) {
        this.particles?.winFireworks();
      }
    }

    // Compute stats
    const rolls  = history.length;
    const snakes = history.filter((e) => e.event === "snake").length;
    const ladders = history.filter((e) => e.event === "ladder").length;
    this.statsText.setText(
      `Total Rolls: ${rolls}   •   Snakes Hit: ${snakes}   •   Ladders Climbed: ${ladders}`
    );

    this.container.setVisible(true);

    // Pop-in animation
    this.scene.tweens.add({
      targets: this.container,
      scale: 1,
      duration: 450,
      ease: "Back.Out",
    });
  }

  /** Override the REPLAY / CLOSE button behaviour (multiplayer driver). */
  setActions(onPlayAgain?: (() => void) | null, onClose?: (() => void) | null): void {
    this.playAgainAction = onPlayAgain ?? null;
    this.closeAction = onClose ?? null;
  }

  hide(): void {
    this.scene.tweens.add({
      targets: this.container,
      scale: 0,
      duration: 250,
      ease: "Back.In",
      onComplete: () => this.container.setVisible(false),
    });
  }

  private onPlayAgain(): void {
    if (this.playAgainAction) {
      this.playAgainAction();
      return;
    }
    this.scene.scene.restart();
  }

  private onClose(): void {
    if (this.closeAction) {
      this.closeAction();
      return;
    }
    // Navigate back to lobby
    window.location.href = "/";
  }
}

export { WinnerPopup };
