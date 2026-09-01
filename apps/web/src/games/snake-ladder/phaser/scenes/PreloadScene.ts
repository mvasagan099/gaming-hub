import Phaser from "phaser";
import { AssetManifest } from "../../config/AssetManifest";

export default class PreloadScene extends Phaser.Scene {
  constructor() {
    super("PreloadScene");
  }

  preload() {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    const progressBox = this.add.graphics();
    progressBox.fillStyle(0x222222, 0.8);
    progressBox.fillRect(width / 2 - 250, height / 2 - 30, 500, 50);

    const progressBar = this.add.graphics();

    const percentText = this.make.text({
      x: width / 2,
      y: height / 2 - 5,
      text: "0%",
      style: {
        font: "bold 16px Outfit, sans-serif",
        color: "#ffffff"
      }
    });
    percentText.setOrigin(0.5, 0.5);

    const loadingText = this.make.text({
      x: width / 2,
      y: height / 2 - 50,
      text: "Loading Assets...",
      style: {
        font: "bold 18px Outfit, sans-serif",
        color: "#f59e0b"
      }
    });
    loadingText.setOrigin(0.5, 0.5);

    this.load.on("progress", (value: number) => {
      percentText.setText(`${Math.floor(value * 100)}%`);
      progressBar.clear();
      progressBar.fillStyle(0x6366f1, 1);
      progressBar.fillRect(width / 2 - 240, height / 2 - 20, 480 * value, 30);
    });

    this.load.on("complete", () => {
      progressBar.destroy();
      progressBox.destroy();
      loadingText.destroy();
      percentText.destroy();
    });

    // Load images, dice, and audio from AssetManifest
    AssetManifest.images.forEach((asset) => {
      this.load.image(asset.key, asset.path);
    });

    AssetManifest.dice.forEach((asset) => {
      this.load.image(asset.key, asset.path);
    });

    AssetManifest.audio.forEach((asset) => {
      this.load.audio(asset.key, asset.path);
    });
  }

  create() {
    this.scene.start("SnakeLadderScene");
  }
}
