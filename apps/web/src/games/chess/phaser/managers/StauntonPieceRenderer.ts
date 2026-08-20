/**
 * StauntonPieceRenderer — Premium 3D Chess Pieces
 *
 * Renders physically-convincing Staunton-inspired chess pieces using layered
 * Phaser Graphics primitives. Each piece has:
 *
 *  - Warm Ivory / Pearl body (White) or Deep Obsidian / Ebony (Black)
 *  - 3-tier beveled pedestal base with rim shadow
 *  - Sculpted anatomical silhouettes for all 6 piece types
 *  - 315° top-left directional key light with specular catch-lights
 *  - Right-side secondary bounce light
 *  - Dynamic contact shadow that detaches and softens on lift
 *  - Selection aura ring
 *  - Capture shockwave expanding ring
 */
import Phaser from "phaser";
import type { PieceType, PieceColor } from "../types/chess.types";
import { CHESS_DESIGN_CONFIG } from "../constants/chessAnimationConfig";

export interface PiecePalette {
  body:       number;
  bodyShade:  number;
  bodyDark:   number;
  rimDark:    number;
  specular:   number;
  bounce:     number; // secondary bounce light color
  accent:     number;
  glow:       number;
}

const WHITE_PALETTE: PiecePalette = {
  body:      0xf5edd4, // Warm ivory / cream
  bodyShade: 0xdcc9a6, // Lateral shade
  bodyDark:  0xb89d7a, // Deep shadow side
  rimDark:   0x8a6d45, // Base rim dark
  specular:  0xffffff, // Top-left catchlight
  bounce:    0xffe4a8, // Warm right-side bounce
  accent:    0xe8d8b8, // Collar / accent tier
  glow:      0xfef08a,
};

const BLACK_PALETTE: PiecePalette = {
  body:      0x22262e, // Dark charcoal / obsidian
  bodyShade: 0x131619, // Deep shadow
  bodyDark:  0x090b0d, // Deepest AO
  rimDark:   0x050608, // Base rim
  specular:  0x8fa3bc, // Blue-gray top-left catchlight
  bounce:    0x384858, // Cool blue-gray right side
  accent:    0x30373f, // Collar / accent tier
  glow:      0x38bdf8,
};

export class StauntonPieceRenderer {

  // ─── Contact Shadow ──────────────────────────────────────────────────────────

  static drawContactShadow(g: Phaser.GameObjects.Graphics, liftFactor = 0): void {
    g.clear();

    const scale  = Phaser.Math.Linear(1.0, 0.72, liftFactor);
    const alpha  = Phaser.Math.Linear(0.44, 0.14, liftFactor);
    const offX   = 4 * (1 + liftFactor * 0.4);
    const offY   = 18 + liftFactor * 8;

    // Wide outer ambient blur
    g.fillStyle(0x000000, alpha * 0.45);
    g.fillEllipse(offX, offY + 3, 58 * scale, 24 * scale);

    // Core contact shadow
    g.fillStyle(0x000000, alpha);
    g.fillEllipse(offX, offY, 46 * scale, 17 * scale);

    // Dense AO dot directly under base
    if (liftFactor < 0.35) {
      const coreA = (1 - liftFactor / 0.35) * 0.55;
      g.fillStyle(0x000000, coreA);
      g.fillEllipse(offX * 0.4, offY * 0.45, 30 * scale, 9 * scale);
    }
  }

  // ─── Main 3D Piece Rendering ─────────────────────────────────────────────────

  static draw3DPiece(g: Phaser.GameObjects.Graphics, type: PieceType, color: PieceColor): void {
    g.clear();
    const isWhite = color === "w";
    const p: PiecePalette = isWhite ? WHITE_PALETTE : BLACK_PALETTE;
    const baseY = 16;

    // Layer 1: pedestal base
    this.drawPedestalBase(g, baseY, p, isWhite);

    // Layer 2: piece body
    switch (type) {
      case "p": this.drawPawn(g, baseY, p, isWhite);   break;
      case "r": this.drawRook(g, baseY, p, isWhite);   break;
      case "n": this.drawKnight(g, baseY, p, isWhite); break;
      case "b": this.drawBishop(g, baseY, p, isWhite); break;
      case "q": this.drawQueen(g, baseY, p, isWhite);  break;
      case "k": this.drawKing(g, baseY, p, isWhite);   break;
    }
  }

