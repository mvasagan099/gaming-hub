import Phaser from "phaser";
import type BoardManager from "./BoardManager";
import { GameEvents } from "../events/GameEvents";
import { ANIM, animDuration, prefersReducedMotion } from "../constants";

export interface Player {
  id: number;
  name: string;
  tile: number;
  container: Phaser.GameObjects.Container;
  label: Phaser.GameObjects.Text;
  finished: boolean;
  color: number;
  glowRing: Phaser.GameObjects.Arc;
  shadowGraphic: Phaser.GameObjects.Graphics;
  pawnGraphic: Phaser.GameObjects.Graphics;
}

export const PLAYER_COLORS = [0x3b82f6, 0xef4444, 0x10b981, 0xf59e0b];
export const PLAYER_HEX = ["#3b82f6", "#ef4444", "#10b981", "#f59e0b"];
const PLAYER_INITIALS = ["P1", "P2", "P3", "P4"];

const OFFSETS = [
  { x: -10, y: -10 },
  { x:  10, y: -10 },
  { x: -10, y:  10 },
  { x:  10, y:  10 },
];

export default class PlayerManager {
  private scene: Phaser.Scene;
  private board: BoardManager;
  private players: Player[] = [];
  public isMoving = false;
  private activePlayerId: number | null = null;

  constructor(scene: Phaser.Scene, board: BoardManager) {
    this.scene = scene;
    this.board = board;
  }

  createPlayers(count = 2): void {
    this.players = [];
    for (let i = 0; i < count; i++) {
      this.players.push(this.createPlayer(i + 1));
    }
  }

  private createPlayer(id: number): Player {
    const color = PLAYER_COLORS[(id - 1) % PLAYER_COLORS.length] ?? 0x94a3b8;
    const initial = PLAYER_INITIALS[(id - 1) % PLAYER_INITIALS.length] ?? `P${id}`;
    const offset = OFFSETS[(id - 1) % OFFSETS.length] ?? { x: 0, y: 0 };
    const startPos = this.board.getTilePosition(1);

    // ── 1. Dynamic Contact Shadow Graphic ──
    const shadowGraphic = this.scene.add.graphics();
    this.drawTokenShadow(shadowGraphic, 1, 1);

    // ── 2. Pulsing Active Aura Ring ──
    const glowRing = this.scene.add.circle(0, 0, 24, color, ANIM.tokenGlowAlphaNormal);

    // ── 3. 3D Volumetric Pawn Graphic ──
    const pawnGraphic = this.scene.add.graphics();
    this.draw3DPawn(pawnGraphic, color);

    // ── 4. Embossed Player Label ──
    const label = this.scene.add.text(0, -2, initial, {
      fontSize: "11px",
      color: "#ffffff",
      fontFamily: "Outfit, sans-serif",
      fontStyle: "bold",
      stroke: "#000000",
      strokeThickness: 2.5,
    }).setOrigin(0.5);

    const container = this.scene.add.container(
      startPos.x + offset.x,
      startPos.y + offset.y,
      [shadowGraphic, glowRing, pawnGraphic, label],
    );
    container.setDepth(50);

    return {
      id,
      name: `Player ${id}`,
      tile: 1,
      container,
      label,
      finished: false,
      color,
      glowRing,
      shadowGraphic,
      pawnGraphic,
    };
  }

  private drawTokenShadow(g: Phaser.GameObjects.Graphics, scale = 1, alpha = 0.45): void {
    g.clear();
    // Multi-tier soft contact shadow under pawn
    g.fillStyle(0x000000, alpha * 0.5);
    g.fillEllipse(1, 9, 32 * scale, 12 * scale);
    g.fillStyle(0x000000, alpha);
    g.fillEllipse(0, 8, 22 * scale, 8 * scale);
  }

