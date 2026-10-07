import Phaser from "phaser";
import type { PlayerColor } from "../types/ludo.types";
import {
  BOARD_CELLS,
  BOARD_PX,
  YARDS,
  YARD_TOKEN_OFFSETS,
  HOME_COL_COORDS,
  MAIN_PATH,
  SAFE_TILES,
  START_POSITION,
  HOME_COL_BASE,
  mainPathPixel,
  homeColPixel,
  yardSpawnPixel,
  setBoardLayoutConfig,
  getCurrentCellSize,
} from "../data/boardLayout";
import { ANIM, LUDO_DESIGN_CONFIG, animDuration } from "../constants";

const PLAYER_COLORS: PlayerColor[] = ["red", "blue", "green", "yellow"];

export default class BoardManager {
  private scene: Phaser.Scene;
  private highlightGraphics!: Phaser.GameObjects.Graphics;
  public readonly offsetX: number;
  public readonly offsetY: number;
  public readonly boardPx: number;
  public readonly cellSize: number;

  constructor(scene: Phaser.Scene, offsetX = 0, offsetY = 0, boardPx = BOARD_PX) {
    this.scene = scene;
    this.offsetX = offsetX;
    this.offsetY = offsetY;
    this.boardPx = boardPx;
    this.cellSize = boardPx / BOARD_CELLS;
    setBoardLayoutConfig(offsetX, offsetY, boardPx);
  }

  drawBoard(): void {
    this.drawBoardShadowAndSlab();
    this.drawYards();
    this.drawMainPath();
    this.drawHomeColumns();
    this.drawCenterStar();
    this.drawSafeStars();
    this.drawStartArrows();
    this.drawBorderBevel();

    this.highlightGraphics = this.scene.add.graphics();
    this.highlightGraphics.setDepth(35);
  }

