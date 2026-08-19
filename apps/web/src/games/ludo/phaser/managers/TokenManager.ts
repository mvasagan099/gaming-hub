import Phaser from "phaser";
import type { Token, PlayerColor } from "../types/ludo.types";
import { LudoEvents } from "../events/LudoEvents";
import { yardSpawnPixel, mainPathPixel, homeColPixel, HOME_COL_BASE, CELL_SIZE } from "../data/boardLayout";
import { ANIM, animDuration, prefersReducedMotion } from "../constants";

const STACK_OFFSETS: Array<{ x: number; y: number }> = [
  { x: -8, y: -8 },
  { x:  8, y: -8 },
  { x: -8, y:  8 },
  { x:  8, y:  8 },
];

const TOKEN_COLORS: Record<PlayerColor, { main: number; dark: number; light: number }> = {
  red:    { main: 0xef4444, dark: 0xb91c1c, light: 0xfca5a5 },
  blue:   { main: 0x3b82f6, dark: 0x1d4ed8, light: 0x93c5fd },
  green:  { main: 0x22c55e, dark: 0x15803d, light: 0x86efac },
  yellow: { main: 0xeab308, dark: 0xa16207, light: 0xfde047 },
};

const COLOR_INITIALS: Record<PlayerColor, string[]> = {
  red:    ["R1", "R2", "R3", "R4"],
  blue:   ["B1", "B2", "B3", "B4"],
  green:  ["G1", "G2", "G3", "G4"],
  yellow: ["Y1", "Y2", "Y3", "Y4"],
};

interface TokenObject {
  token: Token;
  container: Phaser.GameObjects.Container;
  graphics: Phaser.GameObjects.Graphics;
  glowGraphics: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
  glowTween?: Phaser.Tweens.Tween;
  idleTween?: Phaser.Tweens.Tween;
}

export default class TokenManager {
  private scene: Phaser.Scene;
  private tokenObjects = new Map<string, TokenObject>();
  private tokenRadius = Math.round(CELL_SIZE * 0.35);

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  createTokens(tokens: Token[]): void {
    for (const token of tokens) {
      this.createToken(token);
    }
  }

  private createToken(token: Token): void {
    const { x, y } = this.getPixelForToken(token);
    const palette = TOKEN_COLORS[token.color];
    const radius = this.tokenRadius;
    const label = COLOR_INITIALS[token.color][token.index] ?? token.id;

    // Glow ring (rendered behind the token body)
    const glowGfx = this.scene.add.graphics();
    glowGfx.setAlpha(ANIM.tokenGlowAlphaNormal);

    const g = this.scene.add.graphics();

    // Drop shadow — elliptical
    g.fillStyle(0x000000, 0.25);
    g.fillEllipse(2, radius * 0.35 + 4, radius * 2.4, radius * 0.7);

    // Main body — two-tone with inner gradient feel
    g.fillStyle(palette.main, 1);
    g.fillCircle(0, 0, radius);

    // Upper highlight arc (3D dome effect)
    g.fillStyle(0xffffff, 0.22);
    g.fillEllipse(-radius * 0.25, -radius * 0.3, radius * 1.1, radius * 0.75);

    // Specular dot
    g.fillStyle(0xffffff, 0.65);
    g.fillCircle(-radius * 0.3, -radius * 0.35, radius * 0.18);

    // Dark border
    g.lineStyle(2, palette.dark, 0.9);
    g.strokeCircle(0, 0, radius);

    const txt = this.scene.add.text(0, 1, label, {
      fontSize: "8px",
      color: "#ffffff",
      fontFamily: "Outfit, sans-serif",
      fontStyle: "bold",
      stroke: "#00000033",
      strokeThickness: 1,
    }).setOrigin(0.5);

    // Hit area
    const hitArea = this.scene.add.circle(0, 0, radius, 0xffffff, 0);
    hitArea.setInteractive({ useHandCursor: true });
    hitArea.on("pointerdown", () => {
      this.scene.events.emit(LudoEvents.TOKEN_SELECTED, token.id);
    });

    const container = this.scene.add.container(x, y, [glowGfx, g, txt, hitArea]);
    container.setDepth(50);

    const obj: TokenObject = {
      token,
      container,
      graphics: g,
      glowGraphics: glowGfx,
      label: txt,
    };
    this.tokenObjects.set(token.id, obj);

    if (token.state === "yard") {
      this.startIdleAnimation(obj);
    }
  }

