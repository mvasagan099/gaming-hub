import Phaser from "phaser";
import { Chess } from "chess.js";
import { useMultiplayerStore } from "../../../../store/multiplayerStore";
import type { WinnerInfo } from "../../../../store/multiplayerStore";
import { ChessEvents } from "../events/ChessEvents";
import { fenToPieces, computeCaptures } from "../utils/chessUtils";
import type BoardManager from "./BoardManager";
import type PieceManager from "./PieceManager";
import type HUDManager from "./HUDManager";
import type AudioManager from "../../../snake-ladder/phaser/managers/AudioManager";

interface ChessRemoteState {
  fen?: string;
  turn?: "w" | "b";
  inCheck?: boolean;
  checkmate?: boolean;
  stalemate?: boolean;
  draw?: boolean;
  insufficientMaterial?: boolean;
  gameOver?: boolean;
  winnerSeats?: number[];
  currentSeat?: number;
  finished?: boolean;
  lastMove?: { from: string; to: string; promotion?: string; san?: string } | null;
  moveCount?: number;
  players?: { seat: number; color: "w" | "b" }[];
}

interface ChessRemoteEvent {
  type: string;
  isCapture?: boolean;
  isCheck?: boolean;
}

/**
 * Renders a server-authoritative Chess match. All game state comes from the
 * multiplayer store (fed by `game:state` / `game:over` socket events); the
 * local chess.js instance is used only to compute legal moves for highlighting
 * and to catch obviously illegal drags before they reach the server.
 * Input is enabled only when it is the local player's turn.
 */
export default class ChessMultiplayerDriver {
  private scene: Phaser.Scene;
  private board: BoardManager;
  private pieceManager: PieceManager;
  private hud: HUDManager;
  private audio: AudioManager;
  private readonly mySeat: number | null;
  private readonly myColor: "w" | "b" | null;
  private readonly names: string[];

  private mirror = new Chess();
  private lastState: ChessRemoteState | null = null;
  private activeSquare: string | null = null;
  private waitingForServer = false;
  private winnerShown = false;
  private destroyed = false;
  private unsubscribe: (() => void) | null = null;

  constructor(
    scene: Phaser.Scene,
    board: BoardManager,
    pieceManager: PieceManager,
    hud: HUDManager,
    audio: AudioManager,
    mySeat: number | null,
    names: string[],
  ) {
    this.scene = scene;
    this.board = board;
    this.pieceManager = pieceManager;
    this.hud = hud;
    this.audio = audio;
    this.mySeat = mySeat;
    this.myColor = mySeat == null ? null : mySeat === 0 ? "w" : "b";
    this.names = names;
  }

  start(): void {
    this.scene.events.on(ChessEvents.PIECE_SELECTED, this.onPieceSelected, this);
    this.scene.events.on(ChessEvents.MOVE_MADE, this.onMoveMade, this);
    this.scene.events.on(ChessEvents.SQUARE_CLICKED, this.onSquareClicked, this);
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.stop());

    this.unsubscribe = useMultiplayerStore.subscribe((state, prev) => {
      if (this.destroyed) return;
      if (state.gameState !== prev.gameState || state.winner !== prev.winner) {
        this.applyState(state.gameState, state.lastEvents, state.winner);
      }
    });

