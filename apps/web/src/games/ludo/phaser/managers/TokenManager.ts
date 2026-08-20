import Phaser from "phaser";
import type { Token, PlayerColor } from "../types/ludo.types";
import { LudoEvents } from "../events/LudoEvents";
import { yardSpawnPixel, mainPathPixel, homeColPixel, HOME_COL_BASE, CELL_SIZE } from "../data/boardLayout";
import { ANIM, LUDO_TOKEN_VISUAL_CONFIG, animDuration, prefersReducedMotion } from "../constants";
import { LudoTokenRenderer, LUDO_TOKEN_PALETTES } from "./LudoTokenRenderer";
import type MovePathOverlay from "../ui/MovePathOverlay";

const STACK_OFFSETS: Array<{ x: number; y: number }> = [
  { x: -7, y: -7 },
  { x:  7, y: -7 },
  { x: -7, y:  7 },
  { x:  7, y:  7 },
];

const COLOR_INITIALS: Record<PlayerColor, string[]> = {
  red:    ["R1", "R2", "R3", "R4"],
  blue:   ["B1", "B2", "B3", "B4"],
  green:  ["G1", "G2", "G3", "G4"],
  yellow: ["Y1", "Y2", "Y3", "Y4"],
};

interface TokenObject {
  token: Token;
  container: Phaser.GameObjects.Container;
  shadowGraphics: Phaser.GameObjects.Graphics;
  glowGraphics: Phaser.GameObjects.Graphics;
  bodyGraphics: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
  glowTween?: Phaser.Tweens.Tween;
  idleTween?: Phaser.Tweens.Tween;
  isActionable?: boolean;
  isSelected?: boolean;
}

export default class TokenManager {
  private scene: Phaser.Scene;
  private tokenObjects = new Map<string, TokenObject>();
  private tokenRadius = Math.round(CELL_SIZE * 0.36);
  private pathOverlay: MovePathOverlay | null = null;
  private pathProvider: ((tokenId: string) => number[]) | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  setPathOverlay(overlay: MovePathOverlay, pathProvider?: (tokenId: string) => number[]): void {
    this.pathOverlay = overlay;
    if (pathProvider) {
      this.pathProvider = pathProvider;
    }
  }

  createTokens(tokens: Token[]): void {
    for (const token of tokens) {
      this.createToken(token);
    }
  }

  private createToken(token: Token): void {
    const { x, y } = this.getPixelForToken(token);
    const palette = LUDO_TOKEN_PALETTES[token.color];
    const radius = this.tokenRadius;
    const label = COLOR_INITIALS[token.color][token.index] ?? token.id;

    // 1. Contact Shadow Graphics (Layer 0)
    const shadowGfx = this.scene.add.graphics();
    LudoTokenRenderer.drawContactShadow(shadowGfx, radius, 0);

    // 2. Radiant Turn Glow Aura Graphics (Layer 1)
    const glowGfx = this.scene.add.graphics();
    LudoTokenRenderer.drawAuraRing(glowGfx, token.color, radius, false, 0);

    // 3. Volumetric 3D Physical Token Body (Layer 2)
    const bodyGfx = this.scene.add.graphics();
    LudoTokenRenderer.draw3DTokenBody(bodyGfx, token.color, radius);

    // 4. Embossed Typography Initial Crest (Layer 3)
    const txt = this.scene.add.text(0, -0.5, label, {
      fontSize: "9px",
      color: "#ffffff",
      fontFamily: "Outfit, sans-serif",
      fontStyle: "bold",
      stroke: palette.textStroke,
      strokeThickness: 2,
      shadow: {
        offsetX: 0,
        offsetY: 1,
        color: "#00000088",
        blur: 2,
        stroke: true,
        fill: true,
      },
    }).setOrigin(0.5);

    // 5. Interactive Hit Area
    const hitArea = this.scene.add.circle(0, 0, radius + 4, 0xffffff, 0);
    hitArea.setInteractive({ useHandCursor: true });

    hitArea.on("pointerdown", () => {
      this.onTokenClicked(token.id);
    });

    hitArea.on("pointerover", () => {
      this.onTokenHover(token.id, true);
    });

    hitArea.on("pointerout", () => {
      this.onTokenHover(token.id, false);
    });

    const container = this.scene.add.container(x, y, [
      shadowGfx,
      glowGfx,
      bodyGfx,
      txt,
      hitArea,
    ]);
    container.setDepth(50 + token.index);

    const obj: TokenObject = {
      token,
      container,
      shadowGraphics: shadowGfx,
      glowGraphics: glowGfx,
      bodyGraphics: bodyGfx,
      label: txt,
    };
    this.tokenObjects.set(token.id, obj);

    if (token.state === "yard") {
      container.setScale(LUDO_TOKEN_VISUAL_CONFIG.yardScale);
      this.startIdleAnimation(obj);
    } else if (token.state === "finished") {
      container.setScale(LUDO_TOKEN_VISUAL_CONFIG.finishedScale);
    } else {
      container.setScale(LUDO_TOKEN_VISUAL_CONFIG.baseScale);
    }
  }

