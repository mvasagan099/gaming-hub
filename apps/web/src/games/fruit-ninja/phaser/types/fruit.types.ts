export type FruitType =
  | "apple"
  | "orange"
  | "watermelon"
  | "banana"
  | "coconut"
  | "kiwi"
  | "bomb";

export type FruitNinjaMode = "classic" | "zen" | "arcade";

export interface FruitDef {
  type: FruitType;
  color: number; // Juice splash color
  radius: number;
  points: number;
}

export interface FruitNinjaSettings {
  mode: FruitNinjaMode;
  difficulty: "easy" | "medium" | "hard";
}

export interface FruitStats {
  score: number;
  slicedCount: number;
  combosCount: number;
  bombsHit: number;
  missedCount: number;
}

export const FRUIT_DEFS: Record<FruitType, FruitDef> = {
  watermelon: { type: "watermelon", color: 0xef4444, radius: 46, points: 1 },
  apple:      { type: "apple",      color: 0xef4444, radius: 32, points: 1 },
  orange:     { type: "orange",     color: 0xf97316, radius: 34, points: 1 },
  banana:     { type: "banana",     color: 0xeab308, radius: 30, points: 1 },
  coconut:    { type: "coconut",    color: 0xffffff, radius: 36, points: 2 },
  kiwi:       { type: "kiwi",       color: 0x84cc16, radius: 28, points: 2 },
  bomb:       { type: "bomb",       color: 0x3b82f6, radius: 32, points: 0 },
};
