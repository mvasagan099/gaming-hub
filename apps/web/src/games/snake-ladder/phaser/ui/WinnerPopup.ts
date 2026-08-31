import Phaser from "phaser";
import type { MoveHistoryEntry } from "../managers/GameManager";
import type { ParticleManager } from "../effects/ParticleManager";
import { ANIM, animDuration, prefersReducedMotion } from "../constants";

export interface WinnerPopupOptions {
  mode?: "ai" | "multiplayer";
  won?: boolean;
}

export default class WinnerPopup {
  private scene: Phaser.Scene;
  private container!: Phaser.GameObjects.Container;
  private overlay!: Phaser.GameObjects.Rectangle;
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
    this.overlay = this.scene.add.rectangle(cx, cy, w, h, 0x000000, 0.8);

    // Card background
    const card = this.scene.add.graphics();
    card.fillStyle(0x0f172a, 1);
    card.fillRoundedRect(cx - 210, cy - 160, 420, 320, 16);
    card.lineStyle(3, 0xf59e0b, 0.8);
    card.strokeRoundedRect(cx - 210, cy - 160, 420, 320, 16);
    // Subtle inner glow
    card.fillStyle(0xf59e0b, 0.03);
    card.fillRoundedRect(cx - 210, cy - 160, 420, 320, 16);

    // Trophy
    this.trophyText = this.scene.add.text(cx, cy - 110, "🏆", {
      fontSize: "56px",
      align: "center",
    }).setOrigin(0.5);

    // Title
    this.titleText = this.scene.add.text(cx, cy - 48, "", {
      fontSize: "24px",
      color: "#f59e0b",
      fontFamily: "Outfit, sans-serif",
      fontStyle: "bold",
      align: "center",
      stroke: "#000000",
      strokeThickness: 2,
    }).setOrigin(0.5);

    // Stats
    this.statsText = this.scene.add.text(cx, cy + 5, "", {
      fontSize: "13px",
      color: "#94a3b8",
      fontFamily: "Outfit, sans-serif",
      align: "center",
      lineSpacing: 6,
    }).setOrigin(0.5);

    // Divider
    const divider = this.scene.add.graphics();
    divider.lineStyle(1, 0x334155, 0.6);
    divider.lineBetween(cx - 170, cy + 45, cx + 170, cy + 45);

    // Play Again button
    const btnBg = this.scene.add.graphics();
    btnBg.fillStyle(0x16a34a, 1);
    btnBg.fillRoundedRect(cx - 175, cy + 62, 160, 44, 10);
    btnBg.lineStyle(2, 0x4ade80, 0.7);
    btnBg.strokeRoundedRect(cx - 175, cy + 62, 160, 44, 10);
    btnBg.setInteractive({
      hitArea: new Phaser.Geom.Rectangle(cx - 175, cy + 62, 160, 44),
      hitAreaCallback: Phaser.Geom.Rectangle.Contains,
      useHandCursor: true,
    });
    btnBg.on("pointerover", () => { btnBg.clear(); btnBg.fillStyle(0x15803d, 1); btnBg.fillRoundedRect(cx - 175, cy + 62, 160, 44, 10); btnBg.lineStyle(2, 0x4ade80, 1); btnBg.strokeRoundedRect(cx - 175, cy + 62, 160, 44, 10); });
    btnBg.on("pointerout", () => { btnBg.clear(); btnBg.fillStyle(0x16a34a, 1); btnBg.fillRoundedRect(cx - 175, cy + 62, 160, 44, 10); btnBg.lineStyle(2, 0x4ade80, 0.7); btnBg.strokeRoundedRect(cx - 175, cy + 62, 160, 44, 10); });
    btnBg.on("pointerdown", () => this.onPlayAgain());

    this.playBtnLabel = this.scene.add.text(cx - 95, cy + 84, "REPLAY", {
      fontSize: "14px",
      color: "#ffffff",
      fontFamily: "Outfit, sans-serif",
      fontStyle: "bold",
    }).setOrigin(0.5);

