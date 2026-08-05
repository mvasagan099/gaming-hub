import Phaser from "phaser";
import type { ChessPiece, PieceType, PieceColor } from "../types/chess.types";
import { ChessEvents } from "../events/ChessEvents";
import type BoardManager from "./BoardManager";
import { CELL_SIZE, BOARD_OFFSET_X, BOARD_OFFSET_Y } from "./BoardManager";

const PIECE_GLYPHS: Record<PieceColor, Record<PieceType, string>> = {
  w: { p: "♟", r: "♜", n: "♞", b: "♝", q: "♛", k: "♚" },
  b: { p: "♟", r: "♜", n: "♞", b: "♝", q: "♛", k: "♚" },
};

interface PieceSprite {
  piece: ChessPiece;
  container: Phaser.GameObjects.Container;
  glyphText: Phaser.GameObjects.Text;
}

export class PieceManager {
  private scene: Phaser.Scene;
  private board: BoardManager;
  private pieces = new Map<string, PieceSprite>();

  constructor(scene: Phaser.Scene, board: BoardManager) {
    this.scene = scene;
    this.board = board;
  }

  /**
   * Instantiate and render all pieces on the board.
   */
  createPieces(pieceList: ChessPiece[]): void {
    this.clearAll();
    for (const p of pieceList) {
      this.createPiece(p);
    }
  }

  private createPiece(p: ChessPiece): void {
    const coords = this.board.getPixelCoords(p.square);
    if (!coords) return;

    const size = Math.round(CELL_SIZE * 0.4);
    const glyph = PIECE_GLYPHS[p.color][p.type];
    const isWhite = p.color === "w";

    // Piece Unicode symbol
    const textStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontSize:   "56px",
      color:      isWhite ? "#ffffff" : "#000000",
      stroke:     isWhite ? "#000000" : "#ffffff",
      strokeThickness: 2,
      fontFamily: "Arial, sans-serif",
    };
    
    const text = this.scene.add.text(0, -2, glyph, textStyle).setOrigin(0.5);
    text.setShadow(0, 4, 'rgba(0,0,0,0.4)', 4);

    // Interactive hit-area
    const zone = this.scene.add.circle(0, 0, size, 0xffffff, 0);
    zone.setInteractive({ useHandCursor: true });
    this.scene.input.setDraggable(zone);

    const container = this.scene.add.container(coords.x, coords.y, [
      text,
      zone,
    ]);
    container.setDepth(50);

    // Drag-and-drop bindings
    let startX = coords.x;
    let startY = coords.y;

    zone.on("dragstart", () => {
      startX = container.x;
      startY = container.y;
      container.setDepth(100);
      container.setScale(1.15);
      this.scene.events.emit(ChessEvents.PIECE_SELECTED, p.square);
    });

    zone.on("drag", (pointer: Phaser.Input.Pointer) => {
      container.x = pointer.x;
      container.y = pointer.y;
    });

    zone.on("dragend", () => {
      container.setScale(1.0);
      container.setDepth(50);

      // Resolve landing square
      const col = Math.round((container.x - BOARD_OFFSET_X - CELL_SIZE / 2) / CELL_SIZE);
      const row = Math.round((container.y - BOARD_OFFSET_Y - CELL_SIZE / 2) / CELL_SIZE);
      const targetSq = this.board.gridToSquare(col, row);

      if (targetSq && targetSq !== p.square) {
        this.scene.events.emit(ChessEvents.MOVE_MADE, p.square, targetSq);
      } else {
        // Snap back if invalid
        this.scene.tweens.add({
          targets:  container,
          x:        startX,
          y:        startY,
          duration: 150,
          ease:     "Sine.Out",
        });
      }
    });

    // Add click-to-move support
    zone.on("pointerdown", () => {
      this.scene.events.emit(ChessEvents.PIECE_SELECTED, p.square);
    });

    const sprite: PieceSprite = { piece: p, container, glyphText: text };
    this.pieces.set(p.id, sprite);
  }

  // ─── Animations ─────────────────────────────────────────────────────────────

  /** Animate piece sliding from origin to target square */
  movePiece(id: string, targetSq: string, onComplete?: () => void): void {
    const sprite = this.pieces.get(id);
    if (!sprite) { onComplete?.(); return; }

    const targetPos = this.board.getPixelCoords(targetSq);
    if (!targetPos) { onComplete?.(); return; }

    sprite.piece.square = targetSq;

    this.scene.tweens.add({
      targets:    sprite.container,
      x:          targetPos.x,
      y:          targetPos.y,
      duration:   250,
      ease:       "Quad.Out",
      onComplete: () => onComplete?.(),
    });
  }

  /** Animate piece being captured (fades out and shrinks) */
  capturePiece(id: string, onComplete?: () => void): void {
    const sprite = this.pieces.get(id);
    if (!sprite) { onComplete?.(); return; }

    this.pieces.delete(id);

    this.scene.tweens.add({
      targets:    sprite.container,
      alpha:      0,
      scale:      0.5,
      angle:      -30, // slight spin out
      duration:   300,
      ease:       "Back.In",
      onComplete: () => {
        sprite.container.destroy();
        onComplete?.();
      },
    });
  }

  clearAll(): void {
    for (const sprite of this.pieces.values()) {
      sprite.container.destroy();
    }
    this.pieces.clear();
  }

  getPieceAtSquare(square: string): ChessPiece | null {
    for (const sprite of this.pieces.values()) {
      if (sprite.piece.square === square) return sprite.piece;
    }
    return null;
  }
}

export default PieceManager;
