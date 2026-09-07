import Phaser from "phaser";

export const BOARD_OFFSET_X = 60;
export const BOARD_OFFSET_Y = 60;

// Harmonized, sophisticated modern palettes per row (subtle contrast, depth-friendly)
const ROW_PALETTES: Array<[number, number]> = [
  [0x0f766e, 0x14b8a6], // row 0 (  1–10): rich teal
  [0x1d4ed8, 0x3b82f6], // row 1 ( 11–20): royal sapphire
  [0xb45309, 0xf59e0b], // row 2 ( 21–30): warm amber
  [0xbe123c, 0xf43f5e], // row 3 ( 31–40): crimson ruby
  [0x6d28d9, 0x8b5cf6], // row 4 ( 41–50): deep amethyst
  [0x047857, 0x10b981], // row 5 ( 51–60): emerald jade
  [0xc2410c, 0xf97316], // row 6 ( 61–70): burnt coral
  [0x0369a1, 0x0ea5e9], // row 7 ( 71–80): oceanic blue
  [0xa21caf, 0xd946ef], // row 8 ( 81–90): vibrant fuchsia
  [0x854d0e, 0xeab308], // row 9 ( 91–100): radiant gold
];

const TILE_CORNER_RADIUS = 6;
const INSET = 2.0;

export default class BoardManager {
  private scene: Phaser.Scene;
  public readonly boardSize: number;
  public readonly offsetX: number;
  public readonly offsetY: number;
  private readonly rows = 10;
  private readonly cols = 10;
  public readonly tileSize: number;

