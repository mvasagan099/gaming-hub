/** Centralized animation timing and visual config for Snake & Ladder. */
export const ANIM = {
  // Token movement
  tokenStepDuration: 140,
  tokenStepEase: "Cubic.Out",
  bounceHeight: -18,
  bounceDuration: 65,
  landingBounceDuration: 120,
  landingBounceScale: 1.1,
  landingSquashY: 0.9,

  // Snake / Ladder transitions
  snakePause: 200,
  snakeDuration: 700,
  snakeShakeDistance: 6,
  ladderPause: 150,
  ladderDuration: 700,

  // Token appearance
  activeTokenScale: 1.12,
  normalTokenScale: 1.0,
  tokenGlowAlphaActive: 0.45,
  tokenGlowAlphaNormal: 0.2,

  // Turn
  turnTransition: 300,

  // Dice
  diceRollFrames: 16,
  diceFrameDelay: 58,
  diceLandingDuration: 140,
  diceLandingScale: 1.15,

  // Board entry
  boardEntryDuration: 400,

  // Floating feedback
  feedbackFloatDuration: 1200,
  feedbackFloatDistance: 40,

  // Match countdown
  countdownStepDuration: 500,

  // Win
  winTrophyPulseScale: 1.18,
  winTrophyPulseDuration: 280,

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
