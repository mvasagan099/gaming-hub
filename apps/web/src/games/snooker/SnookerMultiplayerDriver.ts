import type { SnookerState, SnookerTrajectoryKeyframe, SnookerBallType } from '@gaming-hub/game-engine';
import { useMultiplayerStore } from '../../store/multiplayerStore';

export class SnookerMultiplayerDriver {
  public readonly mySeat: number | null;
  public lastState: SnookerState | null = null;
  private destroyed = false;
  private unsubscribe: (() => void) | null = null;
  private socket: ReturnType<typeof useMultiplayerStore.getState>['socket'] = null;
  private lastAnimatedShotId: string | null = null;
  private lastAimSentAt = -Infinity;
  private aimSeq = 0;
  private aimScope = '';
  private lastReceivedAimSeq = -1;
  private awaitingReconnect = false;
  private pendingAction = false;
  private actionEpoch = 0;
  private playbackDeadline = 0;
  private readonly matchId?: string;
  private readonly roomId?: string;
  private readonly onStateUpdate: (state: SnookerState, restore?: boolean) => void;
  private readonly onKeyframeAnimation: (frames: SnookerTrajectoryKeyframe[], state: SnookerState) => void;
  private readonly onRemoteAim: (angle: number, power: number) => void;

  constructor(mySeat: number | null, onStateUpdate: (state: SnookerState, restore?: boolean) => void,
    onKeyframeAnimation: (frames: SnookerTrajectoryKeyframe[], state: SnookerState) => void,
    onRemoteAim: (angle: number, power: number) => void, scope?: { matchId: string; roomId: string }) {
    this.mySeat = mySeat; this.onStateUpdate = onStateUpdate;
    this.onKeyframeAnimation = onKeyframeAnimation; this.onRemoteAim = onRemoteAim;
    this.matchId = scope?.matchId; this.roomId = scope?.roomId;
  }
  private inScope(store: ReturnType<typeof useMultiplayerStore.getState>): boolean {
    return (!this.matchId || store.matchId === this.matchId) && (!this.roomId || store.room?.id === this.roomId);
  }
  private handleRemoteAim = (payload: { roomId: string; matchId: string; seat: number; angle: number; power: number; sequence: number; turnNumber: number }) => {
    const store = useMultiplayerStore.getState();
    const state = this.lastState;
    if (this.destroyed || !this.inScope(store) || payload.matchId !== store.matchId || payload.roomId !== store.room?.id) return;
    if (!state || payload.seat === this.mySeat || payload.seat !== state.currentSeat || payload.turnNumber !== state.turnNumber) return;
    if (this.playbackDeadline > Date.now() || state.finished || state.paused || store.status !== 'connected') return;
    if (![payload.angle, payload.power].every(Number.isFinite) || !Number.isSafeInteger(payload.sequence)) return;
    const scope = `${payload.matchId}:${payload.turnNumber}`;
    if (scope !== this.aimScope) { this.aimScope = scope; this.lastReceivedAimSeq = -1; }
    if (payload.sequence <= this.lastReceivedAimSeq) return;
    this.lastReceivedAimSeq = payload.sequence;
    this.onRemoteAim(payload.angle, Math.max(0.05, Math.min(1, payload.power)));
  };
  private attachSocket(socket: typeof this.socket): void {
    if (this.socket === socket) return;
    this.socket?.off('snooker:aim-position' as any, this.handleRemoteAim as any);
    this.socket = socket;
    socket?.on('snooker:aim-position' as any, this.handleRemoteAim as any);
  }
  start(): void {
    if (this.destroyed || this.unsubscribe) return;
    const store = useMultiplayerStore.getState();
    this.attachSocket(store.socket);
    if (this.inScope(store) && store.gameState) this.applyState(store.gameState as unknown as SnookerState, true);
    this.unsubscribe = useMultiplayerStore.subscribe((state, prev) => {
      if (this.destroyed || !this.inScope(state)) return;
      this.attachSocket(state.socket);
      if (state.status !== prev.status && state.status !== 'connected') {
        this.awaitingReconnect = true;
        if (this.lastState) this.onStateUpdate(this.lastState, true);
      }
      if (state.status === 'connected' && prev.status !== 'connected') {
        void state.requestFullStateSync().catch(() => undefined);
      }
      if (state.renderKey !== prev.renderKey || state.winner !== prev.winner) {
        if (state.gameState) this.applyState(state.gameState as unknown as SnookerState, this.awaitingReconnect);
      }
    });
  }
  private applyState(state: SnookerState, restore = false): void {
    if (this.destroyed || state.gameId !== 'snooker') return;
    if (!restore && this.lastState && state.stateVersion < this.lastState.stateVersion) return;
    restore ||= state.paused;
    this.lastState = state;
    this.playbackDeadline = Date.now() + Math.max(0, (state.shotPlaybackEndsAtMs ?? 0) - (state.serverTimestamp || Date.now()));
    this.awaitingReconnect = false;
    if (restore) { this.pendingAction = false; this.actionEpoch++; }
    const id = state.lastProcessedShotId ?? state.lastShot?.shotId ?? null;
    if (!restore && id && id !== this.lastAnimatedShotId && state.keyframes?.length) {
      this.lastAnimatedShotId = id;
      this.onKeyframeAnimation(state.keyframes, state);
    } else {
      if (restore) this.lastAnimatedShotId = id;
      this.onStateUpdate(state, restore);
    }
  }
  canAct(): boolean {
    const store = useMultiplayerStore.getState(); const state = this.lastState;
    return !this.destroyed && !this.pendingAction && !this.awaitingReconnect && this.inScope(store)
      && store.status === 'connected' && this.mySeat != null && state != null && state.currentSeat === this.mySeat
      && !state.finished && !state.paused && !['FRAME_END', 'MATCH_END'].includes(state.frameStatus)
      && this.playbackDeadline <= Date.now();
  }
  sendAim(angle: number, power: number): void {
    if (!this.canAct() || ![angle, power].every(Number.isFinite)) return;
    const now = Date.now(); if (now - this.lastAimSentAt < 40) return;
    this.lastAimSentAt = now;
    const store = useMultiplayerStore.getState();
    store.socket?.emit('snooker:aim-position' as any, { roomId: store.room!.id, matchId: store.matchId,
      turnNumber: this.lastState!.turnNumber, angle, power, sequence: ++this.aimSeq });
  }
  private async send(action: { type: string; [key: string]: any }, nextFrame = false): Promise<{ ok: boolean; error?: string }> {
    const store = useMultiplayerStore.getState();
    if (nextFrame ? (this.destroyed || this.pendingAction || this.mySeat == null || !this.inScope(store)
      || store.status !== 'connected' || this.lastState?.frameStatus !== 'FRAME_END') : !this.canAct()) {
      return { ok: false, error: 'Wait for your turn and the balls to settle' };
    }
    this.pendingAction = true;
    const epoch = this.actionEpoch;
    try { return await store.sendGameAction({ ...action, expectedStateVersion: action.expectedStateVersion ?? this.lastState!.stateVersion }); }
    catch { return { ok: false, error: 'Could not reach the game server' }; }
    finally { if (this.actionEpoch === epoch) this.pendingAction = false; }
  }
  sendStrike(angle: number, power: number, spinX = 0, spinY = 0, shotId?: string, expectedStateVersion?: number) {
    return this.send({ type: 'strike', angle, power, spinX, spinY,
      shotId: shotId ?? `shot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, expectedStateVersion });
  }
  sendPlaceCueBall(x: number, y: number, expectedStateVersion?: number) { return this.send({ type: 'place-cue-ball', x, y, expectedStateVersion }); }
  sendNominateColor(color: SnookerBallType, expectedStateVersion?: number) { return this.send({ type: 'nominate-color', color, expectedStateVersion }); }
  sendNextFrame() { return this.send({ type: 'next-frame' }, true); }
  stop(): void {
    this.destroyed = true; this.unsubscribe?.(); this.unsubscribe = null; this.attachSocket(null);
  }
  destroy(): void { this.stop(); }
}
export default SnookerMultiplayerDriver;