  private tilePositions = new Map<number, Phaser.Math.Vector2>();
  private highlightGraphics!: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, boardSize = 680, offsetX = BOARD_OFFSET_X, offsetY = BOARD_OFFSET_Y) {
    this.scene = scene;
    this.boardSize = boardSize;
    this.offsetX = offsetX;
    this.offsetY = offsetY;
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
      const px = this.offsetX + col * this.tileSize + this.tileSize / 2;
      const py = this.offsetY + (this.rows - 1 - row) * this.tileSize + this.tileSize / 2;
      this.tilePositions.set(tile, new Phaser.Math.Vector2(px, py));
    }
  }

  public drawBoard(): void {
    const g = this.scene.add.graphics();
    g.setDepth(0);

    const bx = this.offsetX;
    const by = this.offsetY;
    const bs = this.boardSize;

    // ── 1. Multi-Tier Deep Ambient Drop Shadow (Layer 0) ───────────────────
    // Soft outer shadow (largest spread, lowest alpha)
    g.fillStyle(0x000000, 0.25);
    g.fillRoundedRect(bx - 24, by - 12, bs + 48, bs + 56, 24);
    // Medium contact shadow
    g.fillStyle(0x000000, 0.4);
    g.fillRoundedRect(bx - 18, by - 6, bs + 36, bs + 44, 20);
    // Hard bottom contact shadow
    g.fillStyle(0x000000, 0.6);
    g.fillRoundedRect(bx - 12, by + 4, bs + 24, bs + 30, 16);

    // ── 2. 3D Board Slab / Extruded Base (Layer 1) ─────────────────────────
    const slabPad = 14;
    const slabX = bx - slabPad;
    const slabY = by - slabPad;
    const slabW = bs + slabPad * 2;
    const slabH = bs + slabPad * 2;
    const slabDepth = 14;

    // Extruded bottom rim (physical 3D thickness)
    g.fillStyle(0x070b14, 1);
    g.fillRoundedRect(slabX, slabY + slabDepth, slabW, slabH, 16);
    // Side gradient simulation for 3D slab edge
    g.fillStyle(0x0d1527, 1);
    g.fillRoundedRect(slabX + 2, slabY + slabDepth - 2, slabW - 4, slabH, 14);

    // Top surface of the slab (dark midnight mahogany)
    g.fillStyle(0x111c33, 1);
    g.fillRoundedRect(slabX, slabY, slabW, slabH, 16);

    // ── 3. Chamfered Metallic Gold/Bronze Outer Frame (Layer 2) ───────────
    const frameG = this.scene.add.graphics();
    frameG.setDepth(1);

    // Outer gold border glow
    frameG.lineStyle(5, 0xf59e0b, 0.2);
    frameG.strokeRoundedRect(bx - 8, by - 8, bs + 16, bs + 16, 12);

    // Main 3D beveled gold frame
    frameG.lineStyle(4, 0xd97706, 1);
    frameG.strokeRoundedRect(bx - 6, by - 6, bs + 12, bs + 12, 10);

    // Specular top-left frame highlight
    frameG.lineStyle(2, 0xfde68a, 0.85);
    frameG.strokeRoundedRect(bx - 5, by - 5, bs + 10, bs + 10, 9);

    // Inner dark recessed frame bevel
    frameG.lineStyle(2, 0x050914, 0.9);
    frameG.strokeRoundedRect(bx - 1, by - 1, bs + 2, bs + 2, 6);

    // Corner decorative brass studs/rivets
    const corners = [
      { x: bx - 10, y: by - 10 },
      { x: bx + bs + 10, y: by - 10 },
      { x: bx - 10, y: by + bs + 10 },
      { x: bx + bs + 10, y: by + bs + 10 },
    ];
    for (const c of corners) {
      // Rivet shadow
      frameG.fillStyle(0x000000, 0.5);
      frameG.fillCircle(c.x + 1, c.y + 2, 4.5);
      // Rivet body
      frameG.fillStyle(0xf59e0b, 1);
      frameG.fillCircle(c.x, c.y, 4);
      // Specular glint
      frameG.fillStyle(0xffffff, 0.9);
      frameG.fillCircle(c.x - 1, c.y - 1, 1.5);
    }

    // ── 4. Recessed Inner Board Tray (Layer 3) ────────────────────────────
    // Shadow casting from frame into top and left edge of the grid
    g.fillStyle(0x000000, 0.4);
    g.fillRect(bx, by, bs, 4);
    g.fillRect(bx, by, 4, bs);

    // ── 5. Elevated 3D Cells with Bevels & Embossed Numbers ────────────────
    for (let tile = 1; tile <= 100; tile++) {
      const pos = this.getTilePosition(tile);
      const sz = this.tileSize;
      const left = pos.x - sz / 2;
      const top = pos.y - sz / 2;

      const idx = tile - 1;
      const row = Math.floor(idx / this.cols);
      const col = (row % 2 === 0) ? idx % this.cols : this.cols - 1 - (idx % this.cols);
      const isLight = (row + col) % 2 === 0;

      let primaryColor: number;

      if (tile === 100) {
        primaryColor = 0xf59e0b;
      } else if (tile === 1) {
        primaryColor = 0x059669;
      } else {
        const pal = ROW_PALETTES[row] ?? ROW_PALETTES[0];
        primaryColor = isLight ? pal[1] : pal[0];
      }

      const r = TILE_CORNER_RADIUS;
      const x = left + INSET;
      const y = top + INSET;
      const s = sz - INSET * 2;
      const depth = 3;

      // ── Cell Drop Shadow & Extruded Bottom Edge ──
      g.fillStyle(0x000000, 0.35);
      g.fillRoundedRect(x, y + depth, s, s, r);

      // Dark underside bevel
      const darkTone = Phaser.Display.Color.IntegerToColor(primaryColor);
      darkTone.darken(40);
      g.fillStyle(darkTone.color, 1);
      g.fillRoundedRect(x, y + 2, s, s, r);

      // ── Main Raised Surface ──
      g.fillStyle(primaryColor, 1);
      g.fillRoundedRect(x, y, s, s - 1, r);

      // ── 3D Bevel Highlights & Shadows (Light source: Top-Left) ──
      // Top specular highlight edge
      g.fillStyle(0xffffff, 0.38);
      g.fillRoundedRect(x + 1, y + 1, s - 2, 4, { tl: r - 1, tr: r - 1, bl: 0, br: 0 });

      // Left specular highlight edge
      g.fillStyle(0xffffff, 0.22);
      g.fillRoundedRect(x + 1, y + 4, 3, s - 8, { tl: 0, tr: 0, bl: 0, br: 0 });

      // Bottom inner shadow
      g.fillStyle(0x000000, 0.28);
      g.fillRoundedRect(x + 1, y + s - 5, s - 2, 4, { tl: 0, tr: 0, bl: r - 1, br: r - 1 });

      // Right inner shadow
      g.fillStyle(0x000000, 0.18);
      g.fillRoundedRect(x + s - 4, y + 4, 3, s - 8, { tl: 0, tr: 0, bl: 0, br: 0 });

      // Crisp inset outline
      g.lineStyle(1, 0x000000, 0.25);
      g.strokeRoundedRect(x, y, s, s, r);

      // ── Embossed Tile Numbers ──
      let numColor = "#ffffff";
      let numStroke = "rgba(0,0,0,0.65)";
      let numFontSize = "12px";

      if (tile === 100) {
        numColor = "#451a03";
        numStroke = "rgba(254, 243, 199, 0.8)";
        numFontSize = "13px";
      } else if (tile === 1) {
        numColor = "#ffffff";
        numStroke = "rgba(6, 78, 59, 0.9)";
        numFontSize = "13px";
      }

      // Embossed number background drop shadow
      this.scene.add.text(pos.x + 0.8, pos.y + 0.8, tile.toString(), {
        fontSize: numFontSize,
        color: "#000000",
        fontFamily: "Outfit, sans-serif",
        fontStyle: "bold",
      }).setOrigin(0.5).setAlpha(0.6).setDepth(2);

      // Main embossed number with stroke
      this.scene.add.text(pos.x, pos.y - 1, tile.toString(), {
        fontSize: numFontSize,
        color: numColor,
        fontFamily: "Outfit, sans-serif",
        fontStyle: "bold",
        stroke: numStroke,
        strokeThickness: 2,
      }).setOrigin(0.5).setDepth(2);

      // ── START / FINISH Special Badges ─────────────────────────────────────
      if (tile === 1) {
        // Emerald launchpad badge
        const startBadge = this.scene.add.graphics();
        startBadge.setDepth(2);
        startBadge.fillStyle(0x064e3b, 0.8);
        startBadge.fillRoundedRect(pos.x - 22, pos.y + 11, 44, 12, 4);
        startBadge.lineStyle(1, 0x34d399, 0.9);
        startBadge.strokeRoundedRect(pos.x - 22, pos.y + 11, 44, 12, 4);

        this.scene.add.text(pos.x, pos.y + 17, "★ START ★", {
          fontSize: "7.5px",
          color: "#a7f3d0",
          fontFamily: "Outfit, sans-serif",
          fontStyle: "bold",
        }).setOrigin(0.5).setDepth(3);
      }

      if (tile === 100) {
        // Golden victory crest badge
        const winBadge = this.scene.add.graphics();
        winBadge.setDepth(2);
        winBadge.fillStyle(0x78350f, 0.85);
        winBadge.fillRoundedRect(pos.x - 23, pos.y + 11, 46, 12, 4);
        winBadge.lineStyle(1, 0xfde68a, 0.9);
        winBadge.strokeRoundedRect(pos.x - 23, pos.y + 11, 46, 12, 4);

        this.scene.add.text(pos.x, pos.y + 17, "🏆 VICTORY", {
          fontSize: "7.5px",
          color: "#fef3c7",
          fontFamily: "Outfit, sans-serif",
          fontStyle: "bold",
        }).setOrigin(0.5).setDepth(3);
      }
    }

    // ── 6. Highlight overlay layer ─────────────────────────────────────────
    this.highlightGraphics = this.scene.add.graphics();
    this.highlightGraphics.setDepth(3);
  }

  public highlightTile(tile: number, color: number): void {
    const pos = this.getTilePosition(tile);
    const r = this.tileSize / 2 - 3;
    this.highlightGraphics.clear();

    // 3D Pulse Aura on target tile
    this.highlightGraphics.lineStyle(5, color, 0.85);
    this.highlightGraphics.strokeRoundedRect(
      pos.x - r - 1,
      pos.y - r - 1,
      r * 2 + 2,
      r * 2 + 2,
      TILE_CORNER_RADIUS,
    );

    // Inner specular glow
    this.highlightGraphics.fillStyle(color, 0.22);
    this.highlightGraphics.fillRoundedRect(
      pos.x - r,
      pos.y - r,
      r * 2,
      r * 2,
      TILE_CORNER_RADIUS,
    );
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
}

export { BoardManager };

