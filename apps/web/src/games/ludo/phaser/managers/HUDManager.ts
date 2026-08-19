import Phaser from "phaser";
import type { PlayerColor } from "../types/ludo.types";
import { ANIM, animDuration, prefersReducedMotion } from "../constants";

const PANEL_X = 912;
const PANEL_W = 224;
const PANEL_H = 800;

const COLORS = {
  red:    0xef4444,
  blue:   0x3b82f6,
  green:  0x22c55e,
  yellow: 0xeab308,
  bg:     0x090d16,
  card:   0x0f172a,
  border: 0x1e293b,
  accent: 0x7c3aed,
};

const ORDERED_COLORS: Array<keyof typeof COLORS> = ["red", "blue", "green", "yellow"];

export default class HUDManager {
  private scene: Phaser.Scene;
  private turnText!: Phaser.GameObjects.Text;
  private bannerContainer!: Phaser.GameObjects.Container;
  private bannerText!: Phaser.GameObjects.Text;
  private bannerTween: Phaser.Tweens.Tween | null = null;
  private cards: Phaser.GameObjects.Rectangle[] = [];
  private cardStrokes: Phaser.GameObjects.Graphics[] = [];
  private dots: Phaser.GameObjects.Arc[] = [];
  private nameTexts: Phaser.GameObjects.Text[] = [];
  private logLines: Phaser.GameObjects.Text[] = [];
  private progressTexts: Phaser.GameObjects.Text[] = [];
  private tokenCountTexts: Phaser.GameObjects.Text[] = [];
  private colors: PlayerColor[] = ["red", "blue", "green", "yellow"];
  private mySeat = 0;
  private soundBtn!: Phaser.GameObjects.Container;
  private soundOn = true;
  private onSoundToggle: (() => void) | null = null;
  private static readonly MAX_LOG = 5;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  create(totalPlayers = 4): void {
    const depth = 10;

    // Sidebar background — rounded
    const bg = this.scene.add.graphics();
    bg.setDepth(depth);
    bg.fillStyle(COLORS.bg, 1);
    bg.fillRoundedRect(PANEL_X - PANEL_W / 2, 0, PANEL_W, PANEL_H, { tl: 0, tr: 12, bl: 0, br: 12 });
    bg.lineStyle(2, COLORS.border, 1);
    bg.strokeRoundedRect(PANEL_X - PANEL_W / 2, 0, PANEL_W, PANEL_H, { tl: 0, tr: 12, bl: 0, br: 12 });

    // Floating selection banner
    const bannerBg = this.scene.add.graphics();
    bannerBg.fillStyle(0xd97706, 1);
    bannerBg.fillRoundedRect(-152, -18, 304, 36, 18);
    bannerBg.lineStyle(2, 0xfcd34d, 1);
    bannerBg.strokeRoundedRect(-152, -18, 304, 36, 18);

    this.bannerText = this.scene.add.text(0, 0, "TAP A HIGHLIGHTED TOKEN TO MOVE!", {
      fontSize: "11px",
      color: "#ffffff",
      fontFamily: "Outfit, sans-serif",
      fontStyle: "bold",
    }).setOrigin(0.5);

    this.bannerContainer = this.scene.add.container(400, 36, [bannerBg, this.bannerText]);
    this.bannerContainer.setDepth(150);
    this.bannerContainer.setVisible(false);
    this.bannerContainer.setScale(0);

    // Title
    this.scene.add.text(PANEL_X, 22, "LUDO CHAMPION", {
      fontSize: "14px",
      color: "#f59e0b",
      fontFamily: "Outfit, sans-serif",
      fontStyle: "bold",
    }).setOrigin(0.5).setDepth(depth + 1);

    // Turn card — rounded
    const turnGfx = this.scene.add.graphics();
    turnGfx.setDepth(depth);
    turnGfx.fillStyle(COLORS.card, 1);
    turnGfx.fillRoundedRect(PANEL_X - 95, 44, 190, 44, 10);
    turnGfx.lineStyle(2, COLORS.accent, 1);
    turnGfx.strokeRoundedRect(PANEL_X - 95, 44, 190, 44, 10);

    this.turnText = this.scene.add.text(PANEL_X, 66, "WAITING...", {
      fontSize: "11px",
      color: "#ffffff",
      fontFamily: "Outfit, sans-serif",
      fontStyle: "bold",
    }).setOrigin(0.5).setDepth(depth + 1);

    // Dice area label
    this.scene.add.text(PANEL_X, 135, "DICE CONTROLLER", {
      fontSize: "10px",
      color: "#64748b",
      fontFamily: "Outfit, sans-serif",
    }).setOrigin(0.5).setDepth(depth + 1);

    // Sound toggle button
    this.createSoundToggle(depth);

    // Player cards
    const startY = 360;
    const gap = 76;

    for (let i = 0; i < totalPlayers; i++) {
      const cy = startY + i * gap;
      const colName = ORDERED_COLORS[i % 4]!;
      const hexColor = COLORS[colName];

      // Card background — rounded
      const cardGfx = this.scene.add.graphics();
      cardGfx.setDepth(depth);
      cardGfx.fillStyle(COLORS.card, 1);
      cardGfx.fillRoundedRect(PANEL_X - 95, cy - 31, 190, 62, 10);
      // Border drawn separately for animation
      cardGfx.lineStyle(2, hexColor, 1);
      cardGfx.strokeRoundedRect(PANEL_X - 95, cy - 31, 190, 62, 10);
      this.cards.push(cardGfx as unknown as Phaser.GameObjects.Rectangle);
      this.cardStrokes.push(cardGfx);

      // Player circle icon
      const dot = this.scene.add.circle(PANEL_X - 74, cy, 11, hexColor);
      dot.setStrokeStyle(1.5, 0xffffff);
      dot.setDepth(depth + 1);
      this.dots.push(dot);

      // Player name
      const name = i === 0 ? "Player 1 (You)" : `Player ${i + 1} (AI)`;
      const nameTxt = this.scene.add.text(PANEL_X - 52, cy - 14, name, {
        fontSize: "11px",
        color: "#" + hexColor.toString(16).padStart(6, "0"),
        fontFamily: "Outfit, sans-serif",
        fontStyle: "bold",
      }).setDepth(depth + 1);
      this.nameTexts.push(nameTxt);

      // Progress text
      const prog = this.scene.add.text(PANEL_X - 52, cy + 2, "Home: 0 / 4", {
        fontSize: "10px",
        color: "#94a3b8",
        fontFamily: "Outfit, sans-serif",
      }).setDepth(depth + 1);
      this.progressTexts.push(prog);

      // Token count
      const tokCount = this.scene.add.text(PANEL_X + 70, cy - 4, "0", {
        fontSize: "18px",
        color: "#" + hexColor.toString(16).padStart(6, "0"),
        fontFamily: "Outfit, sans-serif",
        fontStyle: "bold",
      }).setOrigin(0.5).setDepth(depth + 1);
      this.tokenCountTexts.push(tokCount);
    }

    // Move log area
    const logY = startY + totalPlayers * gap + 10;

    this.scene.add.text(PANEL_X, logY, "ACTION LOG", {
      fontSize: "10px",
      color: "#64748b",
      fontFamily: "Outfit, sans-serif",
      fontStyle: "bold",
    }).setOrigin(0.5).setDepth(depth + 1);

    // Log background
    const logGfx = this.scene.add.graphics();
    logGfx.setDepth(depth);
    logGfx.fillStyle(COLORS.card, 1);
    logGfx.fillRoundedRect(PANEL_X - 95, logY + 12, 190, 84, 8);
    logGfx.lineStyle(1, COLORS.border, 1);
    logGfx.strokeRoundedRect(PANEL_X - 95, logY + 12, 190, 84, 8);

    for (let i = 0; i < HUDManager.MAX_LOG; i++) {
      const t = this.scene.add.text(
        PANEL_X - 86,
        logY + 22 + i * 14,
        "",
        {
          fontSize: "9px",
          color: "#94a3b8",
          fontFamily: "Outfit, sans-serif",
          wordWrap: { width: 172 },
        }
      ).setDepth(depth + 1);
      this.logLines.push(t);
    }
  }

