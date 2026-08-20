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
import { ANIM, animDuration } from "../constants";

const PLAYER_COLORS: PlayerColor[] = ["red", "blue", "green", "yellow"];

export default class BoardManager {
  private scene: Phaser.Scene;
  private highlightGraphics!: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  drawBoard(): void {
    this.drawBackground();
    this.drawYards();
    this.drawMainPath();
    this.drawHomeColumns();
    this.drawCenterStar();
    this.drawSafeStars();
    this.drawStartArrows();
    this.drawBorder();

    this.highlightGraphics = this.scene.add.graphics();
    this.highlightGraphics.setDepth(3);
  }

  /** Board entry animation — fade + slight slide from above */
  animateBoardEntry(onComplete?: () => void): void {
    const reduced = this.scene.registry.get("prefersReducedMotion") ?? false;
    const children = this.scene.children.list;
    for (const child of children) {
      if (child === this.highlightGraphics) continue;
      const alphaObj = child as unknown as { setAlpha?: (alpha: number) => void };
      alphaObj.setAlpha?.(0);
      if (!reduced) {
        this.scene.tweens.add({
          targets: child,
          alpha: 1,
          y: `+=${12}`,
          duration: animDuration(ANIM.boardEntryDuration),
          ease: "Cubic.Out",
          delay: Math.random() * 100,
        });
      } else {
        alphaObj.setAlpha?.(1);
      }
    }
    this.scene.time.delayedCall(animDuration(ANIM.boardEntryDuration + 150), () => onComplete?.());
  }

  // ─── Background ─────────────────────────────────────────────────────────────

  private drawBackground(): void {
    const g = this.scene.add.graphics();
    g.setDepth(0);
    // Warm off-white with subtle radial feel
    g.fillStyle(0xf8f6f1, 1);
    g.fillRect(0, 0, BOARD_PX, BOARD_PX);
    // Subtle inner shadow for depth
    g.fillStyle(0x000000, 0.04);
    g.fillRect(0, 0, BOARD_PX, 6);
    g.fillRect(0, 0, 6, BOARD_PX);
  }

  // ─── Yards ──────────────────────────────────────────────────────────────────

  private drawYards(): void {
    const g = this.scene.add.graphics();
    g.setDepth(1);

    for (const color of PLAYER_COLORS) {
      const zone = ZONE_COLORS[color];
      const yard = YARDS[color];
      const x = yard.col * CELL_SIZE;
      const y = yard.row * CELL_SIZE;
      const size = 6 * CELL_SIZE;
      const cornerR = 14;

      // Yard background — rounded outer rect
      g.fillStyle(zone.main, 1);
      g.fillRoundedRect(x, y, size, size, cornerR);

      // Inner white area with rounded corners
      const pad = CELL_SIZE * 0.5;
      g.fillStyle(0xffffff, 0.92);
      g.fillRoundedRect(x + pad, y + pad, size - pad * 2, size - pad * 2, 12);

      // Token spawn circles — modern ring style
      for (let ti = 0; ti < 4; ti++) {
        const offset = YARD_TOKEN_OFFSETS[ti]!;
        const cx = (yard.col + offset.col) * CELL_SIZE + CELL_SIZE / 2;
        const cy = (yard.row + offset.row) * CELL_SIZE + CELL_SIZE / 2;
        const r = CELL_SIZE * 0.4;

        // Outer glow ring
        g.fillStyle(zone.light, 0.3);
        g.fillCircle(cx, cy, r + 2);

        // Main circle
        g.fillStyle(zone.light, 1);
        g.fillCircle(cx, cy, r);

        // Border
        g.lineStyle(2.5, zone.dark, 0.7);
        g.strokeCircle(cx, cy, r);

        // Inner dot
        g.fillStyle(zone.dark, 0.25);
        g.fillCircle(cx, cy, r * 0.3);
      }

      // Yard label
      const cx = x + size / 2;
      const cy = y + size / 2;
      this.scene.add.text(cx, cy + size * 0.28, color.toUpperCase(), {
        fontSize: "10px",
        color: "#ffffff",
        fontFamily: "Outfit, sans-serif",
        fontStyle: "bold",
        stroke: "#00000044",
        strokeThickness: 2,
      }).setOrigin(0.5).setDepth(2);
    }
  }

  // ─── Main path ──────────────────────────────────────────────────────────────

