import Phaser from "phaser";
import { Chess } from "chess.js";
import type { ChessMove, PieceType, ChessSettings } from "../types/chess.types";
import { ChessEvents } from "../events/ChessEvents";
import { fenToPieces, computeCaptures } from "../utils/chessUtils";
import type BoardManager from "./BoardManager";
import type PieceManager from "./PieceManager";
import type HUDManager from "./HUDManager";
import type AudioManager from "../../../snake-ladder/phaser/managers/AudioManager";
import type { LudoHistoryEntry } from "../../../ludo/phaser/managers/GameManager";
import { ChessAI } from "../ai/ChessAI";

export default class GameManager {
  private scene: Phaser.Scene;
  private board: BoardManager;
  private pieceManager: PieceManager;
  private hud: HUDManager;
  private audio: AudioManager;
  private settings: ChessSettings;

  private chessEngine!: Chess;
  private activePieceSquare: string | null = null;
  private isProcessingMove = false;

  constructor(
    scene: Phaser.Scene,
    board: BoardManager,
    pieceManager: PieceManager,
    hud: HUDManager,
    audio: AudioManager,
    settings: ChessSettings
  ) {
    this.scene = scene;
    this.board = board;
    this.pieceManager = pieceManager;
    this.hud = hud;
    this.audio = audio;
    this.settings = settings;
  }

  init(): void {
    this.chessEngine = new Chess();
    this.activePieceSquare = null;
    this.isProcessingMove = false;

    // Listen to events
    this.scene.events.off(ChessEvents.PIECE_SELECTED);
    this.scene.events.off(ChessEvents.MOVE_MADE);
    this.scene.events.off(ChessEvents.PROMOTION_CHOSEN);
    this.scene.events.off(ChessEvents.SQUARE_CLICKED);

    this.scene.events.on(ChessEvents.PIECE_SELECTED, this.onPieceSelected, this);
    this.scene.events.on(ChessEvents.MOVE_MADE, this.onMoveMade, this);
    this.scene.events.on(ChessEvents.PROMOTION_CHOSEN, this.onPromotionChosen, this);
    this.scene.events.on(ChessEvents.SQUARE_CLICKED, this.onSquareClicked, this);

    this.syncBoardState();
  }

  // ─── Event handlers ─────────────────────────────────────────────────────────

  private onPieceSelected(square: string): void {
    if (this.isProcessingMove || this.chessEngine.isGameOver()) return;

    const piece = this.chessEngine.get(square as any);
    if (!piece) return;

    // Can only select own color
    if (piece.color !== this.chessEngine.turn()) return;

    this.activePieceSquare = square;
    this.board.highlightSquare(square);

    // Calculate legal move destination squares
    const moves = this.chessEngine.moves({ square: square as any, verbose: true });
    const destinations = moves.map((m) => ({
      square: m.to,
      isCapture: m.captured !== undefined || m.flags.includes("e"), // capture or en passant
    }));
    this.board.highlightValidMoves(destinations);
  }

  private onMoveMade(from: string, to: string): void {
    if (this.isProcessingMove || this.chessEngine.isGameOver()) return;

    // Verify if move is legal
    let actualTo = to;

    // Allow castling by dropping King on Rook
    const piece = this.pieceManager.getPieceAtSquare(from);
    if (piece && piece.type === "k") {
      if (from === "e1") { if (to === "h1") actualTo = "g1"; else if (to === "a1") actualTo = "c1"; }
      else if (from === "e8") { if (to === "h8") actualTo = "g8"; else if (to === "a8") actualTo = "c8"; }
    }

    const moves = this.chessEngine.moves({ square: from as any, verbose: true });
    const match = moves.find((m) => m.to === actualTo);

    if (!match) {
      // Snap back smoothly
      const piece = this.pieceManager.getPieceAtSquare(from);
      if (piece) {
        this.pieceManager.movePiece(piece.id, from);
      } else {
        this.syncBoardState();
      }
      return;
    }

    // Pawn promotion handling
    if (match.flags.includes("p")) {
      // Auto-promote to Queen to prevent game freeze, since promotion UI is missing
      this.executeEngineMove({ from, to: actualTo, promotion: "q" });
      return;
    }

    this.executeEngineMove({ from, to: actualTo });
  }

  private onPromotionChosen(from: string, to: string, promotion: PieceType): void {
    this.executeEngineMove({ from, to, promotion });
  }

  private onSquareClicked(square: string): void {
    if (this.isProcessingMove || this.chessEngine.isGameOver()) return;

    // If clicked square is own piece, select it instead
    const piece = this.chessEngine.get(square as any);
    if (piece && piece.color === this.chessEngine.turn()) {
      this.onPieceSelected(square);
      return;
    }

    // Try to move selected piece to clicked square
    if (this.activePieceSquare) {
      const from = this.activePieceSquare;
      this.activePieceSquare = null;
      this.onMoveMade(from, square);
    }
  }

