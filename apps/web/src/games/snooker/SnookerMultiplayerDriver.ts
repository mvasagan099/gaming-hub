import type {
  SnookerState,
  SnookerTrajectoryKeyframe,
  SnookerBallType,
} from "@gaming-hub/game-engine";
import { useMultiplayerStore, type WinnerInfo } from "../../store/multiplayerStore";

export class SnookerMultiplayerDriver {
  public readonly mySeat: number;
  private onStateUpdate: (state: SnookerState) => void;
  private onKeyframeAnimation: (keyframes: SnookerTrajectoryKeyframe[], targetState: SnookerState) => void;
  private onRemoteAim: (angle: number, power: number) => void;

  private destroyed = false;
  private unsubscribe: (() => void) | null = null;
  private lastAnimatedActionMs: number | null = null;
  private lastAnimatedShotId: string | null = null;
  private lastAimSentAt = 0;
  private aimSeq = 0;
  private lastReceivedAimSeq = -1;

  constructor(
    mySeat: number,
    onStateUpdate: (state: SnookerState) => void,
    onKeyframeAnimation: (keyframes: SnookerTrajectoryKeyframe[], targetState: SnookerState) => void,
    onRemoteAim: (angle: number, power: number) => void
  ) {
    this.mySeat = mySeat;
    this.onStateUpdate = onStateUpdate;
    this.onKeyframeAnimation = onKeyframeAnimation;
    this.onRemoteAim = onRemoteAim;
  }

  private handleRemoteAim = (payload: {
    seat: number;
    angle: number;
    power: number;
    sequence?: number;
  }) => {
    if (this.destroyed) return;
    if (payload.seat === this.mySeat) return;
    if (typeof payload.sequence === "number" && payload.sequence <= this.lastReceivedAimSeq) {
      return;
    }
    if (typeof payload.sequence === "number") {
      this.lastReceivedAimSeq = payload.sequence;
    }
    this.onRemoteAim(payload.angle, payload.power);
  };

  public start(): void {
    const store = useMultiplayerStore.getState();

    // 1. Initial State Hydration on Mount
    if (store.gameState) {
      this.applyState(store.gameState as unknown as SnookerState);
    }

    // 2. Attach Live Aim Socket Listener
    const socket = store.socket;
    if (socket) {
      socket.on("snooker:aim-position" as any, this.handleRemoteAim as any);
    }

    // 3. Subscribe to Authoritative State Updates from Multiplayer Store
    this.unsubscribe = useMultiplayerStore.subscribe((state, prev) => {
      if (this.destroyed) return;
      if (state.renderKey !== prev.renderKey || state.gameState !== prev.gameState || state.winner !== prev.winner) {
        if (state.gameState) {
          this.applyState(state.gameState as unknown as SnookerState);
        }
      }
    });
  }

  private applyState(state: SnookerState): void {
    if (!state || this.destroyed) return;

    const shotId = state.lastProcessedShotId || (state.lastShot?.shotId ?? null);
    const actionMs = state.lastActionAtMs ?? 0;

    const hasKeyframes = Array.isArray(state.keyframes) && state.keyframes.length > 0;
    const isNewAnimation =
      (shotId && shotId !== this.lastAnimatedShotId) ||
      (actionMs > 0 && actionMs !== this.lastAnimatedActionMs);

    if (hasKeyframes && isNewAnimation) {
      if (shotId) this.lastAnimatedShotId = shotId;
      if (actionMs) this.lastAnimatedActionMs = actionMs;
      this.onKeyframeAnimation(state.keyframes, state);
    } else {
      this.onStateUpdate(state);
    }
  }

  public sendAim(angle: number, power: number): void {
    const now = Date.now();
    if (now - this.lastAimSentAt < 40) return; // Throttle to 25Hz
    this.lastAimSentAt = now;

    const socket = useMultiplayerStore.getState().socket;
    const room = useMultiplayerStore.getState().room;
    if (!socket || !room) return;

    socket.emit("snooker:aim-position" as any, {
      roomId: room.id,
      matchId: room.matchId,
      angle,
      power,
      sequence: ++this.aimSeq,
      timestamp: now,
    });
  }

  public async sendStrike(
    angle: number,
    power: number,
    spinX = 0,
    spinY = 0,
    shotId?: string,
    expectedStateVersion?: number
  ): Promise<{ ok: boolean; error?: string }> {
    const actionPayload: any = {
      type: "strike",
      shotId: shotId || `shot-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      angle,
      power,
      spinX,
      spinY,
    };
    if (expectedStateVersion !== undefined) {
      actionPayload.expectedStateVersion = expectedStateVersion;
    }
    return useMultiplayerStore.getState().sendGameAction(actionPayload);
  }

  public async sendPlaceCueBall(
    x: number,
    y: number,
    expectedStateVersion?: number
  ): Promise<{ ok: boolean; error?: string }> {
    const actionPayload: any = {
      type: "place-cue-ball",
      x,
      y,
    };
    if (expectedStateVersion !== undefined) {
      actionPayload.expectedStateVersion = expectedStateVersion;
    }
    return useMultiplayerStore.getState().sendGameAction(actionPayload);
  }

  public async sendNominateColor(
    color: SnookerBallType,
    expectedStateVersion?: number
  ): Promise<{ ok: boolean; error?: string }> {
    const actionPayload: any = {
      type: "nominate-color",
      color,
    };
    if (expectedStateVersion !== undefined) {
      actionPayload.expectedStateVersion = expectedStateVersion;
    }
    return useMultiplayerStore.getState().sendGameAction(actionPayload);
  }

  public async sendNextFrame(): Promise<{ ok: boolean; error?: string }> {
    return useMultiplayerStore.getState().sendGameAction({
      type: "next-frame",
    });
  }

  public async sendTimeout(): Promise<{ ok: boolean; error?: string }> {
    return useMultiplayerStore.getState().sendGameAction({
      type: "timeout",
    });
  }

  public stop(): void {
    this.destroyed = true;
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    const socket = useMultiplayerStore.getState().socket;
    if (socket) {
      socket.off("snooker:aim-position" as any, this.handleRemoteAim as any);
    }
  }

  public destroy(): void {
    this.stop();
  }
}
export default SnookerMultiplayerDriver;
