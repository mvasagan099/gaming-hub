import Phaser from "phaser";
import BootScene from "./scenes/BootScene";
import PreloadScene from "./scenes/PreloadScene";
import SnakeLadderScene from "./scenes/SnakeLadderScene";

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,

  parent: "game-container",

  width: 1200,
  height: 800,

  backgroundColor: "#0f172a",

  scene: [
    BootScene,
    PreloadScene,
    SnakeLadderScene
  ],

  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  }
};
