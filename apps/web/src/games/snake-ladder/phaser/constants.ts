/** Centralized animation timing and visual config for 3D-Style Snake & Ladder. */
export const ANIM = {
  // 3D Token Movement
  tokenStepDuration: 150,
  tokenStepEase: "Sine.InOut",
  tokenLiftHeight: -22,
  tokenLiftDuration: 75,
  landingBounceDuration: 140,
  landingBounceScale: 1.15,
  landingSquashY: 0.88,
  tokenShadowMinScale: 0.65,
  tokenShadowMaxAlpha: 0.45,

  // Snake / Ladder transitions
  snakePause: 220,
  snakeDuration: 750,
  snakeShakeDistance: 6,
  ladderPause: 180,
  ladderDuration: 750,

  // Token appearance
  activeTokenScale: 1.14,
  normalTokenScale: 1.0,
  tokenGlowAlphaActive: 0.6,
  tokenGlowAlphaNormal: 0.15,

  // Turn
  turnTransition: 280,

  // 3D Dice
  diceRollFrames: 18,
  diceFrameDelay: 50,
  diceLandingDuration: 160,
  diceLandingScale: 1.2,
  diceLiftHeight: -15,

  // Board entry
  boardEntryDuration: 450,

  // Floating feedback
  feedbackFloatDuration: 1200,
  feedbackFloatDistance: 40,

  // Match countdown
  countdownStepDuration: 500,

  // Win
  winTrophyPulseScale: 1.2,
  winTrophyPulseDuration: 300,

  // Reduced-motion multiplier (0 = skip entirely, 1 = full)
  reducedMotionScale: 0.3,
} as const;

/** Realistic 3D Snake Visual & Animation Configuration */
export const SNAKE_VISUAL_CONFIG = {
  bodyMaxThickness: 16,
  bodyMinThickness: 3.5,
  neckThickness: 11,
  headLength: 26,
  headWidth: 20,
  shadowOffsetX: 5,
  shadowOffsetY: 7,
  shadowAlpha: 0.35,
  tongueMinInterval: 3000,
  tongueMaxInterval: 6000,
  tongueFlickDuration: 320,
  reactionDuration: 260,
  reactionLiftY: -5,
  reactionScale: 1.12,
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


