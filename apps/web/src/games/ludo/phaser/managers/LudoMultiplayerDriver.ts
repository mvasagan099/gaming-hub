import Phaser from "phaser";
import { useMultiplayerStore, type WinnerInfo } from "../../../../store/multiplayerStore";
import { LudoEvents } from "../events/LudoEvents";
import type TokenManager from "./TokenManager";
import type DiceManager from "./DiceManager";
import type HUDManager from "./HUDManager";
import type WinnerPopup from "../ui/WinnerPopup";
import { LudoRuleEngine } from "../engine/LudoRuleEngine";
import { DEFAULT_SETTINGS, type PlayerColor } from "../types/ludo.types";

interface RemoteToken {
  id: string;
  color: PlayerColor;
  index: number;
  position: number;
  state: "yard" | "active" | "finished";
}

interface RemotePlayer {
  seat: number;
  color: PlayerColor;
  name: string;
  tokensDone: number;
  tokens: RemoteToken[];
}

interface RemoteState {
  players?: RemotePlayer[];
  currentSeat?: number;
  dice?: number | null;
  phase?: string;
  winnerSeats?: number[];
  finished?: boolean;
  turnCount?: number;
  legalMoves?: string[];
  logs?: string[];
}

interface RemoteEvent {
  type: string;
  seat?: number;
  tokenId?: string;
  color?: PlayerColor;
  from?: number;
  to?: number;
  dice?: number;
  capturedTokenId?: string;
  isEnter?: boolean;
  isFinish?: boolean;
  isCapture?: boolean;
  isSafe?: boolean;
}

/**
 * Renders a server-authoritative Ludo match. All game state comes from the
 * multiplayer store (fed by `game:state` / `game:over` socket events); this
 * class only animates the server's dice rolls and token moves, and forwards
 * local input as `{ type: "roll" }` / `{ type: "move", tokenId }` actions.
 * Input is enabled only when it is the local player's turn.
 */
export default class LudoMultiplayerDriver {
  private scene: Phaser.Scene;
  private tokenManager: TokenManager;
  private dice: DiceManager;
  private hud: HUDManager;
  private winnerPopup: WinnerPopup;
  private readonly mySeat: number | null;
  private readonly names: string[];
  private ruleEngine: LudoRuleEngine;

  private lastState: RemoteState | null = null;
  private pendingWin = false;
  private winShown = false;
  private busy = false;
  private destroyed = false;
  private unsubscribe: (() => void) | null = null;

  constructor(
    scene: Phaser.Scene,
    tokenManager: TokenManager,
    dice: DiceManager,
    hud: HUDManager,
    winnerPopup: WinnerPopup,
    mySeat: number | null,
    names: string[],
  ) {
    this.scene = scene;
    this.tokenManager = tokenManager;
    this.dice = dice;
    this.hud = hud;
    this.winnerPopup = winnerPopup;
    this.mySeat = mySeat;
    this.names = names;
    this.ruleEngine = new LudoRuleEngine({ ...DEFAULT_SETTINGS, mode: "multiplayer" });
  }

  start(): void {
    this.dice.setOnRoll(() => this.onRoll());
    this.scene.events.on(LudoEvents.TOKEN_SELECTED, this.onTokenSelected, this);

    this.unsubscribe = useMultiplayerStore.subscribe((state, prev) => {
      if (this.destroyed) return;
      if (state.gameState !== prev.gameState || state.winner !== prev.winner) {
        this.applySnapshot(state.gameState, state.lastEvents, state.winner);
      }
    });

    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.stop());

