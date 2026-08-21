/**
 * BoardManager — Premium Realistic Wood Chess Board
 *
 * Visual target: matches the reference screenshot —
 *   • Warm golden-tan light squares (#C8A458)
 *   • Deep rich walnut dark squares (#6B3A18)
 *   • Continuous horizontal wood-grain texture crossing square boundaries
 *   • One seamless physical wood surface — no box borders between squares
 *   • Very dark mahogany beveled outer frame
 *   • Subtle gold inner inlay line
 *   • Coordinate labels (A-H, 1-8) engraved in the frame
 *   • Multi-layer floating shadow beneath the board
 */
import Phaser from "phaser";
import type ThemeManager from "./ThemeManager";
import { CHESS_DESIGN_CONFIG } from "../constants/chessAnimationConfig";

export const BOARD_SIZE    = 8;
export const BOARD_PX      = CHESS_DESIGN_CONFIG.boardPx;         // 640
export const CELL_SIZE     = BOARD_PX / BOARD_SIZE;                // 80
export const BOARD_OFFSET_X = CHESS_DESIGN_CONFIG.boardOffsetX;   // 28
export const BOARD_OFFSET_Y = CHESS_DESIGN_CONFIG.boardOffsetY;   // 28

const FILES = ["a","b","c","d","e","f","g","h"];
const RANKS = ["8","7","6","5","4","3","2","1"];

export class BoardManager {
  private scene: Phaser.Scene;
  private themeManager: ThemeManager;

  private boardGraphics!:     Phaser.GameObjects.Graphics;
  private grainGraphics!:     Phaser.GameObjects.Graphics;
  private selectionGraphics!: Phaser.GameObjects.Graphics;
  private checkGraphics!:     Phaser.GameObjects.Graphics;
  private validMoveGraphics!: Phaser.GameObjects.Graphics;
  private lastMoveGraphics!:  Phaser.GameObjects.Graphics;

  private checkTween: Phaser.Tweens.Tween | null = null;
  private coordTexts: Phaser.GameObjects.Text[]  = [];
  private flipped = false;

