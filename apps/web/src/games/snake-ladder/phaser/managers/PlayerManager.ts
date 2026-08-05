import Phaser from "phaser";
import type BoardManager from "./BoardManager";
import { GameEvents } from "../events/GameEvents";

export interface Player {
  id: number;
  name: string;
  tile: number;
  container: Phaser.GameObjects.Container;
  circle: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
  finished: boolean;
  color: number;
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
    const color   = PLAYER_COLORS[(id - 1) % PLAYER_COLORS.length] ?? 0x94a3b8;
    const initial = PLAYER_INITIALS[(id - 1) % PLAYER_INITIALS.length] ?? `P${id}`;
    const offset  = OFFSETS[(id - 1) % OFFSETS.length] ?? { x: 0, y: 0 };
    const startPos = this.board.getTilePosition(1);

    // 3D pawn graphic using layered circles
    const g = this.scene.add.graphics();

    // Shadow ellipse beneath pawn
    g.fillStyle(0x000000, 0.3);
    g.fillEllipse(2, 5, 26, 8);

    // Main body
    g.fillStyle(color, 1);
    g.fillCircle(0, 0, 14);

    // Dark border
    const darkColor = Phaser.Display.Color.IntegerToColor(color);
    darkColor.darken(45);
    g.lineStyle(2.5, darkColor.color, 1);
    g.strokeCircle(0, 0, 14);

    // Dome highlight (upper-left arc)
    g.fillStyle(0xffffff, 0.3);
    g.fillEllipse(-4, -5, 12, 8);

    // Specular dot
    g.fillStyle(0xffffff, 0.65);
    g.fillCircle(-5, -6, 3);

    // Label text
    const label = this.scene.add.text(0, 1, initial, {
      fontSize: "10px",
      color: "#ffffff",
      fontFamily: "Outfit, sans-serif",
      fontStyle: "bold",
    }).setOrigin(0.5);

    // Transparent arc used as type-compatible circle reference
    const circle = this.scene.add.circle(0, 0, 14, color, 0);

    const container = this.scene.add.container(
      startPos.x + offset.x,
      startPos.y + offset.y,
      [g, circle, label]
    );
    container.setDepth(50);

    return { id, name: `Player ${id}`, tile: 1, container, circle, label, finished: false, color };
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

  /**
   * Animate token moving tile-by-tile from current position.
   * Calls onComplete when done.
   * Note: dice is disabled during movement so concurrent calls cannot happen.
   */
  movePlayer(playerId: number, steps: number, onComplete?: () => void): void {
    const player = this.getPlayer(playerId);
    if (!player) {
      onComplete?.();
      return;
    }
    // Force-reset any stale flag so the move always starts cleanly
    this.isMoving = false;


    this.isMoving = true;
    this.scene.events.emit(GameEvents.MOVEMENT_STARTED, player.id);

    const startTile  = player.tile;
    const targetTile = Math.min(startTile + steps, 100);

    if (startTile + steps > 100) {
      // Over-shoot: stay put (caller already resolved this case)
      this.isMoving = false;
      onComplete?.();
      return;
    }

    const offset = OFFSETS[(player.id - 1) % OFFSETS.length] ?? { x: 0, y: 0 };
    let current  = startTile;

    const hop = () => {
      if (current >= targetTile) {
        player.tile = targetTile;
        this.isMoving = false;
        this.scene.events.emit(GameEvents.MOVEMENT_FINISHED, player.id, targetTile);
        // Bounce on landing
        this.scene.tweens.add({
          targets: player.container,
          y: player.container.y - 8,
          duration: 100,
          ease: "Sine.Out",
          yoyo: true,
          onComplete: () => onComplete?.(),
        });
        return;
      }

      current++;
      const pos = this.board.getTilePosition(current);
      this.scene.events.emit(GameEvents.TILE_REACHED, player.id, current);

      // Move container directly to target tile
      this.scene.tweens.add({
        targets: player.container,
        x: pos.x + offset.x,
        y: pos.y + offset.y,
        duration: 150,
        ease: "Linear",
        onComplete: hop,
      });
      
      // Bounce the children inside the container
      const [g, circle, label] = player.container.list;
      this.scene.tweens.add({
        targets: [g, circle, label],
        y: -25, // bounce height
        duration: 75,
        yoyo: true,
        ease: "Sine.Out",
      });
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
      this.isMoving = false;   // always reset
      onComplete?.();
      return;
    }

    player.tile = tile;
    const pos    = this.board.getTilePosition(tile);
    const offset = OFFSETS[(player.id - 1) % OFFSETS.length] ?? { x: 0, y: 0 };

    this.scene.tweens.add({
      targets: player.container,
      x: pos.x + offset.x,
      y: pos.y + offset.y,
      duration: 500,
      ease: "Back.Out",
      onComplete: () => {
        this.isMoving = false;   // ← critical: unblock future moves
        this.scene.events.emit(GameEvents.MOVEMENT_FINISHED, player.id, tile);
        onComplete?.();
      },
    });
  }

  reset(): void {
    this.isMoving = false;
    this.players.forEach((player, idx) => {
      player.tile     = 1;
      player.finished = false;
      const pos    = this.board.getTilePosition(1);
      const offset = OFFSETS[idx % OFFSETS.length] ?? { x: 0, y: 0 };
      player.container.setPosition(pos.x + offset.x, pos.y + offset.y);
    });
  }

  resetPlayers(): void {
    this.reset();
  }
}

export { PlayerManager };