  // ─── Glow ring drawing ───────────────────────────────────────────────────────

  private drawGlowRing(obj: TokenObject, active: boolean): void {
    const g = obj.glowGraphics;
    g.clear();
    const palette = TOKEN_COLORS[obj.token.color];
    const r = this.tokenRadius + (active ? ANIM.tokenGlowRadiusExtra : 0);

    g.fillStyle(palette.main, active ? ANIM.tokenGlowAlphaActive : ANIM.tokenGlowAlphaNormal);
    g.fillCircle(0, 0, r + 4);
    g.lineStyle(2, palette.light, active ? 0.7 : 0.3);
    g.strokeCircle(0, 0, r + 2);
  }

  // ─── Movement ────────────────────────────────────────────────────────────────

  moveAlongPath(tokenId: string, path: number[], color: PlayerColor, onComplete?: () => void): void {
    const obj = this.tokenObjects.get(tokenId);
    if (!obj || path.length === 0) { onComplete?.(); return; }

    this.stopIdleAnimation(obj);
    this.drawGlowRing(obj, false);
    obj.glowGraphics.setAlpha(1);

    let stepIndex = 0;
    const reduced = prefersReducedMotion();

    const hop = () => {
      if (stepIndex >= path.length) {
        this.bounceOnLand(obj);
        this.scene.time.delayedCall(animDuration(150), () => onComplete?.());
        return;
      }

      const pos = path[stepIndex]!;
      const pixel = this.positionToPixel(color, pos, obj.token.index);
      stepIndex++;

      if (reduced) {
        obj.container.setPosition(pixel.x, pixel.y);
        hop();
        return;
      }

      // Hop arc: up then down with slight squash
      this.scene.tweens.add({
        targets: obj.container,
        x: pixel.x,
        y: pixel.y - ANIM.bounceHeight,
        scaleX: ANIM.landingBounceScale,
        scaleY: ANIM.landingSquashY,
        duration: animDuration(ANIM.tokenStepDuration),
        ease: ANIM.tokenStepEase,
        onComplete: () => {
          this.scene.tweens.add({
            targets: obj.container,
            y: pixel.y,
            scaleX: 1,
            scaleY: 1,
            duration: animDuration(ANIM.bounceDuration),
            ease: "Sine.Out",
            onComplete: hop,
          });
        },
      });
    };

    hop();
  }

  /** Fly token back to yard after capture with shake + arc */
  sendToYard(tokenId: string, color: PlayerColor, tokenIndex: number, onComplete?: () => void): void {
    const obj = this.tokenObjects.get(tokenId);
    if (!obj) { onComplete?.(); return; }

    const { x, y } = yardSpawnPixel(color, tokenIndex);
    const reduced = prefersReducedMotion();

    if (reduced) {
      obj.container.setPosition(x, y);
      this.startIdleAnimation(obj);
      onComplete?.();
      return;
    }

    // Flash white to indicate capture
    const flash = this.scene.add.graphics();
    flash.setDepth(55);
    flash.fillStyle(0xffffff, ANIM.captureFlashAlpha);
    flash.fillCircle(obj.container.x, obj.container.y, this.tokenRadius + 6);
    this.scene.tweens.add({
      targets: flash,
      alpha: 0,
      duration: animDuration(ANIM.captureFlashDuration),
      onComplete: () => flash.destroy(),
    });

    // Shake then fly back
    this.scene.tweens.add({
      targets: obj.container,
      x: obj.container.x + ANIM.captureShakeDistance,
      duration: animDuration(ANIM.captureShakeDuration),
      ease: "Linear",
      yoyo: true,
      repeat: 2,
      onComplete: () => {
        this.scene.tweens.add({
          targets: obj.container,
          x,
          y,
          scaleX: 0.6,
          scaleY: 0.6,
          duration: animDuration(400),
          ease: "Back.In",
          onComplete: () => {
            this.scene.tweens.add({
              targets: obj.container,
              scaleX: 1,
              scaleY: 1,
              duration: animDuration(200),
              ease: "Back.Out",
              onComplete: () => {
                this.startIdleAnimation(obj);
                onComplete?.();
              },
            });
          },
        });
      },
    });
  }

