/**
 * Centralized design tokens, physics parameters, colors, and animation timings
 * for the modernized 3D Fruit Ninja arcade experience.
 */

export const FRUIT_NINJA_VISUAL_CONFIG = {
  // Stage resolution
  stageWidth: 800,
  stageHeight: 500,

  // Physics constants
  gravity: 350,
  baseFlightTime: 1.6,
  minAngularVelocity: -180,
  maxAngularVelocity: 180,
  splitImpulseX: 140,
  splitImpulseY: 60,
  splitAngularSpeed: 260,

  // Blade trail styling
  trail: {
    maxPoints: 12,
    lifetimeMs: 180,
    baseWidth: 10,
    coreWidth: 4,
    defaultColor: 0x38bdf8, // Neon sky blue
    comboColor: 0xf43f5e,   // Fiery crimson/rose
    criticalColor: 0xfacc15,// Golden glow
  },

  // Juice & particle physics
  particles: {
    juiceCount: 22,
    juiceSpeedMin: 120,
    juiceSpeedMax: 320,
    juiceLifespan: 500,
    mistLifespan: 350,
    sparkCount: 16,
    bombSparks: 48,
  },

  // Visual juice colors & accents
  fruitColors: {
    watermelon: {
      juice: 0xef4444, // Ruby red
      mist:  0xf87171,
      rind:  0x15803d, // Emerald green
    },
    apple: {
      juice: 0xdc2626, // Crimson
      mist:  0xfca5a5,
      flesh: 0xfef08a,
    },
    orange: {
      juice: 0xf97316, // Vibrant citrus orange
      mist:  0xfdba74,
      pulp:  0xea580c,
    },
    banana: {
      juice: 0xfacc15, // Golden yellow
      mist:  0xfef08a,
      flesh: 0xfef9c3,
    },
    coconut: {
      juice: 0xffffff, // Coconut milk white
      mist:  0xe2e8f0,
      shell: 0x451a03,
    },
    kiwi: {
      juice: 0x84cc16, // Lime green
      mist:  0xbef264,
      skin:  0x78350f,
    },
    bomb: {
      sparks: [0xff3333, 0xffaa00, 0xffff00],
      flash:  0xffffff,
    },
  },

  // Combo system
  combos: {
    windowMs: 300,
    tiers: [
      { count: 3, label: "3x COMBO!", bonus: 30, color: "#38bdf8", scale: 1.1 },
      { count: 4, label: "MEGA COMBO 4x!", bonus: 40, color: "#a855f7", scale: 1.25 },
      { count: 5, label: "UNSTOPPABLE 5x!", bonus: 50, color: "#f59e0b", scale: 1.4 },
      { count: 6, label: "FRUIT BLITZ 6x+!", bonus: 70, color: "#ef4444", scale: 1.55 },
    ],
  },

  // Spawning & Difficulty progression
  spawning: {
    maxActiveFruits: 5,
    baseSpawnDelayMs: 1600,   // Base wave interval (1.6s)
    minSpawnDelayMs: 950,     // Minimum wave interval (0.95s)
    burstDelayMs: 220,        // Stagger between fruits in same wave
    minSpawnSpacingX: 110,    // Minimum horizontal space between simultaneous launches
  },

  // Reduced motion scaling
  reducedMotionScale: 0.35,
} as const;

export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function animDuration(ms: number): number {
  return prefersReducedMotion() ? Math.round(ms * FRUIT_NINJA_VISUAL_CONFIG.reducedMotionScale) : ms;
}
