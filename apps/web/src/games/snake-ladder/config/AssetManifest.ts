export interface AssetEntry {
  key: string;
  path: string;
}

export const AssetManifest = {
  images: [
    { key: "board", path: "/assets/snake-ladder/images/board.png" },
  ] as AssetEntry[],

  dice: [
    // Dice faces are drawn procedurally in DiceManager using Graphics
  ] as AssetEntry[],

  audio: [
    // Temporarily disabled to prevent decoding errors since we don't have the real files yet
    // { key: "roll", path: "assets/snake-ladder/audio/roll.mp3" },
    // { key: "snake", path: "assets/snake-ladder/audio/snake.mp3" },
    // { key: "ladder", path: "assets/snake-ladder/audio/ladder.mp3" },
    // { key: "win", path: "assets/snake-ladder/audio/win.mp3" }
  ] as AssetEntry[]
};
