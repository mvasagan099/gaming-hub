import Phaser from "phaser";

export interface Player {
  id: number;
  name: string;
  tile: number;
  sprite: Phaser.GameObjects.Arc;
  finished: boolean;
  color: number;
}