    // Close button
    const closeBtnBg = this.scene.add.graphics();
    closeBtnBg.fillStyle(0xef4444, 1);
    closeBtnBg.fillRoundedRect(cx + 15, cy + 62, 160, 44, 10);
    closeBtnBg.lineStyle(2, 0xf87171, 0.7);
    closeBtnBg.strokeRoundedRect(cx + 15, cy + 62, 160, 44, 10);
    closeBtnBg.setInteractive({
      hitArea: new Phaser.Geom.Rectangle(cx + 15, cy + 62, 160, 44),
      hitAreaCallback: Phaser.Geom.Rectangle.Contains,
      useHandCursor: true,
    });
    closeBtnBg.on("pointerover", () => { closeBtnBg.clear(); closeBtnBg.fillStyle(0xb91c1c, 1); closeBtnBg.fillRoundedRect(cx + 15, cy + 62, 160, 44, 10); closeBtnBg.lineStyle(2, 0xf87171, 1); closeBtnBg.strokeRoundedRect(cx + 15, cy + 62, 160, 44, 10); });
    closeBtnBg.on("pointerout", () => { closeBtnBg.clear(); closeBtnBg.fillStyle(0xef4444, 1); closeBtnBg.fillRoundedRect(cx + 15, cy + 62, 160, 44, 10); closeBtnBg.lineStyle(2, 0xf87171, 0.7); closeBtnBg.strokeRoundedRect(cx + 15, cy + 62, 160, 44, 10); });
    closeBtnBg.on("pointerdown", () => this.onClose());

    this.closeBtnLabel = this.scene.add.text(cx + 95, cy + 84, "CLOSE", {
      fontSize: "14px",
      color: "#ffffff",
      fontFamily: "Outfit, sans-serif",
      fontStyle: "bold",
    }).setOrigin(0.5);

    this.container = this.scene.add.container(0, 0, [
      this.overlay,
      card,
      this.trophyText,
      this.titleText,
      this.statsText,
      divider,
      btnBg,
      this.playBtnLabel,
      closeBtnBg,
      this.closeBtnLabel,
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
        this.titleText.setText("YOU WON!");
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
        this.titleText.setText("YOU WON!");
        this.titleText.setColor("#4ade80");
        this.particles?.winFireworks();
      } else {
        this.trophyText.setText("🤖");
        this.titleText.setText("SORRY, AI WON...");
        this.titleText.setColor("#f87171");
      }
    }

    // Stats
    const rolls = history.length;
    const snakes = history.filter((e) => e.event === "snake").length;
    const ladders = history.filter((e) => e.event === "ladder").length;
    this.statsText.setText(
      `🎲 Rolls: ${rolls}   |   🐍 Snakes: ${snakes}   |   🪜 Ladders: ${ladders}`,
    );

    this.container.setVisible(true);

    const reduced = prefersReducedMotion();
    if (reduced) {
      this.container.setScale(1);
      return;
    }

    // Pop-in animation
    this.scene.tweens.add({
      targets: this.container,
      scale: 1,
      duration: animDuration(450),
      ease: "Back.Out",
    });

    // Trophy pulse animation
    this.scene.tweens.add({
      targets: this.trophyText,
      scale: { from: 1, to: ANIM.winTrophyPulseScale },
      duration: animDuration(ANIM.winTrophyPulseDuration),
      yoyo: true,
      repeat: 2,
      ease: "Sine.InOut",
      delay: animDuration(300),
    });
  }

  /** Override the REPLAY / CLOSE button behaviour (multiplayer driver). */
  setActions(onPlayAgain?: (() => void) | null, onClose?: (() => void) | null): void {
    this.playAgainAction = onPlayAgain ?? null;
    this.closeAction = onClose ?? null;
    if (this.playBtnLabel) {
      this.playBtnLabel.setText(onPlayAgain ? "REMATCH" : "REPLAY");
    }
    if (this.closeBtnLabel) {
      this.closeBtnLabel.setText(onClose ? "EXIT LOBBY" : "CLOSE");
    }
  }

  hide(): void {
    const reduced = prefersReducedMotion();
    if (reduced) {
      this.container.setVisible(false);
      return;
    }

    this.scene.tweens.add({
      targets: this.container,
      scale: 0,
      duration: animDuration(250),
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
    window.location.href = "/";
  }
}

export { WinnerPopup };