  // ─── 3-Tier Pedestal Base ────────────────────────────────────────────────────

  private static drawPedestalBase(g: Phaser.GameObjects.Graphics, baseY: number, p: PiecePalette, isWhite: boolean): void {
    const W = 50;
    const H = 13;

    // Deepest bottom rim shadow
    g.fillStyle(p.rimDark, 1.0);
    g.fillEllipse(1, baseY + 4, W, H);

    // Mid dark extrusion
    g.fillStyle(p.bodyDark, 1.0);
    g.fillEllipse(0.5, baseY + 2, W - 2, H - 2);

    // Body shade lateral
    g.fillStyle(p.bodyShade, 1.0);
    g.fillEllipse(0, baseY, W - 4, H - 3);

    // Main ivory / obsidian top surface
    g.fillStyle(p.body, 1.0);
    g.fillEllipse(-0.5, baseY - 2, W - 8, H - 5);

    // Top specular edge arc (key light 315°)
    g.lineStyle(1.6, isWhite ? 0xffffff : 0x94a3b8, isWhite ? 0.85 : 0.5);
    g.beginPath();
    g.arc(-2, baseY - 4, (W - 12) / 2, Phaser.Math.DegToRad(155), Phaser.Math.DegToRad(325), false);
    g.strokePath();

    // Collar ring
    g.fillStyle(p.accent, 1.0);
    g.fillEllipse(0, baseY - 6, W - 16, 7);

    // Collar top specular
    g.lineStyle(0.9, isWhite ? 0xffffff : 0x7a9ab8, isWhite ? 0.7 : 0.3);
    g.beginPath();
    g.arc(-1, baseY - 7, (W - 20) / 2, Phaser.Math.DegToRad(160), Phaser.Math.DegToRad(310), false);
    g.strokePath();
  }

  // ─── Pawn ───────────────────────────────────────────────────────────────────

  private static drawPawn(g: Phaser.GameObjects.Graphics, baseY: number, p: PiecePalette, isWhite: boolean): void {
    // Tapered conical stem
    g.fillStyle(p.bodyShade, 1.0);
    g.beginPath();
    g.moveTo(-12, baseY - 5);  g.lineTo(12, baseY - 5);
    g.lineTo(7, baseY - 22);   g.lineTo(-7, baseY - 22);
    g.closePath(); g.fillPath();

    g.fillStyle(p.body, 1.0);
    g.beginPath();
    g.moveTo(-11, baseY - 6);  g.lineTo(11, baseY - 6);
    g.lineTo(6, baseY - 22);   g.lineTo(-6, baseY - 22);
    g.closePath(); g.fillPath();

    // Right bounce light on stem
    g.fillStyle(p.bounce, isWhite ? 0.14 : 0.08);
    g.beginPath();
    g.moveTo(8, baseY - 8);  g.lineTo(11, baseY - 6);
    g.lineTo(6, baseY - 22); g.lineTo(3, baseY - 22);
    g.closePath(); g.fillPath();

    // Neck collar ring
    g.fillStyle(p.accent, 1.0);
    g.fillEllipse(0, baseY - 22, 18, 6);

    // Spherical head
    const headY = baseY - 31;
    const headR  = 11;

    // Shadow sphere
    g.fillStyle(p.bodyShade, 1.0);
    g.fillCircle(0.5, headY + 0.5, headR);

    // Main body sphere
    g.fillStyle(p.body, 1.0);
    g.fillCircle(-0.5, headY - 0.5, headR - 0.5);

    // Top-left specular catchlight (315°)
    g.fillStyle(0xffffff, isWhite ? 1.0 : 0.75);
    g.fillCircle(-headR * 0.38, headY - headR * 0.38, 3.0);

    // Secondary micro specular
    g.fillStyle(0xffffff, isWhite ? 0.5 : 0.3);
    g.fillCircle(-headR * 0.18, headY - headR * 0.55, 1.4);

    // Right-side bounce light
    g.fillStyle(p.bounce, isWhite ? 0.18 : 0.10);
    g.fillEllipse(headR * 0.45, headY + headR * 0.3, 5, 3);
  }

