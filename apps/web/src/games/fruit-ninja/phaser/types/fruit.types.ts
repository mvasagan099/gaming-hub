export type FruitType =
  | "watermelon"
  | "apple"
  | "orange"
  | "banana"
  | "coconut"
  | "kiwi"
  | "bomb";

export type FruitNinjaMode = "classic" | "zen" | "arcade";

export interface FruitDef {
  type: FruitType;
  color: number; // Juice splash color
  mistColor: number; // Fine mist color
  radius: number;
  points: number;
  displayName: string;
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
  watermelon: { type: "watermelon", color: 0xef4444, mistColor: 0xf87171, radius: 46, points: 10, displayName: "Watermelon" },
  apple:      { type: "apple",      color: 0xdc2626, mistColor: 0xfca5a5, radius: 34, points: 10, displayName: "Apple" },
  orange:     { type: "orange",     color: 0xf97316, mistColor: 0xfdba74, radius: 36, points: 10, displayName: "Orange" },
  banana:     { type: "banana",     color: 0xfacc15, mistColor: 0xfef08a, radius: 32, points: 10, displayName: "Banana" },
  coconut:    { type: "coconut",    color: 0xffffff, mistColor: 0xe2e8f0, radius: 38, points: 10, displayName: "Coconut" },
  kiwi:       { type: "kiwi",       color: 0x84cc16, mistColor: 0xbef264, radius: 30, points: 10, displayName: "Kiwi" },
  bomb:       { type: "bomb",       color: 0x3b82f6, mistColor: 0x60a5fa, radius: 34, points: 0,  displayName: "Bomb" },
};
