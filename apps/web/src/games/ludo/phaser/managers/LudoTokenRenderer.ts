import Phaser from "phaser";
import type { PlayerColor } from "../types/ludo.types";
import { LUDO_TOKEN_VISUAL_CONFIG } from "../constants";

export interface LudoTokenPalette {
  body: number;
  bodyDark: number;
  rimDark: number;
  topCap: number;
  topCapLight: number;
  specular: number;
  glow: number;
  textStroke: string;
}

export const LUDO_TOKEN_PALETTES: Record<PlayerColor, LudoTokenPalette> = {
  red: {
    body: 0xe11d48,        // Ruby red main torso
    bodyDark: 0x9f1239,    // Deep crimson lateral shade
    rimDark: 0x4c0519,     // Obsidian burgundy base rim
    topCap: 0xf43f5e,      // Glossy rose-red top cap
    topCapLight: 0xfda4af, // Soft rose specular crest
    specular: 0xffffff,
    glow: 0xf43f5e,
    textStroke: "#4c0519",
  },
  blue: {
    body: 0x2563eb,        // Royal sapphire blue torso
    bodyDark: 0x1d4ed8,    // Deep navy lateral shade
    rimDark: 0x0f172a,     // Midnight base rim
    topCap: 0x3b82f6,      // Glossy sapphire top cap
    topCapLight: 0x93c5fd, // Sky blue specular crest
    specular: 0xffffff,
    glow: 0x3b82f6,
    textStroke: "#0f172a",
  },
  green: {
    body: 0x16a34a,        // Emerald jade torso
    bodyDark: 0x15803d,    // Deep forest cypress shade
    rimDark: 0x052e16,     // Obsidian emerald base rim
    topCap: 0x22c55e,      // Glossy emerald top cap
    topCapLight: 0x86efac, // Mint specular crest
    specular: 0xffffff,
    glow: 0x22c55e,
    textStroke: "#052e16",
  },
  yellow: {
    body: 0xd97706,        // Warm golden amber torso
    bodyDark: 0xb45309,    // Deep ochre lateral shade
    rimDark: 0x451a03,     // Dark umber base rim
    topCap: 0xeab308,      // Glossy sunlight top cap
    topCapLight: 0xfef08a, // Sunlight lemon specular crest
    specular: 0xffffff,
    glow: 0xfacc15,
    textStroke: "#451a03",
  },
};

/**
 * Pure presentation renderer for 3D physical Ludo board game tokens.
 * Renders physical thickness, cylindrical base skirts, beveled domed caps, and directional lighting.
 */
export class LudoTokenRenderer {
  /**
   * Draws the directional contact shadow under the token.
   * Dynamically adjusts scale, blur, and opacity when the token lifts in 3D space during a hop.
   */
  static drawContactShadow(
    g: Phaser.GameObjects.Graphics,
    radius: number,
    liftFactor = 0, // 0 = resting on board, 1 = maximum 3D hop height
  ): void {
    g.clear();

    const scale = Phaser.Math.Linear(
      LUDO_TOKEN_VISUAL_CONFIG.shadowScaleBase,
      LUDO_TOKEN_VISUAL_CONFIG.shadowScaleLifted,
      liftFactor,
    );
    const alpha = Phaser.Math.Linear(
      LUDO_TOKEN_VISUAL_CONFIG.shadowAlphaBase,
      LUDO_TOKEN_VISUAL_CONFIG.shadowAlphaLifted,
      liftFactor,
    );

    const offX = LUDO_TOKEN_VISUAL_CONFIG.shadowOffsetX * (1 + liftFactor * 0.4);
    const offY = (LUDO_TOKEN_VISUAL_CONFIG.shadowOffsetY + liftFactor * 5) * scale;

    // 1. Soft outer ambient blur shadow
    g.fillStyle(0x000000, alpha * 0.55);
    g.fillEllipse(offX, offY + 1.5, radius * 2.5 * scale, radius * 1.2 * scale);

    // 2. Medium contact shadow
    g.fillStyle(0x000000, alpha * 0.9);
    g.fillEllipse(offX, offY, radius * 2.1 * scale, radius * 0.9 * scale);

    // 3. Dense ambient occlusion core directly under base (only when resting/near ground)
    if (liftFactor < 0.35) {
      const coreAlpha = (1 - liftFactor / 0.35) * 0.5;
      g.fillStyle(0x000000, coreAlpha);
      g.fillEllipse(offX * 0.5, offY * 0.5, radius * 1.5 * scale, radius * 0.65 * scale);
    }
  }