  private drawMainPath(): void {
    const g = this.scene.add.graphics();
    g.setDepth(1);

    for (let pos = 0; pos < MAIN_PATH.length; pos++) {
      const coord = MAIN_PATH[pos];
      if (!coord) continue;
      const x = coord.col * CELL_SIZE;
      const y = coord.row * CELL_SIZE;
      const inset = 1.5;
      const radius = 4;

      // Determine fill color
      let fillColor = 0xffffff;
      let isStart = false;
      let startColor: PlayerColor | undefined;
      for (const color of PLAYER_COLORS) {
        if (START_POSITION[color] === pos) {
          fillColor = ZONE_COLORS[color].main;
          isStart = true;
          startColor = color;
          break;
        }
      }

      // Rounded tile
      g.fillStyle(fillColor, 1);
      g.fillRoundedRect(x + inset, y + inset, CELL_SIZE - inset * 2, CELL_SIZE - inset * 2, radius);

      // Subtle top highlight on non-start tiles
      if (!isStart) {
        g.fillStyle(0xffffff, 0.15);
        g.fillRoundedRect(x + inset, y + inset, CELL_SIZE - inset * 2, 3, { tl: radius, tr: radius, bl: 0, br: 0 });
      }

      // Thin border
      g.lineStyle(1, isStart && startColor ? ZONE_COLORS[startColor].dark : 0xd1d5db, isStart ? 0.6 : 0.5);
      g.strokeRoundedRect(x + inset, y + inset, CELL_SIZE - inset * 2, CELL_SIZE - inset * 2, radius);
    }
  }

  // ─── Home columns ───────────────────────────────────────────────────────────

  private drawHomeColumns(): void {
    const g = this.scene.add.graphics();
    g.setDepth(1);

    for (const color of PLAYER_COLORS) {
      const zone = ZONE_COLORS[color];
      const coords = HOME_COL_COORDS[color];

      coords.forEach((coord, step) => {
        const x = coord.col * CELL_SIZE;
        const y = coord.row * CELL_SIZE;
        const inset = 1.5;
        const radius = 4;

        // Gradient: lighter at entry → saturated at home
        const t = step / (coords.length - 1);
        const interpolated = Phaser.Display.Color.Interpolate.ColorWithColor(
          Phaser.Display.Color.IntegerToColor(zone.light),
          Phaser.Display.Color.IntegerToColor(zone.main),
          100,
          Math.round(t * 100),
        );
        g.fillStyle(interpolated.color, 1);
        g.fillRoundedRect(x + inset, y + inset, CELL_SIZE - inset * 2, CELL_SIZE - inset * 2, radius);

        // Border
        g.lineStyle(1, zone.dark, 0.35);
        g.strokeRoundedRect(x + inset, y + inset, CELL_SIZE - inset * 2, CELL_SIZE - inset * 2, radius);

        // Arrow indicator toward center (subtle)
        if (step < coords.length - 1) {
          g.fillStyle(zone.dark, 0.15);
          const cx = x + CELL_SIZE / 2;
          const cy = y + CELL_SIZE / 2;
          g.fillCircle(cx, cy, 3);
        }
      });
    }
  }

  // ─── Center ─────────────────────────────────────────────────────────────────

  private drawCenterStar(): void {
    const g = this.scene.add.graphics();
    g.setDepth(1);

    const cx = 7.5 * CELL_SIZE;
    const cy = 7.5 * CELL_SIZE;

    const corners: Array<[number, number]> = [
      [6 * CELL_SIZE, 6 * CELL_SIZE],
      [9 * CELL_SIZE, 6 * CELL_SIZE],
      [9 * CELL_SIZE, 9 * CELL_SIZE],
      [6 * CELL_SIZE, 9 * CELL_SIZE],
    ];
    const triangleColors: number[] = [
      ZONE_COLORS.red.main,
      ZONE_COLORS.blue.main,
      ZONE_COLORS.green.main,
      ZONE_COLORS.yellow.main,
    ];

    corners.forEach(([tx, ty], i) => {
      g.fillStyle(triangleColors[i] ?? 0xcccccc, 1);
      g.beginPath();
      g.moveTo(tx, ty);
      const next = corners[(i + 1) % 4]!;
      g.lineTo(next[0], next[1]);
      g.lineTo(cx, cy);
      g.closePath();
      g.fillPath();
    });

    // White center circle
    g.fillStyle(0xffffff, 1);
    g.fillCircle(cx, cy, CELL_SIZE * 0.7);

    // Subtle ring
    g.lineStyle(2, 0xf59e0b, 0.5);
    g.strokeCircle(cx, cy, CELL_SIZE * 0.7);

    // Star
    this.scene.add.text(cx, cy, "★", {
      fontSize: "24px",
      color: "#f59e0b",
      fontFamily: "Outfit, sans-serif",
    }).setOrigin(0.5).setDepth(2);
  }

