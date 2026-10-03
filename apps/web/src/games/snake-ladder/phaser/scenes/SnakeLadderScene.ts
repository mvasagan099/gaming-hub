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
import { FeedbackText } from "../ui/FeedbackText";
import { CountdownOverlay } from "../ui/CountdownOverlay";
import { GameEvents } from "../events/GameEvents";
import { ANIM, animDuration, prefersReducedMotion } from "../constants";
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
  private feedback!: FeedbackText;
  private countdown!: CountdownOverlay;

  constructor() {
    super("SnakeLadderScene");
  }

  create(): void {
    const isPortrait = (this.registry.get("isPortrait") as boolean) ?? false;
    const mode = (this.registry.get("mode") as "ai" | "pvp") ?? "ai";
    const count = (this.registry.get("players") as number) ?? 2;
    const mySeat = (this.registry.get("seat") as number | null | undefined) ?? null;
    const names = (this.registry.get("names") as string[] | undefined) ?? [];
    const reduced = prefersReducedMotion();

    const canvasW = isPortrait ? 720 : 1024;
    const canvasH = isPortrait ? 1080 : 800;

    // ── 0. Atmospheric Ambient Backdrop & Vignette (depth -1) ───────────
    const bgG = this.add.graphics();
    bgG.setDepth(-1);

    // Deep gradient fill
    bgG.fillGradientStyle(0x0b1120, 0x0b1120, 0x030712, 0x030712, 1);
    bgG.fillRect(0, 0, canvasW, canvasH);

    // Ambient radial lighting behind board
    bgG.fillStyle(0x1e3a8a, 0.25);
    bgG.fillCircle(isPortrait ? 360 : 400, isPortrait ? 470 : 400, isPortrait ? 330 : 360);
    bgG.fillStyle(0x3b82f6, 0.08);
    bgG.fillCircle(isPortrait ? 360 : 400, isPortrait ? 470 : 400, isPortrait ? 220 : 240);

    // ── 1. Board (depth 0–3) ─────────────────────────────────────────────
    const boardSize = isPortrait ? 660 : 680;
    const boardOffsetX = isPortrait ? 30 : 60;
    const boardOffsetY = isPortrait ? 140 : 60;
    this.board = new BoardManager(this, boardSize, boardOffsetX, boardOffsetY);
    this.board.drawBoard();


    // ── 2. Snakes & Ladders (depth 4–5) ─────────────────────────────────
    this.snakeManager = new SnakeManager();
    this.ladderManager = new LadderManager();
    this.snakeManager.drawSnakes(this, this.board);
    this.ladderManager.drawLadders(this, this.board);

    // ── 3. Particles (depth 6, 150) ──────────────────────────────────────
    this.particles = new ParticleManager(this);

    // ── 4. Players (depth 50) ────────────────────────────────────────────
    this.playerManager = new PlayerManager(this, this.board);
    this.playerManager.createPlayers(count);
    if (names.length > 0) this.playerManager.setNames(names);

    // ── 5. HUD sidebar / mobile header & deck (depth 10) ─────────────────
    this.hud = new HUDManager(this);
    this.hud.create(count, isPortrait);
    if (names.length > 0) this.hud.setNames(names);

    // ── 6. Dice (depth 100) ─────────────────────────────────────────────
    this.dice = new DiceManager(this);
    this.dice.create(isPortrait ? 185 : 912, isPortrait ? 950 : 210);

    // ── 7. Feedback text ─────────────────────────────────────────────────
    this.feedback = new FeedbackText(this);

    // ── 8. Winner popup (depth 200) ──────────────────────────────────────
    this.winnerPopup = new WinnerPopup(this, this.particles);
    this.winnerPopup.create();

    // ── 9. Countdown overlay ─────────────────────────────────────────────
    this.countdown = new CountdownOverlay(this);

    // ── 10. Audio ────────────────────────────────────────────────────────
    this.audio = new AudioManager(this);
    this.audio.init();
    this.hud.onSoundToggle(() => this.audio.toggleMute());

    // ── 11. Board entry animation ────────────────────────────────────────
    if (!reduced) {
      this.cameras.main.fadeIn(animDuration(ANIM.boardEntryDuration), 0, 0, 0);
    }

    // ── 12. Start game logic ─────────────────────────────────────────────
    const startGame = () => {
      if (mode === "pvp") {
        this.multiplayerDriver = new MultiplayerDriver(
          this,
          this.board,
          this.playerManager,
          this.dice,
          this.hud,
          this.snakeManager,
          this.ladderManager,
          this.feedback,
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
          this.hud,
          this.feedback,
        );
        this.gameManager.init(mode, count);
      }
    };

    // Check if game is already in progress (reconnect) — skip countdown
    const isReconnect = mode === "pvp" && mySeat != null;
    if (isReconnect) {
      startGame();
    } else {
      // Show countdown, then start
      this.countdown.show(names, count, startGame);
    }

    // ── 13. Event bindings ────────────────────────────────────────────────
    this.events.on(GameEvents.DICE_ROLL_STARTED, () => {
      this.audio.play("roll");
    });

    this.events.on(GameEvents.TILE_REACHED, () => {
      this.audio.play("move");
    });

    this.events.on(GameEvents.SNAKE_HIT, (_playerId: number, from: number, _to: number) => {
      this.audio.play("snake");
      const fromPos = this.board.getTilePosition(from);
      this.particles.burstAt(fromPos.x, fromPos.y, reduced ? 10 : 20);
    });

    this.events.on(GameEvents.LADDER_CLIMB, (_playerId: number, from: number, _to: number) => {
      this.audio.play("ladder");
      const fromPos = this.board.getTilePosition(from);
      this.particles.tileSparkle(fromPos.x, fromPos.y, 0x10b981);
    });

    this.events.on(GameEvents.GAME_OVER, (payload: { name: string; history: MoveHistoryEntry[] }) => {
      this.audio.play("win");
      this.time.delayedCall(animDuration(600), () => {
        this.winnerPopup.show(payload.name, payload.history);
      });
    });

    this.events.on(GameEvents.MOVEMENT_FINISHED, (playerId: number, tile: number) => {
      const color = [0xef4444, 0x10b981, 0x3b82f6, 0xf59e0b][(playerId - 1) % 4] ?? 0xffffff;
      this.board.highlightTile(tile, color);
    });
  }

  public updateNames(names: string[]): void {
    if (!names || names.length === 0) return;
    if (this.playerManager) {
      this.playerManager.setNames(names);
    }
    if (this.hud) {
      this.hud.setNames(names);
    }
  }
}
