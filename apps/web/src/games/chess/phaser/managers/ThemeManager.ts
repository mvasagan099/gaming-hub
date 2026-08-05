import type { BoardTheme } from "../types/chess.types";

export interface ThemeColors {
  lightSquare: number;
  darkSquare:  number;
  highlight:   number;
  checkGlow:   number;
  validDot:    number;
  validStroke: number;
  textColor:   string;
}

const THEMES: Record<BoardTheme, ThemeColors> = {
  classic: {
    lightSquare: 0xeeeed2,
    darkSquare:  0x769656,
    highlight:   0xf6f669, // Yellow highlight
    checkGlow:   0xef4444, // Red
    validDot:    0x000000, // Black dot for valid moves looks clean
    validStroke: 0x000000,
    textColor:   "#ffffff",
  },
  wood: {
    lightSquare: 0xe8c39e,
    darkSquare:  0x8b5a2b,
    highlight:   0xf59e0b, // Amber gold
    checkGlow:   0xd97706,
    validDot:    0x84cc16, // Lime green
    validStroke: 0x4d7c0f,
    textColor:   "#451a03",
  },
  cyber: {
    lightSquare: 0x1e293b, // slate-800
    darkSquare:  0x0f172a, // slate-900
    highlight:   0x38bdf8, // Sky blue glow
    checkGlow:   0xec4899, // Pink warning
    validDot:    0xa855f7, // Purple
    validStroke: 0x6b21a8,
    textColor:   "#38bdf8",
  },
};

export class ThemeManager {
  private currentTheme: BoardTheme = "classic";

  constructor(initialTheme: BoardTheme = "classic") {
    this.currentTheme = initialTheme;
  }

  setTheme(theme: BoardTheme): void {
    this.currentTheme = theme;
  }

  getTheme(): BoardTheme {
    return this.currentTheme;
  }

  getColors(): ThemeColors {
    return THEMES[this.currentTheme] || THEMES.classic;
  }
}

export default ThemeManager;
