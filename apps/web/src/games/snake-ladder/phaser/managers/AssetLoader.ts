import Phaser from 'phaser';

export class AssetLoader {
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  loadGameAssets() {
    // Generate inline SVG textures for crisp 2D assets without external file dependencies
    this.createTextureIfMissing('pawn_red', 32, 32, '#ef4444');
    this.createTextureIfMissing('pawn_green', 32, 32, '#10b981');
    this.createTextureIfMissing('dice_bg', 64, 64, '#0f172a');
  }

  private createTextureIfMissing(key: string, width: number, height: number, colorHex: string) {
    if (this.scene.textures.exists(key)) return;

    const graphics = this.scene.make.graphics({ x: 0, y: 0 });
    const colorNum = parseInt(colorHex.replace('#', '0x'), 16);

    graphics.fillStyle(colorNum, 1);
    graphics.fillCircle(width / 2, height / 2, width / 2 - 2);
    graphics.lineStyle(2, 0xffffff, 1);
    graphics.strokeCircle(width / 2, height / 2, width / 2 - 2);

    graphics.generateTexture(key, width, height);
    graphics.destroy();
  }
}
