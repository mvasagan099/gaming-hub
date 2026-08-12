import { useMultiplayerStore, type WinnerInfo } from "../../../../store/multiplayerStore";
import type { FruitNinjaState } from "@gaming-hub/game-engine";

export default class FruitNinjaMultiplayerDriver {
  private readonly mySeat: number | null;
  private readonly names: string[];
  private destroyed = false;
  private unsubscribe: (() => void) | null = null;
  private onStateUpdate: ((state: FruitNinjaState) => void) | null = null;
  private onGameOver: ((winner: WinnerInfo | null, state: FruitNinjaState) => void) | null = null;

  constructor(mySeat: number | null, names: string[]) {
    this.mySeat = mySeat;
    this.names = names;
  }

  start(): void {
    this.unsubscribe = useMultiplayerStore.subscribe((state, prev) => {
      if (this.destroyed) return;
      if (
        state.renderKey !== prev.renderKey ||
        state.winner !== prev.winner ||
        state.room?.status !== prev.room?.status ||
        state.matchId !== prev.matchId
      ) {
        this.applyState(state.gameState as unknown as FruitNinjaState | null, state.winner);
      }
    });

    const current = useMultiplayerStore.getState();
    this.applyState(current.gameState as unknown as FruitNinjaState | null, current.winner);
  }

  stop(): void {
    this.destroyed = true;
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  setOnStateUpdate(handler: (state: FruitNinjaState) => void): void {
    this.onStateUpdate = handler;
  }

  setOnGameOver(handler: (winner: WinnerInfo | null, state: FruitNinjaState) => void): void {
    this.onGameOver = handler;
  }

  applyState(state: FruitNinjaState | null, winner: WinnerInfo | null): void {
    if (!state || this.destroyed) return;
    this.onStateUpdate?.(state);

    if (state.finished || winner) {
      this.onGameOver?.(winner, state);
    }
  }

  sendFruitSliced(points = 10): void {
    if (this.mySeat === null) return;
    void useMultiplayerStore.getState().sendGameAction({
      type: "slice-fruit",
      points,
    });
  }

  sendMissedFruit(): void {
    if (this.mySeat === null) return;
    void useMultiplayerStore.getState().sendGameAction({
      type: "miss-fruit",
    });
  }

  sendBombHit(): void {
    if (this.mySeat === null) return;
    void useMultiplayerStore.getState().sendGameAction({
      type: "bomb-hit",
    });
  }
}
