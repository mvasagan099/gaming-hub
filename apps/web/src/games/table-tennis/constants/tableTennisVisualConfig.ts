/**
 * Centralized design tokens, 3D projection parameters, camera states,
 * and visual configurations for Modernized 3D Competition Table Tennis.
 */

export type CameraState = 'MATCH_START' | 'SERVE' | 'RALLY' | 'BALL_FOLLOW' | 'POINT_END' | 'MATCH_END';

export const TABLE_TENNIS_VISUAL_CONFIG = {
  // Logical game space (authoritative coordinates from server engine)
  // X ∈ [0, 600] is length / depth (0 = Near Baseline, 600 = Far Baseline, 300 = Net)
  // Y ∈ [0, 400] is width / cross-court (0 = Left Edge, 400 = Right Edge, 200 = Center Divide)
  logicalWidth: 600,
  logicalHeight: 400,
  paddleHeight: 80,
  paddleWidth: 12,
  ballRadius: 6,

  // 3D Canvas Viewport
  canvasWidth: 800,
  canvasHeight: 520,

  // Camera Settings & State Offsets
  camera: {
    baseFov: 1.0,
    baseOffsetY: 0,
    baseOffsetX: 0,
    states: {
      MATCH_START: { zoom: 0.92, offsetY: 15, offsetX: 0 },
      SERVE:       { zoom: 1.05, offsetY: -10, offsetX: 0 },
      RALLY:       { zoom: 1.00, offsetY: 0, offsetX: 0 },
      BALL_FOLLOW: { zoom: 1.02, offsetY: 0, offsetX: 0 },
      POINT_END:   { zoom: 0.94, offsetY: 12, offsetX: 0 },
      MATCH_END:   { zoom: 0.88, offsetY: 25, offsetX: 0 },
    },
    interpolationSpeed: 3.5, // Lerp speed per second
    maxTrackingOffset: 25,    // Max camera pan following fast ball shots
  },

  // 3D Table Perspective Coordinates & Dimensions (Broadcast Camera)
  table: {
    // 3D Table Surface Corners (Trapezoidal perspective looking down the table)
    corners: {
      topLeft:     { x: 270, y: 185 }, // Far Left
      topRight:    { x: 530, y: 185 }, // Far Right
      bottomRight: { x: 675, y: 440 }, // Near Right
      bottomLeft:  { x: 125, y: 440 }, // Near Left
    },
    // Table Apron Thickness
    thickness: 20,
    // Material Palettes (ITTF Competition Matte Finish)
    surfaceTopColor: '#0ea5e9',    // Keylit cyan-blue highlight
    surfaceMidColor: '#0284c7',    // ITTF Competition Matte Blue
    surfaceBaseColor: '#0369a1',   // Deep court blue
    surfaceGrain: 'rgba(255, 255, 255, 0.025)',
    apronColor: '#0c4a6e',         // Dark blue wooden apron
    apronSideColor: '#082f49',     // Shadowed side apron
    trimColor: '#38bdf8',          // Metallic cyan-blue bottom trim
    lineColor: '#ffffff',          // Crisp painted white competition lines
    lineWidth: 2.5,
    legColor: '#334155',           // Steel tubular legs
    floorShadowColor: 'rgba(0, 0, 0, 0.55)',
  },

  // 3D Horizontal Woven Net
  net: {
    height: 34,
    overhang: 18, // Overhang past left/right table edge
    postRadius: 5,
    postColor: '#1e293b',
    postTopColor: '#94a3b8',
    meshColor: 'rgba(248, 250, 252, 0.65)',
    meshLineColor: 'rgba(255, 255, 255, 0.35)',
    topTapeColor: '#ffffff',
    bottomTapeColor: 'rgba(255, 255, 255, 0.4)',
  },

  // 3D Paddles & Player Hands
  paddles: {
    // Near Player 1 (Foreground, Red Rubber)
    p1RubberTop: '#ff4d4d',
    p1RubberMid: '#ef4444',
    p1RubberDark: '#991b1b',
    p1Rim: '#7f1d1d',
    // Far Player 2 (Background, Blue/Slate Rubber)
    p2RubberTop: '#60a5fa',
    p2RubberMid: '#3b82f6',
    p2RubberDark: '#1e40af',
    p2Rim: '#172554',
    // Plywood Blade Edge & Flared Handle
    woodBlade: '#d97706',
    woodBladeEdge: '#b45309',
    woodHandleTop: '#b45309',
    woodHandleBase: '#78350f',
    woodHandleDark: '#451a03',
    gripTape: '#1e293b',
    // Player Hand / Arm Skin Tones
    skinHighlight: '#fed7aa',
    skinMid: '#fba86b',
    skinShadow: '#c2410c',
    skinWristband: '#0284c7',
  },

  // 3D Competition Ball
  ball: {
    baseColor: '#ffffff',
    midColor: '#f8fafc',
    shadowColor: '#94a3b8',
    tableShadowColor: 'rgba(0, 0, 0, 0.45)',
    highlightColor: '#ffffff',
    maxApexHeight: 68, // Max parabolic bounce height in pixels
  },

  // Arena & Lighting
  arena: {
    floorTop: '#4a250f',
    floorMid: '#6e3615',
    floorBot: '#542910',
    floorLine: 'rgba(0, 0, 0, 0.20)',
    wallTop: '#090d16',
    wallMid: '#0f172a',
    wallBot: '#1e293b',
    spotlight: 'rgba(56, 189, 248, 0.10)',
  },

  // Visual Effects
  hitDuration: 0.18,
  particlesMax: 30,
} as const;

export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}
