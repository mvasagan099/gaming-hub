export const SNOOKER_VISUAL_CONFIG = {
  // English Baize cloth styling
  cloth: {
    name: "Tournament English Baize",
    bedStart: "#0e5a32",
    bedEnd: "#073a1e",
    bedHighlight: "#15803d",
    cushionBase: "#094825",
    cushionHighlight: "#166534",
    markingLine: "rgba(255, 255, 255, 0.4)",
    spotColor: "rgba(255, 255, 255, 0.6)",
  },

  // Wood finishes for 12ft table rail & corners
  woodRail: {
    primaryWood: "#3b1e08",
    secondaryWood: "#241203",
    highlightWood: "#572d0d",
    brassPlate: "#d97706",
    brassHighlight: "#fde68a",
    brassShadow: "#78350f",
  },

  // Snooker ball color definitions
  balls: {
    cue: "#ffffff",
    red: "#dc2626",
    yellow: "#eab308",
    green: "#16a34a",
    brown: "#854d0e",
    blue: "#2563eb",
    pink: "#ec4899",
    black: "#09090b",
  },

  // Snooker cue stick visuals
  cueStick: {
    woodBase: "#fef3c7",
    woodGrain: "#d4a373",
    ebonyButt: "#18181b",
    ferruleColor: "#f59e0b",
    tipColor: "#38bdf8",
    shadowColor: "rgba(0, 0, 0, 0.45)",
  },

  // Aim trajectory guide visuals
  aimGuide: {
    primaryColor: "rgba(56, 189, 248, 0.85)", // Cyan laser
    ghostBallColor: "rgba(255, 255, 255, 0.35)",
    ghostBallBorder: "#38bdf8",
    targetBallLine: "rgba(234, 179, 8, 0.85)", // Yellow target deflection
    cushionBounceLine: "rgba(244, 63, 94, 0.7)", // Rose path
  },
} as const;

export type SnookerVisualConfig = typeof SNOOKER_VISUAL_CONFIG;
