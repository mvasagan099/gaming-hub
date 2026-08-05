import Phaser from "phaser";
import type { PlayerColor } from "../types/ludo.types";
import {
  BOARD_PX,
  CELL_SIZE,
  YARDS,
  YARD_TOKEN_OFFSETS,
  ZONE_COLORS,
  HOME_COL_COORDS,
  MAIN_PATH,
  SAFE_TILES,
  START_POSITION,
  HOME_COL_BASE,
  cellToPixel,
  mainPathPixel,
  homeColPixel,
  yardSpawnPixel,
} from "../data/boardLayout";

const COLORS: Record<PlayerColor, number> = {
  red:    0xef4444,
  blue:   0x3b82f6,
  green:  0x22c55e,
  yellow: 0xeab308,
};

const PLAYER_COLORS: PlayerColor[] = ["red", "blue", "green", "yellow"];

export default class BoardManager {
  private scene: Phaser.Scene;
  private highlightGraphics!: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /** Draw the complete Ludo board — all zones, paths, labels */
  drawBoard(): void {
    this.drawBackground();
    this.drawYards();
    this.drawMainPath();
    this.drawHomeColumns();
    this.drawCenterStar();
    this.drawSafeStars();
    this.drawStartArrows();
    this.drawBorder();

    // Highlight overlay (depth 3)
    this.highlightGraphics = this.scene.add.graphics();
    this.highlightGraphics.setDepth(3);
  }

  // ─── Background ─────────────────────────────────────────────────────────────

  private drawBackground(): void {
    const g = this.scene.add.graphics();
    g.setDepth(0);
    g.fillStyle(0xfaf7f0, 1);
    g.fillRect(0, 0, BOARD_PX, BOARD_PX);
  }

  // ─── Yards (4 colored corner squares) ──────────────────────────────────────

  private drawYards(): void {
    const g = this.scene.add.graphics();
    g.setDepth(1);

    for (const color of PLAYER_COLORS) {
      const zone   = ZONE_COLORS[color];
      const yard   = YARDS[color];
      const x      = yard.col * CELL_SIZE;
      const y      = yard.row * CELL_SIZE;
      const size   = 6 * CELL_SIZE;

      // Yard background
      g.fillStyle(zone.main, 1);
      g.fillRect(x, y, size, size);

      // Yard inner white circle area
      g.fillStyle(0xffffff, 0.9);
      g.fillRoundedRect(x + CELL_SIZE * 0.5, y + CELL_SIZE * 0.5, size - CELL_SIZE, size - CELL_SIZE, 16);

      // 4 token spawn circles
      for (let ti = 0; ti < 4; ti++) {
        const offset = YARD_TOKEN_OFFSETS[ti]!;
        const cx     = (yard.col + offset.col) * CELL_SIZE + CELL_SIZE / 2;
        const cy     = (yard.row + offset.row) * CELL_SIZE + CELL_SIZE / 2;
        const r      = CELL_SIZE * 0.4;

        // Circle fill
        g.fillStyle(zone.light, 1);
        g.fillCircle(cx, cy, r);

        // Circle border
        g.lineStyle(3, zone.dark, 1);
        g.strokeCircle(cx, cy, r);

        // Inner dark circle
        g.fillStyle(zone.dark, 0.3);
        g.fillCircle(cx, cy, r * 0.4);
      }

      // Yard label
      const cx = x + size / 2;
      const cy = y + size / 2;
      this.scene.add.text(cx, cy + size * 0.3, color.toUpperCase(), {
        fontSize:   "10px",
        color:      "#ffffff",
        fontFamily: "Outfit, sans-serif",
        fontStyle:  "bold",
        stroke:     "#00000066",
        strokeThickness: 2,
      }).setOrigin(0.5).setDepth(2);
    }
  }

  // ─── Main path grid ─────────────────────────────────────────────────────────

