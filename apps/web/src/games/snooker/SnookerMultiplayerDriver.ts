import type {
  SnookerState,
  SnookerTrajectoryKeyframe,
  SnookerBallType,
} from "@gaming-hub/game-engine";
import { useMultiplayerStore } from "../../store/multiplayerStore";

export class SnookerMultiplayerDriver {
  private mySeat: number;
  private onStateUpdate: (state: SnookerState) => void;
  private onKeyframeAnimation: (keyframes: SnookerTrajectoryKeyframe[], targetState: SnookerState) => void;
  private onRemoteAim: (angle: number, power: number) => void;
  private lastAimSentAt = 0;
  private aimSeq = 0;

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

    this.attachSocketListeners();
  }

  private get socket() {
    return useMultiplayerStore.getState().socket;
  }

  private attachSocketListeners(): void {
    const socket = this.socket;
    if (!socket) return;

    // 1. Authoritative Game State Sync
    socket.on("game:state:authoritative", (payload: any) => {
      const state = payload?.gameState as SnookerState;
      if (!state) return;

      if (state.keyframes && state.keyframes.length > 0) {
        this.onKeyframeAnimation(state.keyframes, state);
      } else {
        this.onStateUpdate(state);
      }
    });

    socket.on("game:state", (payload: any) => {
      const state = payload?.state as SnookerState;
      if (!state) return;

      if (state.keyframes && state.keyframes.length > 0) {
        this.onKeyframeAnimation(state.keyframes, state);
      } else {
        this.onStateUpdate(state);
      }
    });

    // 2. Opponent Live Aim Sync
    socket.on("snooker:aim-position" as any, (payload: any) => {
      if (payload.seat !== this.mySeat) {
        this.onRemoteAim(payload.angle, payload.power);
      }
    });
  }

  public sendAim(angle: number, power: number): void {
    const now = Date.now();
    if (now - this.lastAimSentAt < 60) return; // Throttle to ~16Hz
    this.lastAimSentAt = now;

    const socket = this.socket;
    if (!socket) return;

    socket.emit("snooker:aim-position" as any, {
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
    const socket = this.socket;
    if (!socket) return { ok: false, error: "Socket not connected" };

    return new Promise((resolve) => {
      socket.emit(
        "game:action" as any,
        {
          type: "strike",
          shotId: shotId || `shot-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          expectedStateVersion,
          angle,
          power,
          spinX,
          spinY,
        },
        (response: any) => {
          if (response?.ok) {
            resolve({ ok: true });
          } else {
            resolve({ ok: false, error: response?.error || "Action failed" });
          }
        }
      );
    });
  }

  public async sendPlaceCueBall(
    x: number,
    y: number,
    expectedStateVersion?: number
  ): Promise<{ ok: boolean; error?: string }> {
    const socket = this.socket;
    if (!socket) return { ok: false, error: "Socket not connected" };

    return new Promise((resolve) => {
      socket.emit(
        "game:action" as any,
        {
          type: "place-cue-ball",
          x,
          y,
          expectedStateVersion,
        },
        (response: any) => {
          if (response?.ok) {
            resolve({ ok: true });
          } else {
            resolve({ ok: false, error: response?.error || "Placement failed" });
          }
        }
      );
    });
  }

  public async sendNominateColor(
    color: SnookerBallType,
    expectedStateVersion?: number
  ): Promise<{ ok: boolean; error?: string }> {
    const socket = this.socket;
    if (!socket) return { ok: false, error: "Socket not connected" };

    return new Promise((resolve) => {
      socket.emit(
        "game:action" as any,
        {
          type: "nominate-color",
          color,
          expectedStateVersion,
        },
        (response: any) => {
          if (response?.ok) {
            resolve({ ok: true });
          } else {
            resolve({ ok: false, error: response?.error || "Nomination failed" });
          }
        }
      );
    });
  }

  public async sendNextFrame(): Promise<{ ok: boolean; error?: string }> {
    const socket = this.socket;
    if (!socket) return { ok: false, error: "Socket not connected" };

    return new Promise((resolve) => {
      socket.emit(
        "game:action" as any,
        {
          type: "next-frame",
        },
        (response: any) => {
          if (response?.ok) {
            resolve({ ok: true });
          } else {
            resolve({ ok: false, error: response?.error || "Next frame failed" });
          }
        }
      );
    });
  }

  public destroy(): void {
    const socket = this.socket;
    if (!socket) return;
    socket.off("game:state:authoritative");
    socket.off("game:state");
    socket.off("snooker:aim-position" as any);
  }
}
