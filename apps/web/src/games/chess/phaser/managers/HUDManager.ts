import Phaser from "phaser";
import type { PieceType } from "../types/chess.types";

const PANEL_X = 792;  // Board ends at 660, gap is 20, left edge 680, center is 792.
const PANEL_W = 224;
const PANEL_H = 640;
const PANEL_Y = 340;  // Top is 20, height 640, center is 340.

const COLORS = {
  bg:      0x090d16,
  card:    0x0f172a,
  border:  0x1e293b,
  accent:  0x38bdf8,
};

const PIECE_SYMBOLS: Record<PieceType, string> = {
  p: "♟", r: "♜", n: "♞", b: "♝", q: "♛", k: "♚"
};

export default class HUDManager {
  private scene: Phaser.Scene;
  private statusText!: Phaser.GameObjects.Text;
  private capturedWText!: Phaser.GameObjects.Text;
  private capturedBText!: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  create(): void {
    const depth = 10;

    // Sidebar background panel
    const bg = this.scene.add.graphics();
    bg.fillStyle(COLORS.bg, 1);
    bg.fillRoundedRect(680, 20, PANEL_W, PANEL_H, 24);
    bg.lineStyle(4, COLORS.border, 1);
    bg.strokeRoundedRect(680, 20, PANEL_W, PANEL_H, 24);
    bg.setDepth(depth);

    // Title
    this.scene.add.text(PANEL_X, 44, "♟ CHESS MASTER", {
      fontSize:   "14px",
      color:      "#38bdf8",
      fontFamily: "Outfit, sans-serif",
      fontStyle:  "bold",
    }).setOrigin(0.5).setDepth(depth + 1);

    // Status Banner
    const statusBg = this.scene.add.graphics();
    statusBg.fillStyle(COLORS.card, 1);
    statusBg.fillRoundedRect(PANEL_X - 95, 76, 190, 44, 12);
    statusBg.lineStyle(2, COLORS.border, 1);
    statusBg.strokeRoundedRect(PANEL_X - 95, 76, 190, 44, 12);
    statusBg.setDepth(depth);

    this.statusText = this.scene.add.text(PANEL_X, 98, "WHITE TO MOVE", {
      fontSize:   "11px",
      color:      "#ffffff",
      fontFamily: "Outfit, sans-serif",
      fontStyle:  "bold",
    }).setOrigin(0.5).setDepth(depth + 1);

    // Captured pieces frame
    const frameBg = this.scene.add.graphics();
    frameBg.fillStyle(COLORS.card, 1);
    frameBg.fillRoundedRect(PANEL_X - 95, 140, 190, 180, 16);
    frameBg.lineStyle(2, COLORS.border, 1);
    frameBg.strokeRoundedRect(PANEL_X - 95, 140, 190, 180, 16);
    frameBg.setDepth(depth);

    // White Captures Header
    this.scene.add.text(PANEL_X - 84, 150, "CAPTURED WHITE PIECES", {
      fontSize:   "9px",
      color:      "#94a3b8",
      fontFamily: "Outfit, sans-serif",
      fontStyle:  "bold",
    }).setDepth(depth + 1);

    this.capturedWText = this.scene.add.text(PANEL_X - 84, 170, "None", {
      fontSize:   "20px",
      color:      "#ffffff",
      stroke:     "#000000",
      strokeThickness: 2,
      fontFamily: "Arial, sans-serif",
      wordWrap:   { width: 170 },
    }).setDepth(depth + 1);
    this.capturedWText.setShadow(0, 2, 'rgba(0,0,0,0.4)', 2);

    // Black Captures Header
    this.scene.add.text(PANEL_X - 84, 230, "CAPTURED BLACK PIECES", {
      fontSize:   "9px",
      color:      "#94a3b8",
      fontFamily: "Outfit, sans-serif",
      fontStyle:  "bold",
    }).setDepth(depth + 1);

    this.capturedBText = this.scene.add.text(PANEL_X - 84, 250, "None", {
      fontSize:   "20px",
      color:      "#000000",
      stroke:     "#ffffff",
      strokeThickness: 2,
      fontFamily: "Arial, sans-serif",
      wordWrap:   { width: 170 },
    }).setDepth(depth + 1);
    this.capturedBText.setShadow(0, 2, 'rgba(0,0,0,0.4)', 2);
  }

  updateStatus(status: string): void {
    this.statusText.setText(status.toUpperCase());
    if (status.toLowerCase().includes("win") || status.toLowerCase().includes("checkmate")) {
      this.statusText.setColor("#f59e0b");
    } else {
      this.statusText.setColor("#ffffff");
    }
  }

  updateCaptures(captured: { w: PieceType[]; b: PieceType[] }): void {
    const points: Record<PieceType, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
    let wPoints = 0;
    let bPoints = 0;

    // White pieces captured by black
    if (captured.w.length > 0) {
      const syms = captured.w.map((p) => {
        wPoints += points[p];
        return PIECE_SYMBOLS[p];
      }).join(" ");
      this.capturedWText.setText(syms);
    } else {
      this.capturedWText.setText("None");
    }

    // Black pieces captured by white
    if (captured.b.length > 0) {
      const syms = captured.b.map((p) => {
        bPoints += points[p];
        return PIECE_SYMBOLS[p];
      }).join(" ");
      this.capturedBText.setText(syms);
    } else {
      this.capturedBText.setText("None");
    }

    // Append advantage
    if (wPoints > bPoints) {
      // Black has captured more value
      this.capturedWText.setText(this.capturedWText.text + ` (+${wPoints - bPoints})`);
    } else if (bPoints > wPoints) {
      // White has captured more value
      this.capturedBText.setText(this.capturedBText.text + ` (+${bPoints - wPoints})`);
    }
  }
}