  // ─── Home entry celebration ──────────────────────────────────────────────────

  animateHomeEntry(tokenId: string): void {
    const obj = this.tokenObjects.get(tokenId);
    if (!obj) return;

    const reduced = prefersReducedMotion();
    if (reduced) return;

    this.scene.tweens.add({
      targets: obj.container,
      scaleX: ANIM.homeEntryScale,
      scaleY: ANIM.homeEntryScale,
      duration: animDuration(ANIM.homeEntryDuration),
      ease: ANIM.homeEntryBounce,
      yoyo: true,
    });

    // Particle-like ring burst
    const palette = TOKEN_COLORS[obj.token.color];
    const ring = this.scene.add.graphics();
    ring.setDepth(55);
    ring.lineStyle(3, palette.main, 0.8);
    ring.strokeCircle(obj.container.x, obj.container.y, this.tokenRadius);
    this.scene.tweens.add({
      targets: ring,
      alpha: 0,
      scaleX: 2,
      scaleY: 2,
      duration: animDuration(500),
      ease: "Cubic.Out",
      onComplete: () => ring.destroy(),
    });
  }

  // ─── Highlight / Selection ────────────────────────────────────────────────────

  glowToken(tokenId: string): void {
    const obj = this.tokenObjects.get(tokenId);
    if (!obj) return;

    obj.glowTween?.stop();
    this.drawGlowRing(obj, true);

    obj.glowTween = this.scene.tweens.add({
      targets: obj.glowGraphics,
      alpha: { from: ANIM.tokenGlowAlphaActive, to: 0.25 },
      duration: animDuration(350),
      ease: "Sine.InOut",
      yoyo: true,
      repeat: -1,
    });

    // Scale bounce
    this.scene.tweens.add({
      targets: obj.container,
      scaleX: ANIM.activeTokenScale,
      scaleY: ANIM.activeTokenScale,
      duration: animDuration(200),
      ease: "Back.Out",
    });
  }

  clearGlow(tokenId: string): void {
    const obj = this.tokenObjects.get(tokenId);
    if (!obj) return;

    obj.glowTween?.stop();
    obj.glowTween = undefined;
    this.drawGlowRing(obj, false);

    this.scene.tweens.add({
      targets: obj.container,
      scaleX: ANIM.normalTokenScale,
      scaleY: ANIM.normalTokenScale,
      duration: animDuration(150),
    });
  }

  clearAllGlows(): void {
    for (const id of this.tokenObjects.keys()) {
      this.clearGlow(id);
    }
  }

  highlightClickable(tokenIds: string[]): void {
    this.clearAllGlows();
    for (const id of tokenIds) {
      this.glowToken(id);
    }
  }

  // ─── Active player highlight (persistent glow on all tokens of a color) ─────

  setActivePlayer(color: PlayerColor): void {
    for (const [, obj] of this.tokenObjects) {
      if (obj.token.color === color && obj.token.state === "yard") {
        this.drawGlowRing(obj, true);
        obj.glowGraphics.setAlpha(0.35);
      }
    }
  }

  clearActivePlayer(): void {
    for (const [, obj] of this.tokenObjects) {
      if (obj.token.state === "yard") {
        this.drawGlowRing(obj, false);
        obj.glowGraphics.setAlpha(ANIM.tokenGlowAlphaNormal);
      }
    }
  }