  private drawMainPath(): void {
    const g = this.scene.add.graphics();
    g.setDepth(1);

    for (let pos = 0; pos < MAIN_PATH.length; pos++) {
      const coord = MAIN_PATH[pos];
      if (!coord) continue;
      const x = coord.col * CELL_SIZE;
      const y = coord.row * CELL_SIZE;

      // Colour the start squares
      let fillColor = 0xffffff;
      let isStart   = false;
      for (const color of PLAYER_COLORS) {
        if (START_POSITION[color] === pos) {
          fillColor = COLORS[color];
          isStart   = true;
          break;
        }
      }

      g.fillStyle(fillColor, 1);
      g.fillRect(x + 1, y + 1, CELL_SIZE - 2, CELL_SIZE - 2);

      // Border
      g.lineStyle(1, 0xd1d5db, 0.8);
      g.strokeRect(x, y, CELL_SIZE, CELL_SIZE);

      // Inner sheen
      if (!isStart) {
        g.fillStyle(0x000000, 0.03);
        g.fillRect(x + 1, y + 1, CELL_SIZE - 2, 3);
      }
    }
  }

  // ─── Home columns (coloured strips leading to center) ───────────────────────

  private drawHomeColumns(): void {
    const g = this.scene.add.graphics();
    g.setDepth(1);

    for (const color of PLAYER_COLORS) {
      const zone   = ZONE_COLORS[color];
      const coords = HOME_COL_COORDS[color];

      coords.forEach((coord, step) => {
        const x = coord.col * CELL_SIZE;
        const y = coord.row * CELL_SIZE;

        // Gradient feel: lighter near entry, brighter near home
        const t = step / (coords.length - 1);

        g.fillStyle(Phaser.Display.Color.Interpolate.ColorWithColor(
          Phaser.Display.Color.IntegerToColor(zone.light),
          Phaser.Display.Color.IntegerToColor(zone.main),
          100,
          Math.round(t * 100)
        ).color, 1);
        g.fillRect(x + 1, y + 1, CELL_SIZE - 2, CELL_SIZE - 2);

        g.lineStyle(1, zone.dark, 0.4);
        g.strokeRect(x, y, CELL_SIZE, CELL_SIZE);
      });
    }
  }

  // ─── Center star / home triangle ────────────────────────────────────────────

  private drawCenterStar(): void {
    const g   = this.scene.add.graphics();
    g.setDepth(1);

    const cx  = 7.5 * CELL_SIZE;
    const cy  = 7.5 * CELL_SIZE;
    const half = CELL_SIZE * 1.5;

    // 4 triangles pointing inward
    const corners: Array<[number, number]> = [
      [6 * CELL_SIZE, 6 * CELL_SIZE],   // top-left
      [9 * CELL_SIZE, 6 * CELL_SIZE],   // top-right
      [9 * CELL_SIZE, 9 * CELL_SIZE],   // bottom-right
      [6 * CELL_SIZE, 9 * CELL_SIZE],   // bottom-left
    ];
    const triangleColors: number[] = [
      COLORS.red,
      COLORS.blue,
      COLORS.green,
      COLORS.yellow,
    ];

    corners.forEach(([tx, ty], i) => {
      g.fillStyle(triangleColors[i] ?? 0xcccccc, 1);
      g.beginPath();
      g.moveTo(tx, ty);
      // next corner
      const next = corners[(i + 1) % 4]!;
      g.lineTo(next[0], next[1]);
      // center
      g.lineTo(cx, cy);
      g.closePath();
      g.fillPath();
    });

    // White center hexagon
    g.fillStyle(0xffffff, 1);
    g.fillCircle(cx, cy, CELL_SIZE * 0.7);

    // Star ★ in center
    this.scene.add.text(cx, cy, "★", {
      fontSize:   "24px",
      color:      "#f59e0b",
      fontFamily: "Outfit, sans-serif",
    }).setOrigin(0.5).setDepth(2);
  }

