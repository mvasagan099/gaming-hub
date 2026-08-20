import Phaser from "phaser";
import { animDuration, prefersReducedMotion } from "../constants";

/**
 * Modern cinematic countdown overlay shown at match start:
 * Player VS Card followed by 3-2-1-GO! sequence.
 */
export class CountdownOverlay {
  private scene: Phaser.Scene;
  private container!: Phaser.GameObjects.Container;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  show(
    names: string[],
    totalPlayers: number,
    onComplete: () => void,
  ): void {
    const reduced = prefersReducedMotion();
    if (reduced) {
      onComplete();
      return;
    }

    const w = this.scene.scale.width;
    const h = this.scene.scale.height;
    const cx = w / 2;
    const cy = h / 2;

    // 1. Dim Backdrop Overlay (Centered at 0, 0 in container at cx, cy)
    const overlay = this.scene.add.rectangle(0, 0, w, h, 0x000000, 0.85);

    this.container = this.scene.add.container(cx, cy, [overlay]);
    this.container.setDepth(300);

    const displayNames = names.slice(0, Math.min(totalPlayers, 4));
    const vsLines = displayNames.map((n) => n.toUpperCase()).join("\nVS\n");

    // 2. VS Matchup Card
    const vsGfx = this.scene.add.graphics();
    vsGfx.fillStyle(0x0f172a, 0.95);
    vsGfx.fillRoundedRect(-160, -70, 320, 140, 20);
    vsGfx.lineStyle(2, 0xf59e0b, 0.8);
    vsGfx.strokeRoundedRect(-160, -70, 320, 140, 20);

    const vsText = this.scene.add.text(0, 0, vsLines, {
      fontSize: "18px",
      color: "#ffffff",
      fontFamily: "Outfit, sans-serif",
      fontStyle: "bold",
      align: "center",
      lineSpacing: 8,
      shadow: {
        offsetX: 0,
        offsetY: 2,
        color: "#000000",
        blur: 4,
        fill: true,
      },
    }).setOrigin(0.5);

    const vsGroup = this.scene.add.container(0, 0, [vsGfx, vsText]);
    vsGroup.setScale(0.8).setAlpha(0);
    this.container.add(vsGroup);

    // VS Entrance
    this.scene.tweens.add({
      targets: vsGroup,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      duration: animDuration(350),
      ease: "Back.Out",
    });

    this.scene.time.delayedCall(animDuration(1100), () => {
      this.scene.tweens.add({
        targets: vsGroup,
        alpha: 0,
        scaleX: 1.1,
        scaleY: 1.1,
        duration: animDuration(200),
        onComplete: () => {
          this.container.remove(vsGroup);
          vsGroup.destroy();
          this.countdown(totalPlayers, onComplete);
        },
      });
    });
  }

  private countdown(_totalPlayers: number, onComplete: () => void): void {
    const sequence = ["3", "2", "1", "GO!"];
    let idx = 0;

    const showNext = () => {
      if (idx >= sequence.length) {
        this.scene.tweens.add({
          targets: this.container,
          alpha: 0,
          duration: animDuration(200),
          onComplete: () => {
            this.container.destroy();
            onComplete();
          },
        });
        return;
      }

      const text = sequence[idx];
      const isGo = text === "GO!";

      const txt = this.scene.add.text(0, 0, text, {
        fontSize: isGo ? "54px" : "48px",
        color: isGo ? "#4ade80" : "#ffffff",
        fontFamily: "Outfit, sans-serif",
        fontStyle: "bold",
        stroke: isGo ? "#14532d" : "#0f172a",
        strokeThickness: 5,
        shadow: {
          offsetX: 0,
          offsetY: 3,
          color: isGo ? "#22c55e88" : "#00000088",
          blur: 10,
          fill: true,
        },
      }).setOrigin(0.5).setAlpha(0).setScale(0.3);

      this.container.add(txt);

      this.scene.tweens.add({
        targets: txt,
        alpha: 1,
        scaleX: 1,
        scaleY: 1,
        duration: animDuration(200),
        ease: "Back.Out",
        onComplete: () => {
          this.scene.time.delayedCall(animDuration(isGo ? 300 : 400), () => {
            this.scene.tweens.add({
              targets: txt,
              alpha: 0,
              scaleX: 1.3,
              scaleY: 1.3,
              duration: animDuration(150),
              onComplete: () => {
                this.container.remove(txt);
                txt.destroy();
                idx++;
                showNext();
              },
            });
          });
        },
      });
    };

    showNext();
  }

  skip(): void {
    if (this.container) {
      this.container.destroy();
    }
  }
}

export default CountdownOverlay;
