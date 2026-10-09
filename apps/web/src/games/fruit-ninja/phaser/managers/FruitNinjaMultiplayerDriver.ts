import { useMultiplayerStore, type WinnerInfo } from "../../../../store/multiplayerStore";
import type { FruitNinjaState } from "@gaming-hub/game-engine";
import { safeRandomUUID } from "@gaming-hub/shared";

type BladeInput = "slice-begin" | "slice-move" | "slice-end";

export default class FruitNinjaMultiplayerDriver {
  private destroyed = false;
  private unsubscribe: (() => void) | null = null;
  private onStateUpdate: ((state: FruitNinjaState) => void) | null = null;
  private onGameOver: ((winner: WinnerInfo | null, state: FruitNinjaState) => void) | null = null;
  private clockOffset = 0;
  private lastMoveAt = 0;
  private inputMatchId: string | null = null;
  private phase: FruitNinjaState["phase"] = "waiting";
  private completedMatchId: string | null = null;

  private readonly mySeat: number | null;

  constructor(mySeat: number | null, _names: string[]) { this.mySeat = mySeat; }

  start(): void {
    this.unsubscribe?.();
    this.unsubscribe = useMultiplayerStore.subscribe((state, prev) => {
      if (this.destroyed) return;
      if (state.renderKey !== prev.renderKey || state.winner !== prev.winner ||
          state.room?.status !== prev.room?.status || state.matchId !== prev.matchId) {
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

  setOnStateUpdate(handler: (state: FruitNinjaState) => void): void { this.onStateUpdate = handler; }
  setOnGameOver(handler: (winner: WinnerInfo | null, state: FruitNinjaState) => void): void { this.onGameOver = handler; }

  applyState(state: FruitNinjaState | null, winner: WinnerInfo | null): void {
    if (!state || this.destroyed) return;
    const matchId = useMultiplayerStore.getState().matchId;
    this.inputMatchId = matchId;
    this.phase = state.phase;
    if (typeof state.serverTimeMs === "number") this.clockOffset = state.serverTimeMs - Date.now();
    this.onStateUpdate?.(state);
    if ((state.finished || winner) && matchId && this.completedMatchId !== matchId) {
      this.completedMatchId = matchId;
      this.onGameOver?.(winner, state);
    }
  }

  /** Only blade intent crosses the socket; scores, misses and bombs are server outcomes. */
  sendSlice(type: BladeInput, x: number, y: number): void {
    const store = useMultiplayerStore.getState();
    if (this.destroyed || this.mySeat === null || this.phase !== "playing" ||
        !this.inputMatchId || store.matchId !== this.inputMatchId || store.winner) return;
    const now = Date.now();
    // Match the server's 40 actions/sec budget while leaving room for begin/end.
    if (type === "slice-move" && now - this.lastMoveAt < 40) return;
    this.lastMoveAt = now;
    void store.sendGameAction({ type, x, y, time: now + this.clockOffset, actionId: safeRandomUUID() });
  }
}