  // ─── Safe tile stars ─────────────────────────────────────────────────────────

  private drawSafeStars(): void {
    for (const pos of SAFE_TILES) {
      // Don't draw star on color-start tiles (they already have color fill)
      const isStart = Object.values(START_POSITION).includes(pos);
      if (isStart) continue;

      const { x, y } = mainPathPixel(pos);
      this.scene.add.text(x, y, "★", {
        fontSize:   "14px",
        color:      "#f59e0b",
        fontFamily: "Outfit, sans-serif",
      }).setOrigin(0.5).setDepth(2);
    }
  }

  // ─── Start position arrows ───────────────────────────────────────────────────

  private drawStartArrows(): void {
    const arrows: Record<PlayerColor, string> = {
      red:    "→",
      blue:   "↑",
      green:  "←",
      yellow: "↓",
    };

    for (const color of PLAYER_COLORS) {
      const pos  = START_POSITION[color];
      const { x, y } = mainPathPixel(pos);
      this.scene.add.text(x, y, arrows[color], {
        fontSize:   "16px",
        color:      "#ffffff",
        fontFamily: "Outfit, sans-serif",
        fontStyle:  "bold",
      }).setOrigin(0.5).setDepth(2);
    }
  }

  // ─── Outer board border ──────────────────────────────────────────────────────

  private drawBorder(): void {
    const g = this.scene.add.graphics();
    g.setDepth(2);
    g.lineStyle(5, 0x1e293b, 1);
    g.strokeRect(0, 0, BOARD_PX, BOARD_PX);
    g.lineStyle(2, 0xf59e0b, 0.6);
    g.strokeRect(3, 3, BOARD_PX - 6, BOARD_PX - 6);
  }

  // ─── Highlight helpers ───────────────────────────────────────────────────────

  highlightYardToken(color: PlayerColor, tokenIndex: number): void {
    const { x, y } = yardSpawnPixel(color, tokenIndex);
    this.addHighlight(x, y, COLORS[color]);
  }

  highlightMainTile(pos: number, color: PlayerColor): void {
    const { x, y } = mainPathPixel(pos);
    this.addHighlight(x, y, COLORS[color]);
  }

  highlightHomeColTile(color: PlayerColor, step: number): void {
    const { x, y } = homeColPixel(color, step);
    this.addHighlight(x, y, COLORS[color]);
  }

  private addHighlight(x: number, y: number, color: number): void {
    const r = CELL_SIZE * 0.45;
    this.highlightGraphics.lineStyle(3, color, 1);
    this.highlightGraphics.strokeCircle(x, y, r);
    this.highlightGraphics.fillStyle(color, 0.2);
    this.highlightGraphics.fillCircle(x, y, r);

    // Pulse tween on the graphics object
    this.scene.tweens.add({
      targets: this.highlightGraphics,
      alpha:   0.5,
      duration: 400,
      ease:    "Sine.InOut",
      yoyo:    true,
      repeat:  -1,
    });
  }

  clearHighlights(): void {
    this.highlightGraphics.clear();
    this.scene.tweens.killTweensOf(this.highlightGraphics);
    this.highlightGraphics.setAlpha(1);
  }

  // ─── Public pixel accessors ──────────────────────────────────────────────────

  /** Pixel center of any position (handles yard, main, home column) */
  getPixelForPosition(
    color: PlayerColor,
    position: number,
    tokenIndex = 0
  ): { x: number; y: number } {
    if (position === -1) return yardSpawnPixel(color, tokenIndex);

    const homeBase = HOME_COL_BASE[color];
    if (position >= homeBase) {
      const step = position - homeBase;
      return homeColPixel(color, step);
    }

    return mainPathPixel(position);
  }

  getCellSize(): number { return CELL_SIZE; }
  getBoardPx(): number  { return BOARD_PX;  }
}

export { BoardManager };
