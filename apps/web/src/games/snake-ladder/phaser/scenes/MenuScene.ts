import Phaser from 'phaser';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MenuScene' });
  }

  create() {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    const title = this.add.text(width / 2, height / 3, '🐍 SNAKE & LADDER', {
      font: 'bold 24px Outfit, sans-serif',
      color: '#f59e0b'
    });
    title.setOrigin(0.5);

    const playBtn = this.add.text(width / 2, height / 2, 'START ARENA MATCH', {
      font: 'bold 16px Outfit, sans-serif',
      color: '#10b981',
      backgroundColor: '#1e293b',
      padding: { x: 20, y: 10 }
    });
    playBtn.setOrigin(0.5);
    playBtn.setInteractive({ useHandCursor: true });

    playBtn.on('pointerover', () => playBtn.setStyle({ color: '#34d399' }));
    playBtn.on('pointerout', () => playBtn.setStyle({ color: '#10b981' }));
    playBtn.on('pointerdown', () => this.scene.start('SnakeLadderScene'));
  }
}