  // ─── Safe stars ─────────────────────────────────────────────────────────────

  private drawSafeStars(): void {
    for (const pos of SAFE_TILES) {
      const isStart = Object.values(START_POSITION).includes(pos);
      if (isStart) continue;

      const { x, y } = mainPathPixel(pos);
      // Star with subtle glow background
      const g = this.scene.add.graphics();
      g.setDepth(2);
      g.fillStyle(0xf59e0b, 0.12);
      g.fillCircle(x, y, 10);

      this.scene.add.text(x, y, "★", {
        fontSize: "12px",
        color: "#f59e0b",
        fontFamily: "Outfit, sans-serif",
        stroke: "#78350f",
        strokeThickness: 1,
      }).setOrigin(0.5).setDepth(2);
    }
  }

  // ─── Start arrows ───────────────────────────────────────────────────────────

  private drawStartArrows(): void {
    const arrows: Record<PlayerColor, string> = {
      red: "→",
      blue: "↑",
      green: "←",
      yellow: "↓",
    };

    for (const color of PLAYER_COLORS) {
      const pos = START_POSITION[color];
      const { x, y } = mainPathPixel(pos);
      this.scene.add.text(x, y, arrows[color], {
        fontSize: "16px",
        color: "#ffffff",
        fontFamily: "Outfit, sans-serif",
        fontStyle: "bold",
        stroke: "#00000033",
        strokeThickness: 1,
      }).setOrigin(0.5).setDepth(2);
    }
  }

  // ─── Border ─────────────────────────────────────────────────────────────────

  private drawBorder(): void {
    const g = this.scene.add.graphics();
    g.setDepth(2);
    // Modern double-border with corner radius
    g.lineStyle(5, 0x1e293b, 1);
    g.strokeRect(0, 0, BOARD_PX, BOARD_PX);
    g.lineStyle(2, 0xf59e0b, 0.5);
    g.strokeRect(3, 3, BOARD_PX - 6, BOARD_PX - 6);
    // Outer shadow at bottom-right
    g.fillStyle(0x000000, 0.08);
    g.fillRect(BOARD_PX, 4, 4, BOARD_PX);
    g.fillRect(4, BOARD_PX, BOARD_PX, 4);
  }

  // ─── Highlights ─────────────────────────────────────────────────────────────

  highlightYardToken(color: PlayerColor, tokenIndex: number): void {
    const { x, y } = yardSpawnPixel(color, tokenIndex);
    this.addHighlight(x, y, ZONE_COLORS[color].main);
  }

  highlightMainTile(pos: number, color: PlayerColor): void {
    const { x, y } = mainPathPixel(pos);
    this.addHighlight(x, y, ZONE_COLORS[color].main);
  }

  highlightHomeColTile(color: PlayerColor, step: number): void {
    const { x, y } = homeColPixel(color, step);
    this.addHighlight(x, y, ZONE_COLORS[color].main);
  }

  private addHighlight(x: number, y: number, color: number): void {
    const r = CELL_SIZE * 0.45;
    // Glow ring
    this.highlightGraphics.lineStyle(3, color, 1);
    this.highlightGraphics.strokeCircle(x, y, r);
    this.highlightGraphics.fillStyle(color, 0.2);
    this.highlightGraphics.fillCircle(x, y, r);

    // Animated pulse
    this.scene.tweens.add({
      targets: this.highlightGraphics,
      alpha: 0.5,
      duration: animDuration(400),
      ease: "Sine.InOut",
      yoyo: true,
      repeat: -1,
    });
  }

  clearHighlights(): void {
    this.highlightGraphics.clear();
    this.scene.tweens.killTweensOf(this.highlightGraphics);
    this.highlightGraphics.setAlpha(1);
  }

  // ─── Public pixel accessors ─────────────────────────────────────────────────

  getPixelForPosition(
    color: PlayerColor,
    position: number,
    tokenIndex = 0,
  ): { x: number; y: number } {
    if (position === -1) return yardSpawnPixel(color, tokenIndex);
    const homeBase = HOME_COL_BASE[color];
    if (position >= homeBase) {
      return homeColPixel(color, position - homeBase);
    }
    return mainPathPixel(position);
  }

  getCellSize(): number { return CELL_SIZE; }
  getBoardPx(): number { return BOARD_PX; }
}

export { BoardManager };