    // Apply a snapshot that arrived before this driver mounted (reconnect).
    const current = useMultiplayerStore.getState();
    this.applySnapshot(current.gameState, current.lastEvents, current.winner);
  }

  stop(): void {
    this.destroyed = true;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.dice.setOnRoll(null);
    this.scene.events.off(LudoEvents.TOKEN_SELECTED, this.onTokenSelected, this);
  }

  private seatName(seat: number): string {
    return `Player ${seat + 1}`;
  }

  private onRoll(): void {
    this.dice.disable();
    void useMultiplayerStore.getState().sendGameAction({ type: "roll" }).then((res) => {
      if (!res.ok && res.error) this.hud.addLog(res.error);
    });
  }

  private onTokenSelected(tokenId: string): void {
    if (this.busy || this.destroyed) return;
    const s = this.lastState;
    if (!s || s.phase !== "selecting" || s.currentSeat !== this.mySeat) return;
    if (!s.legalMoves?.includes(tokenId)) return;

    this.busy = true;
    this.tokenManager.clearAllGlows();
    void useMultiplayerStore.getState().sendGameAction({ type: "move", tokenId }).then((res) => {
      if (!res.ok && res.error) {
        this.hud.addLog(res.error);
        this.busy = false;
      }
    });
  }

  private applySnapshot(
    state: unknown,
    events: { type: string }[] | undefined,
    winner: WinnerInfo | null,
  ): void {
    if (!state || this.destroyed) return;

    const s = state as RemoteState;
    const evs = (events ?? []) as RemoteEvent[];
    const prev = this.lastState;
    this.lastState = s;
    this.busy = false;

    const freshStart =
      !s.finished && s.dice == null && (s.turnCount ?? 0) === 0 && evs.length === 0;
    if (freshStart) {
      this.winShown = false;
      this.pendingWin = false;
      this.winnerPopup.hide();
    }

    const hasWin =
      evs.some((e) => e.type === "win") || (winner?.winnerSeats?.length ?? 0) > 0;
    this.pendingWin = hasWin;

    if (s.dice != null) {
      if (evs.some((e) => e.type === "roll")) this.dice.rollTo(s.dice);
      else this.dice.setValue(s.dice);
    }

    const moveEvent = evs.find((e) => e.type === "move");
    if (moveEvent?.tokenId && s.dice != null) {
      const actorSeat = moveEvent.seat ?? -1;
      const prevPlayer = prev?.players?.find((p) => p.seat === actorSeat);
      const prevToken = prevPlayer?.tokens?.find((t) => t.id === moveEvent.tokenId);
      if (prevToken) {
        this.animateMove(prevToken, moveEvent, s, evs);
        return;
      }
    }

    // No animated move (initial sync, reconnect, no-move, rematch).
    this.finalize(s, evs);
  }

  private animateMove(
    prevToken: RemoteToken,
    moveEvent: RemoteEvent,
    s: RemoteState,
    evs: RemoteEvent[],
  ): void {
    const dice = s.dice ?? 0;
    const path = this.ruleEngine.buildMovePath(prevToken, dice);
    const color = moveEvent.color ?? prevToken.color;

    this.tokenManager.moveAlongPath(prevToken.id, path, color, () => {
      if (moveEvent.isFinish) {
        this.hud.addLog("🎉 Token reached Home!");
        this.scene.events.emit(LudoEvents.TOKEN_FINISHED);
      } else if (moveEvent.isSafe) {
        this.scene.events.emit(LudoEvents.TOKEN_SAFE);
      }

      const capture = evs.find((e) => e.type === "capture");
      if (capture?.capturedTokenId) {
        this.hud.addLog(`⚔️ Captured ${color.toUpperCase()} token!`);
        this.scene.events.emit(LudoEvents.TOKEN_CAPTURED);
        const victim = s.players
          ?.flatMap((p) => p.tokens)
          .find((t) => t.id === capture.capturedTokenId);
        if (victim) {
          this.tokenManager.sendToYard(
            victim.id,
            victim.color,
            victim.index,
            () => this.finalize(s, evs),
          );
          return;
        }
      }

      this.finalize(s, evs);
    });
  }

  private finalize(s: RemoteState, evs: RemoteEvent[]): void {
    if (!s) return;

    // Correct any drift against the authoritative token positions.
    for (const t of s.players?.flatMap((p) => p.tokens) ?? []) {
      this.tokenManager.syncFromServer(t);
    }

    for (const p of s.players ?? []) {
      this.hud.updateProgress(p.seat, p.tokensDone);
    }

    this.hud.updateTurn(s.currentSeat ?? 0);
    if (s.logs) this.hud.setLogs(s.logs);

    this.updateDice(s);
    this.scheduleWin(s);
  }

  private updateDice(s: RemoteState): void {
    const finished = s.finished || (s.winnerSeats?.length ?? 0) > 0;

    if (this.mySeat == null) {
      this.dice.setWaiting("Spectating…");
      this.tokenManager.clearAllGlows();
      return;
    }

    if (finished) {
      this.dice.disable();
      this.tokenManager.clearAllGlows();
      return;
    }

    if (s.currentSeat !== this.mySeat) {
      this.dice.setWaiting(`${this.seatName(s.currentSeat ?? 0)}'s turn…`);
      this.tokenManager.clearAllGlows();
      return;
    }

    if (s.phase === "selecting") {
      this.dice.setSelectMode();
      this.tokenManager.highlightClickable(s.legalMoves ?? []);
    } else {
      this.dice.enable("🎲 ROLL DICE");
      this.tokenManager.clearAllGlows();
    }
  }

  private scheduleWin(s: RemoteState): void {
    if (!this.pendingWin || this.winShown) return;
    const seats = s.winnerSeats ?? [];
    if (seats.length === 0) return;

    this.winShown = true;
    const winnerSeat = seats[0];
    const won = this.mySeat != null && winnerSeat === this.mySeat;
    const name = this.names[winnerSeat] ?? this.seatName(winnerSeat);

    this.scene.time.delayedCall(700, () => {
      if (this.destroyed) return;
      this.winnerPopup.setActions(() => this.rematch());
      this.winnerPopup.show(name, [], { multiplayer: true, won });
    });
  }

  private rematch(): void {
    this.lastState = null;
    this.winShown = false;
    this.pendingWin = false;
    void useMultiplayerStore.getState().rematch();
  }
}

export { LudoMultiplayerDriver };