  // ─── Sound Toggle ────────────────────────────────────────────────────────────

  private createSoundToggle(depth: number): void {
    const btnX = PANEL_X + 80;
    const btnY = 22;

    const icon = this.scene.add.text(0, 0, this.soundOn ? "\u{1F50A}" : "\u{1F507}", {
      fontSize: "16px",
    }).setOrigin(0.5);

    const hit = this.scene.add.circle(0, 0, 16, 0xffffff, 0);
    hit.setInteractive({ useHandCursor: true });
    hit.on("pointerdown", () => {
      this.soundOn = !this.soundOn;
      icon.setText(this.soundOn ? "\u{1F50A}" : "\u{1F507}");
      this.onSoundToggle?.();
    });

    this.soundBtn = this.scene.add.container(btnX, btnY, [hit, icon]);
    this.soundBtn.setDepth(depth + 2);
  }

  setSoundToggleCallback(cb: () => void): void {
    this.onSoundToggle = cb;
  }

  // ─── Turn Update ─────────────────────────────────────────────────────────────

  updateTurn(playerIndex: number): void {
    if (!this.turnText?.active || !this.turnText?.scene) return;

    const reduced = prefersReducedMotion();

    try {
      const color = this.colors[playerIndex % this.colors.length] ?? "red";
      const colName = color as keyof typeof COLORS;
      const nameStr = playerIndex === this.mySeat ? "YOUR TURN" : `PLAYER ${playerIndex + 1}'S TURN`;
      const hexStr = "#" + COLORS[colName].toString(16).padStart(6, "0");

      // Animate turn text transition
      if (!reduced && this.turnText.text !== nameStr) {
        this.scene.tweens.add({
          targets: this.turnText,
          scaleX: 0.8,
          alpha: 0,
          duration: animDuration(120),
          onComplete: () => {
            this.turnText.setText(nameStr);
            this.turnText.setColor(hexStr);
            this.scene.tweens.add({
              targets: this.turnText,
              scaleX: 1,
              alpha: 1,
              duration: animDuration(150),
              ease: "Back.Out",
            });
          },
        });
      } else {
        this.turnText.setText(nameStr);
        this.turnText.setColor(hexStr);
      }

      // Update card highlight
      this.cardStrokes.forEach((card, idx) => {
        if (!card?.scene) return;
        const otherColor = this.colors[idx % this.colors.length] ?? "red";
        card.clear();
        card.fillStyle(COLORS.card, 1);
        card.fillRoundedRect(PANEL_X - 95, (360 + idx * 76) - 31, 190, 62, 10);
        if (idx === playerIndex) {
          card.lineStyle(3, COLORS[colName], 1);
        } else {
          card.lineStyle(1.5, COLORS[otherColor as keyof typeof COLORS], 0.6);
        }
        card.strokeRoundedRect(PANEL_X - 95, (360 + idx * 76) - 31, 190, 62, 10);
      });
    } catch {
      // Ignore rendering errors on destroyed canvas
    }
  }