  private onTokenHover(tokenId: string, isHover: boolean): void {
    const obj = this.tokenObjects.get(tokenId);
    if (!obj || !obj.isActionable) return;

    if (isHover) {
      if (this.pathOverlay && this.pathProvider) {
        const path = this.pathProvider(tokenId);
        if (path && path.length > 0) {
          this.pathOverlay.showPath(path, obj.token.color);
        }
      }
      this.scene.tweens.add({
        targets: obj.container,
        scaleX: LUDO_TOKEN_VISUAL_CONFIG.selectedScale,
        scaleY: LUDO_TOKEN_VISUAL_CONFIG.selectedScale,
        duration: animDuration(100),
        ease: "Sine.Out",
      });
    } else {
      if (this.pathOverlay) {
        this.pathOverlay.clear();
      }
      this.scene.tweens.add({
        targets: obj.container,
        scaleX: LUDO_TOKEN_VISUAL_CONFIG.activeScale,
        scaleY: LUDO_TOKEN_VISUAL_CONFIG.activeScale,
        duration: animDuration(100),
        ease: "Sine.Out",
      });
    }
  }

  private onTokenClicked(tokenId: string): void {
    const obj = this.tokenObjects.get(tokenId);
    if (!obj) return;

    if (this.pathOverlay) {
      this.pathOverlay.clear();
    }

    // Small selection scale bounce
    if (!prefersReducedMotion()) {
      this.scene.tweens.add({
        targets: obj.container,
        scaleX: LUDO_TOKEN_VISUAL_CONFIG.selectedScale,
        scaleY: LUDO_TOKEN_VISUAL_CONFIG.selectedScale,
        duration: animDuration(120),
        yoyo: true,
        ease: "Sine.Out",
      });
    }

    this.scene.events.emit(LudoEvents.TOKEN_SELECTED, tokenId);
  }

  // ─── Turn Glow & Selection ──────────────────────────────────────────────────

  private drawGlowRing(obj: TokenObject, active: boolean, alpha = 0.5, rotation = 0): void {
    LudoTokenRenderer.drawAuraRing(
      obj.glowGraphics,
      obj.token.color,
      this.tokenRadius,
      active,
      alpha,
      rotation,
    );
  }

  glowToken(tokenId: string): void {
    const obj = this.tokenObjects.get(tokenId);
    if (!obj) return;

    obj.isActionable = true;
    obj.glowTween?.stop();

    const proxy = {
      alpha: LUDO_TOKEN_VISUAL_CONFIG.auraPulseMinAlpha,
      rotation: 0,
    };

    obj.glowTween = this.scene.tweens.add({
      targets: proxy,
      alpha: LUDO_TOKEN_VISUAL_CONFIG.auraPulseMaxAlpha,
      rotation: Math.PI * 2,
      duration: animDuration(LUDO_TOKEN_VISUAL_CONFIG.auraPulseDuration * 2),
      ease: "Linear",
      repeat: -1,
      onUpdate: () => {
        const pulse =
          LUDO_TOKEN_VISUAL_CONFIG.auraPulseMinAlpha +
          (LUDO_TOKEN_VISUAL_CONFIG.auraPulseMaxAlpha - LUDO_TOKEN_VISUAL_CONFIG.auraPulseMinAlpha) *
            Math.abs(Math.sin(proxy.rotation * 2));
        this.drawGlowRing(obj, true, pulse, proxy.rotation);
      },
    });

    // Gentle scale up for active legal token
    this.scene.tweens.add({
      targets: obj.container,
      scaleX: LUDO_TOKEN_VISUAL_CONFIG.activeScale,
      scaleY: LUDO_TOKEN_VISUAL_CONFIG.activeScale,
      duration: animDuration(180),
      ease: "Back.Out",
    });
  }

