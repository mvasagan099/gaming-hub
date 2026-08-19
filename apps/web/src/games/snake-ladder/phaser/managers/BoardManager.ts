import Phaser from "phaser";

export const BOARD_OFFSET_X = 60;
export const BOARD_OFFSET_Y = 60;

// Softer, more muted two-tone palettes per row
const ROW_PALETTES: Array<[number, number]> = [
  [0x1b8a52, 0x34d399], // row 0 (  1–10): emerald
  [0x1e5fa8, 0x4a9fe5], // row 1 ( 11–20): ocean blue
  [0xb8860b, 0xf5c842], // row 2 ( 21–30): golden
  [0xa83232, 0xef5350], // row 3 ( 31–40): crimson
  [0x6a3d9a, 0xb07cd8], // row 4 ( 41–50): royal purple
  [0x0e8b80, 0x2dd4bf], // row 5 ( 51–60): teal
  [0xb85c14, 0xf4a261], // row 6 ( 61–70): burnt orange
  [0x2070a8, 0x5ba3d9], // row 7 ( 71–80): steel blue
  [0xa81860, 0xe8519a], // row 8 ( 81–90): rose
  [0x9a6e1e, 0xfbbf24], // row 9 ( 91–100): amber gold
];

const TILE_CORNER_RADIUS = 4;
const INSET = 1.5;

export default class BoardManager {
  private scene: Phaser.Scene;
  public readonly boardSize: number;
  private readonly rows = 10;
  private readonly cols = 10;
  public readonly tileSize: number;