  // ─── Rook ───────────────────────────────────────────────────────────────────

  private static drawRook(g: Phaser.GameObjects.Graphics, baseY: number, p: PiecePalette, isWhite: boolean): void {
    const towerTopY = baseY - 28;

    // Dark extrusion body
    g.fillStyle(p.bodyShade, 1.0);
    g.beginPath();
    g.moveTo(-14, baseY - 5); g.lineTo(14, baseY - 5);
    g.lineTo(11, towerTopY);  g.lineTo(-11, towerTopY);
    g.closePath(); g.fillPath();

    // Main tower body
    g.fillStyle(p.body, 1.0);
    g.beginPath();
    g.moveTo(-13, baseY - 6); g.lineTo(13, baseY - 6);
    g.lineTo(10, towerTopY);  g.lineTo(-10, towerTopY);
    g.closePath(); g.fillPath();

    // Right bounce light strip
    g.fillStyle(p.bounce, isWhite ? 0.12 : 0.07);
    g.beginPath();
    g.moveTo(10, baseY - 8); g.lineTo(13, baseY - 6);
    g.lineTo(10, towerTopY); g.lineTo(7, towerTopY);
    g.closePath(); g.fillPath();

    // Vertical specular strip (top-left)
    g.fillStyle(0xffffff, isWhite ? 0.18 : 0.10);
    g.fillRoundedRect(-11, towerTopY + 2, 3.5, baseY - towerTopY - 8, 1);

    // Upper cornice platform
    g.fillStyle(p.accent, 1.0);
    g.fillRoundedRect(-16, towerTopY - 3, 32, 7, 2.5);

    // Crenellations (3 battlements)
    const crenY = towerTopY - 12;
    const bW = 7, bH = 10;
    for (const bx of [-15, -4, 7]) {
      g.fillStyle(p.bodyShade, 1.0);
      g.fillRoundedRect(bx + 1, crenY + 1, bW, bH, 1.5);
      g.fillStyle(p.body, 1.0);
      g.fillRoundedRect(bx, crenY, bW, bH, 1.5);
      // Specular on each battlement top
      g.fillStyle(0xffffff, isWhite ? 0.85 : 0.5);
      g.fillCircle(bx + 2, crenY + 2, 1.5);
    }

    // Horizontal gap between crenellations
    g.fillStyle(p.bodyDark, 0.9);
    g.fillRect(-9, crenY, 4, bH);
    g.fillRect(3, crenY, 3, bH);
  }

  // ─── Knight ─────────────────────────────────────────────────────────────────