  // ─── Engine Execution & Synchronization ─────────────────────────────────────

  private executeEngineMove(move: ChessMove): void {
    this.isProcessingMove = true;
    this.board.clearOverlay();

    const fromPiece = this.pieceManager.getPieceAtSquare(move.from);
    if (!fromPiece) {
      this.isProcessingMove = false;
      this.syncBoardState();
      return;
    }

    try {
      // Execute local chess.js calculation
      const res = this.chessEngine.move({
        from: move.from,
        to: move.to,
        promotion: move.promotion,
      } as any);

      // Play specific sounds based on move flags
      if (res.captured) {
        this.audio.play("snake"); // capture sound
        const capturedPiece = this.pieceManager.getPieceAtSquare(move.to);
        if (capturedPiece) {
          this.pieceManager.capturePiece(capturedPiece.id);
        }
      } else if (res.flags.includes("k") || res.flags.includes("q")) {
        this.audio.play("ladder"); // castle sound
      } else {
        this.audio.play("move"); // standard move
      }

      // Animate sliding piece
      this.pieceManager.movePiece(fromPiece.id, move.to, () => {
        this.syncBoardState();
        this.isProcessingMove = false;

        // Check endgame state
        if (this.chessEngine.isGameOver()) {
          this.handleGameOver();
        } else if (this.chessEngine.inCheck()) {
          this.audio.play("roll"); // Check alarm sound
          this.scene.events.emit(ChessEvents.CHECK);
          // Highlight King in check
          this.highlightKingInCheck();
        }
      });

    } catch {
      this.isProcessingMove = false;
      this.syncBoardState();
    }
  }

  private syncBoardState(): void {
    this.board.clearOverlay();

    this.pieceManager.createPieces(fenToPieces(this.chessEngine.fen()));
    this.hud.updateStatus(
      this.chessEngine.turn() === "w" ? "White's Turn" : "Black's Turn"
    );

    // Sync captures
    this.hud.updateCaptures(computeCaptures(this.chessEngine));

    // AI Turn Trigger
    if (
      this.settings.mode === "ai" &&
      this.chessEngine.turn() === "b" &&
      !this.chessEngine.isGameOver()
    ) {
      this.isProcessingMove = true; // block human input
      this.scene.time.delayedCall(800, () => {
        const solver = new ChessAI();
        const best = solver.findBestMove(this.chessEngine, this.settings.aiLevel);
        if (best) {
          try {
            const match = this.chessEngine.moves({ verbose: true }).find((m) => m.san === best);
            if (match) {
              this.executeEngineMove({
                from: match.from,
                to: match.to,
                promotion: match.promotion,
              });
            } else {
              this.isProcessingMove = false;
            }
          } catch {
            this.isProcessingMove = false;
          }
        } else {
          this.isProcessingMove = false;
        }
      });
    }
  }

  private highlightKingInCheck(): void {
    const turn = this.chessEngine.turn();
    const boardState = this.chessEngine.board();
    const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const ranks = ["8", "7", "6", "5", "4", "3", "2", "1"];

    for (let r = 0; r < 8; r++) {
      const row = boardState[r];
      if (!row) continue;
      for (let c = 0; c < 8; c++) {
        const item = row[c];
        if (item && item.type === "k" && item.color === turn) {
          const square = (files[c] || "") + (ranks[r] || "");
          this.board.highlightSquare(square, true);
          return;
        }
      }
    }
  }

  private getCapturedPieces(): { w: PieceType[]; b: PieceType[] } {
    return computeCaptures(this.chessEngine);
  }

  private handleGameOver(): void {
    let msg = "Game Over";
    if (this.chessEngine.isCheckmate()) {
      const winner = this.chessEngine.turn() === "w" ? "Black" : "White";
      msg = `Checkmate! ${winner} Wins!`;
    } else if (this.chessEngine.isDraw()) {
      if (this.chessEngine.isStalemate()) msg = "Draw by Stalemate";
      else if (this.chessEngine.isThreefoldRepetition()) msg = "Draw by Repetition";
      else msg = "Draw by Agreement/Insufficient Material";
    }

    this.hud.updateStatus(msg);
    this.scene.events.emit(ChessEvents.GAME_OVER, msg);
  }

  // ─── Undo & Flip Helpers ──────────────────────────────────────────────────

  undo(): void {
    if (this.isProcessingMove) return;
    this.chessEngine.undo();
    this.syncBoardState();
  }

  getEngine(): Chess {
    return this.chessEngine;
  }
}
export { GameManager };
