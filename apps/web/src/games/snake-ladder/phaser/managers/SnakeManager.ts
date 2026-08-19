import Phaser from "phaser";
import { snakes, snakeLookup } from "../data/snakes";
import type BoardManager from "./BoardManager";

/** Unique visual palette per snake */
interface SnakePalette {
  body: number;
  dark: number;
  belly: number;
}

const SNAKE_PALETTES: SnakePalette[] = [
  { body: 0xc0392b, dark: 0x7b241c, belly: 0xf1948a },
  { body: 0x27ae60, dark: 0x1a5e35, belly: 0x82e0aa },
  { body: 0x8e44ad, dark: 0x5b2c6f, belly: 0xc39bd3 },
  { body: 0xd35400, dark: 0x873600, belly: 0xf0b27a },
  { body: 0x2980b9, dark: 0x1a5276, belly: 0x7fb3d3 },
  { body: 0x16a085, dark: 0x0e6655, belly: 0x76d7c4 },
  { body: 0x784212, dark: 0x4a2800, belly: 0xba8a4a },
  { body: 0x6c3483, dark: 0x4a235a, belly: 0xaf7ac5 },
  { body: 0xb7950b, dark: 0x7d6608, belly: 0xf9e79f },
];

interface SnakeEntry {
  head: number;
  tail: number;
  headPos: Phaser.Math.Vector2;
  tailPos: Phaser.Math.Vector2;
  ctrl1: { x: number; y: number };
  ctrl2: { x: number; y: number };
  graphics: Phaser.GameObjects.Graphics;
  highlightGraphics: Phaser.GameObjects.Graphics;
}

export class SnakeManager {
  private readonly lookup = snakeLookup;
  private entries: SnakeEntry[] = [];

  hasSnake(tile: number): boolean { return this.lookup.has(tile); }
  getTail(tile: number): number | undefined { return this.lookup.get(tile); }
  checkSnake(tile: number): number { return this.lookup.get(tile) ?? tile; }

  getAllSnakeHeads(): number[] {
    return Array.from(this.lookup.keys());
  }