  private static drawKnight(g: Phaser.GameObjects.Graphics, baseY: number, p: PiecePalette, isWhite: boolean): void {
    // Shadow silhouette (offset)
    g.fillStyle(p.bodyShade, 1.0);
    g.beginPath();
    g.moveTo(-12, baseY - 5);
    g.lineTo(12, baseY - 5);
    g.lineTo(13, baseY - 15);
    g.lineTo(8, baseY - 26);
    g.lineTo(3, baseY - 37);
    g.lineTo(-3, baseY - 33);
    g.lineTo(-16, baseY - 25);
    g.lineTo(-14, baseY - 17);
    g.lineTo(-6, baseY - 14);
    g.closePath(); g.fillPath();

    // Main body
    g.fillStyle(p.body, 1.0);
    g.beginPath();
    g.moveTo(-11, baseY - 6);
    g.lineTo(11, baseY - 6);
    g.lineTo(12, baseY - 15);
    g.lineTo(7, baseY - 25);
    g.lineTo(2, baseY - 36);
    g.lineTo(-3, baseY - 32);
    g.lineTo(-15, baseY - 24);
    g.lineTo(-13, baseY - 17);
    g.lineTo(-5, baseY - 15);
    g.closePath(); g.fillPath();

    // Right-side bounce light on neck
    g.fillStyle(p.bounce, isWhite ? 0.15 : 0.08);
    g.beginPath();
    g.moveTo(9, baseY - 8);
    g.lineTo(12, baseY - 15);
    g.lineTo(7, baseY - 25);
    g.lineTo(4, baseY - 26);
    g.lineTo(8, baseY - 16);
    g.closePath(); g.fillPath();

    // Mane grooves (engraved lines)
    g.lineStyle(1.5, p.rimDark, 0.80);
    g.beginPath(); g.moveTo(8, baseY - 20); g.lineTo(3, baseY - 17); g.strokePath();
    g.beginPath(); g.moveTo(6, baseY - 26); g.lineTo(2, baseY - 23); g.strokePath();
    g.beginPath(); g.moveTo(4, baseY - 31); g.lineTo(0, baseY - 28); g.strokePath();

    // Eye glint
    g.fillStyle(isWhite ? 0x0f172a : 0xffffff, 1.0);
    g.fillCircle(-7, baseY - 27, 1.8);
    g.fillStyle(0xffffff, isWhite ? 0.9 : 0.6);
    g.fillCircle(-7.5, baseY - 27.5, 0.9);

    // Nose highlight
    g.fillStyle(0xffffff, isWhite ? 0.75 : 0.45);
    g.fillCircle(-13, baseY - 22, 2.0);

    // Top-of-head specular
    g.fillStyle(0xffffff, isWhite ? 0.90 : 0.55);
    g.fillCircle(0, baseY - 37, 2.5);
  }

  // ─── Bishop ─────────────────────────────────────────────────────────────────

  private static drawBishop(g: Phaser.GameObjects.Graphics, baseY: number, p: PiecePalette, isWhite: boolean): void {
    const waistY = baseY - 20;

    // Shadow body
    g.fillStyle(p.bodyShade, 1.0);
    g.beginPath();
    g.moveTo(-13, baseY - 5); g.lineTo(13, baseY - 5);
    g.lineTo(7, waistY); g.lineTo(-7, waistY);
    g.closePath(); g.fillPath();

    // Main tapered body
    g.fillStyle(p.body, 1.0);
    g.beginPath();
    g.moveTo(-12, baseY - 6); g.lineTo(12, baseY - 6);
    g.lineTo(6, waistY); g.lineTo(-6, waistY);
    g.closePath(); g.fillPath();

    // Right bounce light
    g.fillStyle(p.bounce, isWhite ? 0.14 : 0.07);
    g.beginPath();
    g.moveTo(9, baseY - 8); g.lineTo(12, baseY - 6);
    g.lineTo(6, waistY); g.lineTo(3, waistY);
    g.closePath(); g.fillPath();

    // Waist collar ring
    g.fillStyle(p.accent, 1.0);
    g.fillEllipse(0, waistY, 20, 7);

    // Oval mitre head — shadow
    const headY = waistY - 16;
    g.fillStyle(p.bodyShade, 1.0);
    g.fillEllipse(0.5, headY + 0.5, 22, 28);

    // Mitre head — main
    g.fillStyle(p.body, 1.0);
    g.fillEllipse(-0.5, headY - 0.5, 20.5, 26.5);

    // Left specular strip (key light)
    g.fillStyle(0xffffff, isWhite ? 0.85 : 0.55);
    g.fillEllipse(-4.5, headY - 5, 4, 10);

    // Iconic sliced notch
    g.lineStyle(2.2, p.rimDark, 0.95);
    g.beginPath(); g.moveTo(2, headY - 11); g.lineTo(9, headY - 3); g.strokePath();

    // Top finial ball
    g.fillStyle(p.bodyShade, 1.0);
    g.fillCircle(0, headY - 15, 3.8);
    g.fillStyle(p.body, 1.0);
    g.fillCircle(-0.5, headY - 15.5, 3.2);
    g.fillStyle(0xffffff, 0.95);
    g.fillCircle(-1.0, headY - 16.5, 1.4);
  }

  // ─── Queen ──────────────────────────────────────────────────────────────────

