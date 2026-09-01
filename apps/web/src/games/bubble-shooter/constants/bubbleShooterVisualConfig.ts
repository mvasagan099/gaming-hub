/**
 * Centralized design tokens, physics parameters, 3D color palettes,
 * and animation timings for Modernized 3D Bubble Shooter.
 */

export const BUBBLE_SHOOTER_VISUAL_CONFIG = {
  // Stage resolution & grid dimensions
  radius: 16,
  diameter: 32,
  rows: 14,
  cols: 12,
  canvasWidth: 384, // 12 * 32
  canvasHeight: 580,
  speed: 1200, // Launch velocity (px/sec)

  // 3D Glass / Gel Bubble Palettes (Specular, Core, Rim, Shadow)
  bubbleThemes: {
    '#fb7185': { // Rose / Ruby
      name: 'Ruby',
      base: '#f43f5e',
      highlight: '#ffe4e6',
      center: '#fb7185',
      rim: '#9f1239',
      glow: 'rgba(244, 63, 94, 0.4)',
      particles: ['#fda4af', '#f43f5e', '#ffffff'],
    },
    '#818cf8': { // Azure / Sapphire
      name: 'Sapphire',
      base: '#3b82f6',
      highlight: '#eff6ff',
      center: '#60a5fa',
      rim: '#1e40af',
      glow: 'rgba(59, 130, 246, 0.4)',
      particles: ['#93c5fd', '#3b82f6', '#ffffff'],
    },
    '#34d399': { // Emerald / Jade
      name: 'Emerald',
      base: '#10b981',
      highlight: '#ecfdf5',
      center: '#34d399',
      rim: '#065f46',
      glow: 'rgba(16, 185, 129, 0.4)',
      particles: ['#6ee7b7', '#10b981', '#ffffff'],
    },
    '#fbbf24': { // Amber / Topaz
      name: 'Topaz',
      base: '#f59e0b',
      highlight: '#fefce8',
      center: '#fbbf24',
      rim: '#92400e',
      glow: 'rgba(245, 158, 11, 0.4)',
      particles: ['#fde68a', '#f59e0b', '#ffffff'],
    },
    '#c084fc': { // Amethyst / Violet
      name: 'Amethyst',
      base: '#a855f7',
      highlight: '#faf5ff',
      center: '#c084fc',
      rim: '#6b21a8',
      glow: 'rgba(168, 85, 247, 0.4)',
      particles: ['#d8b4fe', '#a855f7', '#ffffff'],
    },
  } as Record<string, {
    name: string;
    base: string;
    highlight: string;
    center: string;
    rim: string;
    glow: string;
    particles: string[];
  }>,

  // Special materials
  specialThemes: {
    bomb: {
      base: '#0f172a',
      rim: '#020617',
      glow: '#ef4444',
      spark: '#facc15',
    },
    rainbow: {
      stops: ['#f43f5e', '#fbbf24', '#10b981', '#38bdf8', '#a855f7'],
      glow: 'rgba(255, 255, 255, 0.6)',
    },
  },

  // Aiming Guide
  aimGuide: {
    dotCount: 28,
    dotRadiusMin: 2.2,
    dotRadiusMax: 4.5,
    bounceLimit: 3,
    color: 'rgba(255, 255, 255, 0.75)',
    phantomAlpha: 0.45,
  },

  // Animation Timings
  timing: {
    popDuration: 0.28,
    dropGravity: 2200,
    dropRotationSpeed: 360,
    settleDuration: 0.16,
    comboDisplayDuration: 1.4,
    scoreRollDuration: 0.4,
  },

  // Reduced motion
  reducedMotionScale: 0.35,
} as const;

export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}