    // Apply a snapshot that arrived before this driver mounted (reconnect).
    const current = useMultiplayerStore.getState();
    this.applyState(current.gameState, current.lastEvents, current.winner);
  }

  stop(): void {
    this.destroyed = true;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.scene.events.off(ChessEvents.PIECE_SELECTED, this.onPieceSelected, this);
    this.scene.events.off(ChessEvents.MOVE_MADE, this.onMoveMade, this);
    this.scene.events.off(ChessEvents.SQUARE_CLICKED, this.onSquareClicked, this);
    this.scene.input.enabled = true;
  }

  // ─── Input routing ──────────────────────────────────────────────────────────

  private canInteract(): boolean {
    if (this.destroyed || this.waitingForServer || this.mySeat == null) return false;
    const s = this.lastState;
    if (!s || s.finished || s.currentSeat !== this.mySeat) return false;
    return s.turn === this.myColor;
  }

  private onPieceSelected(square: string): void {
    if (!this.canInteract()) return;

    const piece = this.mirror.get(square as never);
    if (!piece || piece.color !== this.myColor) {
      this.activeSquare = null;
      this.board.clearOverlay();
      return;
    }

    this.activeSquare = square;
    this.board.clearOverlay();
    this.board.highlightSquare(square);

    const moves = this.mirror.moves({ square: square as never, verbose: true });
    this.board.highlightValidMoves(
      moves.map((m) => ({
        square: m.to,
        isCapture: m.captured !== undefined || m.flags.includes("e"),
      })),
    );
  }

  private onSquareClicked(square: string): void {
    if (!this.canInteract()) return;

    const piece = this.mirror.get(square as never);
    if (piece && piece.color === this.myColor) {
      this.onPieceSelected(square);
      return;
    }

    if (this.activeSquare) {
      const from = this.activeSquare;
      this.activeSquare = null;
      this.onMoveMade(from, square);
    }
  }

  private onMoveMade(from: string, to: string): void {
    if (!this.canInteract()) return;

    // Allow castling by dropping the King on the Rook.
    let actualTo = to;
    const piece = this.mirror.get(from as never);
    if (piece?.type === "k") {
      if (from === "e1") { if (to === "h1") actualTo = "g1"; else if (to === "a1") actualTo = "c1"; }
      else if (from === "e8") { if (to === "h8") actualTo = "g8"; else if (to === "a8") actualTo = "c8"; }
    }

    const moves = this.mirror.moves({ square: from as never, verbose: true });
    const match = moves.find((m) => m.to === actualTo);
    if (!match) {
      this.activeSquare = null;
      this.board.clearOverlay();
      return;
    }

    // Pawn promotion: auto-promote to Queen (no promotion UI in this build).
    const promotion = match.flags.includes("p") ? "q" : undefined;
    this.sendMove(from, actualTo, promotion);
  }

  private sendMove(from: string, to: string, promotion?: string): void {
    this.waitingForServer = true;
    this.activeSquare = null;
    this.scene.input.enabled = false;
    this.board.clearOverlay();

    void useMultiplayerStore.getState().sendGameAction({
      type: "move",
      from,
      to,
      ...(promotion ? { promotion } : {}),
    }).then((res) => {
      this.waitingForServer = false;
      if (res.ok) return;
      if (res.error) this.hud.updateStatus(res.error);
      // The server never broadcast a state for a rejected move — snap back.
      if (this.lastState) this.render(this.lastState);
    });
  }

  // ─── State application ──────────────────────────────────────────────────────

  private applyState(
    state: unknown,
    events: { type: string }[] | undefined,
    winner: WinnerInfo | null,
  ): void {
    if (!state || this.destroyed) return;
    const s = state as ChessRemoteState;
    if (!s.fen) return;

    // A fresh match means a rematch happened — clear the previous result.
    if (this.winnerShown && !s.finished) {
      this.winnerShown = false;
      this.scene.events.emit(ChessEvents.GAME_OVER, "MP|reset");
    }

    this.lastState = s;
    this.mirror.load(s.fen);

    const lastMove =
      s.lastMove && s.lastMove.from && s.lastMove.to
        ? { from: s.lastMove.from, to: s.lastMove.to }
        : null;

    this.pieceManager.syncPieces(fenToPieces(s.fen), lastMove);

    const moveEvent = (events ?? []).find((e): e is ChessRemoteEvent => e.type === "move");
    if (moveEvent) {
      if (moveEvent.isCapture) this.audio.play("snake");
      else this.audio.play("move");
    } else if ((events ?? []).some((e) => e.type === "check")) {
      this.audio.play("roll");
    }

    this.render(s);

    if (s.finished && !this.winnerShown) {
      this.winnerShown = true;
      this.scheduleResult(s);
    }
  }

  private render(s: ChessRemoteState): void {
    this.hud.updateCaptures(computeCaptures(this.mirror));
    this.updateStatus(s);
    this.updateInput(s);
  }

  private seatName(seat: number): string {
    return this.names[seat] ?? `Player ${seat + 1}`;
  }

  private updateStatus(s: ChessRemoteState): void {
    if (this.mySeat == null) {
      this.hud.updateStatus("Spectating");
      return;
    }

    let status: string;
    if (s.checkmate) {
      const winner = s.turn === "w" ? this.seatName(1) : this.seatName(0);
      status = `Checkmate! ${winner} wins`;
    } else if (s.stalemate) {
      status = "Draw by stalemate";
    } else if (s.draw) {
      status = "Draw";
    } else if (s.finished) {
      status = "Game over";
    } else if (s.inCheck) {
      status = s.currentSeat === this.mySeat ? "Check! Your turn" : "Check! Opponent's turn";
    } else {
      status = s.currentSeat === this.mySeat ? "Your turn" : `${this.seatName(s.currentSeat ?? 0)}'s turn`;
    }

    this.hud.updateStatus(status);
  }

  private updateInput(s: ChessRemoteState): void {
    if (this.mySeat == null) {
      this.scene.input.enabled = false;
      return;
    }
    const myTurn = !s.finished && s.currentSeat === this.mySeat && s.turn === this.myColor;
    this.scene.input.enabled = myTurn;
    if (!myTurn) {
      this.activeSquare = null;
      this.board.clearOverlay();
    }
  }

  private scheduleResult(s: ChessRemoteState): void {
    const winnerSeat = s.winnerSeats?.[0];

    this.scene.time.delayedCall(700, () => {
      if (this.destroyed) return;
      if (winnerSeat != null) {
        const won = this.mySeat != null && winnerSeat === this.mySeat;
        this.scene.events.emit(
          ChessEvents.GAME_OVER,
          `MP|${won ? "win" : "lose"}|${this.seatName(winnerSeat)}`,
        );
      } else {
        this.scene.events.emit(ChessEvents.GAME_OVER, "MP|draw|Draw");
      }
    });
  }
}
