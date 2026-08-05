import Phaser from "phaser";
import BoardManager from "../managers/BoardManager";
import PieceManager from "../managers/PieceManager";
import GameManager from "../managers/GameManager";
import ChessMultiplayerDriver from "../managers/ChessMultiplayerDriver";
import HUDManager from "../managers/HUDManager";
import ThemeManager from "../managers/ThemeManager";
import AudioManager from "../../../snake-ladder/phaser/managers/AudioManager";
import type { ChessSettings } from "../types/chess.types";
import { ChessAI } from "../ai/ChessAI";
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

    // 2. Board Manager (depth 0–3)
    this.board = new BoardManager(this, this.themeManager);
    this.board.drawBoard(online && seat === 1);

    // 3. Piece Manager (depth 50)
    this.pieceManager = new PieceManager(this, this.board);

    // 4. HUD Manager (depth 10)
    this.hud = new HUDManager(this);
    this.hud.create();

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
      const px = pointer.x - 20; // BOARD_OFFSET_X
      const py = pointer.y - 20; // BOARD_OFFSET_Y
      // Board dimensions are 640x640
      if (px >= 0 && px <= 640 && py >= 0 && py <= 640) {
        const col = Math.floor(px / 80); // CELL_SIZE = 80
        const row = Math.floor(py / 80);
        const square = this.board.gridToSquare(col, row);
        if (square) {
          this.events.emit(ChessEvents.SQUARE_CLICKED, square);
        }
      }
    });
  }
}
export { ChessScene };
