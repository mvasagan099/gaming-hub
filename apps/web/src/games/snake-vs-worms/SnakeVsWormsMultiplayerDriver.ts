import { useMultiplayerStore } from "../../store/multiplayerStore";
import type { SnakeVsWormsState, SnakeWormDirection } from "@gaming-hub/game-engine";

export class SnakeVsWormsMultiplayerDriver {
  private mySeat: number | null = null;
  private playerNames: string[] = [];
  private onStateUpdateCb: ((state: SnakeVsWormsState) => void) | null = null;
  private onMatchCompleteCb: ((winnerSeat: number | null) => void) | null = null;
  private lastDirectionSent: SnakeWormDirection | null = null;
  private isBoostingSent = false;
  private unsubscribeStore: (() => void) | null = null;

  constructor(mySeat: number | null, playerNames: string[]) {
    this.mySeat = mySeat;
    this.playerNames = playerNames;
  }

  start(): void {
    console.log("[SnakeVsWormsMultiplayerDriver] Starting driver...", { mySeat: this.mySeat });

    this.unsubscribeStore = useMultiplayerStore.subscribe((state) => {
      if (state.gameState) {
        const engineState = state.gameState as unknown as SnakeVsWormsState;
        if (this.onStateUpdateCb) {
          this.onStateUpdateCb(engineState);
        }

        if (engineState.finished && this.onMatchCompleteCb) {
          const winnerSeat = engineState.winnerSeats && engineState.winnerSeats.length > 0 ? engineState.winnerSeats[0] : null;
          this.onMatchCompleteCb(winnerSeat);
        }
      }
    });

    // Send initial ready signal
    useMultiplayerStore.getState().sendGameAction({ type: "ready" });
  }

  stop(): void {
    if (this.unsubscribeStore) {
      this.unsubscribeStore();
      this.unsubscribeStore = null;
    }
  }

  setOnStateUpdate(cb: (state: SnakeVsWormsState) => void): void {
    this.onStateUpdateCb = cb;
  }

  setOnMatchComplete(cb: (winnerSeat: number | null) => void): void {
    this.onMatchCompleteCb = cb;
  }

  sendDirection(direction: SnakeWormDirection): void {
    if (this.mySeat == null) return;
    if (this.lastDirectionSent === direction) return;

    this.lastDirectionSent = direction;
    useMultiplayerStore.getState().sendGameAction({
      type: "direction",
      direction,
    });
  }

  sendBoostStart(): void {
    if (this.mySeat == null || this.isBoostingSent) return;
    this.isBoostingSent = true;
    useMultiplayerStore.getState().sendGameAction({
      type: "boost-start",
    });
  }

  sendBoostStop(): void {
    if (this.mySeat == null || !this.isBoostingSent) return;
    this.isBoostingSent = false;
    useMultiplayerStore.getState().sendGameAction({
      type: "boost-stop",
    });
  }
}