  constructor(scene: Phaser.Scene, themeManager: ThemeManager) {
    this.scene        = scene;
    this.themeManager = themeManager;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  drawBoard(flipped = false): void {
    this.flipped = flipped;

    if (!this.boardGraphics)     this.boardGraphics     = this.scene.add.graphics().setDepth(0);
    if (!this.grainGraphics)     this.grainGraphics     = this.scene.add.graphics().setDepth(1);
    if (!this.lastMoveGraphics)  this.lastMoveGraphics  = this.scene.add.graphics().setDepth(2);
    if (!this.checkGraphics)     this.checkGraphics     = this.scene.add.graphics().setDepth(3);
    if (!this.selectionGraphics) this.selectionGraphics = this.scene.add.graphics().setDepth(4);
    if (!this.validMoveGraphics) this.validMoveGraphics = this.scene.add.graphics().setDepth(5);

    this.boardGraphics.clear();
    this.grainGraphics.clear();
    this.checkGraphics.clear();
    if (this.checkTween) { this.checkTween.stop(); this.checkTween = null; }
    this.clearCoordinates();

    this.drawShadow();
    this.drawFrame();
    this.drawSquares();
    this.drawGrainOverlay();
    this.drawFrameLabels();
  }

  // ── 1. Multi-Layer Drop Shadow ─────────────────────────────────────────────

  private drawShadow(): void {
    const g  = this.boardGraphics;
    const fw = CHESS_DESIGN_CONFIG.boardFrameWidth; // 28
    const fx = BOARD_OFFSET_X - fw;
    const fy = BOARD_OFFSET_Y - fw;
    const tw = BOARD_PX + fw * 2;
    const th = BOARD_PX + fw * 2;

    const sx = fx + 12, sy = fy + 18;

    // Outermost soft glow
    g.fillStyle(0x000000, 0.15);
    g.fillRoundedRect(sx - 12, sy - 8, tw + 24, th + 20, 32);

    // Mid ambient shadow
    g.fillStyle(0x000000, 0.38);
    g.fillRoundedRect(sx - 4, sy - 2, tw + 8, th + 8, 25);

    // Core directional
    g.fillStyle(0x000000, 0.70);
    g.fillRoundedRect(sx, sy, tw, th, 20);
  }

  // ── 2. Mahogany Beveled Frame ──────────────────────────────────────────────

  private drawFrame(): void {
    const g  = this.boardGraphics;
    const fw = CHESS_DESIGN_CONFIG.boardFrameWidth; // 28
    const fx = BOARD_OFFSET_X - fw;
    const fy = BOARD_OFFSET_Y - fw;
    const tw = BOARD_PX + fw * 2;
    const th = BOARD_PX + fw * 2;

    // Step 1 — deepest outer base
    g.fillStyle(0x100804, 1.0);
    g.fillRoundedRect(fx, fy, tw, th, 16);

    // Step 2 — dark mahogany body
    g.fillStyle(0x1e1008, 1.0);
    g.fillRoundedRect(fx + 2, fy + 2, tw - 4, th - 4, 14);

    // Step 3 — mid mahogany
    g.fillStyle(0x2c1a0c, 1.0);
    g.fillRoundedRect(fx + 3, fy + 3, tw - 6, th - 6, 13);

    // Step 4 — top-left specular chamfer (key light 315°)
    g.lineStyle(1.5, 0x6b3c1e, 0.70);
    g.strokeRoundedRect(fx + 4, fy + 4, tw - 8, th - 8, 12);

    // Step 5 — bottom-right AO shadow chamfer
    g.lineStyle(1.0, 0x050302, 0.90);
    g.strokeRoundedRect(fx + 5, fy + 5, tw - 10, th - 10, 11);

    // Thin sunken recess before board surface
    g.fillStyle(0x0e0804, 1.0);
    g.fillRect(BOARD_OFFSET_X - 2, BOARD_OFFSET_Y - 2, BOARD_PX + 4, BOARD_PX + 4);

    // Gold inner inlay line (single, thin)
    g.lineStyle(1.2, 0xb8860b, 0.80);
    g.strokeRoundedRect(
      BOARD_OFFSET_X - 7,
      BOARD_OFFSET_Y - 7,
      BOARD_PX + 14,
      BOARD_PX + 14,
      4,
    );
  }

  // ── 3. 8×8 Seamless Square Grid ───────────────────────────────────────────
  //
  // Key: NO borders between squares.  The entire board is one wood surface.
  // Light square shading simulates natural wood lighting variations.

  private drawSquares(): void {
    const g      = this.boardGraphics;
    const colors = this.themeManager.getColors();

    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const isDark = (r + c) % 2 === 1;
        const base   = isDark ? colors.darkSquare : colors.lightSquare;
        const x      = BOARD_OFFSET_X + c * CELL_SIZE;
        const y      = BOARD_OFFSET_Y + r * CELL_SIZE;

        // ── Base fill (clean, no border) ──
        g.fillStyle(base, 1.0);
        g.fillRect(x, y, CELL_SIZE, CELL_SIZE);

        // ── Directional lighting gradient simulation ──
        // Top-left lit corner (upper portion of each square)
        g.fillStyle(0xffffff, isDark ? 0.04 : 0.10);
        g.fillRect(x, y, CELL_SIZE, CELL_SIZE * 0.35);

        // Bottom-right AO shadow
        g.fillStyle(0x000000, isDark ? 0.12 : 0.05);
        g.fillRect(x, y + CELL_SIZE * 0.65, CELL_SIZE, CELL_SIZE * 0.35);
      }
    }

