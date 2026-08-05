export const FruitEvents = {
  // Gameplay Events
  FRUIT_SLICED: "fn:fruit-sliced",
  COMBO_TRIGGERED: "fn:combo-triggered",
  BOMB_EXPLODED: "fn:bomb-exploded",
  LIFE_LOST: "fn:life-lost",
  TIME_OUT: "fn:time-out",

  // Game over
  GAME_OVER: "fn:game-over",
} as const;

export type FruitEventType = (typeof FruitEvents)[keyof typeof FruitEvents];
export default FruitEvents;