  /**
   * Draws the complete 3D physical token body:
   * Base rim (cylinder thickness) + Torso + Beveled Top Cap + Specular Highlights.
   */
  static draw3DTokenBody(
    g: Phaser.GameObjects.Graphics,
    color: PlayerColor,
    radius: number,
  ): void {
    g.clear();
    const p = LUDO_TOKEN_PALETTES[color];
    const rimH = LUDO_TOKEN_VISUAL_CONFIG.rimHeight;

    // ── 1. 3D Base Skirt / Dark Rim (cylinder thickness) ──
    g.fillStyle(p.rimDark, 1.0);
    g.fillCircle(0, rimH, radius);

    // Lateral cylinder shade extrusion
    g.fillStyle(p.bodyDark, 1.0);
    g.beginPath();
    g.moveTo(-radius, 0);
    g.lineTo(-radius, rimH);
    g.arc(0, rimH, radius, Math.PI, 0, true);
    g.lineTo(radius, 0);
    g.arc(0, 0, radius, 0, Math.PI, false);
    g.closePath();
    g.fillPath();

    // ── 2. Rounded 3D Main Torso ──
    // Ambient shade under-disc
    g.fillStyle(p.bodyDark, 1.0);
    g.fillCircle(0, 0, radius);

    // Main primary color body disc (slight top-left offset for volume)
    g.fillStyle(p.body, 1.0);
    g.fillCircle(-0.6, -0.6, radius - 0.5);

    // Dark bottom-right flank contour
    g.lineStyle(1.8, p.rimDark, 0.85);
    g.beginPath();
    g.arc(0, 0, radius - 0.8, Phaser.Math.DegToRad(340), Phaser.Math.DegToRad(140), false);
    g.strokePath();

    // Light top-left flank contour (key light)
    g.lineStyle(1.6, p.topCapLight, 0.7);
    g.beginPath();
    g.arc(0, 0, radius - 0.8, Phaser.Math.DegToRad(160), Phaser.Math.DegToRad(320), false);
    g.strokePath();

    // ── 3. Glossy Beveled Top Cap Surface ──
    const capRadius = radius * LUDO_TOKEN_VISUAL_CONFIG.domeInsetRatio;

    // Inset beveled cap shadow boundary
    g.fillStyle(p.bodyDark, 0.9);
    g.fillCircle(0, 0, capRadius + 0.8);

    // Glossy top cap disc
    g.fillStyle(p.topCap, 1.0);
    g.fillCircle(-0.4, -0.5, capRadius);

    // Top cap inner bevel highlight arc (upper-left)
    g.fillStyle(p.topCapLight, 0.5);
    g.fillEllipse(-capRadius * 0.25, -capRadius * 0.35, capRadius * 1.3, capRadius * 0.8);

    // Concentric inner bevel groove ring
    g.lineStyle(1.2, p.bodyDark, 0.75);
    g.strokeCircle(0, 0, capRadius * 0.72);

    // ── 4. Specular Catch-Light & Glossy Glints ──
    // Outer specular crescent
    g.lineStyle(1.4, 0xffffff, 0.55);
    g.beginPath();
    g.arc(
      -capRadius * 0.15,
      -capRadius * 0.2,
      capRadius * 0.82,
      Phaser.Math.DegToRad(180),
      Phaser.Math.DegToRad(290),
      false,
    );
    g.strokePath();

    // Secondary specular soft halo
    g.fillStyle(0xffffff, 0.45);
    g.fillCircle(-radius * 0.32, -radius * 0.36, radius * 0.28);

    // Sharp pinpoint primary catch-light (light source: top-left)
    g.fillStyle(0xffffff, LUDO_TOKEN_VISUAL_CONFIG.specularCatchAlpha);
    g.fillCircle(-radius * 0.32, -radius * 0.36, radius * 0.16);

    // Subtle bottom-right counter-reflection glint (ambient bounce light)
    g.fillStyle(p.topCapLight, 0.3);
    g.fillEllipse(radius * 0.35, radius * 0.38, radius * 0.45, radius * 0.25);
  }

  /**
   * Draws the radiant pulsing turn aura behind active selectable tokens.
   */
  static drawAuraRing(
    g: Phaser.GameObjects.Graphics,
    color: PlayerColor,
    radius: number,
    active: boolean,
    pulseAlpha = 0.5,
    rotationAngle = 0,
  ): void {
    g.clear();
    if (!active && pulseAlpha <= 0.05) return;

    const p = LUDO_TOKEN_PALETTES[color];
    const baseR = radius + (active ? 5 : 2);

    // Outer soft radiant glow
    g.fillStyle(p.glow, pulseAlpha * 0.35);
    g.fillCircle(0, 0, baseR + 7);

    // Inner vibrant glow
    g.fillStyle(p.glow, pulseAlpha * 0.65);
    g.fillCircle(0, 0, baseR + 3.5);

    // High-contrast aura ring
    g.lineStyle(2.2, 0xffffff, pulseAlpha * 0.95);
    g.strokeCircle(0, 0, baseR + 1.5);
    g.lineStyle(1.5, p.topCapLight, pulseAlpha * 0.9);
    g.strokeCircle(0, 0, baseR);

    // Rotating 4-point orbital energy pips
    if (active) {
      const pipDist = baseR + 4;
      for (let i = 0; i < 4; i++) {
        const ang = rotationAngle + (i * Math.PI) / 2;
        const px = Math.cos(ang) * pipDist;
        const py = Math.sin(ang) * pipDist;
        g.fillStyle(0xffffff, pulseAlpha * 0.85);
        g.fillCircle(px, py, 1.8);
      }
    }
  }

  /**
   * Draws an impact shockwave burst during token capture.
   */
  static drawImpactShockwave(
    g: Phaser.GameObjects.Graphics,
    color: PlayerColor,
    progress: number, // 0 -> 1
  ): void {
    g.clear();
    if (progress <= 0 || progress >= 1) return;

    const p = LUDO_TOKEN_PALETTES[color];
    const maxR = LUDO_TOKEN_VISUAL_CONFIG.shockwaveRingRadius;
    const currentR = maxR * progress;
    const alpha = (1 - progress) * 0.95;

    // Expanding shockwave ring
    g.lineStyle(3.2 * (1 - progress * 0.5), p.glow, alpha);
    g.strokeCircle(0, 0, currentR);

    // Inner bright white shockwave
    g.lineStyle(1.8 * (1 - progress), 0xffffff, alpha);
    g.strokeCircle(0, 0, currentR * 0.85);

    // Radial particle burst spikes
    const particleDist = currentR * 1.18;
    for (let i = 0; i < 6; i++) {
      const angle = ((Math.PI * 2) / 6) * i + (Math.PI / 4) * progress;
      const px = Math.cos(angle) * particleDist;
      const py = Math.sin(angle) * particleDist;
      g.fillStyle(0xffffff, alpha);
      g.fillCircle(px, py, 2.2 * (1 - progress));
    }
  }
}