  setMySeat(seat: number): void {
    this.mySeat = seat;
  }

  setNames(names: string[]): void {
    names.forEach((name, idx) => {
      const txt = this.nameTexts[idx];
      if (txt?.active && txt?.scene) {
        try { txt.setText(name); } catch { /* ignore */ }
      }
    });
  }

  applyColors(colors: PlayerColor[]): void {
    this.colors = [...colors];
    colors.forEach((color, idx) => {
      const hex = COLORS[color];
      if (this.dots[idx]?.active) this.dots[idx]?.setFillStyle(hex, 1);
      if (this.nameTexts[idx]?.active && this.nameTexts[idx]?.scene) {
        try { this.nameTexts[idx]?.setColor("#" + hex.toString(16).padStart(6, "0")); } catch { /* ignore */ }
      }
    });
  }

  setLogs(logs: string[]): void {
    this.logLines.forEach((t, i) => {
      if (t?.active && t?.scene) {
        try { t.setText(i < logs.length ? `› ${logs[i]}` : ""); } catch { /* ignore */ }
      }
    });
  }

  updateProgress(playerIndex: number, doneCount: number): void {
    const prog = this.progressTexts[playerIndex];
    if (prog?.active && prog?.scene) {
      try {
        prog.setText(`Home: ${doneCount} / 4`);
        if (doneCount === 4) {
          prog.setColor("#f59e0b").setText("FINISHED!");
        }
      } catch { /* ignore */ }
    }
  }

  updateTokenCount(playerIndex: number, count: number): void {
    const txt = this.tokenCountTexts[playerIndex];
    if (txt?.active && txt?.scene) {
      try { txt.setText(String(count)); } catch { /* ignore */ }
    }
  }

  addLog(message: string): void {
    try {
      for (let i = this.logLines.length - 1; i > 0; i--) {
        const prev = this.logLines[i - 1];
        const curr = this.logLines[i];
        if (prev?.active && curr?.active) curr.setText(prev.text);
      }
      const first = this.logLines[0];
      if (first?.active && first?.scene) first.setText(`› ${message}`);
    } catch { /* ignore */ }
  }

  showSelectionBanner(message = "TAP A HIGHLIGHTED TOKEN TO MOVE!"): void {
    if (!this.bannerContainer) return;
    this.bannerText.setText(message);
    this.bannerContainer.setVisible(true);
    this.bannerTween?.stop();

    this.bannerTween = this.scene.tweens.add({
      targets: this.bannerContainer,
      scaleX: 1,
      scaleY: 1,
      duration: animDuration(250),
      ease: "Back.Out",
    });
  }

  hideSelectionBanner(): void {
    if (!this.bannerContainer || !this.bannerContainer.visible) return;
    this.bannerTween?.stop();

    this.bannerTween = this.scene.tweens.add({
      targets: this.bannerContainer,
      scaleX: 0,
      scaleY: 0,
      duration: animDuration(200),
      ease: "Back.In",
      onComplete: () => this.bannerContainer.setVisible(false),
    });
  }
}
