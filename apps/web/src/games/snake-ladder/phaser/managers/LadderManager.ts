import Phaser from "phaser";
import { ladders, ladderLookup } from "../data/ladders";
import type BoardManager from "./BoardManager";

/** Classic rich teak & brass wooden ladder palette */
const LADDER_COLORS = {
  shadow:    0x000000,
  railDark:  0x3e1d08, // Dark walnut under-rail
  railMain:  0x78350f, // Rich warm teak wood
  railLight: 0xb45309, // Top lit edge
  railShine: 0xfde68a, // Specular wood glint
  rungDark:  0x2e1405, // Bottom rung shadow
  rungMain:  0x5b2707, // Main wooden rung
  rungLight: 0x9a3412, // Top rung highlight
  brassCap:  0xf59e0b, // Polished brass cap
  brassShine:0xfef08a, // Specular brass glint
  rivet:     0xd97706, // Brass rivet studs
};

interface LadderEntry {
  start: number;
  end: number;
  bottom: Phaser.Math.Vector2;
  top: Phaser.Math.Vector2;
  highlightGraphics: Phaser.GameObjects.Graphics;
}

export class LadderManager {
  private readonly lookup = ladderLookup;
  private entries: LadderEntry[] = [];
  private activeHighlight: Phaser.GameObjects.Graphics | null = null;

  hasLadder(tile: number): boolean { return this.lookup.has(tile); }
  getTop(tile: number): number | undefined { return this.lookup.get(tile); }
  checkLadder(tile: number): number { return this.lookup.get(tile) ?? tile; }

  getAllLadderBottoms(): number[] {
    return Array.from(this.lookup.keys());
  }

  drawLadders(scene: Phaser.Scene, board: BoardManager): void {
    this.entries = [];
    for (const ladder of ladders) {
      const bot = board.getTilePosition(ladder.start);
      const top = board.getTilePosition(ladder.end);

      this.draw3DWoodLadder(scene, bot, top);

      const highlightG = scene.add.graphics();
      highlightG.setDepth(5);
      highlightG.setAlpha(0);

      this.entries.push({
        start: ladder.start,
        end: ladder.end,
        bottom: bot,
        top,
        highlightGraphics: highlightG,
      });
    }
  }

  /** Highlight the ladder at the given bottom tile. */
  highlightLadder(bottomTile: number, scene: Phaser.Scene): void {
    const entry = this.entries.find(e => e.start === bottomTile);
    if (!entry) return;

    const hg = entry.highlightGraphics;
    hg.clear();
    // Radiant golden glow along the entire ladder structure
    hg.lineStyle(16, 0xf59e0b, 0.3);
    hg.lineBetween(entry.bottom.x, entry.bottom.y, entry.top.x, entry.top.y);
    hg.lineStyle(8, 0xfde68a, 0.6);
    hg.lineBetween(entry.bottom.x, entry.bottom.y, entry.top.x, entry.top.y);

    this.activeHighlight = hg;
    scene.tweens.add({ targets: hg, alpha: 1, duration: 200, ease: "Sine.InOut" });
  }

  /** Remove highlight from all ladders. */
  unhighlightAll(scene: Phaser.Scene): void {
    if (!this.activeHighlight) return;
    scene.tweens.add({
      targets: this.activeHighlight,
      alpha: 0,
      duration: 200,
      ease: "Sine.InOut",
      onComplete: () => { this.activeHighlight = null; },
    });
  }