  private static drawQueen(g: Phaser.GameObjects.Graphics, baseY: number, p: PiecePalette, isWhite: boolean): void {
    const waistY     = baseY - 22;
    const crownTopY  = waistY - 18;

    // Hourglass gown shadow
    g.fillStyle(p.bodyShade, 1.0);
    g.beginPath();
    g.moveTo(-15, baseY - 5); g.lineTo(15, baseY - 5);
    g.lineTo(7, waistY); g.lineTo(-7, waistY);
    g.closePath(); g.fillPath();

    // Main gown
    g.fillStyle(p.body, 1.0);
    g.beginPath();
    g.moveTo(-14, baseY - 6); g.lineTo(14, baseY - 6);
    g.lineTo(6, waistY); g.lineTo(-6, waistY);
    g.closePath(); g.fillPath();

    // Right bounce
    g.fillStyle(p.bounce, isWhite ? 0.14 : 0.07);
    g.beginPath();
    g.moveTo(10, baseY - 8); g.lineTo(14, baseY - 6);
    g.lineTo(6, waistY); g.lineTo(3, waistY);
    g.closePath(); g.fillPath();

    // Waist royal girdle
    g.fillStyle(p.accent, 1.0);
    g.fillEllipse(0, waistY, 22, 7);

    // Flared coronet body — shadow
    g.fillStyle(p.bodyShade, 1.0);
    g.beginPath();
    g.moveTo(-8, waistY); g.lineTo(8, waistY);
    g.lineTo(17, crownTopY); g.lineTo(-17, crownTopY);
    g.closePath(); g.fillPath();

    // Coronet body — main
    g.fillStyle(p.body, 1.0);
    g.beginPath();
    g.moveTo(-7, waistY); g.lineTo(7, waistY);
    g.lineTo(16, crownTopY); g.lineTo(-16, crownTopY);
    g.closePath(); g.fillPath();

    // Left specular strip on crown body
    g.fillStyle(0xffffff, isWhite ? 0.80 : 0.50);
    g.fillRoundedRect(-9, waistY - 16, 4, 14, 1);

    // 5 Crown pearls
    for (const [i, px] of ([-15, -7.5, 0, 7.5, 15]).entries()) {
      const pearlY = crownTopY - 2;
      g.fillStyle(p.bodyShade, 1.0);
      g.fillCircle(px + 0.4, pearlY + 0.4, 3.2);
      g.fillStyle(isWhite ? 0xf5f0e0 : 0x6a7f98, 1.0);
      g.fillCircle(px, pearlY, 3.0);
      // Pearl specular
      g.fillStyle(0xffffff, isWhite ? 0.92 : 0.6);
      g.fillCircle(px - 0.9, pearlY - 0.9, 1.2);
      // Centre pearl slightly bigger
      if (i === 2) {
        g.fillStyle(0xffffff, isWhite ? 0.60 : 0.35);
        g.fillCircle(px, pearlY, 3.5);
        g.fillStyle(isWhite ? 0xf5f0e0 : 0x6a7f98, 1.0);
        g.fillCircle(px, pearlY, 3.1);
        g.fillStyle(0xffffff, 0.95);
        g.fillCircle(px - 1.0, pearlY - 1.0, 1.3);
      }
    }
  }

  // ─── King ───────────────────────────────────────────────────────────────────

