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
