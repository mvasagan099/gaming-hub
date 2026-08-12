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
  private trophyText!: Phaser.GameObjects.Text;
  private statsText!: Phaser.GameObjects.Text;
  private playBtnLabel!: Phaser.GameObjects.Text;
  private closeBtnLabel!: Phaser.GameObjects.Text;
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

    // Trophy / outcome icon
    this.trophyText = this.scene.add.text(0, -110, "🏆", {
      fontSize: "52px",
      align: "center",
    }).setOrigin(0.5);

    // Winner title
    this.titleText = this.scene.add.text(0, -48, "", {
      fontSize: "24px",
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

    this.playBtnLabel = this.scene.add.text(-85, 95, "▶  REPLAY", {
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

    this.closeBtnLabel = this.scene.add.text(85, 95, "✖  CLOSE", {
      fontSize: "13px",
      color: "#ffffff",
      fontFamily: "Outfit, sans-serif",
      fontStyle: "bold",
    }).setOrigin(0.5);

    this.container = this.scene.add.container(cx, cy, [
      overlay,
      card,
      this.trophyText,
      this.titleText,
      this.statsText,
      divider,
      btnBg,
      this.playBtnLabel,
      closeBtnBg,
      this.closeBtnLabel
    ]);

    this.container.setDepth(200);
    this.container.setVisible(false);
    this.container.setScale(0);
  }

  show(playerName: string, history: MoveHistoryEntry[] = [], options: WinnerPopupOptions = {}): void {
    const isMultiplayer = options.mode === "multiplayer";

    if (isMultiplayer) {
      if (options.won) {
        this.trophyText.setText("🏆");
        this.titleText.setText("🎉 YOU WON!");
        this.titleText.setColor("#4ade80");
        this.particles?.winFireworks();
      } else {
        this.trophyText.setText("💔");
        this.titleText.setText(`YOU LOST\n(${playerName} Won)`);
        this.titleText.setColor("#f87171");
      }
    } else {
      const regNames = (this.scene.registry.get("names") as string[] | undefined) ?? [];
      const humanName = regNames[0]?.toLowerCase();
      const isHuman =
        playerName.toLowerCase() === "player 1" ||
        (humanName != null && playerName.toLowerCase() === humanName);

      if (isHuman) {
        this.trophyText.setText("🏆");
        this.titleText.setText("🎉 YOU WON! (+50 Coins)");
        this.titleText.setColor("#4ade80");
        void claimPracticeReward("snake-ladder");
        this.particles?.winFireworks();
      } else {
        this.trophyText.setText("🤖");
        this.titleText.setText("SORRY, AI WON...");
        this.titleText.setColor("#f87171");
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
    if (this.playBtnLabel) {
      this.playBtnLabel.setText(onPlayAgain ? "🔄  REMATCH" : "▶  REPLAY");
    }
    if (this.closeBtnLabel) {
      this.closeBtnLabel.setText(onClose ? "🚪  EXIT LOBBY" : "✖  CLOSE");
    }
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
