/**
 * Centralized Visual Configuration for Premium 3D Carrom Experience.
 */

export const CARROM_VISUAL_CONFIG = {
  // Color Palette & Material Tones
  colors: {
    // Outer Frame (Light Warm Teak / Natural Wood Finish)
    frameBase: "#7c3f14",
    frameTop: "#9a561f",
    frameDark: "#5c2b09",
    frameHighlight: "rgba(255, 235, 190, 0.40)",
    frameInnerShadow: "rgba(70, 30, 10, 0.35)",

    // Corner Brass Accents
    brassBase: "#d97706",
    brassHighlight: "#fef08a",
    brassDark: "#78350f",
    brassRivet: "#451a03",

    // Playing Surface (Maple Wood Finish)
    surfaceCenter: "#fbf0d3",
    surfaceMid: "#f3e1b4",
    surfaceEdge: "#e4c688",
    surfaceGrain: "rgba(120, 65, 15, 0.038)",
    surfaceMarkingDark: "#1c0d02",
    surfaceMarkingRed: "#b91c1c",
    surfaceMarkingGold: "#d97706",

    // 3D Pockets
    pocketRim: "rgba(255, 255, 255, 0.4)",
    pocketNetLine: "rgba(180, 150, 100, 0.45)",
    pocketDepthDark: "#020100",
    pocketDepthMid: "#1a0a03",

    // White / Light Pieces (Light Natural Birch / Blond Wood Finish)
    ivoryTop: "#fffaf0",
    ivoryMid: "#f5e2c3",
    ivoryShade: "#debf93",
    ivoryRim: "#b5874f",

    ebonyTop: "#475569",
    ebonyMid: "#1e293b",
    ebonyShade: "#090d16",
    ebonyRim: "#020617",

    queenTop: "#ff3b3b",
    queenMid: "#e11d48",
    queenShade: "#9f1239",
    queenGold: "#fbbf24",

    strikerCyan: "#38bdf8",
    strikerCyanDark: "#0284c7",
    strikerChrome: "#e2e8f0",
  },

  /**
   * Calculate dynamically scaled pocket positions matching authoritative server 600x600 space.
   */
  getPockets: (w: number, h: number) => {
    const scale = w / 600;
    const margin = 45 * scale;
    return [
      { x: margin, y: margin },
      { x: w - margin, y: margin },
      { x: margin, y: h - margin },
      { x: w - margin, y: h - margin },
    ];
  },

  // Striker placement limits (in 500 space: ±98, in 400 space: ±78)
  getStrikerRange: (w: number) => {
    const scale = w / 600;
    return {
      min: -118 * scale,
      max: 118 * scale,
    };
  },

  // Animation Timers & Physics Tuning
  animation: {
    pocketSuctionMs: 160,
    shotMaxSpeed: 18,
    trailLength: 6,
    powderLifespan: 24,
    rippleSpeed: 1.2,
  },
} as const;

export type CarromVisualConfig = typeof CARROM_VISUAL_CONFIG;
