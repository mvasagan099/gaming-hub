import Phaser from "phaser";
import { useMultiplayerStore, type WinnerInfo } from "../../../../store/multiplayerStore";
import { LudoEvents } from "../events/LudoEvents";
import type TokenManager from "./TokenManager";
import type DiceManager from "./DiceManager";
import type HUDManager from "./HUDManager";
import type WinnerPopup from "../ui/WinnerPopup";
import type FeedbackText from "../ui/FeedbackText";
import { LudoRuleEngine } from "../engine/LudoRuleEngine";
import { DEFAULT_SETTINGS, type PlayerColor } from "../types/ludo.types";
import { mainPathPixel, homeColPixel, HOME_COL_BASE } from "../data/boardLayout";

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
 * multiplayer store. Animates dice rolls and token moves, forwards local input.
 * Input is enabled only when it is the local player's turn.
 */
export default class LudoMultiplayerDriver {
  private scene: Phaser.Scene;
  private tokenManager: TokenManager;
  private dice: DiceManager;
  private hud: HUDManager;
  private winnerPopup: WinnerPopup;
  private feedback: FeedbackText | null;
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
    feedback: FeedbackText | null = null,
  ) {
    this.scene = scene;
    this.tokenManager = tokenManager;
    this.dice = dice;
    this.hud = hud;
    this.winnerPopup = winnerPopup;
    this.feedback = feedback;
    this.mySeat = mySeat;
    this.names = names;
    const count = names.length === 2 || mySeat != null ? 2 : (DEFAULT_SETTINGS.playerCount as 2 | 4);
    this.ruleEngine = new LudoRuleEngine({ ...DEFAULT_SETTINGS, mode: "multiplayer", playerCount: count });
  }

  start(): void {
    this.dice.setOnRoll(() => this.onRoll());
    this.scene.events.on(LudoEvents.TOKEN_SELECTED, this.onTokenSelected, this);

    this.unsubscribe = useMultiplayerStore.subscribe((state, prev) => {
      if (this.destroyed) return;
      if (
        state.gameState !== prev.gameState ||
        state.winner !== prev.winner ||
        state.matchId !== prev.matchId ||
        state.renderKey !== prev.renderKey
      ) {
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
    // Kill all running tweens for reconnect safety
    this.tokenManager.killAllTweens();
  }

  private get effectiveMySeat(): number | null {
    const storeSeat = useMultiplayerStore.getState().mySeat;
    if (storeSeat !== null && storeSeat !== undefined) return storeSeat;
    return this.mySeat;
  }

  private seatName(seat: number): string {
    return this.names[seat] ?? `Player ${seat + 1}`;
  }

  private onRoll(): void {
    this.dice.disable();
    this.dice.rollTo(1);
    void useMultiplayerStore.getState().sendGameAction({ type: "roll" }).then((res) => {
      if (!res.ok && res.error) {
        this.hud.addLog(res.error);
        if (this.lastState) this.updateDice(this.lastState);
      }
    });
  }

  private onTokenSelected(tokenId: string): void {
    if (this.busy || this.destroyed) return;
    const s = this.lastState;
    if (!s || s.phase !== "selecting" || s.currentSeat !== this.mySeat) return;
    if (!s.legalMoves?.includes(tokenId)) return;

    this.busy = true;
    this.hud.hideSelectionBanner();
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

    const hasRoll = evs.some((e) => e.type === "roll");
    const processMoveAndFinalize = () => {
      const moveEvent = evs.find((e) => e.type === "move");
      if (moveEvent?.tokenId && s.dice != null) {
        const actorSeat = moveEvent.seat ?? -1;
        const prevPlayer = prev?.players?.find((p) => p.seat === actorSeat);
        const prevToken = prevPlayer?.tokens?.find((t) => t.id === moveEvent.tokenId) ?? {
          id: moveEvent.tokenId,
          color: moveEvent.color ?? "red",
          index: parseInt(moveEvent.tokenId.split("-")[1] ?? "0", 10),
          position: moveEvent.from ?? -1,
          state: (moveEvent.from ?? -1) === -1 ? "yard" : "active",
        };
        this.animateMove(prevToken, moveEvent, s, evs);
        return;
      }
      this.finalize(s, evs);
    };

    if (s.dice != null && hasRoll) {
      this.dice.rollTo(s.dice, processMoveAndFinalize);
    } else {
      if (s.dice != null) this.dice.setValue(s.dice);
      processMoveAndFinalize();
    }
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

    // Show dice feedback
    if (this.feedback && s.dice != null) {
      const pos = this.getTokenPixel(color, prevToken);
      this.feedback.diceResult(s.dice, pos.x, pos.y - 30);
    }

    this.tokenManager.moveAlongPath(prevToken.id, path, color, () => {
      if (this.destroyed) return;

      const finish = evs.find((e) => e.type === "finish");
      if (finish) {
        this.hud.addLog(`${color.toUpperCase()} token reached Home!`);
        this.scene.events.emit(LudoEvents.TOKEN_FINISHED);
        if (this.feedback) {
          const pos = this.getTokenPixel(color, { ...prevToken, position: 57 });
          this.feedback.home(pos.x, pos.y);
        }
        this.tokenManager.animateHomeEntry(prevToken.id);
      }

      const capture = evs.find((e) => e.type === "capture");
      if (capture?.capturedTokenId) {
        this.hud.addLog(`Captured ${color.toUpperCase()} token!`);
        this.scene.events.emit(LudoEvents.TOKEN_CAPTURED);
        if (this.feedback) {
          const victim = s.players
            ?.flatMap((p) => p.tokens)
            .find((t) => t.id === capture.capturedTokenId);
          if (victim) {
            const pos = this.getTokenPixel(victim.color, victim);
            this.feedback.capture(pos.x, pos.y);
          }
        }
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
    if (this.destroyed) return;

    if (s.players) {
      s.players.forEach((p) => {
        this.tokenManager.updateTokens(p.tokens);
        this.hud.updateProgress(p.seat, p.tokensDone);
        const activeCount = p.tokens.filter((t) => t.state !== "finished").length;
        this.hud.updateTokenCount(p.seat, activeCount);
      });
    }

    this.hud.updateTurn(s.currentSeat ?? 0);
    if (s.logs) this.hud.setLogs(s.logs);

    this.updateDice(s);
    this.scheduleWin(s);
  }

  private updateDice(s: RemoteState): void {
    const finished = s.finished || (s.winnerSeats?.length ?? 0) > 0;
    const mySeat = this.effectiveMySeat;

    if (mySeat == null) {
      this.dice.setWaiting("Spectating...");
      this.tokenManager.clearAllGlows();
      return;
    }

    if (finished) {
      this.dice.disable();
      this.tokenManager.clearAllGlows();
      return;
    }

    if (s.currentSeat !== mySeat) {
      this.dice.setWaiting(`${this.seatName(s.currentSeat ?? 0)}'s turn...`);
      this.tokenManager.clearAllGlows();
      return;
    }

    if (s.phase === "selecting") {
      this.dice.setSelectMode();
      this.tokenManager.highlightClickable(s.legalMoves ?? []);
      if (s.currentSeat === mySeat) {
        this.hud.showSelectionBanner("TAP A HIGHLIGHTED TOKEN TO MOVE!");
      } else {
        this.hud.hideSelectionBanner();
      }
    } else {
      this.hud.hideSelectionBanner();
      this.dice.enable("ROLL DICE");
      this.tokenManager.clearAllGlows();
    }
  }

  private scheduleWin(s: RemoteState): void {
    if (!this.pendingWin || this.winShown) return;
    const storeWinner = useMultiplayerStore.getState().winner;
    const seats = (s.winnerSeats && s.winnerSeats.length > 0)
      ? s.winnerSeats
      : (storeWinner?.winnerSeats && storeWinner.winnerSeats.length > 0)
      ? storeWinner.winnerSeats
      : [];

    if (seats.length === 0 && !s.finished && !storeWinner) return;

    this.winShown = true;
    const winnerSeat = seats[0] ?? 0;
    const won = this.mySeat != null && winnerSeat === this.mySeat;
    const name = this.seatName(winnerSeat);

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

  /** Get pixel position for feedback text placement. */
  private getTokenPixel(color: PlayerColor, token: { position: number }): { x: number; y: number } {
    if (token.position === -1) return { x: 400, y: 400 };
    const homeBase = HOME_COL_BASE[color];
    if (token.position >= homeBase) {
      return homeColPixel(color, token.position - homeBase);
    }
    return mainPathPixel(token.position);
  }
}

export { LudoMultiplayerDriver };
