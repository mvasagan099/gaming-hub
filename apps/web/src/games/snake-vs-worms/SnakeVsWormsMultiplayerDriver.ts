import { useMultiplayerStore } from "../../store/multiplayerStore";
import type { SnakeVsWormsState, SnakeWormDirection } from "@gaming-hub/game-engine";

export class SnakeVsWormsMultiplayerDriver {
  private unsubscribe: (() => void) | null = null;
  private stopped = false;
  private awaitingSync = false;
  private lastState: SnakeVsWormsState | null = null;
  private lastDirectionSent: SnakeWormDirection | null = null;
  private directionEpoch = 0;
  private boostingSent = false;
  private boostEpoch = 0;
  private completed = false;
  private onStateUpdateCb: ((state: SnakeVsWormsState) => void) | null = null;
  private onMatchCompleteCb: ((winnerSeat: number | null) => void) | null = null;
  private readonly scope: { roomId: string | undefined; matchId: string | null };
  private readonly mySeat: number | null;

  constructor(mySeat: number | null, _playerNames: string[]) {
    this.mySeat = mySeat;
    const state = useMultiplayerStore.getState();
    this.scope = { roomId: state.room?.id, matchId: state.matchId };
  }
  private inScope(state: ReturnType<typeof useMultiplayerStore.getState>): boolean {
    return state.room?.id === this.scope.roomId && state.matchId === this.scope.matchId
      && state.room?.gameId === 'snake-vs-worms';
  }
  private receive(state: SnakeVsWormsState): void {
    if (!state || state.gameId !== 'snake-vs-worms' || !Array.isArray(state.players)) return;
    if (this.lastState && state.stateVersion < this.lastState.stateVersion) return;
    const restored = this.awaitingSync;
    if (state.paused || state.finished) {
      this.boostingSent = false; this.boostEpoch++;
      this.lastDirectionSent = null; this.directionEpoch++;
    }
    this.lastState = state; this.awaitingSync = false;
    if (restored && state.players.some(p => p.seat === this.mySeat && p.isBoosting)) this.sendBoostStop();
    this.onStateUpdateCb?.(state);
    if (state.finished && !this.completed) {
      this.completed = true;
      this.onMatchCompleteCb?.(state.winnerSeats.length === 1 ? state.winnerSeats[0] : null);
    }
  }
  start(): void {
    if (this.stopped || this.unsubscribe) return;
    const current = useMultiplayerStore.getState();
    if (this.inScope(current) && current.gameState) this.receive(current.gameState as unknown as SnakeVsWormsState);
    this.awaitingSync = current.status !== 'connected';
    this.unsubscribe = useMultiplayerStore.subscribe((state, previous) => {
      if (this.stopped || !this.inScope(state)) return;
      if (state.status !== 'connected') {
        this.awaitingSync = true; this.lastDirectionSent = null; this.boostingSent = false; this.boostEpoch++;
        this.directionEpoch++;
      }
      if (state.status === 'connected' && previous.status !== 'connected') {
        void state.requestFullStateSync().catch(() => undefined);
      }
      if (state.status === 'connected' && (state.renderKey !== previous.renderKey || state.winner !== previous.winner) && state.gameState) {
        this.receive(state.gameState as unknown as SnakeVsWormsState);
      }
    });
  }
  canAct(): boolean {
    const store = useMultiplayerStore.getState();
    return !this.stopped && !this.awaitingSync && this.inScope(store) && store.status === 'connected'
      && this.mySeat != null && !!this.lastState && !this.lastState.paused && !this.lastState.finished
      && this.lastState.players.some(p => p.seat === this.mySeat && p.status === 'active');
  }
  sendDirection(direction: SnakeWormDirection): void {
    if (!this.canAct() || this.lastDirectionSent === direction) return;
    const me = this.lastState!.players.find(p => p.seat === this.mySeat)!;
    const opposite = { up: 'down', down: 'up', left: 'right', right: 'left' };
    if (opposite[me.direction] === direction) return;
    const epoch = ++this.directionEpoch;
    // The snapshot may still show the old direction while an earlier turn is in flight.
    if (me.targetDirection === direction && this.lastDirectionSent === null) { this.lastDirectionSent = direction; return; }
    this.lastDirectionSent = direction;
    void useMultiplayerStore.getState().sendGameAction({ type: 'direction', direction }).then(result => {
      if (!result.ok && epoch === this.directionEpoch) this.lastDirectionSent = null;
    }).catch(() => { if (epoch === this.directionEpoch) this.lastDirectionSent = null; });
  }
  private boost(value: boolean): void {
    const activeBoost = this.lastState?.players.some(p => p.seat === this.mySeat && p.isBoosting);
    if (!this.canAct() || (this.boostingSent === value && (value || !activeBoost))) return;
    this.boostingSent = value;
    const epoch = ++this.boostEpoch;
    void useMultiplayerStore.getState().sendGameAction({ type: value ? 'boost-start' : 'boost-stop' }).then(result => {
      if (!result.ok && epoch === this.boostEpoch) this.boostingSent = !value;
    }).catch(() => { if (epoch === this.boostEpoch) this.boostingSent = !value; });
  }
  sendBoostStart(): void { this.boost(true); }
  sendBoostStop(): void { this.boost(false); }
  stop(): void {
    if (this.stopped) return;
    this.sendBoostStop(); this.stopped = true;
    this.unsubscribe?.(); this.unsubscribe = null;
  }
  setOnStateUpdate(cb: (state: SnakeVsWormsState) => void): void { this.onStateUpdateCb = cb; }
  setOnMatchComplete(cb: (winnerSeat: number | null) => void): void { this.onMatchCompleteCb = cb; }
}
