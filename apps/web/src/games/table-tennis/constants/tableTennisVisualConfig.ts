/**
 * Centralized design tokens, 3D projection parameters,
 * and visual configurations for Modernized 3D Table Tennis.
 */

export const TABLE_TENNIS_VISUAL_CONFIG = {
  // Logical game space (authoritative coordinates)
  logicalWidth: 600,
  logicalHeight: 400,
  paddleHeight: 80,
  paddleWidth: 12,
  ballRadius: 6,

  // 3D Canvas Viewport
  canvasWidth: 800,
  canvasHeight: 520,

  // Table 3D Perspective Coordinates
  table: {
    // 3D Table Surface Corners (trapezoidal perspective)
    corners: {
      topLeft:     { x: 140, y: 110 },
      topRight:    { x: 660, y: 110 },
      bottomRight: { x: 740, y: 440 },
      bottomLeft:  { x: 60,  y: 440 },
    },
    // Table Top Thickness (Apron)
    thickness: 18,
    // Colors
    surfaceColor: '#1d4ed8',     // Deep tournament blue
    surfaceTopColor: '#2563eb',  // Keylit surface
    apronColor: '#0f2b66',       // Dark blue wooden apron
    apronSideColor: '#0a1d44',   // Dark shadowed apron
    lineColor: '#f8fafc',        // Crisp white tournament lines
    lineWidth: 3,
    legColor: '#334155',         // Steel frame tubular legs
    floorShadowColor: 'rgba(0, 0, 0, 0.45)',
  },

  // 3D Net
  net: {
    height: 38,
    postRadius: 5,
    postColor: '#475569',
    meshColor: 'rgba(241, 245, 249, 0.75)',
    topTapeColor: '#ffffff',
  },

  // 3D Paddles
  paddles: {
    p1Rubber: '#ef4444',    // Player 1 (Red rubber)
    p1Rim: '#991b1b',
    p2Rubber: '#1e293b',    // Player 2 (Black/Dark Slate rubber)
    p2Rim: '#0f172a',
    woodBlade: '#d97706',   // Ply wood blade
    woodHandle: '#b45309',  // Wooden flared handle
    gripTape: '#1e293b',
  },

  // 3D Ball
  ball: {
    baseColor: '#ffffff',
    shadowColor: 'rgba(0, 0, 0, 0.35)',
    highlightColor: '#ffffff',
    ambientColor: '#cbd5e1',
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
