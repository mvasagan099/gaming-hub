import Phaser from "phaser";

export const BOARD_OFFSET_X = 60;
export const BOARD_OFFSET_Y = 60;

// Each row (row 0 = bottom = tiles 1-10, row 9 = top = tiles 91-100)
// gets its own two-tone colour palette: [darkTile, lightTile]
const ROW_PALETTES: Array<[number, number]> = [
  [0x1a7a4a, 0x2ecc71], // row 0 (  1–10): emerald green
  [0x1a4e8a, 0x3498db], // row 1 ( 11–20): ocean blue
  [0x9c6600, 0xf39c12], // row 2 ( 21–30): golden yellow
  [0x922b21, 0xe74c3c], // row 3 ( 31–40): crimson red
  [0x5b2d8e, 0x9b59b6], // row 4 ( 41–50): royal purple
  [0x0d7377, 0x1abc9c], // row 5 ( 51–60): teal
  [0xa04000, 0xe67e22], // row 6 ( 61–70): burnt orange
  [0x1a6b99, 0x2e86c1], // row 7 ( 71–80): steel blue
  [0x8e1048, 0xd63878], // row 8 ( 81–90): hot pink
  [0x7c5200, 0xf0b429], // row 9 ( 91–100): amber gold
];

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
      const row   = Math.floor(index / this.cols);
      let   col   = index % this.cols;
      if (row % 2 === 1) col = this.cols - 1 - col;
      const px = BOARD_OFFSET_X + col * this.tileSize + this.tileSize / 2;
      const py = BOARD_OFFSET_Y + (this.rows - 1 - row) * this.tileSize + this.tileSize / 2;
      this.tilePositions.set(tile, new Phaser.Math.Vector2(px, py));
    }
  }

  public drawBoard(): void {
    const g = this.scene.add.graphics();
    g.setDepth(0);

    // 3D Border around the board
    const borderThickness = 12;
    g.fillStyle(0x331c10, 1);
    g.fillRect(
      BOARD_OFFSET_X - borderThickness,
      BOARD_OFFSET_Y - borderThickness,
      this.boardSize + borderThickness * 2,
      this.boardSize + borderThickness * 2
    );
    // Outer bevel highlights
    g.fillStyle(0x5e3a24, 1);
    g.fillRect(BOARD_OFFSET_X - borderThickness, BOARD_OFFSET_Y - borderThickness, this.boardSize + borderThickness * 2, 4); // Top
    g.fillRect(BOARD_OFFSET_X - borderThickness, BOARD_OFFSET_Y - borderThickness, 4, this.boardSize + borderThickness * 2); // Left
    // Outer bevel shadows
    g.fillStyle(0x1a0d06, 1);
    g.fillRect(BOARD_OFFSET_X - borderThickness, BOARD_OFFSET_Y + this.boardSize + borderThickness - 4, this.boardSize + borderThickness * 2, 4); // Bottom
    g.fillRect(BOARD_OFFSET_X + this.boardSize + borderThickness - 4, BOARD_OFFSET_Y - borderThickness, 4, this.boardSize + borderThickness * 2); // Right

    for (let tile = 1; tile <= 100; tile++) {
      const pos  = this.getTilePosition(tile);
      const left = pos.x - this.tileSize / 2;
      const top  = pos.y - this.tileSize / 2;
      const sz   = this.tileSize;

      const idx = tile - 1;
      const row = Math.floor(idx / this.cols);
      const col = (row % 2 === 0) ? idx % this.cols : this.cols - 1 - (idx % this.cols);
      const isLight = (row + col) % 2 === 0;

      // Special tiles
      let fillColor: number;
      if (tile === 100) {
        fillColor = 0xf59e0b; // gold finish
      } else if (tile === 1) {
        fillColor = 0x16a34a; // green start
      } else {
        const palette = ROW_PALETTES[row] ?? ROW_PALETTES[0];
        fillColor = isLight ? palette[1] : palette[0];
      }

      // Tile fill
      g.fillStyle(fillColor, 1);
      g.fillRect(left + 1, top + 1, sz - 2, sz - 2);

      // Top bevel
      g.fillStyle(0xffffff, 0.15);
      g.fillRect(left + 1, top + 1, sz - 2, 4);
      // Left bevel
      g.fillRect(left + 1, top + 1, 4, sz - 2);
      
      // Bottom bevel shadow
      g.fillStyle(0x000000, 0.25);
      g.fillRect(left + 1, top + sz - 5, sz - 2, 4);
      // Right bevel shadow
      g.fillRect(left + sz - 5, top + 1, 4, sz - 2);

      // Tile border (dark line)
      g.lineStyle(2, 0x000000, 0.3);
      g.strokeRect(left, top, sz, sz);

      // Tile number
      let numColor = "#ffffff";
      if (tile === 100) { numColor = "#1a0500"; }

      const isEdge = tile === 1 || tile === 100;
      const numStyle: Phaser.Types.GameObjects.Text.TextStyle = {
        fontSize: isEdge ? "10px" : "11px",
        color:    numColor,
        fontFamily: "Outfit, sans-serif",
        fontStyle:  "bold",
      };
      this.scene.add.text(left + 4, top + 3, tile.toString(), numStyle).setDepth(1);

      // START / FINISH labels
      if (tile === 1) {
        this.scene.add.text(pos.x, pos.y + 10, "START", {
          fontSize: "7px", color: "#ffffff",
          fontFamily: "Outfit, sans-serif", fontStyle: "bold",
        }).setOrigin(0.5).setDepth(1);
      }
      if (tile === 100) {
        this.scene.add.text(pos.x, pos.y + 10, "FINISH", {
          fontSize: "7px", color: "#1a0500",
          fontFamily: "Outfit, sans-serif", fontStyle: "bold",
        }).setOrigin(0.5).setDepth(1);
      }
    }

    // Outer board frame — thick gold border
    const border = this.scene.add.graphics();
    border.setDepth(2);
    border.lineStyle(5, 0xf59e0b, 1);
    border.strokeRect(BOARD_OFFSET_X, BOARD_OFFSET_Y, this.boardSize, this.boardSize);
    // Inner frame
    border.lineStyle(2, 0xfcd34d, 0.4);
    border.strokeRect(BOARD_OFFSET_X + 4, BOARD_OFFSET_Y + 4, this.boardSize - 8, this.boardSize - 8);

    // Highlight overlay layer
    this.highlightGraphics = this.scene.add.graphics();
    this.highlightGraphics.setDepth(3);
  }

  public highlightTile(tile: number, color: number): void {
    const pos = this.getTilePosition(tile);
    this.highlightGraphics.clear();
    this.highlightGraphics.lineStyle(4, color, 1);
    this.highlightGraphics.strokeRect(
      pos.x - this.tileSize / 2 + 2,
      pos.y - this.tileSize / 2 + 2,
      this.tileSize - 4,
      this.tileSize - 4
    );
    this.highlightGraphics.fillStyle(color, 0.15);
    this.highlightGraphics.fillRect(
      pos.x - this.tileSize / 2 + 2,
      pos.y - this.tileSize / 2 + 2,
      this.tileSize - 4,
      this.tileSize - 4
    );
  }

  public clearHighlight(): void {
    this.highlightGraphics.clear();
  }

  public getTilePosition(tile: number): Phaser.Math.Vector2 {
    const clamped = Math.max(1, Math.min(tile, 100));
    return this.tilePositions.get(clamped) ?? new Phaser.Math.Vector2(
      this.tileSize / 2,
      this.boardSize - this.tileSize / 2
    );
  }

  public getTileSize(): number { return this.tileSize; }

  /** @deprecated */
  public drawGrid(): void { this.drawBoard(); }
  /** @deprecated */
  public drawDebugNumbers(): void { /* noop */ }
}

export { BoardManager };
