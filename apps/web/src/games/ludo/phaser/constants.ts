/** Centralized animation timing, 3D lighting, and visual design config for modern Ludo. */

export const LUDO_DESIGN_CONFIG = {
  // Lighting & Shadows (Consistent 3D Top-Left Key Light: ~315 deg)
  lightAngleDeg: 315,
  boardShadowOffset: { x: 8, y: 14 },
  boardShadowBlur: 24,
  boardCornerRadius: 24,
  boardBevelSize: 6,

  // Theme Colors
  theme: {
    bgDark: 0x070b14,
    boardBase: 0x0f172a,
    boardSurface: 0xf8fafc,
    boardTrimGold: 0xf59e0b,
    boardBorderDark: 0x1e293b,
    cardBg: 0x0f172a,
    cardBorder: 0x1e293b,
    goldGlow: 0xf59e0b,
    textWhite: "#ffffff",
    textMuted: "#94a3b8",
  },

  // Color Palette Accents
  colors: {
    red: {
      main: 0xe11d48,
      dark: 0x9f1239,
      light: 0xf43f5e,
      glow: 0xf43f5e,
      base: 0xffe4e6,
      socket: 0x4c0519,
    },
    blue: {
      main: 0x2563eb,
      dark: 0x1d4ed8,
      light: 0x3b82f6,
      glow: 0x3b82f6,
      base: 0xdbeafe,
      socket: 0x0f172a,
    },
    green: {
      main: 0x16a34a,
      dark: 0x15803d,
      light: 0x22c55e,
      glow: 0x22c55e,
      base: 0xdcfce7,
      socket: 0x052e16,
    },
    yellow: {
      main: 0xd97706,
      dark: 0xb45309,
      light: 0xfbbf24,
      glow: 0xfacc15,
      base: 0xfef9c3,
      socket: 0x451a03,
    },
  },
} as const;

export const ANIM = {
  // Token movement & 3D physics
  tokenStepDuration: 120,
  tokenStepEase: "Cubic.Out",
  bounceHeight: -16,
  bounceDuration: 60,
  landingBounceDuration: 110,
  landingBounceScale: 1.10,
  landingSquashY: 0.90,

  // Capture
  captureShakeDistance: 6,
  captureShakeDuration: 70,
  captureFlyDuration: 380,
  captureFlashAlpha: 0.6,
  captureFlashDuration: 180,

  // Home entry
  homeEntryDuration: 500,
  homeEntryScale: 1.3,
  homeEntryBounce: "Back.Out",

  // Token appearance & aura
  activeTokenScale: 1.10,
  selectedTokenScale: 1.15,
  normalTokenScale: 1.0,
  tokenGlowAlphaActive: 0.85,
  tokenGlowAlphaNormal: 0.25,
  tokenGlowRadiusExtra: 6,

  // Turn transition
  turnTransition: 300,

  // 3D Dice
  diceRollFrames: 14,
  diceFrameDelay: 55,
  diceLandingDuration: 160,
  diceLandingScale: 1.18,
  diceRotationAmount: 0.2,

  // Board entry
  boardEntryDuration: 450,

  // Floating feedback
  feedbackFloatDuration: 1100,
  feedbackFloatDistance: 35,

  // Match countdown & intro
  countdownStepDuration: 500,

  // Win
  winTrophyPulseScale: 1.2,
  winTrophyPulseDuration: 300,

  // Reduced-motion multiplier (0 = skip entirely, 1 = full)
  reducedMotionScale: 0.3,
} as const;

/** Centralized 3D physical token styling, lighting, and animation constants. */
export const LUDO_TOKEN_VISUAL_CONFIG = {
  // Physical Dimensions & Scales
  baseScale: 1.0,
  activeScale: 1.08,
  selectedScale: 1.14,
  yardScale: 0.95,
  homeScale: 0.85,
  finishedScale: 0.72,

  // 3D Lighting & Shadows
  lightAngleDeg: 315, // Top-left key light
  shadowOffsetX: 3,
  shadowOffsetY: 4.5,
  shadowAlphaBase: 0.35,
  shadowAlphaLifted: 0.15,
  shadowScaleBase: 1.0,
  shadowScaleLifted: 0.75,
  shadowScaleLand: 1.18,

  // 3D Cylinder & Dome Heights
  rimHeight: 3.5,
  domeInsetRatio: 0.82,
  specularAlpha: 0.75,
  specularCatchAlpha: 0.95,

  // Hop & Movement Timing
  stepDuration: 120,
  hopLiftY: -14,
  landingBounceY: -5,
  landingSquashScaleX: 1.12,
  landingSquashScaleY: 0.90,
  motionTiltDeg: 2.5,

  // Capture Shockwave & Physics
  captureShakeDistance: 6,
  captureShakeDuration: 70,
  captureFlyDuration: 380,
  shockwaveRingRadius: 30,
  shockwaveDuration: 420,

  // Aura & Turn Glow
  auraPulseMinAlpha: 0.3,
  auraPulseMaxAlpha: 0.9,
  auraPulseDuration: 550,
} as const;

/** Check if the user prefers reduced motion. */
export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** Returns duration scaled by reduced-motion preference. */
export function animDuration(ms: number): number {
  return prefersReducedMotion() ? Math.round(ms * ANIM.reducedMotionScale) : ms;
}
