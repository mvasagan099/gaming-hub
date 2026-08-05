import Phaser from "phaser";
import type { PlayerColor } from "../types/ludo.types";

const PANEL_X = 912;
const PANEL_W = 224;
const PANEL_H = 800;

const COLORS = {
  red:     0xef4444,
  blue:    0x3b82f6,
  green:   0x22c55e,
  yellow:  0xeab308,
  bg:      0x090d16,
  card:    0x0f172a,
  border:  0x1e293b,
  accent:  0x7c3aed,
};

const ORDERED_COLORS: Array<keyof typeof COLORS> = ["red", "blue", "green", "yellow"];

export default class HUDManager {
  private scene: Phaser.Scene;
  private turnText!: Phaser.GameObjects.Text;
  private cards: Phaser.GameObjects.Rectangle[] = [];
  private dots: Phaser.GameObjects.Arc[] = [];
  private nameTexts: Phaser.GameObjects.Text[] = [];
  private logLines: Phaser.GameObjects.Text[] = [];
  private progressTexts: Phaser.GameObjects.Text[] = [];
  private colors: PlayerColor[] = ["red", "blue", "green", "yellow"];
  private mySeat = 0;
  private static readonly MAX_LOG = 5;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  create(totalPlayers = 4): void {
    const depth = 10;

    // Sidebar background
    const bg = this.scene.add.rectangle(PANEL_X, 400, PANEL_W, PANEL_H, COLORS.bg);
    bg.setStrokeStyle(2, COLORS.border);
    bg.setDepth(depth);

    // Title
    this.scene.add.text(PANEL_X, 22, "🎲 LUDO CHAMPION", {
      fontSize:   "14px",
      color:      "#f59e0b",
      fontFamily: "Outfit, sans-serif",
      fontStyle:  "bold",
    }).setOrigin(0.5).setDepth(depth + 1);

    // Turn Card
    const turnBg = this.scene.add.rectangle(PANEL_X, 66, 190, 44, COLORS.card);
    turnBg.setStrokeStyle(2, COLORS.accent);
    turnBg.setDepth(depth);

    this.turnText = this.scene.add.text(PANEL_X, 66, "WAITING...", {
      fontSize:   "11px",
      color:      "#ffffff",
      fontFamily: "Outfit, sans-serif",
      fontStyle:  "bold",
    }).setOrigin(0.5).setDepth(depth + 1);

    // Dice Area Label
    this.scene.add.text(PANEL_X, 135, "▶  DICE CONTROLLER", {
      fontSize:   "10px",
      color:      "#64748b",
      fontFamily: "Outfit, sans-serif",
    }).setOrigin(0.5).setDepth(depth + 1);

    // Player Cards
    const startY = 360;
    const gap    = 76;

    for (let i = 0; i < totalPlayers; i++) {
      const cy = startY + i * gap;
      const colName = ORDERED_COLORS[i % 4]!;
      const hexColor = COLORS[colName];

      const card = this.scene.add.rectangle(PANEL_X, cy, 190, 62, COLORS.card);
      card.setStrokeStyle(2, hexColor);
      card.setDepth(depth);
      this.cards.push(card);

      // Player circle icon
      const dot = this.scene.add.circle(PANEL_X - 74, cy, 11, hexColor);
      dot.setStrokeStyle(1.5, 0xffffff);
      dot.setDepth(depth + 1);
      this.dots.push(dot);

      // Player title text
      const name = i === 0 ? "Player 1 (You)" : `Player ${i + 1} (AI)`;
      const nameTxt = this.scene.add.text(PANEL_X - 52, cy - 14, name, {
        fontSize:   "11px",
        color:      "#" + hexColor.toString(16),
        fontFamily: "Outfit, sans-serif",
        fontStyle:  "bold",
      }).setDepth(depth + 1);
      this.nameTexts.push(nameTxt);

      // Progress text (e.g. Done: 0 / 4)
      const prog = this.scene.add.text(PANEL_X - 52, cy + 2, "Home: 0 / 4", {
        fontSize:   "10px",
        color:      "#94a3b8",
        fontFamily: "Outfit, sans-serif",
      }).setDepth(depth + 1);
      this.progressTexts.push(prog);
    }

    // Move Log Area
    const logY = startY + totalPlayers * gap + 10;

    this.scene.add.text(PANEL_X, logY, "ACTION LOG", {
      fontSize:   "10px",
      color:      "#64748b",
      fontFamily: "Outfit, sans-serif",
      fontStyle:  "bold",
    }).setOrigin(0.5).setDepth(depth + 1);

    const logBg = this.scene.add.rectangle(PANEL_X, logY + 54, 190, 84, COLORS.card);
    logBg.setStrokeStyle(1, COLORS.border);
    logBg.setDepth(depth);

    for (let i = 0; i < HUDManager.MAX_LOG; i++) {
      const t = this.scene.add.text(
        PANEL_X - 86,
        logY + 18 + i * 14,
        "",
        {
          fontSize:   "9px",
          color:      "#94a3b8",
          fontFamily: "Outfit, sans-serif",
          wordWrap:   { width: 172 },
        }
      ).setDepth(depth + 1);
      this.logLines.push(t);
    }
  }

  updateTurn(playerIndex: number): void {
    const color = this.colors[playerIndex % this.colors.length] ?? "red";
    const colName = color as keyof typeof COLORS;
    const nameStr = playerIndex === this.mySeat ? "YOUR TURN" : `PLAYER ${playerIndex + 1}'S TURN`;

    this.turnText.setText(nameStr);
    this.turnText.setColor("#" + COLORS[colName].toString(16));

    // Reset card highlight scales
    this.cards.forEach((card, idx) => {
      if (idx === playerIndex) {
        card.setStrokeStyle(3, COLORS[colName]);
      } else {
        const otherColor = this.colors[idx % this.colors.length] ?? "red";
        card.setStrokeStyle(1.5, COLORS[otherColor]);
      }
    });
  }

  /** Which seat is "you" (for turn labels). Defaults to seat 0 (local play). */
  setMySeat(seat: number): void {
    this.mySeat = seat;
  }

  /** Replace the per-player name labels (online players). */
  setNames(names: string[]): void {
    names.forEach((name, idx) => {
      const txt = this.nameTexts[idx];
      if (txt) txt.setText(name);
    });
  }

  /** Re-style the player cards to match the actual seat colours. */
  applyColors(colors: PlayerColor[]): void {
    this.colors = [...colors];
    colors.forEach((color, idx) => {
      const hex = COLORS[color];
      this.cards[idx]?.setStrokeStyle(2, hex);
      this.dots[idx]?.setFillStyle(hex, 1);
      this.nameTexts[idx]?.setColor("#" + hex.toString(16));
    });
  }

  /** Show the authoritative action log (newest first). */
  setLogs(logs: string[]): void {
    this.logLines.forEach((t, i) => {
      t.setText(i < logs.length ? `› ${logs[i]}` : "");
    });
  }

  updateProgress(playerIndex: number, doneCount: number): void {
    const prog = this.progressTexts[playerIndex];
    if (prog) {
      prog.setText(`Home: ${doneCount} / 4`);
      if (doneCount === 4) {
        prog.setColor("#f59e0b").setText("🏆 FINISHED!");
      }
    }
  }

  addLog(message: string): void {
    // Shift up
    for (let i = this.logLines.length - 1; i > 0; i--) {
      const prev = this.logLines[i - 1];
      const curr = this.logLines[i];
      if (prev && curr) curr.setText(prev.text);
    }
    const first = this.logLines[0];
    if (first) first.setText(`› ${message}`);
  }
}
