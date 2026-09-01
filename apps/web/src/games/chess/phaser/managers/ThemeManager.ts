import type { BoardTheme } from "../types/chess.types";
import { CHESS_DESIGN_CONFIG } from "../constants/chessAnimationConfig";

export interface ThemeColors {
  lightSquare: number;
  darkSquare:  number;
  highlight:   number;
  lastMoveSrc: number;
  lastMoveDst: number;
  checkGlow:   number;
  validDot:    number;
  validStroke: number;
  textColor:   string;
}

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
    const t = CHESS_DESIGN_CONFIG.themes[this.currentTheme] || CHESS_DESIGN_CONFIG.themes.classic;
    return {
      lightSquare: t.lightSquare,
      darkSquare:  t.darkSquare,
      highlight:   t.highlight,
      lastMoveSrc: t.lastMoveSrc,
      lastMoveDst: t.lastMoveDst,
      checkGlow:   t.checkGlow,
      validDot:    t.validDot,
      validStroke: t.validStroke,
      textColor:   t.textColor,
    };
  }
}

export default ThemeManager;