  private draw3DPawn(g: Phaser.GameObjects.Graphics, color: number): void {
    g.clear();

    const darkColor = Phaser.Display.Color.IntegerToColor(color);
    darkColor.darken(45);

    const midDark = Phaser.Display.Color.IntegerToColor(color);
    midDark.darken(25);

    const brightColor = Phaser.Display.Color.IntegerToColor(color);
    brightColor.lighten(20);

    // ── Layer 1: Metallic Beveled Base Rim ──
    g.fillStyle(0x000000, 0.4);
    g.fillEllipse(0, 7, 30, 11);

    g.fillStyle(darkColor.color, 1);
    g.fillEllipse(0, 6, 28, 10);

    g.fillStyle(color, 1);
    g.fillEllipse(0, 4, 26, 9);

    g.fillStyle(0xffffff, 0.4);
    g.fillEllipse(-4, 2, 16, 4);

    // ── Layer 2: Conical Pawn Waist & Body ──
    g.fillStyle(darkColor.color, 1);
    g.fillCircle(0, 0, 15);

    // Lower shaded hemisphere
    g.fillStyle(midDark.color, 1);
    g.fillCircle(0, -1, 14.5);

    // Main vibrant body
    g.fillStyle(color, 1);
    g.fillCircle(-1, -2, 13.5);

    // ── Layer 3: Spherical Crown Dome ──
    // Directional highlight (top-left light source)
    g.fillStyle(brightColor.color, 0.9);
    g.fillEllipse(-3, -4, 16, 12);

    // Primary specular sheen
    g.fillStyle(0xffffff, 0.5);
    g.fillEllipse(-4, -5, 11, 7);

    // Intense specular glint spot
    g.fillStyle(0xffffff, 0.95);
    g.fillCircle(-5, -6, 3);

    // Inset golden rim border
    g.lineStyle(1.5, 0x000000, 0.35);
    g.strokeCircle(0, 0, 15);
  }

  getPlayers(): Player[] {
    return this.players;
  }

  getPlayer(id: number): Player | undefined {
    return this.players.find((p) => p.id === id);
  }

  placeAt(playerId: number, tile: number): void {
    const player = this.getPlayer(playerId);
    if (!player) return;
    player.tile = tile;
    const pos = this.board.getTilePosition(tile);
    const offset = OFFSETS[(player.id - 1) % OFFSETS.length] ?? { x: 0, y: 0 };
    player.container.setPosition(pos.x + offset.x, pos.y + offset.y);
  }

  setNames(names: string[]): void {
    this.players.forEach((player, index) => {
      const name = names[index];
      if (!name) return;
      player.name = name;
      const initials =
        name
          .split(/\s+/)
          .map((word) => word.charAt(0))
          .join("")
          .slice(0, 2)
          .toUpperCase() || `P${player.id}`;
      player.label.setText(initials);
    });
  }

  setActivePlayer(playerId: number): void {
    if (this.activePlayerId === playerId) return;
    this.activePlayerId = playerId;
    const reduced = prefersReducedMotion();

    for (const p of this.players) {
      const isActive = p.id === playerId;
      const targetScale = isActive ? ANIM.activeTokenScale : ANIM.normalTokenScale;
      const targetGlowAlpha = isActive ? ANIM.tokenGlowAlphaActive : ANIM.tokenGlowAlphaNormal;

      if (reduced) {
        p.container.setScale(targetScale);
        p.glowRing.setAlpha(targetGlowAlpha);
      } else {
        this.scene.tweens.add({
          targets: p.container,
          scale: targetScale,
          duration: animDuration(250),
          ease: "Back.Out",
        });
        this.scene.tweens.add({
          targets: p.glowRing,
          alpha: targetGlowAlpha,
          duration: animDuration(250),
          ease: "Sine.InOut",
        });
      }
    }
  }

