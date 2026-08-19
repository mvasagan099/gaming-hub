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
}

/** Per-player pixel offsets so tokens don't overlap on the same tile */
const OFFSETS: Array<{ x: number; y: number }> = [
  { x: -12, y: -12 },
  { x:  12, y:  12 },
  { x: -12, y:  12 },
  { x:  12, y: -12 },
];

const PLAYER_COLORS = [0xef4444, 0x10b981, 0x3b82f6, 0xf59e0b];
const PLAYER_INITIALS = ["P1", "P2", "P3", "P4"];

export default class PlayerManager {
  private scene: Phaser.Scene;
  private board: BoardManager;
  private players: Player[] = [];
  private isMoving = false;
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

    const g = this.scene.add.graphics();

    // Outer glow ring (semi-transparent)
    const glowRing = this.scene.add.circle(0, 0, 22, color, ANIM.tokenGlowAlphaNormal);

    // Shadow ellipse beneath pawn
    g.fillStyle(0x000000, 0.35);
    g.fillEllipse(2, 6, 28, 10);

    // Main body — two-tone gradient (lighter top, darker bottom)
    g.fillStyle(color, 1);
    g.fillCircle(0, 0, 16);

    // Darker lower hemisphere
    const darkColor = Phaser.Display.Color.IntegerToColor(color);
    darkColor.darken(30);
    g.fillStyle(darkColor.color, 0.5);
    g.fillEllipse(0, 5, 28, 14);

    // Border
    const borderColor = Phaser.Display.Color.IntegerToColor(color);
    borderColor.darken(50);
    g.lineStyle(2.5, borderColor.color, 1);
    g.strokeCircle(0, 0, 16);

    // Dome highlight (upper-left arc)
    g.fillStyle(0xffffff, 0.35);
    g.fillEllipse(-4, -5, 14, 10);

    // Specular dot
    g.fillStyle(0xffffff, 0.7);
    g.fillCircle(-5, -6, 3.5);

    // Label text
    const label = this.scene.add.text(0, 1, initial, {
      fontSize: "11px",
      color: "#ffffff",
      fontFamily: "Outfit, sans-serif",
      fontStyle: "bold",
      stroke: "#000000",
      strokeThickness: 2,
    }).setOrigin(0.5);

    const container = this.scene.add.container(
      startPos.x + offset.x,
      startPos.y + offset.y,
      [glowRing, g, label],
    );
    container.setDepth(50);

    return { id, name: `Player ${id}`, tile: 1, container, label, finished: false, color, glowRing };
  }


  getPlayers(): Player[] {
    return this.players;
  }

  getPlayer(id: number): Player | undefined {
    return this.players.find((p) => p.id === id);
  }

  /** Instantly place a token on a tile (used for authoritative sync). */
  placeAt(playerId: number, tile: number): void {
    const player = this.getPlayer(playerId);
    if (!player) return;
    player.tile = tile;
    const pos = this.board.getTilePosition(tile);
    const offset = OFFSETS[(player.id - 1) % OFFSETS.length] ?? { x: 0, y: 0 };
    player.container.setPosition(pos.x + offset.x, pos.y + offset.y);
  }

  /** Override token names + initials with real display names (multiplayer). */
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

  /** Set the active (current-turn) player — glows the active token, dims others. */
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

  /**
   * Animate token moving tile-by-tile from current position.
   * Calls onComplete when done.
   */
  movePlayer(playerId: number, steps: number, onComplete?: () => void): void {
    const player = this.getPlayer(playerId);
    if (!player) {
      onComplete?.();
      return;
    }
    this.isMoving = false;
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

        // Landing bounce with squish
        this.scene.tweens.add({
          targets: player.container,
          scaleX: ANIM.landingBounceScale,
          scaleY: ANIM.landingSquashY,
          duration: animDuration(80),
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

      // Move container to next tile
      this.scene.tweens.add({
        targets: player.container,
        x: pos.x + offset.x,
        y: pos.y + offset.y,
        duration: stepDur,
        ease: ANIM.tokenStepEase,
        onComplete: hop,
      });

      if (!reduced) {
        // Hop the graphics inside the container
        const children = player.container.list;
        this.scene.tweens.add({
          targets: children,
          y: ANIM.bounceHeight,
          duration: animDuration(ANIM.bounceDuration),
          yoyo: true,
          ease: "Sine.Out",
        });
      }
    };

    hop();
  }

  /**
   * Slide token to a tile after a snake or ladder event.
   * Always resets isMoving so the next turn can proceed.
   */
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

  /**
   * Animate token following a curved path (for snake/ladder visual).
   * Each point in the path is visited sequentially, then onComplete fires.
   */
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

  /** Find the closest tile number to a world position. */
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