  // ─── Win celebration ─────────────────────────────────────────────────────────

  celebrateWinner(color: PlayerColor): void {
    for (const [, obj] of this.tokenObjects) {
      if (obj.token.color !== color) continue;
      this.scene.tweens.add({
        targets: obj.container,
        y: obj.container.y - 20,
        scaleX: 1.4,
        scaleY: 1.4,
        duration: animDuration(400),
        ease: "Back.Out",
        yoyo: true,
        repeat: 3,
      });
    }
  }

  // ─── Token sync ──────────────────────────────────────────────────────────────

  syncToken(token: Token): void {
    const obj = this.tokenObjects.get(token.id);
    if (!obj) return;

    obj.token = token;

    if (token.state === "finished") {
      this.stopIdleAnimation(obj);
      this.scene.tweens.add({
        targets: obj.container,
        scaleX: 0.7,
        scaleY: 0.7,
        duration: animDuration(300),
      });
    }
  }

  updateTokens(tokens: Token[]): void {
    for (const token of tokens) {
      this.syncFromServer(token);
    }
  }

  syncFromServer(token: Token): void {
    const obj = this.tokenObjects.get(token.id);
    if (!obj) return;

    obj.token = token;
    const { x, y } = this.getPixelForToken(token);
    obj.container.setPosition(x, y);

    if (token.state === "finished") {
      this.stopIdleAnimation(obj);
      this.scene.tweens.add({
        targets: obj.container,
        scaleX: 0.7,
        scaleY: 0.7,
        duration: animDuration(300),
      });
    } else if (token.state === "yard" && !obj.idleTween) {
      this.startIdleAnimation(obj);
    }
  }

  /** Kill all running tweens (reconnect safety). */
  killAllTweens(): void {
    for (const [, obj] of this.tokenObjects) {
      this.scene.tweens.killTweensOf(obj.container);
      this.scene.tweens.killTweensOf(obj.glowGraphics);
      obj.glowTween = undefined;
      obj.idleTween = undefined;
    }
  }

  // ─── Private helpers ──────────────────────────────────────────────────────────

  private getPixelForToken(token: Token): { x: number; y: number } {
    if (token.position === -1) return yardSpawnPixel(token.color, token.index);
    const homeBase = HOME_COL_BASE[token.color];
    if (token.position >= homeBase) {
      return homeColPixel(token.color, token.position - homeBase);
    }
    return mainPathPixel(token.position);
  }

  private positionToPixel(color: PlayerColor, pos: number, tokenIndex: number): { x: number; y: number } {
    if (pos === -1) return yardSpawnPixel(color, tokenIndex);
    const homeBase = HOME_COL_BASE[color];
    const offset = STACK_OFFSETS[tokenIndex % 4] ?? { x: 0, y: 0 };
    if (pos >= homeBase) {
      const base = homeColPixel(color, pos - homeBase);
      return { x: base.x + offset.x, y: base.y + offset.y };
    }
    const base = mainPathPixel(pos);
    return { x: base.x + offset.x, y: base.y + offset.y };
  }

  private bounceOnLand(obj: TokenObject): void {
    if (prefersReducedMotion()) return;
    this.scene.tweens.add({
      targets: obj.container,
      y: obj.container.y - ANIM.bounceHeight,
      duration: animDuration(ANIM.landingBounceDuration),
      ease: "Sine.Out",
      yoyo: true,
    });
  }

  private startIdleAnimation(obj: TokenObject): void {
    obj.idleTween?.stop();
    obj.idleTween = this.scene.tweens.add({
      targets: obj.container,
      y: obj.container.y - 4,
      duration: 800 + Math.random() * 400,
      ease: "Sine.InOut",
      yoyo: true,
      repeat: -1,
    });
  }

  private stopIdleAnimation(obj: TokenObject): void {
    obj.idleTween?.stop();
    obj.idleTween = undefined;
  }

  getTokenObject(id: string): TokenObject | undefined {
    return this.tokenObjects.get(id);
  }
}

export { TokenManager };
