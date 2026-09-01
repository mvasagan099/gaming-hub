import Phaser from "phaser";
import { ANIM, animDuration, prefersReducedMotion } from "../constants";

/** Countdown overlay shown at match start: "PLAYER 1 vs PLAYER 2" then 3-2-1-GO! */
export class CountdownOverlay {
  private scene: Phaser.Scene;
  private container!: Phaser.GameObjects.Container;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /**
   * Show the full countdown sequence, then call onComplete.
   * For multiplayer reconnects where the game is already in progress,
   * call onComplete immediately without showing anything.
   */
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

    // Dim overlay
    const overlay = this.scene.add.rectangle(0, 0, w, h, 0x000000, 0.8);

    this.container = this.scene.add.container(cx, cy, [overlay]);
    this.container.setDepth(300);

    // Show "PLAYER 1  VS  PLAYER 2"
    const p1Name = names[0] ?? "Player 1";
    const p2Name = names[1] ?? "Player 2";
    const vsText = this.scene.add.text(0, -10, `${p1Name.toUpperCase()}\nVS\n${p2Name.toUpperCase()}`, {
      fontSize: "22px",
      color: "#ffffff",
      fontFamily: "Outfit, sans-serif",
      fontStyle: "bold",
      align: "center",
      lineSpacing: 8,
      stroke: "#000000",
      strokeThickness: 3,
    }).setOrigin(0.5).setAlpha(0).setScale(0.8);

    this.container.add(vsText);

    const step = (tween: Phaser.Tweens.Tween, onCompleteStep: () => void): void => {
      tween.play();
      this.scene.time.delayedCall(animDuration(tween.totalDuration), onCompleteStep);
    };

    // VS fade in
    this.scene.tweens.add({
      targets: vsText,
      alpha: 1,
      scale: 1,
      duration: animDuration(400),
      ease: "Back.Out",
    });

    this.scene.time.delayedCall(animDuration(1000), () => {
      // Fade out VS
      this.scene.tweens.add({
        targets: vsText,
        alpha: 0,
        scale: 1.1,
        duration: animDuration(200),
        onComplete: () => {
          this.container.remove(vsText);
          vsText.destroy();
          this.countdown(cx, cy, totalPlayers, onComplete);
        },
      });
    });
  }

  private countdown(cx: number, cy: number, totalPlayers: number, onComplete: () => void): void {
    const sequence = ["3", "2", "1", "GO!"];
    let idx = 0;

    const showNext = () => {
      if (idx >= sequence.length) {
        // Clean up
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
      const txt = this.scene.add.text(cx, cy, text, {
        fontSize: isGo ? "48px" : "42px",
        color: isGo ? "#4ade80" : "#ffffff",
        fontFamily: "Outfit, sans-serif",
        fontStyle: "bold",
        stroke: isGo ? "#14532d" : "#000000",
        strokeThickness: 4,
      }).setOrigin(0.5).setAlpha(0).setScale(0.3).setDepth(301);

      this.scene.tweens.add({
        targets: txt,
        alpha: 1,
        scale: 1,
        duration: animDuration(200),
        ease: "Back.Out",
        onComplete: () => {
          this.scene.time.delayedCall(animDuration(isGo ? 300 : 400), () => {
            this.scene.tweens.add({
              targets: txt,
              alpha: 0,
              scale: 1.3,
              duration: animDuration(150),
              onComplete: () => {
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
