import Phaser from "phaser";
import type ThemeManager from "./ThemeManager";

export const BOARD_SIZE = 8;
export const BOARD_PX   = 640;
export const CELL_SIZE  = BOARD_PX / BOARD_SIZE; // 80px
export const BOARD_OFFSET_X = 20;
export const BOARD_OFFSET_Y = 20;

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"];

export class BoardManager {
  private scene: Phaser.Scene;
  private themeManager: ThemeManager;
  private boardGraphics!: Phaser.GameObjects.Graphics;
  private selectionGraphics!: Phaser.GameObjects.Graphics;
  private checkGraphics!: Phaser.GameObjects.Graphics;
  private validMoveGraphics!: Phaser.GameObjects.Graphics;
  private checkTween: Phaser.Tweens.Tween | null = null;
  private coordTexts: Phaser.GameObjects.Text[] = [];
  private flipped = false;

  constructor(scene: Phaser.Scene, themeManager: ThemeManager) {
    this.scene = scene;
    this.themeManager = themeManager;
  }

  drawBoard(flipped = false): void {
    this.flipped = flipped;

    if (!this.boardGraphics) {
      this.boardGraphics = this.scene.add.graphics().setDepth(0);
    }
    if (!this.selectionGraphics) {
      this.selectionGraphics = this.scene.add.graphics().setDepth(3);
    }
    if (!this.validMoveGraphics) {
      this.validMoveGraphics = this.scene.add.graphics().setDepth(4);
    }
    if (!this.checkGraphics) {
      this.checkGraphics = this.scene.add.graphics().setDepth(2);
    }

    this.boardGraphics.clear();
    this.checkGraphics.clear();
    if (this.checkTween) {
      this.checkTween.stop();
      this.checkTween = null;
    }
    this.clearCoordinates();

    const colors = this.themeManager.getColors();
    const cellSize = CELL_SIZE;

    // Draw 8x8 Grid
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const isDark = (r + c) % 2 === 1;
        const color  = isDark ? colors.darkSquare : colors.lightSquare;
        const x = BOARD_OFFSET_X + c * cellSize;
        const y = BOARD_OFFSET_Y + r * cellSize;

        this.boardGraphics.fillStyle(color, 1);
        this.boardGraphics.fillRect(x, y, cellSize, cellSize);

        // Draw rank/file labels on the borders
        this.drawLabels(r, c, x, y, colors.textColor);
      }
    }

    // Outer dark board border
    this.boardGraphics.lineStyle(4, colors.darkSquare, 1);
    this.boardGraphics.strokeRect(BOARD_OFFSET_X, BOARD_OFFSET_Y, BOARD_PX, BOARD_PX);
  }

  private drawLabels(r: number, c: number, x: number, y: number, textColor: string): void {
    const cellSize = CELL_SIZE;

    // Draw rank coordinate (1-8) on left edge of first column
    if (c === 0) {
      const rankIdx = this.flipped ? BOARD_SIZE - 1 - r : r;
      const rank = RANKS[rankIdx] || "";
      const text = this.scene.add.text(x + 4, y + 4, rank, {
        fontSize:   "10px",
        fontFamily: "Outfit, sans-serif",
        fontStyle:  "bold",
        color:      textColor,
      }).setDepth(1);
      this.coordTexts.push(text);
    }

    // Draw file coordinate (A-H) on bottom edge of last row
    if (r === BOARD_SIZE - 1) {
      const fileIdx = this.flipped ? BOARD_SIZE - 1 - c : c;
      const file = FILES[fileIdx]?.toUpperCase() || "";
      const text = this.scene.add.text(x + cellSize - 12, y + cellSize - 14, file, {
        fontSize:   "10px",
        fontFamily: "Outfit, sans-serif",
        fontStyle:  "bold",
        color:      textColor,
      }).setDepth(1);
      this.coordTexts.push(text);
    }
  }

  private clearCoordinates(): void {
    this.coordTexts.forEach((t) => t.destroy());
    this.coordTexts = [];
  }

  // ─── Highlights & Selections ────────────────────────────────────────────────

  highlightSquare(square: string, isCheck = false): void {
    const coords = this.squareToGrid(square);
    if (!coords) return;

    const colors = this.themeManager.getColors();
    const x = BOARD_OFFSET_X + coords.col * CELL_SIZE;
    const y = BOARD_OFFSET_Y + coords.row * CELL_SIZE;

    if (isCheck) {
      this.checkGraphics.clear();
      this.checkGraphics.lineStyle(4, colors.checkGlow, 1);
      this.checkGraphics.strokeRect(x + 2, y + 2, CELL_SIZE - 4, CELL_SIZE - 4);
      this.checkGraphics.fillStyle(colors.checkGlow, 0.4);
      this.checkGraphics.fillRect(x + 2, y + 2, CELL_SIZE - 4, CELL_SIZE - 4);
      
      if (this.checkTween) this.checkTween.stop();
      this.checkGraphics.setAlpha(1);
      
      this.checkTween = this.scene.tweens.add({
        targets: this.checkGraphics,
        alpha: 0.2,
        duration: 600,
        yoyo: true,
        repeat: -1,
        ease: "Sine.InOut"
      });
    } else {
      this.selectionGraphics.clear(); 
      this.selectionGraphics.lineStyle(3, colors.highlight, 0.95);
      this.selectionGraphics.strokeRect(x + 2, y + 2, CELL_SIZE - 4, CELL_SIZE - 4);
      this.selectionGraphics.fillStyle(colors.highlight, 0.12);
      this.selectionGraphics.fillRect(x + 2, y + 2, CELL_SIZE - 4, CELL_SIZE - 4);
    }
  }

  highlightValidMoves(moves: Array<{ square: string; isCapture: boolean }>): void {
    this.validMoveGraphics.clear();
    const colors = this.themeManager.getColors();

    for (const m of moves) {
      const coords = this.squareToGrid(m.square);
      if (!coords) continue;

      const cx = BOARD_OFFSET_X + coords.col * CELL_SIZE + CELL_SIZE / 2;
      const cy = BOARD_OFFSET_Y + coords.row * CELL_SIZE + CELL_SIZE / 2;

      if (m.isCapture) {
        // Draw hollow capture ring at piece border
        const r = CELL_SIZE * 0.43;
        this.validMoveGraphics.lineStyle(4.5, colors.highlight, 0.9);
        this.validMoveGraphics.strokeCircle(cx, cy, r);
      } else {
        // Draw standard valid dot
        this.validMoveGraphics.fillStyle(colors.validDot, 0.7);
        this.validMoveGraphics.fillCircle(cx, cy, 8);
        this.validMoveGraphics.lineStyle(1.5, colors.validStroke, 1);
        this.validMoveGraphics.strokeCircle(cx, cy, 8);
      }
    }
  }

  clearOverlay(): void {
    this.selectionGraphics.clear();
    this.validMoveGraphics.clear();
    this.checkGraphics.clear();
    if (this.checkTween) {
      this.checkTween.stop();
      this.checkTween = null;
    }
  }

  // ─── Coordinate Conversion Helpers ──────────────────────────────────────────

  squareToGrid(square: string): { col: number; row: number } | null {
    if (square.length !== 2) return null;
    const file = square[0]!.toLowerCase();
    const rank = square[1]!;

    let col = FILES.indexOf(file);
    let row = RANKS.indexOf(rank);

    if (col === -1 || row === -1) return null;

    if (this.flipped) {
      col = BOARD_SIZE - 1 - col;
      row = BOARD_SIZE - 1 - row;
    }

    return { col, row };
  }

  gridToSquare(col: number, row: number): string | null {
    if (col < 0 || col >= BOARD_SIZE || row < 0 || row >= BOARD_SIZE) return null;

    let c = col;
    let r = row;

    if (this.flipped) {
      c = BOARD_SIZE - 1 - c;
      r = BOARD_SIZE - 1 - r;
    }

    const file = FILES[c] || "";
    const rank = RANKS[r] || "";
    return file + rank;
  }

  getPixelCoords(square: string): { x: number; y: number } | null {
    const grid = this.squareToGrid(square);
    if (!grid) return null;
    return {
      x: BOARD_OFFSET_X + grid.col * CELL_SIZE + CELL_SIZE / 2,
      y: BOARD_OFFSET_Y + grid.row * CELL_SIZE + CELL_SIZE / 2,
    };
  }

  isFlipped(): boolean {
    return this.flipped;
  }
}

export default BoardManager;
export { FILES, RANKS };