  /** Get a sampled straight-line path from bottom to top for token animation. */
  getLadderPath(bottomTile: number, board: BoardManager): Phaser.Math.Vector2[] {
    const entry = this.entries.find(e => e.start === bottomTile);
    if (!entry) return [];
    const points: Phaser.Math.Vector2[] = [];
    const steps = 8;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      points.push(new Phaser.Math.Vector2(
        Phaser.Math.Linear(entry.bottom.x, entry.top.x, t),
        Phaser.Math.Linear(entry.bottom.y, entry.top.y, t),
      ));
    }
    return points;
  }

  private draw3DWoodLadder(
    scene: Phaser.Scene,
    bottom: Phaser.Math.Vector2,
    top: Phaser.Math.Vector2,
  ): void {
    const g = scene.add.graphics();
    g.setDepth(4);

    const dx = top.x - bottom.x;
    const dy = top.y - bottom.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 20) return;

    const nx = dx / len;
    const ny = dy / len;
    const px = -ny;
    const py = nx;

    const halfGap = 10;
    const railW = 7;
    const rungW = 5;
    const rungOver = 4;

    const l0 = { x: bottom.x + px * halfGap, y: bottom.y + py * halfGap };
    const l1 = { x: top.x + px * halfGap, y: top.y + py * halfGap };
    const r0 = { x: bottom.x - px * halfGap, y: bottom.y - py * halfGap };
    const r1 = { x: top.x - px * halfGap, y: top.y - py * halfGap };

    const shadowOffset = { x: 7, y: 9 };

    // ── 1. Soft 3D Directional Cast Shadow on Board ──
    g.lineStyle(railW + 8, LADDER_COLORS.shadow, 0.16);
    g.lineBetween(l0.x + shadowOffset.x, l0.y + shadowOffset.y, l1.x + shadowOffset.x, l1.y + shadowOffset.y);
    g.lineBetween(r0.x + shadowOffset.x, r0.y + shadowOffset.y, r1.x + shadowOffset.x, r1.y + shadowOffset.y);

    g.lineStyle(railW + 2, LADDER_COLORS.shadow, 0.3);
    g.lineBetween(l0.x + shadowOffset.x * 0.6, l0.y + shadowOffset.y * 0.6, l1.x + shadowOffset.x * 0.6, l1.y + shadowOffset.y * 0.6);
    g.lineBetween(r0.x + shadowOffset.x * 0.6, r0.y + shadowOffset.y * 0.6, r1.x + shadowOffset.x * 0.6, r1.y + shadowOffset.y * 0.6);

    // ── 2. Left Wooden Rail (3D cylindrical wood) ──
    // Dark underside
    g.lineStyle(railW + 2, LADDER_COLORS.railDark, 1);
    g.lineBetween(l0.x, l0.y, l1.x, l1.y);
    // Warm Teak body
    g.lineStyle(railW, LADDER_COLORS.railMain, 1);
    g.lineBetween(l0.x, l0.y, l1.x, l1.y);
    // Top highlight bevel
    g.lineStyle(2.5, LADDER_COLORS.railLight, 0.9);
    g.lineBetween(l0.x + px * 1.5, l0.y + py * 1.5, l1.x + px * 1.5, l1.y + py * 1.5);
    // Specular wood shine
    g.lineStyle(1, LADDER_COLORS.railShine, 0.65);
    g.lineBetween(l0.x + px * 2, l0.y + py * 2, l1.x + px * 2, l1.y + py * 2);

    // ── 3. Right Wooden Rail ──
    // Dark underside
    g.lineStyle(railW + 2, LADDER_COLORS.railDark, 1);
    g.lineBetween(r0.x, r0.y, r1.x, r1.y);
    // Warm Teak body
    g.lineStyle(railW, LADDER_COLORS.railMain, 1);
    g.lineBetween(r0.x, r0.y, r1.x, r1.y);
    // Top highlight bevel
    g.lineStyle(2.5, LADDER_COLORS.railLight, 0.9);
    g.lineBetween(r0.x + px * 1.5, r0.y + py * 1.5, r1.x + px * 1.5, r1.y + py * 1.5);

    // ── 4. 3D Cylindrical Wooden Rungs & Rivet Studs ──
    const numRungs = Math.max(3, Math.floor(len / 22));
    for (let i = 1; i < numRungs; i++) {
      const t = i / numRungs;
      const cx = bottom.x + dx * t;
      const cy = bottom.y + dy * t;

      const rx0 = cx + px * (halfGap + rungOver);
      const ry0 = cy + py * (halfGap + rungOver);
      const rx1 = cx - px * (halfGap + rungOver);
      const ry1 = cy - py * (halfGap + rungOver);

      // Rung drop shadow
      g.lineStyle(rungW + 4, LADDER_COLORS.shadow, 0.22);
      g.lineBetween(rx0 + shadowOffset.x * 0.7, ry0 + shadowOffset.y * 0.7, rx1 + shadowOffset.x * 0.7, ry1 + shadowOffset.y * 0.7);

      // Rung dark underside
      g.lineStyle(rungW + 1.5, LADDER_COLORS.rungDark, 1);
      g.lineBetween(rx0 + nx * 1.2, ry0 + ny * 1.2, rx1 + nx * 1.2, ry1 + ny * 1.2);

      // Rung body
      g.lineStyle(rungW, LADDER_COLORS.rungMain, 1);
      g.lineBetween(rx0, ry0, rx1, ry1);

      // Rung top specular highlight
      g.lineStyle(1.8, LADDER_COLORS.rungLight, 0.9);
      g.lineBetween(rx0 - nx * 1.2, ry0 - ny * 1.2, rx1 - nx * 1.2, ry1 - ny * 1.2);

      // Brass Rivet Studs at Rail Junctions
      const jLeft = { x: cx + px * halfGap, y: cy + py * halfGap };
      const jRight = { x: cx - px * halfGap, y: cy - py * halfGap };

      g.fillStyle(LADDER_COLORS.rivet, 1);
      g.fillCircle(jLeft.x, jLeft.y, 2.2);
      g.fillCircle(jRight.x, jRight.y, 2.2);
      g.fillStyle(0xffffff, 0.8);
      g.fillCircle(jLeft.x - 0.6, jLeft.y - 0.6, 0.8);
      g.fillCircle(jRight.x - 0.6, jRight.y - 0.6, 0.8);
    }

    // ── 5. Polished Brass End-Caps ──
    const capRadius = 5.5;
    const caps = [l0, r0, l1, r1];
    for (const c of caps) {
      // Brass cap shadow
      g.fillStyle(0x000000, 0.35);
      g.fillCircle(c.x + 1.5, c.y + 2, capRadius);
      // Brass cap dark rim
      g.fillStyle(LADDER_COLORS.railDark, 1);
      g.fillCircle(c.x, c.y, capRadius);
      // Brass cap golden face
      g.fillStyle(LADDER_COLORS.brassCap, 1);
      g.fillCircle(c.x, c.y, capRadius - 1);
      // Specular glint
      g.fillStyle(LADDER_COLORS.brassShine, 0.9);
      g.fillCircle(c.x - 1.2, c.y - 1.2, 1.8);
    }

    // Polished brass end-caps are rendered above
  }
}

export default LadderManager;

