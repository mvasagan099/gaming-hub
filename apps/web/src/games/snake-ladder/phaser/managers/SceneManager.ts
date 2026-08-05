import Phaser from 'phaser';

export class SceneManager {
  private game: Phaser.Game;

  constructor(game: Phaser.Game) {
    this.game = game;
  }

  startScene(sceneKey: string, data?: object) {
    this.game.scene.start(sceneKey, data);
  }

  pauseScene(sceneKey: string) {
    this.game.scene.pause(sceneKey);
  }

  resumeScene(sceneKey: string) {
    this.game.scene.resume(sceneKey);
  }
}
