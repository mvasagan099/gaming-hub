/**
 * Centralized design tokens, 3D stadium geometry, lighting,
 * and animation configurations for Modernized 3D Cricket.
 */

export const CRICKET_VISUAL_CONFIG = {
  // Canvas & Arena Dimensions
  canvasWidth: 924,
  canvasHeight: 680,

  // 3D Perspective Court & Pitch
  horizonY: 215,
  pitchTopW: 120,
  pitchBotW: 440,
  pitchTopY: 260,
  pitchBotY: 600,

  // Lighting & Theme
  lighting: {
    ambientColor: '#0b132b',
    floodlightCore: '#ffffff',
    floodlightGlow: 'rgba(255, 255, 255, 0.25)',
    floodlightBeams: 'rgba(255, 255, 255, 0.08)',
    pitchSunlight: 'rgba(251, 191, 36, 0.12)',
    shadowColor: 'rgba(2, 6, 23, 0.65)',
  },

  // Grass Outfield
  outfield: {
    stripeDark: '#064e3b',
    stripeLight: '#047857',
    stripeHeight: 38,
    boundaryRopeColor: '#ffffff',
    innerCircleColor: 'rgba(255, 255, 255, 0.2)',
  },

  // Pitch Materials
  pitch: {
    soilBase: '#b45309',
    soilLight: '#d97706',
    soilWear: '#92400e',
    creaseColor: '#ffffff',
    creaseWidth: 3.5,
  },

  // Wickets & Stumps (3D Wooden Stumps)
  stumps: {
    woodBase: '#fef08a',
    woodShadow: '#ca8a04',
    woodVarnish: '#a16207',
    height: 48,
    stumpWidth: 5,
    bailLength: 14,
    bailHeight: 3.5,
  },

  // 3D Player Dimensions & Colors
  batsman: {
    helmetColor: '#1e3a8a',
    helmetGrill: '#94a3b8',
    jerseyTeam1: '#2563eb',
    jerseyTeam2: '#dc2626',
    jerseyTrim: '#fbbf24',
    skinTone: '#fca5a5',
    glovesColor: '#ffffff',
    padsColor: '#ffffff',
    padStraps: '#1e3a8a',
    shoesColor: '#f8fafc',
  },

  bowler: {
    jerseyTeam1: '#2563eb',
    jerseyTeam2: '#dc2626',
    skinTone: '#fca5a5',
    trousers: '#ffffff',
    shoesColor: '#f8fafc',
  },

  // 3D Cricket Bat
  bat: {
    handleGrip: '#334155',
    bladeWood: '#fef08a',
    bladeGrain: '#ca8a04',
    bladeSticker: '#dc2626',
    toeGuard: '#0f172a',
    width: 14,
    height: 82,
  },

  // 3D Cricket Ball
  ball: {
    leatherRed: '#dc2626',
    leatherLight: '#f87171',
    leatherDark: '#991b1b',
    seamWhite: '#ffffff',
    specularCatchlight: 'rgba(255, 255, 255, 0.85)',
    radius: 8.5,
  },

  // Camera Settings
  camera: {
    lerpSpeed: 8,
    shotFollowZoom: 1.15,
    wicketZoom: 1.25,
    boundaryPanSpeed: 6,
  },

  // Timings & Durations (seconds)
  timing: {
    shotSwingDuration: 0.28,
    wicketAnimationDuration: 1.8,
    boundaryCelebrateDuration: 2.2,
    overSummaryDuration: 1.5,
  },
  // Graphics Quality Presets
  quality: {
    LOW: {
      particles: false,
      shadows: false,
      stadiumLighting: false,
      animatedCrowd: false,
      cameraShake: false,
      trailBlur: false,
    },
    MEDIUM: {
      particles: true,
      shadows: true,
      stadiumLighting: true,
      animatedCrowd: false,
      cameraShake: true,
      trailBlur: false,
    },
    HIGH: {
      particles: true,
      shadows: true,
      stadiumLighting: true,
      animatedCrowd: true,
      cameraShake: true,
      trailBlur: true,
    },
  },
} as const;

export type GraphicsQuality = 'LOW' | 'MEDIUM' | 'HIGH';

export function getStoredGraphicsQuality(): GraphicsQuality {
  try {
    const q = localStorage.getItem('cricket_graphics_quality');
    if (q === 'LOW' || q === 'MEDIUM' || q === 'HIGH') return q;
  } catch {}
  return 'HIGH';
}

export function setStoredGraphicsQuality(q: GraphicsQuality): void {
  try {
    localStorage.setItem('cricket_graphics_quality', q);
  } catch {}
}

export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}
