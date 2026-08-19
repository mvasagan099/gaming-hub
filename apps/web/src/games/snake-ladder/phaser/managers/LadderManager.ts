import Phaser from "phaser";
import { ladders, ladderLookup } from "../data/ladders";
import type BoardManager from "./BoardManager";

/** Classic wooden ladder colour set */
const LADDER_COLORS = {
  railDark:  0x5c3317,
  railMain:  0x8B4513,
  railLight: 0xcd853f,
  rungDark:  0x4a2800,
  rungMain:  0x6b3a2a,
  rungLight: 0xb07040,
  shine:     0xdeb887,
  capTop:    0xf0c060,
  capBot:    0xa07030,
  shadow:    0x000000,
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

      this.drawLadder(scene, bot, top);

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
    // Draw a glowing overlay along the ladder
    const dx = entry.top.x - entry.bottom.x;
    const dy = entry.top.y - entry.bottom.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const nx = dx / len;
    const ny = dy / len;
    const px = -ny;
    const py = nx;

    hg.lineStyle(12, 0xfbbf24, 0.25);
    hg.lineBetween(entry.bottom.x, entry.bottom.y, entry.top.x, entry.top.y);
    hg.lineStyle(6, 0xfde68a, 0.4);
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

  /** Get a straight-line path from bottom to top for token animation. */
  getLadderPath(bottomTile: number, board: BoardManager): Phaser.Math.Vector2[] {
    const entry = this.entries.find(e => e.start === bottomTile);
    if (!entry) return [];
    const points: Phaser.Math.Vector2[] = [];
    const steps = 6;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      points.push(new Phaser.Math.Vector2(
        Phaser.Math.Linear(entry.bottom.x, entry.top.x, t),
        Phaser.Math.Linear(entry.bottom.y, entry.top.y, t),
      ));
    }
    return points;
  }

  private drawLadder(
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

    const halfGap = 9;
    const railW = 6;
    const rungW = 5;
    const rungOver = 3;

    const l0 = { x: bottom.x + px * halfGap, y: bottom.y + py * halfGap };
    const l1 = { x: top.x + px * halfGap, y: top.y + py * halfGap };
    const r0 = { x: bottom.x - px * halfGap, y: bottom.y - py * halfGap };
    const r1 = { x: top.x - px * halfGap, y: top.y - py * halfGap };

    // Drop shadow
    g.lineStyle(railW + 6, LADDER_COLORS.shadow, 0.18);
    g.lineBetween(l0.x + 2, l0.y + 2, l1.x + 2, l1.y + 2);
    g.lineBetween(r0.x + 2, r0.y + 2, r1.x + 2, r1.y + 2);

    // Left rail
    g.lineStyle(railW + 2, LADDER_COLORS.railDark, 1);
    g.lineBetween(l0.x, l0.y, l1.x, l1.y);
    g.lineStyle(railW, LADDER_COLORS.railMain, 1);
    g.lineBetween(l0.x, l0.y, l1.x, l1.y);
    g.lineStyle(2, LADDER_COLORS.shine, 0.6);
    g.lineBetween(l0.x + px, l0.y + py, l1.x + px, l1.y + py);

    // Right rail
    g.lineStyle(railW + 2, LADDER_COLORS.railDark, 1);
    g.lineBetween(r0.x, r0.y, r1.x, r1.y);
    g.lineStyle(railW, LADDER_COLORS.railMain, 1);
    g.lineBetween(r0.x, r0.y, r1.x, r1.y);
    g.lineStyle(2, LADDER_COLORS.shine, 0.6);
    g.lineBetween(r0.x - px, r0.y - py, r1.x - px, r1.y - py);

    // Rungs
    const numRungs = Math.max(3, Math.floor(len / 22));
    for (let i = 1; i < numRungs; i++) {
      const t = i / numRungs;
      const cx = bottom.x + dx * t;
      const cy = bottom.y + dy * t;

      const rx0 = cx + px * (halfGap + rungOver);
      const ry0 = cy + py * (halfGap + rungOver);
      const rx1 = cx - px * (halfGap + rungOver);
      const ry1 = cy - py * (halfGap + rungOver);

      g.lineStyle(rungW + 3, LADDER_COLORS.shadow, 0.2);
      g.lineBetween(rx0 + nx, ry0 + ny, rx1 + nx, ry1 + ny);
      g.lineStyle(rungW, LADDER_COLORS.rungDark, 1);
      g.lineBetween(rx0 + nx * 1.5, ry0 + ny * 1.5, rx1 + nx * 1.5, ry1 + ny * 1.5);
      g.lineStyle(rungW, LADDER_COLORS.rungMain, 1);
      g.lineBetween(rx0, ry0, rx1, ry1);
      g.lineStyle(2, LADDER_COLORS.rungLight, 0.8);
      g.lineBetween(rx0 - nx, ry0 - ny, rx1 - nx, ry1 - ny);
    }

    // End caps
    const capRadius = 5;
    g.fillStyle(LADDER_COLORS.capBot, 1);
    g.fillCircle(l0.x, l0.y, capRadius);
    g.fillCircle(r0.x, r0.y, capRadius);
    g.lineStyle(2, LADDER_COLORS.railDark, 1);
    g.strokeCircle(l0.x, l0.y, capRadius);
    g.strokeCircle(r0.x, r0.y, capRadius);

    g.fillStyle(LADDER_COLORS.capTop, 1);
    g.fillCircle(l1.x, l1.y, capRadius);
    g.fillCircle(r1.x, r1.y, capRadius);
    g.lineStyle(2, LADDER_COLORS.railDark, 1);
    g.strokeCircle(l1.x, l1.y, capRadius);
    g.strokeCircle(r1.x, r1.y, capRadius);

    // UP arrow at top
    const arrowTip = { x: top.x + nx * 14, y: top.y + ny * 14 };
    const arrowL = { x: top.x - px * 7, y: top.y - py * 7 };
    const arrowR = { x: top.x + px * 7, y: top.y + py * 7 };

    g.fillStyle(0xf9e79f, 0.85);
    g.beginPath();
    g.moveTo(arrowTip.x, arrowTip.y);
    g.lineTo(arrowL.x, arrowL.y);
    g.lineTo(arrowR.x, arrowR.y);
    g.closePath();
    g.fillPath();
  }
}

export default LadderManager;