  private tilePositions = new Map<number, Phaser.Math.Vector2>();
  private highlightGraphics!: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, boardSize = 680) {
    this.scene = scene;
    this.boardSize = boardSize;
    this.tileSize = boardSize / this.cols;
    this.generateTilePositions();
  }

  private generateTilePositions(): void {
    this.tilePositions.clear();
    for (let tile = 1; tile <= 100; tile++) {
      const index = tile - 1;
      const row = Math.floor(index / this.cols);
      let col = index % this.cols;
      if (row % 2 === 1) col = this.cols - 1 - col;
      const px = BOARD_OFFSET_X + col * this.tileSize + this.tileSize / 2;
      const py = BOARD_OFFSET_Y + (this.rows - 1 - row) * this.tileSize + this.tileSize / 2;
      this.tilePositions.set(tile, new Phaser.Math.Vector2(px, py));
    }
  }

  public drawBoard(): void {
    const g = this.scene.add.graphics();
    g.setDepth(0);

    // ── Board backing ───────────────────────────────────────────────────
    const pad = 14;
    g.fillStyle(0x0a0f1a, 1);
    g.fillRoundedRect(
      BOARD_OFFSET_X - pad,
      BOARD_OFFSET_Y - pad,
      this.boardSize + pad * 2,
      this.boardSize + pad * 2,
      8,
    );

    // Subtle inner shadow on the backing
    g.fillStyle(0x000000, 0.3);
    g.fillRect(BOARD_OFFSET_X, BOARD_OFFSET_Y + this.boardSize - 2, this.boardSize, 3);

    // ── Draw each tile ──────────────────────────────────────────────────
    for (let tile = 1; tile <= 100; tile++) {
      const pos = this.getTilePosition(tile);
      const left = pos.x - this.tileSize / 2;
      const top = pos.y - this.tileSize / 2;
      const sz = this.tileSize;

      const idx = tile - 1;
      const row = Math.floor(idx / this.cols);
      const col = (row % 2 === 0) ? idx % this.cols : this.cols - 1 - (idx % this.cols);
      const isLight = (row + col) % 2 === 0;

      let fillColor: number;
      if (tile === 100) {
        fillColor = 0xf59e0b;
      } else if (tile === 1) {
        fillColor = 0x22c55e;
      } else {
        const palette = ROW_PALETTES[row] ?? ROW_PALETTES[0];
        fillColor = isLight ? palette[1] : palette[0];
      }

      const r = TILE_CORNER_RADIUS;
      const x = left + INSET;
      const y = top + INSET;
      const s = sz - INSET * 2;

      // Tile body
      g.fillStyle(fillColor, 1);
      g.fillRoundedRect(x, y, s, s, r);

      // Top highlight
      g.fillStyle(0xffffff, 0.18);
      g.fillRoundedRect(x, y, s, 4, { tl: r, tr: r, bl: 0, br: 0 });

      // Bottom shadow
      g.fillStyle(0x000000, 0.2);
      g.fillRoundedRect(x, y + s - 4, s, 4, { tl: 0, tr: 0, bl: r, br: r });

      // Tile border
      g.lineStyle(1, 0x000000, 0.2);
      g.strokeRoundedRect(x, y, s, s, r);

      // ── Tile number ───────────────────────────────────────────────────
      let numColor = "#ffffff";
      let numStroke = "rgba(0,0,0,0.4)";
      if (tile === 100) {
        numColor = "#3d1f00";
        numStroke = "rgba(0,0,0,0.15)";
      }

      const isEdge = tile === 1 || tile === 100;
      const numText = this.scene.add.text(pos.x, pos.y - 2, tile.toString(), {
        fontSize: isEdge ? "11px" : "12px",
        color: numColor,
        fontFamily: "Outfit, sans-serif",
        fontStyle: "bold",
        stroke: numStroke,
        strokeThickness: isEdge ? 0 : 2,
      }).setOrigin(0.5).setDepth(1);

      // Ensure number sits above the tile
      numText.setDepth(1);

      // ── START / FINISH labels ─────────────────────────────────────────
      if (tile === 1) {
        this.scene.add.text(pos.x, pos.y + 11, "START", {
          fontSize: "7px",
          color: "#ffffff",
          fontFamily: "Outfit, sans-serif",
          fontStyle: "bold",
          stroke: "#000000",
          strokeThickness: 1,
        }).setOrigin(0.5).setDepth(1);
      }
      if (tile === 100) {
        this.scene.add.text(pos.x, pos.y + 11, "FINISH", {
          fontSize: "7px",
          color: "#5c3a00",
          fontFamily: "Outfit, sans-serif",
          fontStyle: "bold",
          stroke: "#fcd34d",
          strokeThickness: 1,
        }).setOrigin(0.5).setDepth(1);
      }
    }

    // ── Outer gold frame ────────────────────────────────────────────────
    const border = this.scene.add.graphics();
    border.setDepth(2);
    // Subtle glow behind
    border.lineStyle(6, 0xf59e0b, 0.12);
    border.strokeRoundedRect(
      BOARD_OFFSET_X - 3,
      BOARD_OFFSET_Y - 3,
      this.boardSize + 6,
      this.boardSize + 6,
      6,
    );
    // Main border
    border.lineStyle(3, 0xf59e0b, 0.85);
    border.strokeRoundedRect(
      BOARD_OFFSET_X,
      BOARD_OFFSET_Y,
      this.boardSize,
      this.boardSize,
      4,
    );
    // Inner accent
    border.lineStyle(1, 0xfcd34d, 0.25);
    border.strokeRoundedRect(
      BOARD_OFFSET_X + 4,
      BOARD_OFFSET_Y + 4,
      this.boardSize - 8,
      this.boardSize - 8,
      3,
    );

    // Highlight overlay layer
    this.highlightGraphics = this.scene.add.graphics();
    this.highlightGraphics.setDepth(3);
  }

  public highlightTile(tile: number, color: number): void {
    const pos = this.getTilePosition(tile);
    const r = this.tileSize / 2 - 3;
    this.highlightGraphics.clear();
    // Glow ring
    this.highlightGraphics.lineStyle(4, color, 0.7);
    this.highlightGraphics.strokeCircle(pos.x, pos.y, r);
    // Subtle fill
    this.highlightGraphics.fillStyle(color, 0.12);
    this.highlightGraphics.fillCircle(pos.x, pos.y, r);
  }

  public clearHighlight(): void {
    this.highlightGraphics.clear();
  }

  public getTilePosition(tile: number): Phaser.Math.Vector2 {
    const clamped = Math.max(1, Math.min(tile, 100));
    return this.tilePositions.get(clamped) ?? new Phaser.Math.Vector2(
      this.tileSize / 2,
      this.boardSize - this.tileSize / 2,
    );
  }

  public getTileSize(): number { return this.tileSize; }

  /** @deprecated */
  public drawGrid(): void { this.drawBoard(); }
  /** @deprecated */
  public drawDebugNumbers(): void { /* noop */ }
}

export { BoardManager };
