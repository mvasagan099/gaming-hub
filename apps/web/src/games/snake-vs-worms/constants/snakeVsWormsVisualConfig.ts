/**
 * Centralized design tokens, 3D creature skins, lighting,
 * and animation configurations for Modernized 3D Snake vs Worms.
 */

export interface CreatureSkin {
  name: string;
  base: string;
  center: string;
  highlight: string;
  rim: string;
  glow: string;
  spotColor: string;
}

export const SNAKE_WORMS_VISUAL_CONFIG = {
  // Map dimensions
  mapWidth: 2000,
  mapHeight: 2000,

  // Camera settings
  canvasWidth: 900,
  canvasHeight: 600,
  cameraLerpSpeed: 7.5,
  boostZoomFactor: 0.92,

  // Creature 3D dimensions
  segmentRadius: 13,
  headRadius: 16,
  segmentSpacing: 10,
  contactShadowOffset: 8,

  // 3D Creature Skins
  skins: {
    player: {
      name: 'Emerald Dragon',
      base: '#10b981',
      center: '#34d399',
      highlight: '#d1fae5',
      rim: '#064e3b',
      glow: 'rgba(16, 185, 129, 0.4)',
      spotColor: 'rgba(255, 255, 255, 0.45)',
    },
    p2: {
      name: 'Sapphire Worm',
      base: '#3b82f6',
      center: '#60a5fa',
      highlight: '#eff6ff',
      rim: '#1e40af',
      glow: 'rgba(59, 130, 246, 0.4)',
      spotColor: 'rgba(255, 255, 255, 0.45)',
    },
    ruby: {
      name: 'Ruby Viper',
      base: '#ef4444',
      center: '#f87171',
      highlight: '#fee2e2',
      rim: '#991b1b',
      glow: 'rgba(239, 68, 68, 0.4)',
      spotColor: 'rgba(255, 255, 255, 0.45)',
    },
    amethyst: {
      name: 'Amethyst Serpent',
      base: '#a855f7',
      center: '#c084fc',
      highlight: '#faf5ff',
      rim: '#6b21a8',
      glow: 'rgba(168, 85, 247, 0.4)',
      spotColor: 'rgba(255, 255, 255, 0.45)',
    },
    gold: {
      name: 'Golden Python',
      base: '#f59e0b',
      center: '#fbbf24',
      highlight: '#fef3c7',
      rim: '#92400e',
      glow: 'rgba(245, 158, 11, 0.4)',
      spotColor: 'rgba(255, 255, 255, 0.45)',
    },
    cyan: {
      name: 'Plasma Worm',
      base: '#06b6d4',
      center: '#22d3ee',
      highlight: '#ecfeff',
      rim: '#0e7490',
      glow: 'rgba(6, 182, 212, 0.4)',
      spotColor: 'rgba(255, 255, 255, 0.45)',
    },
  } as Record<string, CreatureSkin>,

  // 3D Food Types
  food: {
    normal: {
      base: '#10b981',
      highlight: '#d1fae5',
      rim: '#064e3b',
      glow: '#34d399',
      radius: 6.5,
    },
    golden: {
      base: '#f59e0b',
      highlight: '#fefce8',
      rim: '#92400e',
      glow: '#fbbf24',
      radius: 9.5,
    },
    boost: {
      base: '#06b6d4',
      highlight: '#ecfeff',
      rim: '#0e7490',
      glow: '#22d3ee',
      radius: 7.5,
    },
  },

  // Timings & FX
  timing: {
    particleLifetime: 0.6,
    shakeDecay: 20,
    tongueFlickFrequency: 12,
  },
} as const;

export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}