  private static drawKing(g: Phaser.GameObjects.Graphics, baseY: number, p: PiecePalette, isWhite: boolean): void {
    const waistY    = baseY - 24;
    const crownTopY = waistY - 16;

    // Imperial robe shadow
    g.fillStyle(p.bodyShade, 1.0);
    g.beginPath();
    g.moveTo(-16, baseY - 5); g.lineTo(16, baseY - 5);
    g.lineTo(8, waistY); g.lineTo(-8, waistY);
    g.closePath(); g.fillPath();

    // Main robe
    g.fillStyle(p.body, 1.0);
    g.beginPath();
    g.moveTo(-15, baseY - 6); g.lineTo(15, baseY - 6);
    g.lineTo(7, waistY); g.lineTo(-7, waistY);
    g.closePath(); g.fillPath();

    // Right bounce light on robe
    g.fillStyle(p.bounce, isWhite ? 0.14 : 0.07);
    g.beginPath();
    g.moveTo(11, baseY - 8); g.lineTo(15, baseY - 6);
    g.lineTo(7, waistY); g.lineTo(4, waistY);
    g.closePath(); g.fillPath();

    // Imperial girdle
    g.fillStyle(p.accent, 1.0);
    g.fillEllipse(0, waistY, 24, 7);

    // Domed royal crown — shadow
    g.fillStyle(p.bodyShade, 1.0);
    g.fillEllipse(0.5, crownTopY + 0.5, 24, 18);

    // Crown dome — main
    g.fillStyle(p.body, 1.0);
    g.fillEllipse(-0.5, crownTopY - 0.5, 22.5, 16.5);

    // Crown specular (key light)
    g.fillStyle(0xffffff, isWhite ? 0.90 : 0.55);
    g.fillEllipse(-5.5, crownTopY - 4, 5, 8);

    // Imperial cross finial
    const crossY = crownTopY - 13;
    const goldC  = isWhite ? 0xd4af37 : 0xf59e0b;

    // Cross vertical bar
    g.fillStyle(goldC, 1.0);
    g.fillRoundedRect(-2, crossY - 7, 4, 11, 1.5);

    // Cross horizontal bar
    g.fillRoundedRect(-5.5, crossY - 4, 11, 4, 1.5);

    // Gold specular
    g.fillStyle(0xffffff, 0.95);
    g.fillCircle(-1, crossY - 5, 1.4);

    // Cross centre ball
    g.fillStyle(isWhite ? 0xfef08a : 0xf59e0b, 1.0);
    g.fillCircle(0, crossY - 1, 2.2);
    g.fillStyle(0xffffff, 0.9);
    g.fillCircle(-0.7, crossY - 1.7, 0.9);
  }

  // ─── Aura Ring ───────────────────────────────────────────────────────────────

  static drawAuraRing(g: Phaser.GameObjects.Graphics, color: PieceColor, active: boolean, pulseAlpha = 0.5): void {
    g.clear();
    if (!active && pulseAlpha <= 0.05) return;

    const auraColor = color === "w" ? 0xfacc15 : 0x38bdf8;
    const r = 28;

    // Soft outer radiant glow
    g.fillStyle(auraColor, pulseAlpha * 0.20);
    g.fillCircle(0, 4, r + 8);

    // Mid glow ring
    g.lineStyle(3.5, auraColor, pulseAlpha * 0.55);
    g.strokeCircle(0, 4, r + 2);

    // High-contrast bright ring
    g.lineStyle(1.8, 0xffffff, pulseAlpha * 0.90);
    g.strokeCircle(0, 4, r);

    // Inner color ring
    g.lineStyle(1.2, auraColor, pulseAlpha * 0.80);
    g.strokeCircle(0, 4, r - 2.5);
  }

  // ─── Capture Shockwave ───────────────────────────────────────────────────────

  static drawCaptureShockwave(g: Phaser.GameObjects.Graphics, color: PieceColor, progress: number): void {
    g.clear();
    if (progress <= 0 || progress >= 1) return;

    const ringColor  = color === "w" ? 0xf59e0b : 0x38bdf8;
    const currentR   = 40 * progress;
    const alpha      = (1 - progress) * 0.92;
    const lineW      = 3.2 * (1 - progress * 0.6);

    // Outer expanding ring
    g.lineStyle(lineW, ringColor, alpha);
    g.strokeCircle(0, 0, currentR);

    // Inner white shock ring
    g.lineStyle(1.6 * (1 - progress), 0xffffff, alpha * 0.85);
    g.strokeCircle(0, 0, currentR * 0.80);

    // Centre bright flash (early)
    if (progress < 0.25) {
      const flashA = (0.25 - progress) / 0.25 * 0.5;
      g.fillStyle(0xffffff, flashA);
      g.fillCircle(0, 0, 12 * (1 - progress * 4));
    }
  }
}
