/** Centralized animation timing and visual config for Ludo. */
export const ANIM = {
  // Token movement
  tokenStepDuration: 110,
  tokenStepEase: "Cubic.Out",
  bounceHeight: -14,
  bounceDuration: 60,
  landingBounceDuration: 100,
  landingBounceScale: 1.12,
  landingSquashY: 0.92,

  // Capture
  captureShakeDistance: 8,
  captureShakeDuration: 80,
  captureFlashAlpha: 0.6,
  captureFlashDuration: 180,

  // Home entry
  homeEntryDuration: 500,
  homeEntryScale: 1.3,
  homeEntryBounce: "Back.Out",

  // Token appearance
  activeTokenScale: 1.15,
  normalTokenScale: 1.0,
  tokenGlowAlphaActive: 0.5,
  tokenGlowAlphaNormal: 0.2,
  tokenGlowRadiusExtra: 6,

  // Turn
  turnTransition: 300,

  // Dice
  diceRollFrames: 14,
  diceFrameDelay: 60,
  diceLandingDuration: 150,
  diceLandingScale: 1.18,
  diceRotationAmount: 0.15,

  // Board entry
  boardEntryDuration: 450,

  // Floating feedback
  feedbackFloatDuration: 1100,
  feedbackFloatDistance: 35,

  // Match countdown
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
  selectedScale: 1.12,
  yardScale: 0.95,
  homeScale: 0.85,
  finishedScale: 0.72,

  // 3D Lighting & Shadows
  lightAngleDeg: 315, // Top-left key light
  shadowOffsetX: 3,
  shadowOffsetY: 4.5,
  shadowAlphaBase: 0.32,
  shadowAlphaLifted: 0.16,
  shadowScaleBase: 1.0,
  shadowScaleLifted: 0.78,
  shadowScaleLand: 1.18,

  // 3D Cylinder & Dome Heights
  rimHeight: 3.2,
  domeInsetRatio: 0.82,
  specularAlpha: 0.75,
  specularCatchAlpha: 0.95,

  // Hop & Movement Timing
  stepDuration: 120,
  hopLiftY: -12,
  landingBounceY: -5,
  landingSquashScaleX: 1.10,
  landingSquashScaleY: 0.92,
  motionTiltDeg: 2.0,

  // Capture Shockwave & Physics
  captureShakeDistance: 6,
  captureShakeDuration: 70,
  captureFlyDuration: 380,
  shockwaveRingRadius: 28,
  shockwaveDuration: 400,

  // Aura & Turn Glow
  auraPulseMinAlpha: 0.25,
  auraPulseMaxAlpha: 0.85,
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
