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

export interface ChessRemoteState {
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
  history?: string[];
  timeControl?: {
    baseSeconds: number;
    incrementSeconds: number;
    delaySeconds: number;
  } | null;
  clocks?: {
    [seat: string]: { remainingMs: number; startedAtMs: number | null };
  } | null;
  lastMoveAtMs?: number | null;
  drawOfferedBy?: number | null;
  result?: "1-0" | "0-1" | "1/2-1/2" | "*";
  endReason?:
    | "checkmate"
    | "stalemate"
    | "insufficient"
    | "repetition"
    | "fifty-move"
    | "agreement"
    | "resign"
    | "flag"
    | null
    | string;
  players?: { seat: number; color: "w" | "b" }[];
}

// ...


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
  private isInReplay = false;

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
    this.scene.events.on(ChessEvents.REPLAY_FEN, this.handleReplayFen, this);
    this.scene.events.on(ChessEvents.REPLAY_EXIT, this.handleReplayExit, this);
    this.scene.events.on(ChessEvents.PROMOTION_NEEDED, this.handlePromotionNeeded, this);
    this.scene.events.on(ChessEvents.PROMOTION_CHOSEN, this.onPromotionChosen, this);
    this.scene.events.emit("CUSTOM:CHECK_STATE"); // Force initial state check
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.stop());

    // Setup both subscription-based and event-based state detection
    console.log("[ChessMultiplayerDriver] Setting up subscription and event listeners");
    
    this.unsubscribe = useMultiplayerStore.subscribe((state, prev) => {
      console.log("[ChessMultiplayerDriver] Subscription callback fired! prev.renderKey:", prev.renderKey, "->", state.renderKey);
      if (this.destroyed) {
        console.log("[ChessMultiplayerDriver] Subscription callback skipped: driver destroyed");
        return;
      }
      // Use renderKey to detect actual state changes instead of shallow comparison
      if (state.renderKey !== prev.renderKey || state.winner !== prev.winner) {
        console.log("[ChessMultiplayerDriver] State changed, applying new state");
        const gameState = state.gameState as unknown as ChessRemoteState | null;
        console.log("[ChessMultiplayerDriver] Applying new state with FEN:", gameState?.fen?.substring(0, 20) + "...");
        this.applyState(state.gameState, state.lastEvents, state.winner);
        this.scene.events.emit("CUSTOM:STATE_SYNCED", state.gameState);
      } else {
        console.log("[ChessMultiplayerDriver] State unchanged, renderKey:", state.renderKey);
      }
    });

    // Actively poll for state changes as fallback
    this.scene.time.addEvent({
      delay: 100,
      loop: true,
      callback: () => {
        const current = useMultiplayerStore.getState();
        const currentFen = (current.gameState as any)?.fen;
        if (currentFen && this.lastState?.fen !== currentFen) {
          console.log("[ChessMultiplayerDriver] Poll detected FEN change");
          this.applyState(current.gameState, current.lastEvents, current.winner);
        }
      }
    });

    // Apply a snapshot that arrived before this driver mounted (reconnect).
    const current = useMultiplayerStore.getState();
    this.applyState(current.gameState, current.lastEvents, current.winner);
  }

  stop(): void {
    console.log("[ChessMultiplayerDriver] stop called, destroyed:", this.destroyed);
    this.destroyed = true;
    this.unsubscribe?.();
    this.unsubscribe = null;
    
    this.scene.events.off(ChessEvents.PIECE_SELECTED, this.onPieceSelected, this);
    this.scene.events.off(ChessEvents.MOVE_MADE, this.onMoveMade, this);
    this.scene.events.off(ChessEvents.SQUARE_CLICKED, this.onSquareClicked, this);
    this.scene.events.off(ChessEvents.REPLAY_FEN, this.handleReplayFen, this);
    this.scene.events.off(ChessEvents.REPLAY_EXIT, this.handleReplayExit, this);
    this.scene.events.off(ChessEvents.PROMOTION_CHOSEN, this.onPromotionChosen, this);
    this.scene.events.off(ChessEvents.PROMOTION_NEEDED, this.handlePromotionNeeded);
    
    // Stop the intro scene if exists
    this.scene.scene.stop("IntroScene");
    
    console.log("[ChessMultiplayerDriver] All event listeners cleaned up");
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
      if (this.activeSquare && piece && piece.color !== this.myColor) {
        this.onSquareClicked(square);
        return;
      }
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

    // Pawn promotion: emit event to trigger the modal.
    if (match.flags.includes("p")) {
      this.waitingForServer = true;
      this.activeSquare = null;
      this.scene.input.enabled = false;
      this.board.clearOverlay();
      this.scene.events.emit(ChessEvents.PROMOTION_NEEDED, from, actualTo);
      return;
    }
    this.sendMove(from, actualTo);
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

  public getLatestState(): ChessRemoteState | null {
    return this.lastState;
  }

  // ─── State application ──────────────────────────────────────────────────────
  
  public applyState(
    state: unknown,
    events: { type: string }[] | undefined = [],
    winner: WinnerInfo | null = null,
  ): void {
    console.log("[ChessMultiplayerDriver] applyState called, destroyed:", this.destroyed, "gameState exists:", !!state);
    if (!state || this.destroyed) return;
    this.waitingForServer = false;
    const s = state as ChessRemoteState;
    if (!s.fen) {
      console.log("[ChessMultiplayerDriver] applyState skipped: no FEN in state");
      return;
    }

    console.log("[ChessMultiplayerDriver] Applying state with FEN:", s.fen?.substring(0, 20) + "...", "finished:", s.finished);

    // A fresh match means a rematch happened — clear the previous result.
    if (this.winnerShown && !s.finished) {
      this.winnerShown = false;
      this.scene.events.emit(ChessEvents.GAME_OVER, "MP|reset");
    }

    this.lastState = s;
    this.mirror.load(s.fen);
    console.log("[ChessMultiplayerDriver] Mirror engine loaded, current turn:", this.mirror.turn());

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

    if (s.finished) this.isInReplay = false;
    if (!this.isInReplay && lastMove) this.board.highlightLastMove(lastMove.from, lastMove.to);
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

    if (s.drawOfferedBy != null) {
      const offerer = this.seatName(s.drawOfferedBy);
      const status = s.drawOfferedBy === this.mySeat
        ? "You offered a draw"
        : `${offerer} offered a draw`;
      this.hud.updateStatus(status);
      return;
    }

    let status: string;
    if (s.checkmate) {
      const winner = s.turn === "w" ? this.seatName(1) : this.seatName(0);
      status = `Checkmate! ${winner ?? "Opponent"} wins (by ${s.endReason || "checkmate"})`;
    } else if (s.stalemate) {
      status = `Draw by stalemate`;
    } else if (s.insufficientMaterial) {
      status = "Draw by insufficient material";
    } else if (s.draw) {
      status = "Draw";
    } else if (s.finished) {
      const reason = s.endReason || s.result === "1/2-1/2" ? "Draw" : "Game over";
      status = `${s.result === "*" ? "Game over" : s.result} (${reason})`;
    } else if (s.inCheck) {
      status = s.currentSeat === this.mySeat ? "Check! Your turn" : "Check! Opponent\'s turn";
    } else {
      status = s.currentSeat === this.mySeat ? "Your turn" : `${this.seatName(s.currentSeat ?? 0)}\'s turn`;
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

  private onPromotionChosen(from: string, to: string, pieceType: "q" | "r" | "b" | "n"): void {
    this.sendMove(from, to, pieceType);
  }

  private handleReplayFen(fen: string): void {
    this.isInReplay = true;
    this.pieceManager.syncPieces(fenToPieces(fen), null);
    this.board.clearLastMove();
    this.hud.updateStatus("Replay mode");
    this.scene.input.enabled = false;
  }

  private handleReplayExit(): void {
    this.isInReplay = false;
    if (this.lastState && this.lastState.fen) {
      this.board.clearLastMove();
      this.pieceManager.syncPieces(fenToPieces(this.lastState.fen), this.lastState.lastMove);
      this.render(this.lastState);
    }
  }

  private handlePromotionNeeded(from: string, to: string): void {
    this.waitingForServer = true;
    this.activeSquare = null;
    this.scene.input.enabled = false;
    this.board.clearOverlay();
    this.scene.events.emit(ChessEvents.PROMOTION_NEEDED, from, to);
  }
}
