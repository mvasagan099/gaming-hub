import Phaser from "phaser";
import { ladders, ladderLookup } from "../data/ladders";
import type BoardManager from "./BoardManager";

/** Classic wooden ladder colour set */
const LADDER_COLORS = {
  railDark:    0x5c3317, // dark brown rail (shadow side)
  railMain:    0x8B4513, // saddle brown main rail
  railLight:   0xcd853f, // Peru (lit side highlight)
  rungDark:    0x4a2800, // very dark rung shadow
  rungMain:    0x6b3a2a, // dark rung
  rungLight:   0xb07040, // lighter rung top face
  shine:       0xdeb887, // burlywood edge shine
  capTop:      0xf0c060, // gold cap at top
  capBot:      0xa07030, // darker cap at bottom
  shadow:      0x000000, // drop shadow colour
};

export class LadderManager {
  private readonly lookup = ladderLookup;

  hasLadder(tile: number): boolean { return this.lookup.has(tile); }
  getTop(tile: number): number | undefined { return this.lookup.get(tile); }
  checkLadder(tile: number): number { return this.lookup.get(tile) ?? tile; }

  getAllLadderBottoms(): number[] {
    return Array.from(this.lookup.keys());
  }

  drawLadders(scene: Phaser.Scene, board: BoardManager): void {
    for (const ladder of ladders) {
      const bot = board.getTilePosition(ladder.start);
      const top = board.getTilePosition(ladder.end);
      this.drawLadder(scene, bot, top);
    }
  }

  private drawLadder(
    scene: Phaser.Scene,
    bottom: Phaser.Math.Vector2,
    top: Phaser.Math.Vector2
  ): void {
    const g = scene.add.graphics();
    g.setDepth(4);

    const dx  = top.x - bottom.x;
    const dy  = top.y - bottom.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 20) return;

    // Unit direction vectors
    const nx = dx / len;   // along ladder
    const ny = dy / len;
    const px = -ny;        // perpendicular (left side of ladder)
    const py =  nx;

    const halfGap  = 9;   // half distance between the two rails
    const railW    = 6;   // rail stroke width
    const rungW    = 5;   // rung stroke width
    const rungOver = 3;   // how far rungs stick out past rails

    // ── Rail helper positions ─────────────────────────────────────────────
    const l0 = { x: bottom.x + px * halfGap, y: bottom.y + py * halfGap };
    const l1 = { x: top.x    + px * halfGap, y: top.y    + py * halfGap };
    const r0 = { x: bottom.x - px * halfGap, y: bottom.y - py * halfGap };
    const r1 = { x: top.x    - px * halfGap, y: top.y    - py * halfGap };

    // ── Drop shadow ───────────────────────────────────────────────────────
    g.lineStyle(railW + 6, LADDER_COLORS.shadow, 0.18);
    g.lineBetween(l0.x + 2, l0.y + 2, l1.x + 2, l1.y + 2);
    g.lineBetween(r0.x + 2, r0.y + 2, r1.x + 2, r1.y + 2);

    // ── Left rail (shadow side) ───────────────────────────────────────────
    g.lineStyle(railW + 2, LADDER_COLORS.railDark, 1);
    g.lineBetween(l0.x, l0.y, l1.x, l1.y);

    g.lineStyle(railW, LADDER_COLORS.railMain, 1);
    g.lineBetween(l0.x, l0.y, l1.x, l1.y);

    // Left rail light edge
    g.lineStyle(2, LADDER_COLORS.shine, 0.6);
    g.lineBetween(l0.x + px, l0.y + py, l1.x + px, l1.y + py);

    // ── Right rail ────────────────────────────────────────────────────────
    g.lineStyle(railW + 2, LADDER_COLORS.railDark, 1);
    g.lineBetween(r0.x, r0.y, r1.x, r1.y);

    g.lineStyle(railW, LADDER_COLORS.railMain, 1);
    g.lineBetween(r0.x, r0.y, r1.x, r1.y);

    // Right rail light edge
    g.lineStyle(2, LADDER_COLORS.shine, 0.6);
    g.lineBetween(r0.x - px, r0.y - py, r1.x - px, r1.y - py);

    // ── Rungs ─────────────────────────────────────────────────────────────
    const numRungs = Math.max(3, Math.floor(len / 22));
    for (let i = 1; i < numRungs; i++) {
      const t   = i / numRungs;
      const cx  = bottom.x + dx * t;
      const cy  = bottom.y + dy * t;

      const rx0 = cx + px * (halfGap + rungOver);
      const ry0 = cy + py * (halfGap + rungOver);
      const rx1 = cx - px * (halfGap + rungOver);
      const ry1 = cy - py * (halfGap + rungOver);

      // Rung shadow
      g.lineStyle(rungW + 3, LADDER_COLORS.shadow, 0.2);
      g.lineBetween(rx0 + nx, ry0 + ny, rx1 + nx, ry1 + ny);

      // Rung dark face (underside)
      g.lineStyle(rungW, LADDER_COLORS.rungDark, 1);
      g.lineBetween(rx0 + nx * 1.5, ry0 + ny * 1.5, rx1 + nx * 1.5, ry1 + ny * 1.5);

      // Rung main face
      g.lineStyle(rungW, LADDER_COLORS.rungMain, 1);
      g.lineBetween(rx0, ry0, rx1, ry1);

      // Rung top highlight
      g.lineStyle(2, LADDER_COLORS.rungLight, 0.8);
      g.lineBetween(rx0 - nx, ry0 - ny, rx1 - nx, ry1 - ny);
    }

    // ── End caps (circular knobs at each corner) ──────────────────────────
    const capRadius = 5;

    // Bottom caps
    g.fillStyle(LADDER_COLORS.capBot, 1);
    g.fillCircle(l0.x, l0.y, capRadius);
    g.fillCircle(r0.x, r0.y, capRadius);
    g.lineStyle(2, LADDER_COLORS.railDark, 1);
    g.strokeCircle(l0.x, l0.y, capRadius);
    g.strokeCircle(r0.x, r0.y, capRadius);

    // Top caps (gold tinted — the "goal" end)
    g.fillStyle(LADDER_COLORS.capTop, 1);
    g.fillCircle(l1.x, l1.y, capRadius);
    g.fillCircle(r1.x, r1.y, capRadius);
    g.lineStyle(2, LADDER_COLORS.railDark, 1);
    g.strokeCircle(l1.x, l1.y, capRadius);
    g.strokeCircle(r1.x, r1.y, capRadius);

    // ── UP arrow at top (subtle triangle) ────────────────────────────────
    const arrowTip = { x: top.x + nx * 14, y: top.y + ny * 14 };
    const arrowL   = { x: top.x - px * 7,  y: top.y - py * 7  };
    const arrowR   = { x: top.x + px * 7,  y: top.y + py * 7  };

    g.fillStyle(0xf9e79f, 0.85);
    g.beginPath();
    g.moveTo(arrowTip.x, arrowTip.y);
    g.lineTo(arrowL.x,   arrowL.y);
    g.lineTo(arrowR.x,   arrowR.y);
    g.closePath();
    g.fillPath();
  }
}

export default LadderManager;
