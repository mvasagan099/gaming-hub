import Phaser from "phaser";
import BoardManager from "../managers/BoardManager";
import PlayerManager from "../managers/PlayerManager";
import DiceManager from "../managers/DiceManager";
import GameManager from "../managers/GameManager";
import MultiplayerDriver from "../managers/MultiplayerDriver";
import { SnakeManager } from "../managers/SnakeManager";
import { LadderManager } from "../managers/LadderManager";
import { HUDManager } from "../managers/HUDManager";
import { AudioManager } from "../managers/AudioManager";
import { ParticleManager } from "../managers/ParticleManager";
import WinnerPopup from "../ui/WinnerPopup";
import { GameEvents } from "../events/GameEvents";
import type { MoveHistoryEntry } from "../managers/GameManager";

export default class SnakeLadderScene extends Phaser.Scene {
  private board!: BoardManager;
  private playerManager!: PlayerManager;
  private dice!: DiceManager;
  private gameManager!: GameManager;
  private multiplayerDriver!: MultiplayerDriver;
  private hud!: HUDManager;
  private snakeManager!: SnakeManager;
  private ladderManager!: LadderManager;
  private audio!: AudioManager;
  private particles!: ParticleManager;
  private winnerPopup!: WinnerPopup;

  constructor() {
    super("SnakeLadderScene");
  }

  create(): void {
    const mode  = (this.registry.get("mode")  as "ai" | "pvp") ?? "ai";
    const count = (this.registry.get("players") as number) ?? 2;
    const mySeat = (this.registry.get("seat") as number | null | undefined) ?? null;
    const names = (this.registry.get("names") as string[] | undefined) ?? [];

    // ── 1. Board (depth 0–3) ─────────────────────────────────────────────
    this.board = new BoardManager(this, 800);
    this.board.drawBoard();

    // ── 2. Snakes & Ladders (depth 4–5) ─────────────────────────────────
    this.snakeManager  = new SnakeManager();
    this.ladderManager = new LadderManager();
    this.snakeManager.drawSnakes(this, this.board);
    this.ladderManager.drawLadders(this, this.board);

    // ── 3. Particles (depth 6, 150) ──────────────────────────────────────
    this.particles = new ParticleManager(this);

    // ── 4. Players (depth 50) ────────────────────────────────────────────
    this.playerManager = new PlayerManager(this, this.board);
    this.playerManager.createPlayers(count);
    if (names.length > 0) this.playerManager.setNames(names);

    // ── 5. HUD sidebar (depth 10, below dice) ───────────────────────────
    this.hud = new HUDManager(this);
    this.hud.create(count);

    // ── 6. Dice (depth 100, topmost interactive element) ────────────────
    this.dice = new DiceManager(this);
    this.dice.create(912, 210);

    // ── 7. Winner popup (depth 200) ──────────────────────────────────────
    this.winnerPopup = new WinnerPopup(this, this.particles);
    this.winnerPopup.create();

    // ── 8. Audio ─────────────────────────────────────────────────────────
    this.audio = new AudioManager(this);
    this.audio.init();

    // ── 9. Game logic — server-driven in multiplayer, local otherwise ────
    if (mode === "pvp") {
      this.multiplayerDriver = new MultiplayerDriver(
        this,
        this.board,
        this.playerManager,
        this.dice,
        this.hud,
        this.winnerPopup,
        mySeat,
      );
      this.multiplayerDriver.start();
    } else {
      this.gameManager = new GameManager(
        this,
        this.board,
        this.playerManager,
        this.dice,
        this.snakeManager,
        this.ladderManager,
        this.hud
      );
      this.gameManager.init(mode, count);
    }

    // ── 10. Event bindings ────────────────────────────────────────────────
    this.events.on(GameEvents.DICE_ROLL_STARTED, () => {
      this.audio.play("roll");
    });

    this.events.on(GameEvents.TILE_REACHED, () => {
      this.audio.play("move");
    });

    this.events.on(GameEvents.SNAKE_HIT, (playerId: number, from: number, to: number) => {
      this.audio.play("snake");
      const fromPos = this.board.getTilePosition(from);
      this.particles.burstAt(fromPos.x, fromPos.y, 20);
      void playerId; void to;
    });

    this.events.on(GameEvents.LADDER_CLIMB, (playerId: number, from: number, to: number) => {
      this.audio.play("ladder");
      const fromPos = this.board.getTilePosition(from);
      this.particles.tileSparkle(fromPos.x, fromPos.y, 0x10b981);
      void playerId; void to;
    });

    this.events.on(GameEvents.GAME_OVER, (payload: { name: string; history: MoveHistoryEntry[] }) => {
      this.audio.play("win");
      this.time.delayedCall(600, () => {
        this.winnerPopup.show(payload.name, payload.history);
      });
    });

    this.events.on(GameEvents.MOVEMENT_FINISHED, (playerId: number, tile: number) => {
      const color = [0xef4444, 0x10b981, 0x3b82f6, 0xf59e0b][(playerId - 1) % 4] ?? 0xffffff;
      this.board.highlightTile(tile, color);
    });
  }
}