  drawSnakes(scene: Phaser.Scene, board: BoardManager): void {
    this.entries = [];
    snakes.forEach((snake, idx) => {
      const head = board.getTilePosition(snake.head);
      const tail = board.getTilePosition(snake.tail);
      const pal = SNAKE_PALETTES[idx % SNAKE_PALETTES.length] ?? SNAKE_PALETTES[0];

      const dx = tail.x - head.x;
      const dy = tail.y - head.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len === 0) return;

      const nx = dx / len;
      const ny = dy / len;
      const px = -ny;
      const py = nx;
      const amp = Math.min(len * 0.28, 55);

      const ctrl1 = { x: head.x + dx * 0.3 + px * amp, y: head.y + dy * 0.3 + py * amp };
      const ctrl2 = { x: head.x + dx * 0.7 - px * amp, y: head.y + dy * 0.7 - py * amp };

      const g = scene.add.graphics();
      g.setDepth(4);
      this.drawSnakeBody(g, head, ctrl1, ctrl2, tail, pal);

      const highlightG = scene.add.graphics();
      highlightG.setDepth(5);
      highlightG.setAlpha(0);

      this.entries.push({
        head: snake.head, tail: snake.tail,
        headPos: head, tailPos: tail,
        ctrl1, ctrl2,
        graphics: g,
        highlightGraphics: highlightG,
      });
    });
  }

  /** Highlight the snake at the given head tile. */
  highlightSnake(headTile: number): void {
    const entry = this.entries.find(e => e.head === headTile);
    if (!entry) return;
    const hg = entry.highlightGraphics;
    hg.clear();
    // Draw a glowing overlay along the snake path
    const pal = SNAKE_PALETTES[this.entries.indexOf(entry) % SNAKE_PALETTES.length] ?? SNAKE_PALETTES[0];
    hg.lineStyle(16, pal.body, 0.25);
    this.bezier(hg, entry.headPos, entry.ctrl1, entry.ctrl2, entry.tailPos);
    hg.lineStyle(8, pal.belly, 0.35);
    this.bezier(hg, entry.headPos, entry.ctrl1, entry.ctrl2, entry.tailPos);
    // Pulse alpha in
    this.highlightG = hg;
  }

  private highlightG: Phaser.GameObjects.Graphics | null = null;

  animateHighlightIn(scene: Phaser.Scene): void {
    if (!this.highlightG) return;
    scene.tweens.add({
      targets: this.highlightG,
      alpha: 1,
      duration: 200,
      ease: "Sine.InOut",
    });
  }

  animateHighlightOut(scene: Phaser.Scene): void {
    if (!this.highlightG) return;
    scene.tweens.add({
      targets: this.highlightG,
      alpha: 0,
      duration: 200,
      ease: "Sine.InOut",
      onComplete: () => { this.highlightG = null; },
    });
  }

  /** Get a sampled path along the snake bezier curve for token animation. */
  getSnakePath(headTile: number, board: BoardManager): Phaser.Math.Vector2[] {
    const entry = this.entries.find(e => e.head === headTile);
    if (!entry) return [];
    const points: Phaser.Math.Vector2[] = [];
    const steps = 12;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      points.push(this.bezierPoint(t, entry.headPos, entry.ctrl1, entry.ctrl2, entry.tailPos));
    }
    return points;
  }

  // ─── Private drawing helpers ───────────────────────────────────────────────

  private drawSnakeBody(
    g: Phaser.GameObjects.Graphics,
    head: Phaser.Math.Vector2,
    ctrl1: { x: number; y: number },
    ctrl2: { x: number; y: number },
    tail: Phaser.Math.Vector2,
    pal: SnakePalette,
  ): void {
    // Layer 1: dark outer shadow
    g.lineStyle(18, pal.dark, 0.35);
    this.bezier(g, head, ctrl1, ctrl2, tail);

    // Layer 2: body border
    g.lineStyle(14, pal.dark, 0.85);
    this.bezier(g, head, ctrl1, ctrl2, tail);

    // Layer 3: main body
    g.lineStyle(10, pal.body, 1);
    this.bezier(g, head, ctrl1, ctrl2, tail);

    // Layer 4: belly stripe
    g.lineStyle(4, pal.belly, 0.65);
    this.bezier(g, head, ctrl1, ctrl2, tail);

    // Scale dots
    this.drawScales(g, head, ctrl1, ctrl2, tail, pal);

    // Direction the head faces
    const faceX = -(ctrl1.x - head.x);
    const faceY = -(ctrl1.y - head.y);
    const fLen = Math.sqrt(faceX * faceX + faceY * faceY) || 1;
    const fwd = { x: faceX / fLen, y: faceY / fLen };

    this.drawSnakeHead(g, head, fwd, pal);

    // Tail tip
    g.fillStyle(pal.dark, 1);
    g.fillCircle(tail.x, tail.y, 4);
  }

  private drawScales(
    g: Phaser.GameObjects.Graphics,
    p0: { x: number; y: number },
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    p3: { x: number; y: number },
    pal: SnakePalette,
  ): void {
    const scaleCount = 10;
    for (let i = 1; i < scaleCount; i++) {
      const t = i / scaleCount;
      const pt = this.bezierPoint(t, p0, p1, p2, p3);

      const dt = 0.02;
      const pt2 = this.bezierPoint(Math.min(t + dt, 1), p0, p1, p2, p3);
      const tx = pt2.x - pt.x;
      const ty = pt2.y - pt.y;
      const tLen = Math.sqrt(tx * tx + ty * ty) || 1;
      const perpX = -ty / tLen;
      const perpY = tx / tLen;

      g.lineStyle(2, pal.dark, 0.45);
      g.lineBetween(
        pt.x + perpX * 5, pt.y + perpY * 5,
        pt.x - perpX * 5, pt.y - perpY * 5,
      );
    }
  }

  private drawSnakeHead(
    g: Phaser.GameObjects.Graphics,
    pos: Phaser.Math.Vector2,
    fwd: { x: number; y: number },
    pal: SnakePalette,
  ): void {
    const perpX = -fwd.y;
    const perpY = fwd.x;

    g.fillStyle(pal.dark, 1);
    g.fillEllipse(pos.x, pos.y, 26, 22);
    g.fillStyle(pal.body, 1);
    g.fillEllipse(pos.x, pos.y, 22, 18);

    const tongBase = { x: pos.x + fwd.x * 8, y: pos.y + fwd.y * 8 };
    const tongTip = { x: pos.x + fwd.x * 20, y: pos.y + fwd.y * 20 };
    const fork1 = {
      x: tongTip.x + fwd.x * 5 + perpX * 5,
      y: tongTip.y + fwd.y * 5 + perpY * 5,
    };
    const fork2 = {
      x: tongTip.x + fwd.x * 5 - perpX * 5,
      y: tongTip.y + fwd.y * 5 - perpY * 5,
    };

    g.lineStyle(2, 0xff3333, 1);
    g.lineBetween(tongBase.x, tongBase.y, tongTip.x, tongTip.y);
    g.lineBetween(tongTip.x, tongTip.y, fork1.x, fork1.y);
    g.lineBetween(tongTip.x, tongTip.y, fork2.x, fork2.y);

    const eyeDist = 5;
    const eyeFwd = 5;
    const eye1 = { x: pos.x + fwd.x * eyeFwd + perpX * eyeDist, y: pos.y + fwd.y * eyeFwd + perpY * eyeDist };
    const eye2 = { x: pos.x + fwd.x * eyeFwd - perpX * eyeDist, y: pos.y + fwd.y * eyeFwd - perpY * eyeDist };

    g.fillStyle(0xffffff, 1);
    g.fillCircle(eye1.x, eye1.y, 4);
    g.fillCircle(eye2.x, eye2.y, 4);

    g.fillStyle(0x111111, 1);
    g.fillEllipse(eye1.x + fwd.x * 0.8, eye1.y + fwd.y * 0.8, 2.5, 4);
    g.fillEllipse(eye2.x + fwd.x * 0.8, eye2.y + fwd.y * 0.8, 2.5, 4);

    g.fillStyle(0xffffff, 0.8);
    g.fillCircle(eye1.x + perpX * 0.8, eye1.y + perpY * 0.8, 1.2);
    g.fillCircle(eye2.x + perpX * 0.8, eye2.y + perpY * 0.8, 1.2);
  }

  // ─── Bezier math helpers ──────────────────────────────────────────────────

  private bezier(
    g: Phaser.GameObjects.Graphics,
    p0: { x: number; y: number },
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    p3: { x: number; y: number },
    steps = 64,
  ): void {
    g.beginPath();
    g.moveTo(p0.x, p0.y);
    for (let i = 1; i <= steps; i++) {
      const pt = this.bezierPoint(i / steps, p0, p1, p2, p3);
      g.lineTo(pt.x, pt.y);
    }
    g.strokePath();
  }

  private bezierPoint(
    t: number,
    p0: { x: number; y: number },
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    p3: { x: number; y: number },
  ): { x: number; y: number } {
    const it = 1 - t;
    return {
      x: it ** 3 * p0.x + 3 * it ** 2 * t * p1.x + 3 * it * t ** 2 * p2.x + t ** 3 * p3.x,
      y: it ** 3 * p0.y + 3 * it ** 2 * t * p1.y + 3 * it * t ** 2 * p2.y + t ** 3 * p3.y,
    };
  }
}

export default SnakeManager;