    // Board surface rim (very thin inner edge)
    g.lineStyle(0.8, 0x000000, 0.50);
    g.strokeRect(BOARD_OFFSET_X, BOARD_OFFSET_Y, BOARD_PX, BOARD_PX);
  }

  // ── 4. Continuous Wood Grain (crosses square boundaries) ──────────────────
  //
  // This is the single most important visual detail:
  // Grain lines flow HORIZONTALLY across the entire board surface,
  // crossing square color boundaries — exactly like a real wood board.

  private drawGrainOverlay(): void {
    const g      = this.grainGraphics;
    const colors = this.themeManager.getColors();
    g.clear();

    const bx = BOARD_OFFSET_X;
    const by = BOARD_OFFSET_Y;
    const bw = BOARD_PX;
    const bh = BOARD_PX;

    // Clip mask helper — fill only board region
    // We draw across the full width, clipped to board bounds.

    // ── Primary horizontal grain lines ──
    // These cross ALL 8 columns with natural sinusoidal waviness
    for (let yOff = 3; yOff < bh; yOff += 6) {
      const y = by + yOff;

      // Determine if this row is on a light or dark square band
      const rowSquare = Math.floor(yOff / CELL_SIZE);
      const isLightRow = rowSquare % 2 === 0;

      // Alternate grain line alpha — denser on light squares, subtle on dark
      const alpha = isLightRow ? 0.07 : 0.05;

      g.lineStyle(0.7, isLightRow ? 0x8a6030 : 0x000000, alpha);
      g.beginPath();
      g.moveTo(bx, y);

      // Wavy grain — natural wood undulation
      for (let xOff = 0; xOff <= bw; xOff += 20) {
        const wave = Math.sin((xOff * 0.015) + (yOff * 0.04)) * 0.8;
        g.lineTo(bx + xOff, y + wave);
      }
      g.strokePath();
    }

    // ── Secondary finer grain lines (denser) ──
    for (let yOff = 6; yOff < bh; yOff += 13) {
      const y = by + yOff;
      const rowSquare = Math.floor(yOff / CELL_SIZE);
      const isLightRow = rowSquare % 2 === 0;
      const alpha = isLightRow ? 0.05 : 0.03;

      g.lineStyle(0.4, isLightRow ? 0xa07840 : 0x000000, alpha);
      g.beginPath();
      g.moveTo(bx, y);
      for (let xOff = 0; xOff <= bw; xOff += 16) {
        const wave = Math.sin((xOff * 0.020) + (yOff * 0.06)) * 0.6;
        g.lineTo(bx + xOff, y + wave);
      }
      g.strokePath();
    }

    // ── Occasional darker knot/figure accent ──
    for (let i = 0; i < 6; i++) {
      const kx = bx + 40 + i * 100;
      const ky = by + 50 + ((i * 137) % (bh - 100));
      g.lineStyle(0.5, 0x4a2808, 0.06);
      g.strokeEllipse(kx, ky, 60 + (i % 3) * 20, 4);
    }

    // ── Slight surface specular sheen (top-left zone of board) ──
    // Simulates reflected light on polished lacquer
    g.fillStyle(0xffffff, 0.025);
    for (let i = 0; i < 3; i++) {
      g.fillRect(bx, by + i * 2, bw * (0.7 - i * 0.15), 1);
    }
  }

  // ── 5. Frame Coordinate Labels ─────────────────────────────────────────────

  private drawFrameLabels(): void {
    const fw     = CHESS_DESIGN_CONFIG.boardFrameWidth; // 28
    const lColor = "#c8a458"; // warm tan matching light squares

    // Rank numbers (left frame, centered per row)
    for (let r = 0; r < BOARD_SIZE; r++) {
      const rankIdx = this.flipped ? BOARD_SIZE - 1 - r : r;
      const rank    = RANKS[rankIdx] || "";
      const cy      = BOARD_OFFSET_Y + r * CELL_SIZE + CELL_SIZE / 2 - 7;

      const t = this.scene.add.text(
        BOARD_OFFSET_X - fw + 7,
        cy,
        rank,
        {
          fontSize:   "13px",
          fontFamily: "Outfit, Georgia, serif",
          fontStyle:  "bold",
          color:      lColor,
        },
      ).setDepth(2).setAlpha(0.75);
      this.coordTexts.push(t);
    }

    // File letters (bottom frame, centered per column)
    for (let c = 0; c < BOARD_SIZE; c++) {
      const fileIdx = this.flipped ? BOARD_SIZE - 1 - c : c;
      const file    = FILES[fileIdx]?.toUpperCase() || "";
      const cx      = BOARD_OFFSET_X + c * CELL_SIZE + CELL_SIZE / 2 - 5;

      const t = this.scene.add.text(
        cx,
        BOARD_OFFSET_Y + BOARD_PX + 8,
        file,
        {
          fontSize:   "13px",
          fontFamily: "Outfit, Georgia, serif",
          fontStyle:  "bold",
          color:      lColor,
        },
      ).setDepth(2).setAlpha(0.75);
      this.coordTexts.push(t);
    }
  }

  private clearCoordinates(): void {
    this.coordTexts.forEach((t) => t.destroy());
    this.coordTexts = [];
  }

  // ── Highlights ─────────────────────────────────────────────────────────────

  highlightSquare(square: string, isCheck = false): void {
    const coords = this.squareToGrid(square);
    if (!coords) return;
    const colors = this.themeManager.getColors();
    const x = BOARD_OFFSET_X + coords.col * CELL_SIZE;
    const y = BOARD_OFFSET_Y + coords.row * CELL_SIZE;

    if (isCheck) {
      this.checkGraphics.clear();

      this.checkGraphics.fillStyle(colors.checkGlow, 0.40);
      this.checkGraphics.fillRect(x, y, CELL_SIZE, CELL_SIZE);

      this.checkGraphics.lineStyle(3.5, colors.checkGlow, 1.0);
      this.checkGraphics.strokeRect(x + 1, y + 1, CELL_SIZE - 2, CELL_SIZE - 2);

      this.checkGraphics.lineStyle(1.5, 0xff8888, 0.75);
      this.checkGraphics.strokeRect(x + 4, y + 4, CELL_SIZE - 8, CELL_SIZE - 8);

      if (this.checkTween) this.checkTween.stop();
      this.checkGraphics.setAlpha(1);
      this.checkTween = this.scene.tweens.add({
        targets: this.checkGraphics, alpha: 0.28,
        duration: 580, yoyo: true, repeat: -1, ease: "Sine.InOut",
      });
    } else {
      this.selectionGraphics.clear();

      // Warm golden selection glow
      this.selectionGraphics.fillStyle(colors.highlight, 0.30);
      this.selectionGraphics.fillRect(x, y, CELL_SIZE, CELL_SIZE);

      this.selectionGraphics.lineStyle(3.0, colors.highlight, 1.0);
      this.selectionGraphics.strokeRect(x + 1, y + 1, CELL_SIZE - 2, CELL_SIZE - 2);

      this.selectionGraphics.lineStyle(1.2, 0xffffff, 0.55);
      this.selectionGraphics.strokeRect(x + 4, y + 4, CELL_SIZE - 8, CELL_SIZE - 8);
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
        // Hollow targeting ring
        const r = CELL_SIZE * 0.44;
        this.validMoveGraphics.lineStyle(5.5, colors.highlight, 0.80);
        this.validMoveGraphics.strokeCircle(cx, cy, r);
        this.validMoveGraphics.lineStyle(2.0, 0xffffff, 0.55);
        this.validMoveGraphics.strokeCircle(cx, cy, r - 3.5);
        this.validMoveGraphics.fillStyle(colors.highlight, 0.06);
        this.validMoveGraphics.fillCircle(cx, cy, r);
      } else {
        // Subtle dark dot with specular
        this.validMoveGraphics.fillStyle(0x000000, 0.35);
        this.validMoveGraphics.fillCircle(cx + 0.5, cy + 1.5, 11);

        this.validMoveGraphics.fillStyle(0x1a1206, 0.85);
        this.validMoveGraphics.fillCircle(cx, cy, 10);

        this.validMoveGraphics.fillStyle(0xfff0a0, 0.25);
        this.validMoveGraphics.fillCircle(cx - 3, cy - 3, 4);
      }
    }
  }

  clearOverlay(): void {
    this.selectionGraphics.clear();
    this.validMoveGraphics.clear();
    this.checkGraphics.clear();
    if (this.checkTween) { this.checkTween.stop(); this.checkTween = null; }
  }

  highlightLastMove(from: string, to: string): void {
    this.clearLastMove();
    const f = this.squareToGrid(from);
    const t = this.squareToGrid(to);
    if (!f || !t) return;

    const colors = this.themeManager.getColors();
    if (!this.lastMoveGraphics) {
      this.lastMoveGraphics = this.scene.add.graphics().setDepth(2);
    }
    this.lastMoveGraphics.clear();

    // Source — subtle amber wash
    const fx = BOARD_OFFSET_X + f.col * CELL_SIZE;
    const fy = BOARD_OFFSET_Y + f.row * CELL_SIZE;
    this.lastMoveGraphics.fillStyle(colors.lastMoveSrc, 0.30);
    this.lastMoveGraphics.fillRect(fx, fy, CELL_SIZE, CELL_SIZE);
    this.lastMoveGraphics.lineStyle(2.0, colors.lastMoveSrc, 0.80);
    this.lastMoveGraphics.strokeRect(fx + 1, fy + 1, CELL_SIZE - 2, CELL_SIZE - 2);

    // Destination — brighter amber
    const tx = BOARD_OFFSET_X + t.col * CELL_SIZE;
    const ty = BOARD_OFFSET_Y + t.row * CELL_SIZE;
    this.lastMoveGraphics.fillStyle(colors.lastMoveDst, 0.45);
    this.lastMoveGraphics.fillRect(tx, ty, CELL_SIZE, CELL_SIZE);
    this.lastMoveGraphics.lineStyle(3.0, colors.lastMoveDst, 1.0);
    this.lastMoveGraphics.strokeRect(tx + 1, ty + 1, CELL_SIZE - 2, CELL_SIZE - 2);
    this.lastMoveGraphics.lineStyle(1.2, 0xffffff, 0.30);
    this.lastMoveGraphics.strokeRect(tx + 4, ty + 4, CELL_SIZE - 8, CELL_SIZE - 8);
  }

  clearLastMove(): void {
    if (this.lastMoveGraphics) this.lastMoveGraphics.clear();
  }

  // ── Coordinate Helpers ─────────────────────────────────────────────────────

  squareToGrid(square: string): { col: number; row: number } | null {
    if (!square || square.length !== 2) return null;
    const file = square[0]!.toLowerCase();
    const rank = square[1]!;
    let col = FILES.indexOf(file);
    let row = RANKS.indexOf(rank);
    if (col === -1 || row === -1) return null;
    if (this.flipped) { col = BOARD_SIZE - 1 - col; row = BOARD_SIZE - 1 - row; }
    return { col, row };
  }

  gridToSquare(col: number, row: number): string | null {
    if (col < 0 || col >= BOARD_SIZE || row < 0 || row >= BOARD_SIZE) return null;
    let c = col, r = row;
    if (this.flipped) { c = BOARD_SIZE - 1 - c; r = BOARD_SIZE - 1 - r; }
    const file = FILES[c];
    const rank = RANKS[r];
    if (!file || !rank) return null;
    return `${file}${rank}`;
  }

  getPixelCoords(square: string): { x: number; y: number } | null {
    const grid = this.squareToGrid(square);
    if (!grid) return null;
    return {
      x: BOARD_OFFSET_X + grid.col * CELL_SIZE + CELL_SIZE / 2,
      y: BOARD_OFFSET_Y + grid.row * CELL_SIZE + CELL_SIZE / 2,
    };
  }

  isFlipped(): boolean { return this.flipped; }
}

export default BoardManager;