  /** Board entry animation — subtle lift & fade */
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
          y: `+=${10}`,
          duration: animDuration(ANIM.boardEntryDuration),
          ease: "Cubic.Out",
          delay: Math.random() * 80,
        });
      } else {
        alphaObj.setAlpha?.(1);
      }
    }
    this.scene.time.delayedCall(animDuration(ANIM.boardEntryDuration + 100), () => onComplete?.());
  }

  // ─── 3D Board Shadow & Elevated Slab ─────────────────────────────────────────

  private drawBoardShadowAndSlab(): void {
    const g = this.scene.add.graphics();
    g.setDepth(0);

    const cornerR = LUDO_DESIGN_CONFIG.boardCornerRadius;
    const pad = 4;
    const bx = this.offsetX + pad;
    const by = this.offsetY + pad;
    const w = this.boardPx - pad * 2;
    const h = this.boardPx - pad * 2;

    // 1. Soft Multi-Stage 3D Ambient Drop Shadow under board slab
    g.fillStyle(0x000000, 0.4);
    g.fillRoundedRect(bx + 10, by + 16, w, h, cornerR + 4);
    g.fillStyle(0x000000, 0.25);
    g.fillRoundedRect(bx + 6, by + 10, w, h, cornerR + 2);
    g.fillStyle(0x000000, 0.15);
    g.fillRoundedRect(bx + 2, by + 4, w, h, cornerR);

    // 2. 3D Board Base Chassis (Midnight Navy Slab)
    g.fillStyle(0x0a0f1d, 1);
    g.fillRoundedRect(bx, by, w, h, cornerR);

    // 3. Satin Board Playfield Surface
    const inset = 6;
    g.fillStyle(0x0f172a, 1);
    g.fillRoundedRect(bx + inset, by + inset, w - inset * 2, h - inset * 2, cornerR - 4);

    // 4. Subtle Top-Left Specular Surface Sheen
    g.fillStyle(0xffffff, 0.03);
    g.fillRoundedRect(bx + inset, by + inset, w - inset * 2, (h - inset * 2) * 0.45, {
      tl: cornerR - 4,
      tr: cornerR - 4,
      bl: 0,
      br: 0,
    });
  }

  // ─── Player Home / Yard Quadrants ────────────────────────────────────────────

  private drawYards(): void {
    const g = this.scene.add.graphics();
    g.setDepth(1);
    const cs = this.cellSize;

    for (const color of PLAYER_COLORS) {
      const c = LUDO_DESIGN_CONFIG.colors[color];
      const yard = YARDS[color];
      const x = this.offsetX + yard.col * cs + 4;
      const y = this.offsetY + yard.row * cs + 4;
      const size = 6 * cs - 8;
      const cornerR = 18;

      // 1. Yard Outer Raised Card (Modern Glass Panel)
      g.fillStyle(0x090d16, 0.95);
      g.fillRoundedRect(x, y, size, size, cornerR);

      // Yard team-colored ambient glow gradient at base
      g.fillStyle(c.main, 0.12);
      g.fillRoundedRect(x, y, size, size, cornerR);

      // Yard Metallic Border
      g.lineStyle(2.0, c.main, 0.85);
      g.strokeRoundedRect(x, y, size, size, cornerR);

      // Top-left bevel highlight
      g.lineStyle(1.5, 0xffffff, 0.3);
      g.strokeRoundedRect(x + 1, y + 1, size - 2, size - 2, cornerR - 1);

      // 2. Inner Recessed Floor Arena
      const pad = cs * 0.45;
      const innerW = size - pad * 2;
      const innerH = size - pad * 2;
      g.fillStyle(0x030712, 0.8);
      g.fillRoundedRect(x + pad, y + pad, innerW, innerH, 14);
      g.lineStyle(1.5, c.dark, 0.5);
      g.strokeRoundedRect(x + pad, y + pad, innerW, innerH, 14);

      // 3. 3D Recessed Token Pedestals / Sockets
      for (let ti = 0; ti < 4; ti++) {
        const offset = YARD_TOKEN_OFFSETS[ti]!;
        const cx = this.offsetX + (yard.col + offset.col) * cs + cs / 2;
        const cy = this.offsetY + (yard.row + offset.row) * cs + cs / 2;
        const r = cs * 0.42;

        // Outer LED-glow halo
        g.fillStyle(c.glow, 0.2);
        g.fillCircle(cx, cy, r + 4);

        // Recessed rim bevel
        g.fillStyle(0x0a0f1d, 1);
        g.fillCircle(cx, cy, r);

        // Dark cavity socket
        g.fillStyle(0x020617, 1);
        g.fillCircle(cx, cy, r - 3);

        // Inner glowing team core
        g.fillStyle(c.main, 0.25);
        g.fillCircle(cx, cy, r * 0.5);

        // Socket metallic stroke
        g.lineStyle(1.8, c.light, 0.8);
        g.strokeCircle(cx, cy, r - 1.5);
      }

      // 4. Modern Minimalist Team Name Badge
      const cx = x + size / 2;
      const cy = y + size / 2;

      // Small central crest pill
      g.fillStyle(0x0f172a, 0.9);
      g.fillRoundedRect(cx - 38, cy + size * 0.26 - 10, 76, 20, 10);
      g.lineStyle(1, c.main, 0.6);
      g.strokeRoundedRect(cx - 38, cy + size * 0.26 - 10, 76, 20, 10);

      this.scene.add.text(cx, cy + size * 0.26, color.toUpperCase(), {
        fontSize: "10px",
        color: "#ffffff",
        fontFamily: "Outfit, sans-serif",
        fontStyle: "bold",
      }).setOrigin(0.5).setDepth(2);
    }
  }

  // ─── Playable Main Path Cells ────────────────────────────────────────────────

  private drawMainPath(): void {
    const g = this.scene.add.graphics();
    g.setDepth(2);
    const cs = this.cellSize;

    for (let pos = 0; pos < MAIN_PATH.length; pos++) {
      const coord = MAIN_PATH[pos];
      if (!coord) continue;
      const x = this.offsetX + coord.col * cs;
      const y = this.offsetY + coord.row * cs;
      const inset = 2.0;
      const radius = 6;
      const w = cs - inset * 2;
      const h = cs - inset * 2;

      // Determine cell styling
      let isStart = false;
      let startColor: PlayerColor | undefined;
      for (const color of PLAYER_COLORS) {
        if (START_POSITION[color] === pos) {
          isStart = true;
          startColor = color;
          break;
        }
      }

      if (isStart && startColor) {
        const c = LUDO_DESIGN_CONFIG.colors[startColor];
        // Start Tile — Team colored illuminated slab
        g.fillStyle(c.main, 1.0);
        g.fillRoundedRect(x + inset, y + inset, w, h, radius);

        // Top specular highlight
        g.fillStyle(0xffffff, 0.35);
        g.fillRoundedRect(x + inset, y + inset, w, 4, { tl: radius, tr: radius, bl: 0, br: 0 });

        // Outer glow stroke
        g.lineStyle(1.8, c.light, 0.9);
        g.strokeRoundedRect(x + inset, y + inset, w, h, radius);
      } else {
        // Standard Modern Neutral Cell (Dark Glass Inset)
        g.fillStyle(0x131d31, 1.0);
        g.fillRoundedRect(x + inset, y + inset, w, h, radius);

        // Subtle top bevel highlight
        g.fillStyle(0xffffff, 0.08);
        g.fillRoundedRect(x + inset, y + inset, w, 3, { tl: radius, tr: radius, bl: 0, br: 0 });

        // Clean separator stroke
        g.lineStyle(1.2, 0x1e293b, 0.8);
        g.strokeRoundedRect(x + inset, y + inset, w, h, radius);
      }
    }
  }

  // ─── Home Columns ───────────────────────────────────────────────────────────

  private drawHomeColumns(): void {
    const g = this.scene.add.graphics();
    g.setDepth(2);
    const cs = this.cellSize;

    for (const color of PLAYER_COLORS) {
      const c = LUDO_DESIGN_CONFIG.colors[color];
      const coords = HOME_COL_COORDS[color];

      coords.forEach((coord, step) => {
        const x = this.offsetX + coord.col * cs;
        const y = this.offsetY + coord.row * cs;
        const inset = 2.0;
        const radius = 6;
        const w = cs - inset * 2;
        const h = cs - inset * 2;

        // Progressive gradient from entry to home center
        const t = (step + 1) / coords.length;
        const interpolated = Phaser.Display.Color.Interpolate.ColorWithColor(
          Phaser.Display.Color.IntegerToColor(c.dark),
          Phaser.Display.Color.IntegerToColor(c.main),
          100,
          Math.round(t * 100),
        );

        g.fillStyle(interpolated.color, 0.95);
        g.fillRoundedRect(x + inset, y + inset, w, h, radius);

        // Top-left bevel highlight
        g.fillStyle(0xffffff, 0.25 + t * 0.15);
        g.fillRoundedRect(x + inset, y + inset, w, 3.5, { tl: radius, tr: radius, bl: 0, br: 0 });

        // Glowing border
        g.lineStyle(1.4, c.light, 0.7 + t * 0.3);
        g.strokeRoundedRect(x + inset, y + inset, w, h, radius);

        // Directional glowing dot towards center
        if (step < coords.length - 1) {
          const cx = x + cs / 2;
          const cy = y + cs / 2;
          g.fillStyle(0xffffff, 0.5);
          g.fillCircle(cx, cy, 3);
        }
      });
    }
  }

  // ─── Multi-Faceted Center Home Area ─────────────────────────────────────────

  private drawCenterStar(): void {
    const g = this.scene.add.graphics();
    g.setDepth(2);
    const cs = this.cellSize;

    const cx = this.offsetX + 7.5 * cs;
    const cy = this.offsetY + 7.5 * cs;

    const corners: Array<[number, number]> = [
      [this.offsetX + 6 * cs, this.offsetY + 6 * cs],
      [this.offsetX + 9 * cs, this.offsetY + 6 * cs],
      [this.offsetX + 9 * cs, this.offsetY + 9 * cs],
      [this.offsetX + 6 * cs, this.offsetY + 9 * cs],
    ];

    const triangleColors: number[] = [
      LUDO_DESIGN_CONFIG.colors.yellow.main,
      LUDO_DESIGN_CONFIG.colors.blue.main,
      LUDO_DESIGN_CONFIG.colors.red.main,
      LUDO_DESIGN_CONFIG.colors.green.main,
    ];

    // 1. Triangular Home Quadrants
    corners.forEach(([tx, ty], i) => {
      g.fillStyle(triangleColors[i] ?? 0x334155, 1.0);
      g.beginPath();
      g.moveTo(tx, ty);
      const next = corners[(i + 1) % 4]!;
      g.lineTo(next[0], next[1]);
      g.lineTo(cx, cy);
      g.closePath();
      g.fillPath();

      // Subtle inner shadow along triangle borders
      g.lineStyle(1.5, 0x000000, 0.4);
      g.beginPath();
      g.moveTo(tx, ty);
      g.lineTo(cx, cy);
      g.strokePath();
    });

    // 2. Polished Center Gold Hub
    const hubR = cs * 0.75;

    // Ambient glow halo
    g.fillStyle(0xf59e0b, 0.25);
    g.fillCircle(cx, cy, hubR + 4);

    // Midnight gold hub disc
    g.fillStyle(0x0f172a, 1.0);
    g.fillCircle(cx, cy, hubR);

    // Inner gold ring
    g.fillStyle(0xf59e0b, 0.2);
    g.fillCircle(cx, cy, hubR - 2);

    // Metallic gold rim stroke
    g.lineStyle(2.5, 0xf59e0b, 1.0);
    g.strokeCircle(cx, cy, hubR);

    g.lineStyle(1.5, 0xfef08a, 0.8);
    g.strokeCircle(cx, cy, hubR - 3);

    // 3. Central 3D Star Crest
    this.scene.add.text(cx, cy, "★", {
      fontSize: "26px",
      color: "#f59e0b",
      fontFamily: "Outfit, sans-serif",
      shadow: {
        offsetX: 0,
        offsetY: 2,
        color: "#000000",
        blur: 4,
        stroke: true,
        fill: true,
      },
    }).setOrigin(0.5).setDepth(3);
  }

  // ─── Safe Star Tiles ────────────────────────────────────────────────────────

  private drawSafeStars(): void {
    for (const pos of SAFE_TILES) {
      const isStart = Object.values(START_POSITION).includes(pos);
      if (isStart) continue;

      const { x, y } = mainPathPixel(pos);
      const g = this.scene.add.graphics();
      g.setDepth(3);

      // Subtle gold ambient glow on safe tile
      g.fillStyle(0xf59e0b, 0.18);
      g.fillCircle(x, y, 12);

      g.lineStyle(1.5, 0xf59e0b, 0.6);
      g.strokeCircle(x, y, 10);

      this.scene.add.text(x, y, "★", {
        fontSize: "13px",
        color: "#f59e0b",
        fontFamily: "Outfit, sans-serif",
        shadow: {
          offsetX: 0,
          offsetY: 1,
          color: "#000000",
          blur: 2,
          fill: true,
        },
      }).setOrigin(0.5).setDepth(3);
    }
  }

  // ─── Start Arrows ───────────────────────────────────────────────────────────

  private drawStartArrows(): void {
    const arrows: Record<PlayerColor, string> = {
      green: "→",
      yellow: "↓",
      blue: "←",
      red: "↑",
    };

    for (const color of PLAYER_COLORS) {
      const pos = START_POSITION[color];
      const { x, y } = mainPathPixel(pos);
      this.scene.add.text(x, y, arrows[color], {
        fontSize: "17px",
        color: "#ffffff",
        fontFamily: "Outfit, sans-serif",
        fontStyle: "bold",
        shadow: {
          offsetX: 0,
          offsetY: 1,
          color: "#00000088",
          blur: 2,
          stroke: true,
          fill: true,
        },
      }).setOrigin(0.5).setDepth(3);
    }
  }

  // ─── 3D Board Rim & Beveled Border ──────────────────────────────────────────

  private drawBorderBevel(): void {
    const g = this.scene.add.graphics();
    g.setDepth(30);

    const pad = 4;
    const bx = this.offsetX + pad;
    const by = this.offsetY + pad;
    const w = this.boardPx - pad * 2;
    const h = this.boardPx - pad * 2;
    const cornerR = LUDO_DESIGN_CONFIG.boardCornerRadius;

    // Metallic Outer Chamfer Rim
    g.lineStyle(3, 0x1e293b, 1.0);
    g.strokeRoundedRect(bx, by, w, h, cornerR);

    // Subtle Gold Accent Pinstripe
    g.lineStyle(1.5, 0xf59e0b, 0.5);
    g.strokeRoundedRect(bx + 3, by + 3, w - 6, h - 6, cornerR - 2);
  }

  // ─── Highlights ─────────────────────────────────────────────────────────────

  highlightYardToken(color: PlayerColor, tokenIndex: number): void {
    const { x, y } = yardSpawnPixel(color, tokenIndex);
    this.addHighlight(x, y, LUDO_DESIGN_CONFIG.colors[color].glow);
  }

  highlightMainTile(pos: number, color: PlayerColor): void {
    const { x, y } = mainPathPixel(pos);
    this.addHighlight(x, y, LUDO_DESIGN_CONFIG.colors[color].glow);
  }

  highlightHomeColTile(color: PlayerColor, step: number): void {
    const { x, y } = homeColPixel(color, step);
    this.addHighlight(x, y, LUDO_DESIGN_CONFIG.colors[color].glow);
  }

  private addHighlight(x: number, y: number, color: number): void {
    const r = this.cellSize * 0.45;
    this.highlightGraphics.lineStyle(2.5, color, 0.9);
    this.highlightGraphics.strokeCircle(x, y, r);
    this.highlightGraphics.fillStyle(color, 0.2);
    this.highlightGraphics.fillCircle(x, y, r);

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

  // ─── Public Pixel Accessors ─────────────────────────────────────────────────

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

  getCellSize(): number { return this.cellSize; }
  getBoardPx(): number { return this.boardPx; }
}

export { BoardManager };