  clearGlow(tokenId: string): void {
    const obj = this.tokenObjects.get(tokenId);
    if (!obj) return;

    obj.isActionable = false;
    obj.glowTween?.stop();
    obj.glowTween = undefined;
    this.drawGlowRing(obj, false, 0);

    const targetScale = obj.token.state === "yard"
      ? LUDO_TOKEN_VISUAL_CONFIG.yardScale
      : obj.token.state === "finished"
        ? LUDO_TOKEN_VISUAL_CONFIG.finishedScale
        : LUDO_TOKEN_VISUAL_CONFIG.baseScale;

    this.scene.tweens.add({
      targets: obj.container,
      scaleX: targetScale,
      scaleY: targetScale,
      duration: animDuration(150),
      ease: "Sine.Out",
    });
  }

  clearAllGlows(): void {
    if (this.pathOverlay) {
      this.pathOverlay.clear();
    }
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

  setActivePlayer(color: PlayerColor): void {
    for (const [, obj] of this.tokenObjects) {
      if (obj.token.color === color && obj.token.state === "yard") {
        this.drawGlowRing(obj, true, 0.4);
      }
    }
  }

  clearActivePlayer(): void {
    for (const [, obj] of this.tokenObjects) {
      if (obj.token.state === "yard") {
        this.drawGlowRing(obj, false, 0);
      }
    }
  }

  // ─── 3D Step-by-Step Hop Movement ──────────────────────────────────────────

  moveAlongPath(tokenId: string, path: number[], color: PlayerColor, onComplete?: () => void): void {
    const obj = this.tokenObjects.get(tokenId);
    if (!obj || path.length === 0) {
      onComplete?.();
      return;
    }

    if (this.pathOverlay) {
      this.pathOverlay.clear();
    }

    this.stopIdleAnimation(obj);
    this.clearGlow(tokenId);
    obj.container.setDepth(100); // Bring moving token above other board objects

    let stepIndex = 0;
    const reduced = prefersReducedMotion();

    const hop = () => {
      if (stepIndex >= path.length) {
        // Restore final resting depth and bounce on arrival
        obj.container.setDepth(50 + obj.token.index);
        this.bounceOnLand(obj);
        this.scene.time.delayedCall(animDuration(160), () => onComplete?.());
        return;
      }

      const pos = path[stepIndex]!;
      const pixel = this.positionToPixel(color, pos, obj.token.index);
      const isFirstStepFromYard = (stepIndex === 0 && obj.token.state === "yard");
      stepIndex++;

      if (reduced) {
        obj.container.setPosition(pixel.x, pixel.y);
        obj.container.setScale(LUDO_TOKEN_VISUAL_CONFIG.baseScale);
        hop();
        return;
      }

      // Dynamic 3D hop: Upward lift + Dynamic shadow scaling + Landing squash & stretch
      const hopLift = LUDO_TOKEN_VISUAL_CONFIG.hopLiftY;
      const stepTime = animDuration(LUDO_TOKEN_VISUAL_CONFIG.stepDuration);
      const tiltAngle = (stepIndex % 2 === 0 ? 1 : -1) * Phaser.Math.DegToRad(LUDO_TOKEN_VISUAL_CONFIG.motionTiltDeg);

      // Phase 1: 3D Lift & Travel
      const liftProxy = { t: 0 };
      this.scene.tweens.add({
        targets: liftProxy,
        t: 1,
        duration: stepTime * 0.55,
        ease: "Sine.Out",
        onUpdate: () => {
          LudoTokenRenderer.drawContactShadow(obj.shadowGraphics, this.tokenRadius, liftProxy.t);
        },
      });

      this.scene.tweens.add({
        targets: obj.container,
        x: pixel.x,
        y: pixel.y + hopLift,
        rotation: tiltAngle,
        scaleX: isFirstStepFromYard ? LUDO_TOKEN_VISUAL_CONFIG.baseScale * 1.05 : 1.05,
        scaleY: isFirstStepFromYard ? LUDO_TOKEN_VISUAL_CONFIG.baseScale * 1.05 : 1.05,
        duration: stepTime * 0.55,
        ease: "Cubic.Out",
        onComplete: () => {
          // Phase 2: 3D Descent & Landing
          const dropProxy = { t: 1 };
          this.scene.tweens.add({
            targets: dropProxy,
            t: 0,
            duration: stepTime * 0.45,
            ease: "Sine.In",
            onUpdate: () => {
              LudoTokenRenderer.drawContactShadow(obj.shadowGraphics, this.tokenRadius, dropProxy.t);
            },
          });

          this.scene.tweens.add({
            targets: obj.container,
            y: pixel.y,
            rotation: 0,
            scaleX: LUDO_TOKEN_VISUAL_CONFIG.baseScale * LUDO_TOKEN_VISUAL_CONFIG.landingSquashScaleX,
            scaleY: LUDO_TOKEN_VISUAL_CONFIG.baseScale * LUDO_TOKEN_VISUAL_CONFIG.landingSquashScaleY,
            duration: stepTime * 0.45,
            ease: "Sine.In",
            onComplete: () => {
              // Squash & stretch rebound
              this.scene.tweens.add({
                targets: obj.container,
                scaleX: LUDO_TOKEN_VISUAL_CONFIG.baseScale,
                scaleY: LUDO_TOKEN_VISUAL_CONFIG.baseScale,
                duration: animDuration(50),
                ease: "Sine.Out",
                onComplete: hop,
              });
            },
          });
        },
      });
    };

    hop();
  }

  private bounceOnLand(obj: TokenObject): void {
    if (prefersReducedMotion()) return;
    this.scene.tweens.add({
      targets: obj.container,
      y: obj.container.y + LUDO_TOKEN_VISUAL_CONFIG.landingBounceY,
      duration: animDuration(LUDO_TOKEN_VISUAL_CONFIG.stepDuration * 0.6),
      ease: "Sine.Out",
      yoyo: true,
    });
  }

  // ─── Capture Animation (Shockwave, Shake & Smooth Arc Return) ──────────────────

  sendToYard(tokenId: string, color: PlayerColor, tokenIndex: number, onComplete?: () => void): void {
    const obj = this.tokenObjects.get(tokenId);
    if (!obj) {
      onComplete?.();
      return;
    }

    const { x, y } = yardSpawnPixel(color, tokenIndex);
    const reduced = prefersReducedMotion();

    if (reduced) {
      obj.container.setPosition(x, y);
      obj.container.setScale(LUDO_TOKEN_VISUAL_CONFIG.yardScale);
      this.startIdleAnimation(obj);
      onComplete?.();
      return;
    }

    // 1. Expanding impact shockwave
    const shockGfx = this.scene.add.graphics();
    shockGfx.setPosition(obj.container.x, obj.container.y);
    shockGfx.setDepth(90);

    const shockProxy = { progress: 0 };
    this.scene.tweens.add({
      targets: shockProxy,
      progress: 1,
      duration: animDuration(LUDO_TOKEN_VISUAL_CONFIG.shockwaveDuration),
      ease: "Cubic.Out",
      onUpdate: () => {
        LudoTokenRenderer.drawImpactShockwave(shockGfx, color, shockProxy.progress);
      },
      onComplete: () => shockGfx.destroy(),
    });

    // 2. Token shake reaction
    this.scene.tweens.add({
      targets: obj.container,
      x: obj.container.x + LUDO_TOKEN_VISUAL_CONFIG.captureShakeDistance,
      duration: animDuration(LUDO_TOKEN_VISUAL_CONFIG.captureShakeDuration),
      ease: "Sine.InOut",
      yoyo: true,
      repeat: 2,
      onComplete: () => {
        // 3. Smooth 3D flight back to home yard slot
        obj.container.setDepth(95);

        // Shadow shrinks during high arc flight
        LudoTokenRenderer.drawContactShadow(obj.shadowGraphics, this.tokenRadius, 0.85);

        this.scene.tweens.add({
          targets: obj.container,
          x,
          y,
          scaleX: LUDO_TOKEN_VISUAL_CONFIG.yardScale * 0.7,
          scaleY: LUDO_TOKEN_VISUAL_CONFIG.yardScale * 0.7,
          duration: animDuration(LUDO_TOKEN_VISUAL_CONFIG.captureFlyDuration),
          ease: "Cubic.InOut",
          onComplete: () => {
            obj.container.setDepth(50 + obj.token.index);
            LudoTokenRenderer.drawContactShadow(obj.shadowGraphics, this.tokenRadius, 0);

            // Rebound landing in yard
            this.scene.tweens.add({
              targets: obj.container,
              scaleX: LUDO_TOKEN_VISUAL_CONFIG.yardScale,
              scaleY: LUDO_TOKEN_VISUAL_CONFIG.yardScale,
              duration: animDuration(180),
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

  // ─── Home Entry Celebration ────────────────────────────────────────────────

  animateHomeEntry(tokenId: string): void {
    const obj = this.tokenObjects.get(tokenId);
    if (!obj) return;

    if (prefersReducedMotion()) {
      obj.container.setScale(LUDO_TOKEN_VISUAL_CONFIG.finishedScale);
      return;
    }

    // Radiant victory ring burst
    const ring = this.scene.add.graphics();
    ring.setPosition(obj.container.x, obj.container.y);
    ring.setDepth(90);

    const ringProxy = { progress: 0 };
    this.scene.tweens.add({
      targets: ringProxy,
      progress: 1,
      duration: animDuration(600),
      ease: "Cubic.Out",
      onUpdate: () => {
        LudoTokenRenderer.drawImpactShockwave(ring, obj.token.color, ringProxy.progress);
      },
      onComplete: () => ring.destroy(),
    });

    this.scene.tweens.add({
      targets: obj.container,
      scaleX: 1.35,
      scaleY: 1.35,
      duration: animDuration(250),
      ease: "Back.Out",
      yoyo: true,
      onComplete: () => {
        obj.container.setScale(LUDO_TOKEN_VISUAL_CONFIG.finishedScale);
      },
    });
  }

  // ─── Winner Celebration ─────────────────────────────────────────────────────

  celebrateWinner(color: PlayerColor): void {
    for (const [, obj] of this.tokenObjects) {
      if (obj.token.color !== color) continue;
      this.scene.tweens.add({
        targets: obj.container,
        y: obj.container.y - 18,
        scaleX: 1.25,
        scaleY: 1.25,
        duration: animDuration(350),
        ease: "Back.Out",
        yoyo: true,
        repeat: 4,
      });
    }
  }

  // ─── Synchronization & Idle Animations ─────────────────────────────────────

  syncToken(token: Token): void {
    const obj = this.tokenObjects.get(token.id);
    if (!obj) return;

    obj.token = token;

    if (token.state === "finished") {
      this.stopIdleAnimation(obj);
      this.scene.tweens.add({
        targets: obj.container,
        scaleX: LUDO_TOKEN_VISUAL_CONFIG.finishedScale,
        scaleY: LUDO_TOKEN_VISUAL_CONFIG.finishedScale,
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
      obj.container.setScale(LUDO_TOKEN_VISUAL_CONFIG.finishedScale);
    } else if (token.state === "yard") {
      obj.container.setScale(LUDO_TOKEN_VISUAL_CONFIG.yardScale);
      if (!obj.idleTween) {
        this.startIdleAnimation(obj);
      }
    } else {
      obj.container.setScale(LUDO_TOKEN_VISUAL_CONFIG.baseScale);
      this.stopIdleAnimation(obj);
    }
  }

  killAllTweens(): void {
    if (this.pathOverlay) {
      this.pathOverlay.clear();
    }
    for (const [, obj] of this.tokenObjects) {
      this.scene.tweens.killTweensOf(obj.container);
      this.scene.tweens.killTweensOf(obj.glowGraphics);
      obj.glowTween = undefined;
      obj.idleTween = undefined;
    }
  }

  private startIdleAnimation(obj: TokenObject): void {
    obj.idleTween?.stop();
    obj.idleTween = this.scene.tweens.add({
      targets: obj.container,
      y: obj.container.y - 3,
      duration: 1000 + Math.random() * 400,
      ease: "Sine.InOut",
      yoyo: true,
      repeat: -1,
    });
  }

  private stopIdleAnimation(obj: TokenObject): void {
    obj.idleTween?.stop();
    obj.idleTween = undefined;
  }

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

  getTokenObject(id: string): TokenObject | undefined {
    return this.tokenObjects.get(id);
  }
}

export { TokenManager };