  movePlayer(playerId: number, steps: number, onComplete?: () => void): void {
    const player = this.getPlayer(playerId);
    if (!player) {
      onComplete?.();
      return;
    }
    this.isMoving = true;
    this.scene.events.emit(GameEvents.MOVEMENT_STARTED, player.id);

    const startTile = player.tile;
    const targetTile = Math.min(startTile + steps, 100);

    if (startTile + steps > 100) {
      this.isMoving = false;
      onComplete?.();
      return;
    }

    const offset = OFFSETS[(player.id - 1) % OFFSETS.length] ?? { x: 0, y: 0 };
    let current = startTile;
    const reduced = prefersReducedMotion();

    const hop = () => {
      if (current >= targetTile) {
        player.tile = targetTile;
        this.isMoving = false;
        this.scene.events.emit(GameEvents.MOVEMENT_FINISHED, player.id, targetTile);

        if (reduced) {
          onComplete?.();
          return;
        }

        this.scene.tweens.add({
          targets: player.container,
          scaleX: ANIM.landingBounceScale,
          scaleY: ANIM.landingSquashY,
          duration: animDuration(ANIM.landingBounceDuration / 2),
          ease: "Sine.Out",
          yoyo: true,
          onComplete: () => {
            player.container.setScale(1);
            onComplete?.();
          },
        });
        return;
      }

      current++;
      const pos = this.board.getTilePosition(current);
      this.scene.events.emit(GameEvents.TILE_REACHED, player.id, current);

      const stepDur = reduced ? 0 : animDuration(ANIM.tokenStepDuration);

      this.scene.tweens.add({
        targets: player.container,
        x: pos.x + offset.x,
        y: pos.y + offset.y,
        duration: stepDur,
        ease: ANIM.tokenStepEase,
        onComplete: hop,
      });

      if (!reduced) {
        const liftTargets = [player.pawnGraphic, player.label, player.glowRing];
        this.scene.tweens.add({
          targets: liftTargets,
          y: ANIM.tokenLiftHeight,
          duration: animDuration(ANIM.tokenLiftDuration),
          yoyo: true,
          ease: "Sine.Out",
        });

        this.scene.tweens.add({
          targets: player.shadowGraphic,
          scaleX: ANIM.tokenShadowMinScale,
          scaleY: ANIM.tokenShadowMinScale,
          alpha: 0.25,
          duration: animDuration(ANIM.tokenLiftDuration),
          yoyo: true,
          ease: "Sine.Out",
          onComplete: () => {
            this.drawTokenShadow(player.shadowGraphic, 1, ANIM.tokenShadowMaxAlpha);
          },
        });
      }
    };
    hop();
  }

  snapToTile(playerId: number, tile: number, onComplete?: () => void): void {
    const player = this.getPlayer(playerId);
    if (!player) {
      this.isMoving = false;
      onComplete?.();
      return;
    }

    player.tile = tile;
    const pos = this.board.getTilePosition(tile);
    const offset = OFFSETS[(player.id - 1) % OFFSETS.length] ?? { x: 0, y: 0 };
    const reduced = prefersReducedMotion();
    const dur = reduced ? 0 : animDuration(ANIM.snakeDuration);

    this.scene.tweens.add({
      targets: player.container,
      x: pos.x + offset.x,
      y: pos.y + offset.y,
      duration: dur,
      ease: "Cubic.InOut",
      onComplete: () => {
        this.isMoving = false;
        this.scene.events.emit(GameEvents.MOVEMENT_FINISHED, player.id, tile);
        onComplete?.();
      },
    });
  }

  animateAlongPath(
    playerId: number,
    path: Phaser.Math.Vector2[],
    onComplete?: () => void,
  ): void {
    const player = this.getPlayer(playerId);
    if (!player || path.length === 0) {
      this.isMoving = false;
      onComplete?.();
      return;
    }

    const offset = OFFSETS[(player.id - 1) % OFFSETS.length] ?? { x: 0, y: 0 };
    const reduced = prefersReducedMotion();
    const stepDur = reduced ? 0 : animDuration(Math.round(ANIM.snakeDuration / path.length));

    let i = 0;
    const step = () => {
      if (i >= path.length) {
        const last = path[path.length - 1];
        player.tile = this.getClosestTile(last);
        this.isMoving = false;
        this.scene.events.emit(GameEvents.MOVEMENT_FINISHED, player.id, player.tile);
        onComplete?.();
        return;
      }
      const pt = path[i];
      this.scene.tweens.add({
        targets: player.container,
        x: pt.x + offset.x,
        y: pt.y + offset.y,
        duration: stepDur,
        ease: "Sine.InOut",
        onComplete: () => { i++; step(); },
      });
    };
    step();
  }

  private getClosestTile(pos: Phaser.Math.Vector2): number {
    let best = 1;
    let bestDist = Infinity;
    for (let t = 1; t <= 100; t++) {
      const tp = this.board.getTilePosition(t);
      const d = Phaser.Math.Distance.Between(pos.x, pos.y, tp.x, tp.y);
      if (d < bestDist) { bestDist = d; best = t; }
    }
    return best;
  }

  reset(): void {
    this.isMoving = false;
    this.activePlayerId = null;
    this.players.forEach((player, idx) => {
      player.tile = 1;
      player.finished = false;
      player.container.setScale(1);
      player.glowRing.setAlpha(ANIM.tokenGlowAlphaNormal);
      const pos = this.board.getTilePosition(1);
      const offset = OFFSETS[idx % OFFSETS.length] ?? { x: 0, y: 0 };
      player.container.setPosition(pos.x + offset.x, pos.y + offset.y);
    });
  }

  resetPlayers(): void {
    this.reset();
  }
}

export { PlayerManager };
