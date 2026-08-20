import Phaser from "phaser";
import BoardManager, { BOARD_OFFSET_X, BOARD_OFFSET_Y, BOARD_PX, CELL_SIZE } from "../managers/BoardManager";
import PieceManager from "../managers/PieceManager";
import GameManager from "../managers/GameManager";
import ChessMultiplayerDriver from "../managers/ChessMultiplayerDriver";
import HUDManager from "../managers/HUDManager";
import ThemeManager from "../managers/ThemeManager";
import AudioManager from "../../../snake-ladder/phaser/managers/AudioManager";
import type { ChessSettings } from "../types/chess.types";
import { ChessEvents } from "../events/ChessEvents";

export default class ChessScene extends Phaser.Scene {
  private board!: BoardManager;
  private pieceManager!: PieceManager;
  private gameManager!: GameManager;
  private multiplayerDriver!: ChessMultiplayerDriver;
  private hud!: HUDManager;
  private themeManager!: ThemeManager;
  private audio!: AudioManager;

  constructor() {
    super("ChessScene");
  }

  create(): void {
    const mode   = (this.registry.get("mode") as "ai" | "pvp") ?? "ai";
    const online = (this.registry.get("online") as boolean) ?? false;
    const level  = (this.registry.get("aiLevel") as number) ?? 2;
    const theme  = (this.registry.get("theme") as any) ?? "classic";
    const seat   = (this.registry.get("seat") as number | null | undefined) ?? null;
    const names  = (this.registry.get("names") as string[] | undefined) ?? [];

    const settings: ChessSettings = {
      mode,
      aiLevel: level,
      theme,
      flipBoard: false,
    };

    // 1. Audio & Theme
    this.audio = new AudioManager(this);
    this.audio.init();

    this.themeManager = new ThemeManager(theme);

    // 2. Board Manager (depth 0–4)
    this.board = new BoardManager(this, this.themeManager);
    this.board.drawBoard(online && seat === 1);

    // 3. Piece Manager (depth 50)
    this.pieceManager = new PieceManager(this, this.board);

    // 4. In-scene HUD
    this.hud = new HUDManager(this);

    // 5. Game logic — server-driven in multiplayer, local otherwise
    if (online) {
      this.multiplayerDriver = new ChessMultiplayerDriver(
        this,
        this.board,
        this.pieceManager,
        this.hud,
        this.audio,
        seat,
        names,
      );
      this.multiplayerDriver.start();
    } else {
      this.gameManager = new GameManager(
        this,
        this.board,
        this.pieceManager,
        this.hud,
        this.audio,
        settings
      );
      this.gameManager.init();
    }

    // Click on empty board squares listener
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      // Ignore if pointer clicked over an interactive piece zone (handled by PieceManager)
      const hitObjects = this.input.hitTestPointer(pointer);
      if (hitObjects && hitObjects.length > 0) return;

      const px = pointer.x - BOARD_OFFSET_X;
      const py = pointer.y - BOARD_OFFSET_Y;
      if (px >= 0 && px <= BOARD_PX && py >= 0 && py <= BOARD_PX) {
        const col = Math.floor(px / CELL_SIZE);
        const row = Math.floor(py / CELL_SIZE);
        const square = this.board.gridToSquare(col, row);
        if (square) {
          this.events.emit(ChessEvents.SQUARE_CLICKED, square);
        }
      }
    });
  }
}
export { ChessScene };
