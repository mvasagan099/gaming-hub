/** Centralized animation timing, 3D lighting, and visual design config for modern Chess. */

export const CHESS_DESIGN_CONFIG = {
  // 3D Lighting (Top-Left Key Light: ~315 deg)
  lightAngleDeg: 315,
  boardShadowOffset: { x: 10, y: 18 },
  boardFrameWidth: 28,
  boardCornerRadius: 16,
  squareSize: 80,
  boardPx: 640,
  canvasWidth: 696,
  canvasHeight: 696,
  boardOffsetX: 28,
  boardOffsetY: 28,

  // Theme Palettes
  themes: {
    classic: {
      name: "Classic Walnut & Ivory",
      // Warm golden-tan (like the reference image)
      lightSquare: 0xc8a458,
      // Rich deep walnut (like the reference image)
      darkSquare:  0x6b3a18,
      // Very dark mahogany outer frame
      frameBg:     0x1a0c06,
      frameBevel:  0x2e1a0a,
      // Subtle gold inner inlay
      goldInlay:   0xb8860b,
      // Golden highlight for selection
      highlight:   0xf5c842,
      // Last move warm amber
      lastMoveSrc: 0xa0700a,
      lastMoveDst: 0xf0a500,
      // Crimson check alert
      checkGlow:   0xef4444,
      validDot:    0x1a1206,
      validStroke: 0xffe082,
      textColor:   "#c8a458",
    },
    wood: {
      name: "Royal Rosewood",
      lightSquare: 0xeadcc2,
      darkSquare:  0x7c3f1d,
      frameBg:     0x1c0f08,
      frameBevel:  0x351b0e,
      goldInlay:   0xf59e0b,
      highlight:   0xf59e0b,
      lastMoveSrc: 0x9a3412,
      lastMoveDst: 0xfbbf24,
      checkGlow:   0xd97706,
      validDot:    0x15803d,
      validStroke: 0x86efac,
      textColor:   "#f59e0b",
    },
    cyber: {
      name: "Obsidian Cyber",
      lightSquare: 0x1e293b,
      darkSquare:  0x0f172a,
      frameBg:     0x070b14,
      frameBevel:  0x1e293b,
      goldInlay:   0x38bdf8,
      highlight:   0x38bdf8,
      lastMoveSrc: 0x0284c7,
      lastMoveDst: 0x38bdf8,
      checkGlow:   0xf43f5e,
      validDot:    0x38bdf8,
      validStroke: 0xffffff,
      textColor:   "#38bdf8",
    },
  },

  // 3D Piece Palettes
  pieces: {
    white: {
      body:      0xf0e4c8,
      bodyShade: 0xd4c4a0,
      bodyDark:  0xb0956c,
      rimDark:   0x8a6d45,
      specular:  0xffffff,
      bounce:    0xfff0c0,
      accent:    0xe2d0a8,
      glow:      0xfef08a,
    },
    black: {
      body:      0x1e2228,
      bodyShade: 0x111419,
      bodyDark:  0x080a0c,
      rimDark:   0x040506,
      specular:  0x8fa3bc,
      bounce:    0x304050,
      accent:    0x282e36,
      glow:      0x38bdf8,
    },
  },
} as const;

export const CHESS_ANIMATION_CONFIG = {
  // Move physics
  moveDurationMin: 180,
  moveDurationMax: 260,
  moveLiftY: -5,
  moveScale: 1.03,
  landingBounceY: -2,
  landingBounceDuration: 85,
  landingSquashX: 1.05,
  landingSquashY: 0.96,

  // Selection
  selectedScale: 1.04,
  selectedLiftY: -4,

  // Capture
  captureShockwaveRadius: 38,
  captureDuration: 260,
  captureScaleOut: 0.3,

  // Check & Alerts
  checkPulseDuration: 550,
  turnTransitionDuration: 300,

  // Reduced motion
  reducedMotionScale: 0.3,
} as const;

export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function animDuration(ms: number): number {
  return prefersReducedMotion() ? Math.round(ms * CHESS_ANIMATION_CONFIG.reducedMotionScale) : ms;
}
