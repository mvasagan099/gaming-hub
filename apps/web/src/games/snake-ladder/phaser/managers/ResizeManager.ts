import Phaser from 'phaser';

export class ResizeManager {
  private game: Phaser.Game;

  constructor(game: Phaser.Game) {
    this.game = game;
    this.initResizeListener();
  }

  private initResizeListener() {
    window.addEventListener('resize', () => {
      this.handleResize();
    });
  }

  public handleResize() {
    if (!this.game) return;
    this.game.scale.refresh();
  }
}
